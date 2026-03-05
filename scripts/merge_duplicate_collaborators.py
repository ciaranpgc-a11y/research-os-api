#!/usr/bin/env python3
"""
Merge duplicate collaborator records in the database

Finds and merges collaborators that represent the same person based on OpenAlex ID, 
ORCID, email, or name similarity into a single canonical record, preserving all 
unique institutions in CollaboratorAffiliation records.

Usage:
    python scripts/merge_duplicate_collaborators.py [--dry-run] [--user-id USER_ID]
"""

import argparse
import logging
import re
from collections import defaultdict
from difflib import SequenceMatcher

from sqlalchemy import delete, select

from research_os.db import (
    Collaborator,
    CollaboratorAffiliation,
    CollaborationMetric,
    session_scope,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

_ORCID_RE = re.compile(r"^\d{4}-\d{4}-\d{4}-[\dX]{4}$")


def _normalize_openalex_author_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.startswith("http://openalex.org/"):
        clean = "https://openalex.org/" + clean.removeprefix("http://openalex.org/")
    if clean.startswith("https://openalex.org/"):
        suffix = clean.removeprefix("https://openalex.org/").strip().strip("/")
        if re.fullmatch(r"(?i)A\d+", suffix):
            suffix = suffix.upper()
        return f"https://openalex.org/{suffix}" if suffix else None
    if re.fullmatch(r"(?i)A\d+", clean):
        return f"https://openalex.org/{clean.upper()}"
    return clean


def _openalex_identity_key(value: str | None) -> str:
    normalized = _normalize_openalex_author_id(value)
    if not normalized:
        return ""
    if normalized.startswith("https://openalex.org/"):
        normalized = normalized.removeprefix("https://openalex.org/")
    return re.sub(r"\s+", "", normalized.strip().lower())


def _normalize_email_key(value: str | None) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def _normalize_institution(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_orcid_id(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"[^0-9X]", "", str(value).strip().upper())
    if len(cleaned) != 16:
        return None
    formatted = f"{cleaned[0:4]}-{cleaned[4:8]}-{cleaned[8:12]}-{cleaned[12:16]}"
    if not _ORCID_RE.match(formatted):
        return None
    return formatted


def _normalize_name_lower(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _collaborator_identity_key(collaborator: Collaborator) -> str:
    """Generate canonical identity key for deduplication."""
    openalex_id = _openalex_identity_key(collaborator.openalex_author_id)
    if openalex_id:
        return f"oa:{openalex_id}"
    email = _normalize_email_key(collaborator.email)
    if email:
        return f"email:{email}"
    name = _normalize_name_lower(collaborator.full_name or "")
    return f"name:{name}"


def _name_similarity(left: str | None, right: str | None) -> float:
    """Compute name similarity score (0.0 to 1.0)."""
    left_norm = _normalize_name_lower(left)
    right_norm = _normalize_name_lower(right)
    if not left_norm or not right_norm:
        return 0.0
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def _institution_similarity(left: str | None, right: str | None) -> float:
    left_norm = _normalize_name_lower(left)
    right_norm = _normalize_name_lower(right)
    if not left_norm or not right_norm:
        return 0.0
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def _parse_name_parts(name: str) -> tuple[str, list[str]]:
    """Parse a name into (surname, [given_name_parts])."""
    clean = re.sub(r"\s+", " ", str(name or "").strip())
    if not clean:
        return ("", [])
    if "," in clean:
        parts = clean.split(",", 1)
        surname = parts[0].strip().lower()
        given_str = parts[1].strip().lower()
        given = [p.rstrip(".") for p in given_str.split() if p.rstrip(".")]
    else:
        tokens = clean.lower().split()
        if len(tokens) <= 1:
            return (tokens[0] if tokens else "", [])
        surname = tokens[-1]
        given = [p.rstrip(".") for p in tokens[:-1] if p.rstrip(".")]
    return (surname, given)


def _name_initial_compatible(a: str, b: str) -> bool:
    """Check if two names could be the same person via surname + initial match."""
    surname_a, given_a = _parse_name_parts(a)
    surname_b, given_b = _parse_name_parts(b)
    if not surname_a or not surname_b:
        return False
    if surname_a != surname_b:
        if SequenceMatcher(None, surname_a, surname_b).ratio() < 0.85:
            return False
    if not given_a or not given_b:
        return False
    if given_a[0][0] != given_b[0][0]:
        return False
    shorter = min(len(given_a), len(given_b))
    for i in range(1, shorter):
        pa, pb = given_a[i], given_b[i]
        if len(pa) > 1 and len(pb) > 1:
            if SequenceMatcher(None, pa, pb).ratio() < 0.7:
                return False
        elif pa[0] != pb[0]:
            return False
    return True


def merge_duplicate_collaborators(user_id: str | None = None, dry_run: bool = False):
    """
    Find and merge duplicate collaborator records.
    
    Args:
        user_id: If provided, only process duplicates for this user
        dry_run: If True, log what would be done without making changes
    """
    with session_scope() as session:
        query = select(Collaborator)
        if user_id:
            query = query.where(Collaborator.owner_user_id == user_id)
            logger.info(f"Processing collaborators for user: {user_id}")
        else:
            logger.info("Processing collaborators for ALL users")
        
        collaborators = session.scalars(query).all()
        logger.info(f"Found {len(collaborators)} total collaborator records")
        
        # Group by user and then by identity key
        by_user: dict[str, list[Collaborator]] = defaultdict(list)
        for collab in collaborators:
            by_user[str(collab.owner_user_id)].append(collab)
        
        total_merged = 0
        total_groups = 0
        
        for owner_id, user_collaborators in by_user.items():
            collaborators_by_id = {str(collab.id): collab for collab in user_collaborators}
            parent: dict[str, str] = {str(collab.id): str(collab.id) for collab in user_collaborators}

            def find(value: str) -> str:
                root = parent[value]
                while root != parent[root]:
                    root = parent[root]
                while value != root:
                    next_value = parent[value]
                    parent[value] = root
                    value = next_value
                return root

            def union(left: str, right: str) -> None:
                left_root = find(left)
                right_root = find(right)
                if left_root != right_root:
                    parent[right_root] = left_root

            token_to_ids: dict[str, list[str]] = defaultdict(list)
            for collab in user_collaborators:
                collab_id = str(collab.id)
                openalex = _openalex_identity_key(collab.openalex_author_id)
                if openalex:
                    token_to_ids[f"oa:{openalex}"].append(collab_id)
                email = _normalize_email_key(collab.email)
                if email:
                    token_to_ids[f"email:{email}"].append(collab_id)
                fallback_name = _normalize_name_lower(collab.full_name)
                if fallback_name:
                    token_to_ids[f"name:{fallback_name}"].append(collab_id)

            for ids in token_to_ids.values():
                if len(ids) <= 1:
                    continue
                first = ids[0]
                for other in ids[1:]:
                    union(first, other)

            # Fuzzy pass for near duplicates that missed hard identity linking.
            for index, left in enumerate(user_collaborators):
                left_id = str(left.id)
                for right in user_collaborators[index + 1 :]:
                    right_id = str(right.id)
                    if find(left_id) == find(right_id):
                        continue
                    left_name = left.full_name or ""
                    right_name = right.full_name or ""
                    name_sim = _name_similarity(left_name, right_name)
                    if name_sim >= 0.98:
                        union(left_id, right_id)
                        continue
                    if name_sim >= 0.94:
                        inst_sim = _institution_similarity(
                            left.primary_institution,
                            right.primary_institution,
                        )
                        if inst_sim >= 0.82:
                            union(left_id, right_id)
                            continue
                    if _name_initial_compatible(left_name, right_name):
                        left_inst = (left.primary_institution or "").strip()
                        right_inst = (right.primary_institution or "").strip()
                        # Both have institutions → require similarity
                        if left_inst and right_inst:
                            if _institution_similarity(left_inst, right_inst) >= 0.82:
                                union(left_id, right_id)
                        # Exactly one has institution → institution side confirms
                        elif left_inst or right_inst:
                            union(left_id, right_id)

            grouped_ids: dict[str, list[str]] = defaultdict(list)
            for collab in user_collaborators:
                collab_id = str(collab.id)
                grouped_ids[find(collab_id)].append(collab_id)

            # Process groups with duplicates
            for ids in grouped_ids.values():
                group = [collaborators_by_id[item_id] for item_id in ids]
                if len(group) <= 1:
                    continue
                
                total_groups += 1

                metrics_by_collaborator: dict[str, CollaborationMetric] = {}
                for metric in session.scalars(
                    select(CollaborationMetric).where(
                        CollaborationMetric.collaborator_id.in_(ids)
                    )
                ).all():
                    metrics_by_collaborator[str(metric.collaborator_id)] = metric

                # Sort by most complete record (most works, most recent)
                group.sort(
                    key=lambda c: (
                        -int((metrics_by_collaborator.get(str(c.id)) or type("obj", (object,), {"coauthored_works_count": 0})()).coauthored_works_count or 0),
                        -c.updated_at.timestamp() if c.updated_at else 0,
                        str(c.id),
                    )
                )
                
                canonical = group[0]
                duplicates = group[1:]
                
                logger.info(f"\n{'[DRY RUN] ' if dry_run else ''}Merging {len(duplicates)} duplicates into canonical:")
                logger.info(f"  Canonical: {canonical.full_name} ({canonical.id})")
                for dup in duplicates:
                    logger.info(f"  Duplicate: {dup.full_name} ({dup.id}) - Institution: {dup.primary_institution or 'None'}")
                
                if dry_run:
                    continue
                
                # Collect all unique institutions
                institutions: set[str] = set()
                for collab in group:
                    # Add primary institution
                    if collab.primary_institution:
                        institutions.add(_normalize_institution(collab.primary_institution))
                    
                    # Add existing affiliation institutions
                    affiliations = session.scalars(
                        select(CollaboratorAffiliation).where(
                            CollaboratorAffiliation.collaborator_id == collab.id
                        )
                    ).all()
                    for aff in affiliations:
                        if aff.institution_name:
                            institutions.add(_normalize_institution(aff.institution_name))
                
                # Merge fields from duplicates into canonical (fill missing fields only)
                for dup in duplicates:
                    if not canonical.orcid_id and dup.orcid_id:
                        canonical.orcid_id = dup.orcid_id
                    if not canonical.openalex_author_id and dup.openalex_author_id:
                        canonical.openalex_author_id = dup.openalex_author_id
                    if not canonical.email and dup.email:
                        canonical.email = dup.email
                    if not canonical.preferred_name and dup.preferred_name:
                        canonical.preferred_name = dup.preferred_name
                    if not canonical.department and dup.department:
                        canonical.department = dup.department
                    if not canonical.country and dup.country:
                        canonical.country = dup.country
                    if not canonical.current_position and dup.current_position:
                        canonical.current_position = dup.current_position
                    if not canonical.notes and dup.notes:
                        canonical.notes = dup.notes
                    
                    # Merge research domains
                    existing_domains = set(canonical.research_domains or [])
                    for domain in (dup.research_domains or []):
                        existing_domains.add(domain)
                    canonical.research_domains = sorted(existing_domains)
                
                # Delete existing affiliations for canonical to rebuild
                session.execute(
                    delete(CollaboratorAffiliation).where(
                        CollaboratorAffiliation.collaborator_id == canonical.id
                    )
                )
                
                # Add all unique institutions as affiliations
                for institution in sorted(institutions):
                    session.add(
                        CollaboratorAffiliation(
                            collaborator_id=canonical.id,
                            institution_name=institution,
                        )
                    )
                
                # Update canonical primary_institution if empty
                if not canonical.primary_institution and institutions:
                    canonical.primary_institution = sorted(institutions)[0]
                
                # Merge metrics (keep the one with most works)
                canonical_metric = session.scalars(
                    select(CollaborationMetric).where(
                        CollaborationMetric.collaborator_id == canonical.id
                    )
                ).first()
                
                for dup in duplicates:
                    dup_metric = session.scalars(
                        select(CollaborationMetric).where(
                            CollaborationMetric.collaborator_id == dup.id
                        )
                    ).first()
                    
                    if dup_metric and canonical_metric:
                        # Merge metric values (take max)
                        canonical_metric.coauthored_works_count = max(
                            canonical_metric.coauthored_works_count or 0,
                            dup_metric.coauthored_works_count or 0,
                        )
                        canonical_metric.shared_citations_total = max(
                            canonical_metric.shared_citations_total or 0,
                            dup_metric.shared_citations_total or 0,
                        )
                        canonical_metric.collaboration_strength_score = max(
                            canonical_metric.collaboration_strength_score or 0.0,
                            dup_metric.collaboration_strength_score or 0.0,
                        )
                
                # Delete duplicate records and their metrics
                for dup in duplicates:
                    session.execute(
                        delete(CollaborationMetric).where(
                            CollaborationMetric.collaborator_id == dup.id
                        )
                    )
                    session.execute(
                        delete(CollaboratorAffiliation).where(
                            CollaboratorAffiliation.collaborator_id == dup.id
                        )
                    )
                    session.delete(dup)
                
                total_merged += len(duplicates)
                logger.info(f"  ✓ Merged {len(duplicates)} duplicates, preserved {len(institutions)} institutions")
        
        if not dry_run:
            session.commit()
            logger.info(f"\n✅ Successfully merged {total_merged} duplicate records across {total_groups} identity groups")
        else:
            logger.info(f"\n[DRY RUN] Would merge {total_merged} duplicate records across {total_groups} identity groups")


def main():
    parser = argparse.ArgumentParser(description="Merge duplicate collaborator records")
    parser.add_argument(
        "--user-id",
        type=str,
        help="Only process duplicates for this user ID",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    args = parser.parse_args()
    
    merge_duplicate_collaborators(user_id=args.user_id, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
