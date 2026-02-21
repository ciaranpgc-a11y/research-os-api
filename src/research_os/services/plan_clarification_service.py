from __future__ import annotations

import json
import re
from typing import Any

from research_os.clients.openai_client import get_client

PREFERRED_MODEL = "gpt-5.2"
FALLBACK_MODEL = "gpt-4.1-mini"


def _strip_json_fences(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _ask_model(prompt: str, preferred_model: str) -> tuple[str, str]:
    client = get_client()
    try:
        response = client.responses.create(model=preferred_model, input=prompt)
        return response.output_text, preferred_model
    except Exception:
        fallback_response = client.responses.create(model=FALLBACK_MODEL, input=prompt)
        return fallback_response.output_text, FALLBACK_MODEL


def _normalise_id(index: int, prompt: str) -> str:
    normalised = re.sub(r"[^a-z0-9]+", "_", prompt.strip().lower()).strip("_")
    if not normalised:
        return f"q{index + 1}"
    return f"q{index + 1}_{normalised[:40]}"


def _normalise_prompt(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip()
    if not cleaned:
        return ""
    if not cleaned.endswith("?"):
        cleaned = f"{cleaned.rstrip('.')}?"
    lowered = cleaned.lower()
    if lowered.startswith(("should ", "is ", "are ", "does ", "do ", "can ")):
        return cleaned
    return f"Should {cleaned[0].lower() + cleaned[1:]}" if len(cleaned) > 1 else f"Should {cleaned.lower()}"


def _fallback_questions(
    *,
    target_journal: str,
    research_category: str,
    study_type: str,
    interpretation_mode: str,
    article_type: str,
    word_length: str,
) -> list[dict[str, str]]:
    journal = target_journal or "the target journal"
    category = research_category or "the selected research category"
    study = study_type or "the selected study type"
    interpretation = interpretation_mode or "the selected interpretation mode"
    manuscript_type = article_type or "the selected article type"
    length = word_length or "the selected target word length"

    prompts = [
        f"Should the Introduction include one explicit objective aligned with {study}?",
        f"Should Methods justify why {study} is appropriate for {category}?",
        "Should Methods include explicit eligibility criteria and endpoint definitions?",
        "Should Methods state missing-data handling and planned sensitivity analyses?",
        "Should Results require primary estimates with uncertainty wording for each main outcome?",
        "Should Discussion include a dedicated limitations subsection with alternative explanations?",
        f"Should interpretation language stay within {interpretation} across all sections?",
        f"Should section framing be tuned to {journal} expectations?",
        f"Should the plan follow {manuscript_type} conventions for section emphasis?",
        f"Should section detail be budgeted to fit {length}?",
    ]
    rationales = [
        "Prevents objective drift before drafting.",
        "Locks design justification before generation.",
        "Ensures core methodological essentials are explicit.",
        "Pre-empts reviewer concerns about robustness.",
        "Keeps reporting structure rigorous and consistent.",
        "Prevents over-claiming in interpretation.",
        "Maintains the declared inferential contract.",
        "Improves journal fit before draft generation.",
        "Reduces mismatch with expected manuscript structure.",
        "Controls scope and prevents over-length drafts.",
    ]
    return [
        {
            "id": _normalise_id(index, prompt),
            "prompt": prompt,
            "rationale": rationales[index],
        }
        for index, prompt in enumerate(prompts)
    ]


def _coerce_questions(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, str]] = []
    seen_prompts: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        prompt = _normalise_prompt(str(item.get("prompt", "")).strip())
        if not prompt:
            continue
        key = prompt.lower()
        if key in seen_prompts:
            continue
        seen_prompts.add(key)
        rationale = re.sub(r"\s+", " ", str(item.get("rationale", "")).strip())
        if not rationale:
            rationale = "Clarifies planning intent before section generation."
        question_id = str(item.get("id", "")).strip() or _normalise_id(index, prompt)
        cleaned.append(
            {
                "id": question_id,
                "prompt": prompt,
                "rationale": rationale,
            }
        )
        if len(cleaned) >= 10:
            break
    return cleaned


def generate_plan_clarification_questions(
    *,
    target_journal: str,
    research_category: str,
    study_type: str,
    interpretation_mode: str,
    article_type: str,
    word_length: str,
    summary_of_research: str,
    preferred_model: str = PREFERRED_MODEL,
) -> dict[str, object]:
    prompt = f"""
You are building clarification questions for manuscript planning.
Generate exactly 10 yes/no questions with short rationale, tailored to the provided context.

Context:
- target_journal: {target_journal}
- research_category: {research_category}
- study_type: {study_type}
- interpretation_mode: {interpretation_mode}
- article_type: {article_type}
- word_length: {word_length}
- summary_of_research: {summary_of_research}

Rules:
- Output exactly 10 items.
- Each prompt must be answerable as Yes or No.
- Each prompt must start with "Should", "Is", "Are", "Do", "Does", or "Can".
- Focus on questions that improve planning quality for Introduction, Methods, Results, Discussion, and Conclusion.
- Keep prompts concrete and actionable.
- Keep rationale to one sentence.
- Use British English.
- Do not output markdown.

Return JSON only:
{{
  "questions": [
    {{
      "id": "string",
      "prompt": "string",
      "rationale": "string"
    }}
  ]
}}
""".strip()

    fallback_questions = _fallback_questions(
        target_journal=target_journal,
        research_category=research_category,
        study_type=study_type,
        interpretation_mode=interpretation_mode,
        article_type=article_type,
        word_length=word_length,
    )
    try:
        raw_output, model_used = _ask_model(prompt, preferred_model=preferred_model)
        parsed = json.loads(_strip_json_fences(raw_output))
        questions = _coerce_questions(parsed.get("questions"))
        if len(questions) < 10:
            existing = {item["prompt"].strip().lower() for item in questions}
            for fallback in fallback_questions:
                key = fallback["prompt"].strip().lower()
                if key in existing:
                    continue
                questions.append(fallback)
                existing.add(key)
                if len(questions) >= 10:
                    break
        questions = questions[:10]
        if len(questions) < 10:
            questions = fallback_questions
        return {
            "questions": questions,
            "model_used": model_used,
        }
    except Exception:
        return {
            "questions": fallback_questions,
            "model_used": preferred_model,
        }
