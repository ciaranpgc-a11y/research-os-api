"""
AI-powered automatic collaborator deduplication service.

This module provides automatic duplicate detection and merging using OpenAI.
It runs automatically after imports and enrichments, and can run as a background job.
"""

import json
import logging
import os
import re
from typing import Any

from sqlalchemy import delete, func, select

from research_os.db import (
    Collaborator,
    CollaboratorAffiliation,
    CollaborationMetric,
    session_scope,
)

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

_ORCID_RE = re.compile(r"^\d{4}-\d{4}-\d{4}-[\dX]{4}$")
AI_DEDUPE_CONFIDENCE_THRESHOLD = 0.92  # Auto-merge if AI is 92%+ confident


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


def _build_collaborator_summary(session, collaborator: Collaborator) -> str:
    """Build concise summary for AI analysis."""
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
    
    institutions = {collaborator.primary_institution} if collaborator.primary_institution else set()
    for aff in affiliations:
        if aff.institution_name:
            institutions.add(aff.institution_name)
    
    parts = [f"Name: {collaborator.full_name}"]
    if collaborator.email:
        parts.append(f"Email: {collaborator.email}")
    if collaborator.orcid_id:
        parts.append(f"ORCID: {collaborator.orcid_id}")
    if collaborator.openalex_author_id:
        parts.append(f"OpenAlex: {collaborator.openalex_author_id}")
    if institutions:
        parts.append(f"Institutions: {', '.join(sorted(institutions))}")
    if collaborator.country:
        parts.append(f"Country: {collaborator.country}")
    if metric:
        parts.append(f"Works: {metric.coauthored_works_count or 0}")
        if metric.first_collaboration_year and metric.last_collaboration_year:
            parts.append(f"Period: {metric.first_collaboration_year}-{metric.last_collaboration_year}")
    
    return " | ".join(parts)


def _ask_ai_batch_duplicates(client: OpenAI, summaries: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
    """
    Ask AI to identify duplicates in a batch.
    
    Args:
        summaries: List of (id1, id2, summary_pair) tuples
    
    Returns:
        List of results with is_duplicate, confidence, reasoning
    """
    if not summaries:
        return []
    
    pairs_text = "\n\n".join([
        f"PAIR {i+1} (IDs: {id1}, {id2}):\n{summary}"
        for i, (id1, id2, summary) in enumerate(summaries)
    ])
    
    prompt = f"""You are analyzing research collaborator records to find duplicates. For each pair below, determine if they represent the SAME PERSON.

Consider:
- Name variations (initials like "Z Mehmood" vs "Zia Mehmood", nicknames)
- Same person can work at multiple institutions over time
- Research domains and collaboration periods should align
- ORCID/OpenAlex IDs are definitive if present

{pairs_text}

Respond with a JSON array (one entry per pair in order):
[
  {{"pair": 1, "is_duplicate": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}},
  ...
]"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert at identifying duplicate researcher records. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        
        result = json.loads(response.choices[0].message.content)
        results_array = result if isinstance(result, list) else result.get("results", [])
        return results_array
    except Exception as e:
        logger.error(f"OpenAI batch analysis error: {e}")
        return []


def _merge_collaborators(session, keep_id: str, merge_id: str) -> bool:
    """Merge two collaborator records."""
    try:
        keep = session.get(Collaborator, keep_id)
        merge = session.get(Collaborator, merge_id)
        
        if not keep or not merge:
            return False
        
        # Merge fields
        if not keep.orcid_id and merge.orcid_id:
            keep.orcid_id = merge.orcid_id
        if not keep.openalex_author_id and merge.openalex_author_id:
            keep.openalex_author_id = merge.openalex_author_id
        if not keep.email and merge.email:
            keep.email = merge.email
        if not keep.preferred_name and merge.preferred_name:
            keep.preferred_name = merge.preferred_name
        
        # Merge institutions
        merge_institutions = {merge.primary_institution} if merge.primary_institution else set()
        merge_affs = session.scalars(
            select(CollaboratorAffiliation).where(
                CollaboratorAffiliation.collaborator_id == merge_id
            )
        ).all()
        for aff in merge_affs:
            if aff.institution_name:
                merge_institutions.add(aff.institution_name)
        
        for inst in merge_institutions:
            existing = session.scalars(
                select(CollaboratorAffiliation).where(
                    CollaboratorAffiliation.collaborator_id == keep_id,
                    func.lower(CollaboratorAffiliation.institution_name) == inst.lower()
                )
            ).first()
            if not existing:
                session.add(CollaboratorAffiliation(
                    collaborator_id=keep_id,
                    institution_name=inst
                ))
        
        # Merge metrics
        keep_metric = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.collaborator_id == keep_id
            )
        ).first()
        merge_metric = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.collaborator_id == merge_id
            )
        ).first()
        
        if keep_metric and merge_metric:
            keep_metric.coauthored_works_count = max(
                keep_metric.coauthored_works_count or 0,
                merge_metric.coauthored_works_count or 0
            )
        
        # Delete duplicate
        session.execute(
            delete(CollaborationMetric).where(
                CollaborationMetric.collaborator_id == merge_id
            )
        )
        session.execute(
            delete(CollaboratorAffiliation).where(
                CollaboratorAffiliation.collaborator_id == merge_id
            )
        )
        session.delete(merge)
        
        return True
    except Exception as e:
        logger.error(f"Error merging collaborators {keep_id} and {merge_id}: {e}")
        return False


def auto_dedupe_collaborators(*, user_id: str) -> dict[str, Any]:
    """
    Automatically detect and merge duplicate collaborators using AI.
    
    This runs after imports/enrichments to ensure clean data.
    
    Args:
        user_id: User ID to dedupe collaborators for
    
    Returns:
        {
            "checked_pairs": int,
            "duplicates_found": int,
            "merged_count": int,
            "skipped_low_confidence": int,
        }
    """
    if not OPENAI_AVAILABLE:
        logger.warning("OpenAI not available, skipping AI deduplication")
        return {"checked_pairs": 0, "duplicates_found": 0, "merged_count": 0, "skipped_low_confidence": 0}
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set, skipping AI deduplication")
        return {"checked_pairs": 0, "duplicates_found": 0, "merged_count": 0, "skipped_low_confidence": 0}
    
    client = OpenAI(api_key=api_key)
    
    with session_scope() as session:
        collaborators = session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).all()
        
        if len(collaborators) < 2:
            return {"checked_pairs": 0, "duplicates_found": 0, "merged_count": 0, "skipped_low_confidence": 0}
        
        # Build summaries
        summaries = {}
        for collab in collaborators:
            summaries[str(collab.id)] = _build_collaborator_summary(session, collab)
        
        # Check pairs (skip if they have matching identity markers)
        pairs_to_check = []
        checked_pairs = 0
        
        for i, c1 in enumerate(collaborators):
            for c2 in collaborators[i+1:]:
                # Skip obvious non-duplicates
                if c1.openalex_author_id and c2.openalex_author_id and c1.openalex_author_id == c2.openalex_author_id:
                    continue
                if c1.orcid_id and c2.orcid_id and c1.orcid_id == c2.orcid_id:
                    continue
                if c1.email and c2.email and c1.email == c2.email:
                    continue
                
                summary1 = summaries[str(c1.id)]
                summary2 = summaries[str(c2.id)]
                pair_summary = f"A: {summary1}\nB: {summary2}"
                
                pairs_to_check.append((str(c1.id), str(c2.id), pair_summary))
                checked_pairs += 1
        
        if not pairs_to_check:
            return {"checked_pairs": 0, "duplicates_found": 0, "merged_count": 0, "skipped_low_confidence": 0}
        
        # Analyze in batches
        batch_size = 10
        results = []
        for i in range(0, len(pairs_to_check), batch_size):
            batch = pairs_to_check[i:i+batch_size]
            batch_results = _ask_ai_batch_duplicates(client, batch)
            results.extend(batch_results)
        
        # Merge high-confidence duplicates
        duplicates_found = 0
        merged_count = 0
        skipped_low_confidence = 0
        
        for i, result in enumerate(results):
            if not result.get("is_duplicate"):
                continue
            
            duplicates_found += 1
            confidence = float(result.get("confidence", 0.0))
            
            if confidence >= AI_DEDUPE_CONFIDENCE_THRESHOLD:
                id1, id2, _ = pairs_to_check[i]
                if _merge_collaborators(session, id1, id2):
                    merged_count += 1
                    logger.info(f"AI auto-merged collaborators {id1} and {id2} (confidence: {confidence:.0%})")
                else:
                    logger.warning(f"Failed to merge {id1} and {id2}")
            else:
                skipped_low_confidence += 1
                logger.info(f"Skipped low-confidence match ({confidence:.0%}): {result.get('reasoning')}")
        
        session.commit()
        
        return {
            "checked_pairs": checked_pairs,
            "duplicates_found": duplicates_found,
            "merged_count": merged_count,
            "skipped_low_confidence": skipped_low_confidence,
        }
