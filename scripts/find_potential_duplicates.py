#!/usr/bin/env python3
"""
Find potential duplicate collaborators using fuzzy name matching.

This script identifies collaborators that are likely the same person based on:
- High name similarity (90%+ match)
- Same institution
- Initials matching full names

Usage:
    python scripts/find_potential_duplicates.py [--user-email EMAIL] [--threshold 0.90]
"""

import argparse
import logging
import re
from collections import defaultdict
from difflib import SequenceMatcher

from sqlalchemy import select

from research_os.db import Collaborator, User, session_scope

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _normalize_name_lower(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _name_similarity(left: str | None, right: str | None) -> float:
    """Compute name similarity score (0.0 to 1.0)."""
    left_norm = _normalize_name_lower(left)
    right_norm = _normalize_name_lower(right)
    if not left_norm or not right_norm:
        return 0.0
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def _initial_matches_name(initial: str, full_name: str) -> bool:
    """Check if an initial or abbreviated name matches a full name."""
    initial_norm = _normalize_name_lower(initial)
    full_norm = _normalize_name_lower(full_name)
    
    if not initial_norm or not full_norm:
        return False
    
    # Split into parts
    initial_parts = initial_norm.split()
    full_parts = full_norm.split()
    
    if len(initial_parts) != len(full_parts):
        return False
    
    # Check if each initial part matches the start of corresponding full part
    for init_part, full_part in zip(initial_parts, full_parts):
        # Allow single letter initial to match first letter of full name
        if len(init_part) == 1:
            if not full_part.startswith(init_part):
                return False
        # Allow partial match (like "zia" and "zia")
        elif not full_part.startswith(init_part):
            return False
    
    return True


def _same_institution(inst1: str | None, inst2: str | None) -> bool:
    """Check if two institutions are the same (case-insensitive)."""
    norm1 = _normalize_name_lower(inst1)
    norm2 = _normalize_name_lower(inst2)
    return bool(norm1 and norm2 and norm1 == norm2)


def find_potential_duplicates(user_email: str | None = None, similarity_threshold: float = 0.90):
    """
    Find potential duplicate collaborators.
    
    Args:
        user_email: If provided, only check this user's collaborators
        similarity_threshold: Minimum name similarity score to consider (0.0-1.0)
    """
    with session_scope() as session:
        query = select(Collaborator)
        
        if user_email:
            user = session.scalars(select(User).where(User.email == user_email)).first()
            if not user:
                logger.error(f"User not found: {user_email}")
                return
            query = query.where(Collaborator.owner_user_id == user.id)
            logger.info(f"Checking collaborators for user: {user_email}")
        else:
            logger.info("Checking collaborators for ALL users")
        
        collaborators = session.scalars(query).all()
        logger.info(f"Found {len(collaborators)} total collaborator records")
        
        # Group by user
        by_user: dict[str, list[Collaborator]] = defaultdict(list)
        for collab in collaborators:
            by_user[str(collab.owner_user_id)].append(collab)
        
        total_potential_dupes = 0
        
        for owner_id, user_collaborators in by_user.items():
            if not user_email:
                logger.info(f"\nUser {owner_id}:")
            
            potential_duplicates = []
            
            # Check each pair for similarity
            for i, c1 in enumerate(user_collaborators):
                for c2 in user_collaborators[i+1:]:
                    # Skip if they have same OpenAlex/ORCID (already handled by identity key)
                    if c1.openalex_author_id and c1.openalex_author_id == c2.openalex_author_id:
                        continue
                    if c1.orcid_id and c1.orcid_id == c2.orcid_id:
                        continue
                    if c1.email and c1.email == c2.email:
                        continue
                    
                    similarity = _name_similarity(c1.full_name, c2.full_name)
                    is_initial_match = _initial_matches_name(c1.full_name or "", c2.full_name or "") or \
                                     _initial_matches_name(c2.full_name or "", c1.full_name or "")
                    same_inst = _same_institution(c1.primary_institution, c2.primary_institution)
                    
                    # Flag as potential duplicate if:
                    # 1. High name similarity, OR
                    # 2. Initial matches full name
                    if similarity >= similarity_threshold or is_initial_match:
                        potential_duplicates.append({
                            'c1': c1,
                            'c2': c2,
                            'similarity': similarity,
                            'initial_match': is_initial_match,
                            'same_institution': same_inst,
                        })
            
            if potential_duplicates:
                logger.info(f"\n  Found {len(potential_duplicates)} potential duplicate pairs:")
                total_potential_dupes += len(potential_duplicates)
                
                for dup in potential_duplicates:
                    c1 = dup['c1']
                    c2 = dup['c2']
                    logger.info(f"\n  ⚠️  Potential match ({dup['similarity']:.0%} similar):")
                    logger.info(f"    1. {c1.full_name:30} | {c1.primary_institution or 'No institution':50}")
                    logger.info(f"       ID: {c1.id} | OpenAlex: {c1.openalex_author_id or 'None':25} | ORCID: {c1.orcid_id or 'None'}")
                    logger.info(f"    2. {c2.full_name:30} | {c2.primary_institution or 'No institution':50}")
                    logger.info(f"       ID: {c2.id} | OpenAlex: {c2.openalex_author_id or 'None':25} | ORCID: {c2.orcid_id or 'None'}")
                    
                    if dup['initial_match']:
                        logger.info(f"       → Initial/abbreviation match detected")
                    if dup['same_institution']:
                        logger.info(f"       → Same institution (likely duplicate)")
                    
                    logger.info(f"\n       To merge manually, run:")
                    logger.info(f"       python scripts/merge_specific_collaborators.py {c1.id} {c2.id}")
            else:
                if not user_email:
                    logger.info("  No potential duplicates found")
        
        logger.info(f"\n{'='*80}")
        logger.info(f"Total potential duplicate pairs found: {total_potential_dupes}")
        logger.info(f"\nRecommendations:")
        logger.info(f"1. Review the pairs above")
        logger.info(f"2. Use the merge command for confirmed duplicates")
        logger.info(f"3. Consider enriching with OpenAlex IDs to auto-deduplicate in future")


def main():
    parser = argparse.ArgumentParser(description="Find potential duplicate collaborators")
    parser.add_argument(
        "--user-email",
        type=str,
        help="Only check duplicates for this user email",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.90,
        help="Minimum name similarity threshold (0.0-1.0, default: 0.90)",
    )
    args = parser.parse_args()
    
    find_potential_duplicates(user_email=args.user_email, similarity_threshold=args.threshold)


if __name__ == "__main__":
    main()
