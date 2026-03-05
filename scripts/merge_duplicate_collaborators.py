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
    openalex_id = re.sub(r"\s+", "", str(collaborator.openalex_author_id or "").strip().lower())
    if openalex_id:
        return f"oa:{openalex_id}"
    orcid_id = _normalize_orcid_id(collaborator.orcid_id)
    if orcid_id:
        return f"orcid:{orcid_id.lower()}"
    email = str(collaborator.email or "").strip().lower()
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
            groups: dict[str, list[Collaborator]] = defaultdict(list)
            for collab in user_collaborators:
                key = _collaborator_identity_key(collab)
                groups[key].append(collab)
            
            # Process groups with duplicates
            for key, group in groups.items():
                if len(group) <= 1:
                    continue
                
                total_groups += 1
                
                # Sort by most complete record (most works, most recent)
                group.sort(
                    key=lambda c: (
                        -int((session.scalars(select(CollaborationMetric).where(CollaborationMetric.collaborator_id == c.id)).first() or type('obj', (object,), {'coauthored_works_count': 0})()).coauthored_works_count or 0),
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
                        institutions.add(collab.primary_institution.strip())
                    
                    # Add existing affiliation institutions
                    affiliations = session.scalars(
                        select(CollaboratorAffiliation).where(
                            CollaboratorAffiliation.collaborator_id == collab.id
                        )
                    ).all()
                    for aff in affiliations:
                        if aff.institution_name:
                            institutions.add(aff.institution_name.strip())
                
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
