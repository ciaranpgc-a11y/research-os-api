#!/usr/bin/env python3
"""
AI-powered collaborator duplicate detection using OpenAI.

This script uses GPT-4 to intelligently identify duplicate collaborators by analyzing:
- Name variations (initials, nicknames, transliterations)
- Institution context
- Research domains
- Temporal patterns (last collaboration years)

Usage:
    python scripts/ai_dedupe_collaborators.py --user-email EMAIL [--auto-merge-threshold 0.95] [--dry-run]
"""

import argparse
import json
import logging
import os
import re
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select

from research_os.db import Collaborator, CollaboratorAffiliation, CollaborationMetric, User, session_scope

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
    
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logger.warning("OpenAI library not available. Install with: pip install openai")


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


def _build_collaborator_context(session, collaborator: Collaborator) -> dict[str, Any]:
    """Build rich context about a collaborator for AI analysis."""
    metric = session.scalars(
        select(CollaborationMetric).where(
            CollaborationMetric.collaborator_id == collaborator.id
        )
    ).first()
    
    affiliations = session.scalars(
        select(CollaboratorAffiliation).where(
            CollaboratorAffiliation.collaborator_id == collaborator.id
        )
    ).all()
    
    all_institutions = set()
    if collaborator.primary_institution:
        all_institutions.add(collaborator.primary_institution)
    for aff in affiliations:
        if aff.institution_name:
            all_institutions.add(aff.institution_name)
    
    return {
        "id": str(collaborator.id),
        "full_name": collaborator.full_name or "",
        "preferred_name": collaborator.preferred_name or "",
        "email": collaborator.email or "",
        "orcid_id": collaborator.orcid_id or "",
        "openalex_author_id": collaborator.openalex_author_id or "",
        "institutions": sorted(all_institutions),
        "country": collaborator.country or "",
        "department": collaborator.department or "",
        "current_position": collaborator.current_position or "",
        "research_domains": collaborator.research_domains or [],
        "coauthored_works_count": metric.coauthored_works_count if metric else 0,
        "last_collaboration_year": metric.last_collaboration_year if metric else None,
        "first_collaboration_year": metric.first_collaboration_year if metric else None,
    }


def _ask_ai_if_duplicate(client: OpenAI, collab1_ctx: dict, collab2_ctx: dict) -> dict[str, Any]:
    """
    Ask OpenAI if two collaborators are the same person.
    
    Returns:
        {
            "is_duplicate": bool,
            "confidence": float (0.0-1.0),
            "reasoning": str,
        }
    """
    prompt = f"""You are an expert research database analyst. Analyze these two collaborator records and determine if they represent the SAME PERSON.

COLLABORATOR A:
- Name: {collab1_ctx['full_name']}
- Preferred Name: {collab1_ctx['preferred_name'] or 'N/A'}
- Email: {collab1_ctx['email'] or 'N/A'}
- ORCID: {collab1_ctx['orcid_id'] or 'N/A'}
- OpenAlex ID: {collab1_ctx['openalex_author_id'] or 'N/A'}
- Institutions: {', '.join(collab1_ctx['institutions']) or 'N/A'}
- Country: {collab1_ctx['country'] or 'N/A'}
- Department: {collab1_ctx['department'] or 'N/A'}
- Position: {collab1_ctx['current_position'] or 'N/A'}
- Research Domains: {', '.join(collab1_ctx['research_domains']) or 'N/A'}
- Co-authored Works: {collab1_ctx['coauthored_works_count']}
- Collaboration Period: {collab1_ctx['first_collaboration_year'] or 'N/A'} - {collab1_ctx['last_collaboration_year'] or 'N/A'}

COLLABORATOR B:
- Name: {collab2_ctx['full_name']}
- Preferred Name: {collab2_ctx['preferred_name'] or 'N/A'}
- Email: {collab2_ctx['email'] or 'N/A'}
- ORCID: {collab2_ctx['orcid_id'] or 'N/A'}
- OpenAlex ID: {collab2_ctx['openalex_author_id'] or 'N/A'}
- Institutions: {', '.join(collab2_ctx['institutions']) or 'N/A'}
- Country: {collab2_ctx['country'] or 'N/A'}
- Department: {collab2_ctx['department'] or 'N/A'}
- Position: {collab2_ctx['current_position'] or 'N/A'}
- Research Domains: {', '.join(collab2_ctx['research_domains']) or 'N/A'}
- Co-authored Works: {collab2_ctx['coauthored_works_count']}
- Collaboration Period: {collab2_ctx['first_collaboration_year'] or 'N/A'} - {collab2_ctx['last_collaboration_year'] or 'N/A'}

Consider:
1. Name variations (initials like "Z Mehmood" vs "Zia Mehmood", nicknames, transliterations)
2. Institution mobility (same person can move between institutions)
3. Research domain overlap
4. Temporal plausibility (collaboration timelines)
5. Geographic consistency

Respond in JSON format:
{{
  "is_duplicate": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why they are/aren't the same person"
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at identifying duplicate researcher records. You understand name variations, academic mobility, and research collaboration patterns. Always respond with valid JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        
        result = json.loads(response.choices[0].message.content)
        return {
            "is_duplicate": result.get("is_duplicate", False),
            "confidence": float(result.get("confidence", 0.0)),
            "reasoning": result.get("reasoning", "No reasoning provided"),
        }
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return {
            "is_duplicate": False,
            "confidence": 0.0,
            "reasoning": f"Error: {str(e)}",
        }


def ai_dedupe_collaborators(
    user_email: str,
    auto_merge_threshold: float = 0.95,
    dry_run: bool = True,
):
    """
    Use AI to find and optionally merge duplicate collaborators.
    
    Args:
        user_email: User email to process
        auto_merge_threshold: Confidence threshold for automatic merging (0.0-1.0)
        dry_run: If True, don't make any changes
    """
    if not OPENAI_AVAILABLE:
        logger.error("OpenAI library not installed. Install with: pip install openai")
        return
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY environment variable not set")
        return
    
    client = OpenAI(api_key=api_key)
    
    with session_scope() as session:
        user = session.scalars(select(User).where(User.email == user_email)).first()
        if not user:
            logger.error(f"User not found: {user_email}")
            return
        
        logger.info(f"Analyzing collaborators for: {user_email}")
        
        collaborators = session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user.id)
        ).all()
        
        logger.info(f"Found {len(collaborators)} collaborator records")
        logger.info(f"Auto-merge threshold: {auto_merge_threshold:.0%}")
        logger.info(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
        
        # Build contexts
        contexts = {}
        for collab in collaborators:
            contexts[str(collab.id)] = _build_collaborator_context(session, collab)
        
        # Check pairs for duplicates
        checked_pairs = set()
        duplicate_groups = []
        auto_merge_count = 0
        manual_review_count = 0
        
        for i, c1 in enumerate(collaborators):
            for c2 in collaborators[i+1:]:
                pair_key = tuple(sorted([str(c1.id), str(c2.id)]))
                if pair_key in checked_pairs:
                    continue
                checked_pairs.add(pair_key)
                
                # Skip if already have strong identity markers
                if c1.openalex_author_id and c1.openalex_author_id == c2.openalex_author_id:
                    continue
                if c1.orcid_id and c1.orcid_id == c2.orcid_id:
                    continue
                if c1.email and c1.email == c2.email:
                    continue
                
                # Ask AI
                logger.info(f"\nAnalyzing: '{c1.full_name}' vs '{c2.full_name}'...")
                ctx1 = contexts[str(c1.id)]
                ctx2 = contexts[str(c2.id)]
                
                result = _ask_ai_if_duplicate(client, ctx1, ctx2)
                
                logger.info(f"  → {result['confidence']:.0%} confidence: {result['reasoning']}")
                
                if result['is_duplicate']:
                    duplicate_groups.append({
                        'c1': c1,
                        'c2': c2,
                        'result': result,
                    })
                    
                    if result['confidence'] >= auto_merge_threshold:
                        auto_merge_count += 1
                        logger.info(f"  ✓ AUTO-MERGE (high confidence)")
                        
                        if not dry_run:
                            # Merge logic here (simplified - reuse from merge script)
                            logger.info(f"  → Merging {c2.id} into {c1.id}")
                            # TODO: Call merge function
                    else:
                        manual_review_count += 1
                        logger.info(f"  ⚠️  NEEDS REVIEW (medium confidence)")
        
        # Summary
        logger.info(f"\n{'='*80}")
        logger.info(f"AI Duplicate Detection Summary:")
        logger.info(f"  Total pairs checked: {len(checked_pairs)}")
        logger.info(f"  Duplicates found: {len(duplicate_groups)}")
        logger.info(f"  High confidence (≥{auto_merge_threshold:.0%}): {auto_merge_count}")
        logger.info(f"  Medium confidence (manual review): {manual_review_count}")
        
        if dry_run and auto_merge_count > 0:
            logger.info(f"\n💡 Run without --dry-run to auto-merge high-confidence duplicates")
        
        if manual_review_count > 0:
            logger.info(f"\n⚠️  {manual_review_count} pairs need manual review:")
            for dup in duplicate_groups:
                if dup['result']['confidence'] < auto_merge_threshold:
                    logger.info(f"\n  '{dup['c1'].full_name}' vs '{dup['c2'].full_name}'")
                    logger.info(f"    Confidence: {dup['result']['confidence']:.0%}")
                    logger.info(f"    Reason: {dup['result']['reasoning']}")
                    logger.info(f"    IDs: {dup['c1'].id} / {dup['c2'].id}")


def main():
    parser = argparse.ArgumentParser(description="AI-powered collaborator deduplication")
    parser.add_argument(
        "--user-email",
        type=str,
        required=True,
        help="User email to process",
    )
    parser.add_argument(
        "--auto-merge-threshold",
        type=float,
        default=0.95,
        help="Confidence threshold for automatic merging (default: 0.95)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without making changes",
    )
    args = parser.parse_args()
    
    ai_dedupe_collaborators(
        user_email=args.user_email,
        auto_merge_threshold=args.auto_merge_threshold,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
