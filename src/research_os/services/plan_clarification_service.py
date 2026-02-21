from __future__ import annotations

import json
import re
from typing import Any

from research_os.clients.openai_client import get_client

PREFERRED_MODEL = "gpt-5.2"
FALLBACK_MODEL = "gpt-4.1-mini"
YES_NO_PREFIXES = ("should ", "is ", "are ", "do ", "does ", "can ")
SECTION_TERMS = {"introduction", "methods", "results", "discussion", "conclusion"}
STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "into",
    "onto",
    "study",
    "article",
    "journal",
    "mode",
    "type",
    "word",
    "length",
}
RESEARCH_CATEGORY_OPTIONS = (
    "Observational Clinical Cohort",
    "Imaging Biomarker Study",
    "Prognostic / Risk Modelling",
    "Diagnostic Study",
    "Reproducibility / Technical Validation",
    "Multimodality Integration",
    "AI / Radiomics",
    "Methodological / Analytical",
)
INTERPRETATION_MODE_OPTIONS = (
    "Descriptive phenotype characterization",
    "Descriptive epidemiology and prevalence patterning",
    "Associative risk or prognostic inference",
    "Adjusted association interpretation (multivariable)",
    "Time-to-event prognostic interpretation",
    "Diagnostic performance interpretation",
    "Incremental diagnostic value interpretation",
    "Predictive model development interpretation",
    "Predictive model internal validation interpretation",
    "Predictive model external validation interpretation",
    "Comparative effectiveness interpretation (non-causal)",
    "Treatment-response heterogeneity exploration (non-causal)",
    "Hypothesis-generating mechanistic interpretation",
    "Pathophysiologic plausibility interpretation",
    "Replication or confirmatory association interpretation",
    "Safety and feasibility characterization",
    "Implementation and workflow feasibility interpretation",
)


def _strip_json_fences(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _extract_json_object(raw_text: str) -> str:
    cleaned = _strip_json_fences(raw_text)
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in model output.")
    return match.group(0)


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
    return f"q{index + 1}_{normalised[:48]}"


def _normalise_prompt(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip()
    if not cleaned:
        return ""
    if not cleaned.endswith("?"):
        cleaned = f"{cleaned.rstrip('.')}?"
    lowered = cleaned.lower()
    if lowered.startswith(YES_NO_PREFIXES):
        return cleaned
    if len(cleaned) > 1:
        return f"Should {cleaned[0].lower() + cleaned[1:]}"
    return f"Should {cleaned.lower()}"


def _content_tokens(*values: str) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        for token in re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", value.lower()):
            if token in STOPWORDS:
                continue
            tokens.add(token)
    return tokens


def _is_contextual(prompt: str, context_tokens: set[str]) -> bool:
    lowered = prompt.lower()
    if any(term in lowered for term in SECTION_TERMS):
        return True
    prompt_tokens = set(re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", lowered))
    return len(prompt_tokens.intersection(context_tokens)) > 0


def _coerce_questions(value: Any, context_tokens: set[str]) -> list[dict[str, str]]:
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
        lowered_prompt = prompt.lower()
        if not lowered_prompt.startswith(YES_NO_PREFIXES):
            continue
        if not _is_contextual(prompt, context_tokens):
            continue
        key = lowered_prompt
        if key in seen_prompts:
            continue
        seen_prompts.add(key)
        rationale = re.sub(r"\s+", " ", str(item.get("rationale", "")).strip())
        if not rationale:
            rationale = "Clarifies planning decisions before section generation."
        question_id = str(item.get("id", "")).strip() or _normalise_id(index, prompt)
        cleaned.append({"id": question_id, "prompt": prompt, "rationale": rationale})
        if len(cleaned) >= 10:
            break
    return cleaned


def _build_prompt(
    *,
    project_title: str,
    target_journal: str,
    target_journal_label: str,
    research_category: str,
    study_type: str,
    interpretation_mode: str,
    article_type: str,
    word_length: str,
    summary_of_research: str,
) -> str:
    missing_fields = [
        label
        for label, value in (
            ("project_title", project_title),
            ("target_journal", target_journal_label or target_journal),
            ("research_category", research_category),
            ("study_type", study_type),
            ("interpretation_mode", interpretation_mode),
            ("article_type", article_type),
            ("word_length", word_length),
        )
        if not value.strip()
    ]
    missing_block = ", ".join(missing_fields) if missing_fields else "none"
    return f"""
You are an academic manuscript-planning assistant.
Generate clarification questions for Step 2 planning.

Use all provided context:
- project_title: {project_title}
- target_journal_slug: {target_journal}
- target_journal_label: {target_journal_label}
- research_category: {research_category}
- study_type: {study_type}
- interpretation_mode: {interpretation_mode}
- article_type: {article_type}
- target_word_length: {word_length}
- summary_of_research: {summary_of_research}
- missing_fields: {missing_block}

Requirements:
- Return exactly 10 unique questions.
- Each question must be yes/no answerable.
- Each question must start with one of: Should, Is, Are, Do, Does, Can.
- Questions must be specific to this context, not generic boilerplate.
- At least 2 questions should directly reference details from summary_of_research.
- Cover manuscript planning across Introduction, Methods, Results, Discussion, and Conclusion.
- If a key field is missing, include targeted yes/no questions to fill that gap.
- Use British English spelling.
- Keep each rationale to one sentence.
- Do not provide fixed templates or placeholders.
- Return valid JSON only.

Return JSON with this schema exactly:
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


def _build_completion_prompt(
    *,
    remaining: int,
    existing_prompts: list[str],
    context_prompt: str,
) -> str:
    existing_block = "\n".join(f"- {item}" for item in existing_prompts) or "- none"
    return f"""
{context_prompt}

The previous output was incomplete.
Generate exactly {remaining} additional questions that are not duplicates of:
{existing_block}

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


def _merge_model_labels(*labels: str) -> str:
    cleaned = [label.strip() for label in labels if label.strip()]
    deduped: list[str] = []
    for label in cleaned:
        if label in deduped:
            continue
        deduped.append(label)
    return ",".join(deduped)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    if isinstance(value, (int, float)):
        return value != 0
    return default


def _normalise_choice_label(value: str) -> str:
    normalized = value.strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _resolve_canonical_option(raw_choice: str, options: list[str]) -> str:
    normalized_choice = _normalise_choice_label(raw_choice)
    if not normalized_choice:
        return ""

    for option in options:
        if _normalise_choice_label(option) == normalized_choice:
            return option

    for option in options:
        normalized_option = _normalise_choice_label(option)
        if not normalized_option:
            continue
        if normalized_option in normalized_choice or normalized_choice in normalized_option:
            return option

    choice_tokens = set(normalized_choice.split(" "))
    best_option = ""
    best_score = 0.0
    for option in options:
        option_tokens = set(_normalise_choice_label(option).split(" "))
        if not option_tokens:
            continue
        overlap = len(choice_tokens.intersection(option_tokens))
        recall = overlap / max(1, len(choice_tokens))
        precision = overlap / max(1, len(option_tokens))
        score = (recall + precision) / 2
        if score > best_score:
            best_score = score
            best_option = option
    if best_option and best_score >= 0.55:
        return best_option
    return ""


def _clean_study_type_options(options: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for option in options:
        text = str(option).strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


def generate_plan_clarification_questions(
    *,
    project_title: str,
    target_journal: str,
    target_journal_label: str,
    research_category: str,
    study_type: str,
    interpretation_mode: str,
    article_type: str,
    word_length: str,
    summary_of_research: str,
    preferred_model: str = PREFERRED_MODEL,
) -> dict[str, object]:
    context_prompt = _build_prompt(
        project_title=project_title,
        target_journal=target_journal,
        target_journal_label=target_journal_label,
        research_category=research_category,
        study_type=study_type,
        interpretation_mode=interpretation_mode,
        article_type=article_type,
        word_length=word_length,
        summary_of_research=summary_of_research,
    )
    context_tokens = _content_tokens(
        project_title,
        target_journal_label,
        research_category,
        study_type,
        interpretation_mode,
        article_type,
        word_length,
        summary_of_research,
    )

    raw_output, first_model = _ask_model(context_prompt, preferred_model=preferred_model)
    parsed = json.loads(_extract_json_object(raw_output))
    questions = _coerce_questions(parsed.get("questions"), context_tokens)

    second_model = ""
    if len(questions) < 10:
        completion_prompt = _build_completion_prompt(
            remaining=10 - len(questions),
            existing_prompts=[item["prompt"] for item in questions],
            context_prompt=context_prompt,
        )
        completion_output, second_model = _ask_model(
            completion_prompt, preferred_model=preferred_model
        )
        completion_parsed = json.loads(_extract_json_object(completion_output))
        additional = _coerce_questions(completion_parsed.get("questions"), context_tokens)
        existing = {item["prompt"].strip().lower() for item in questions}
        for item in additional:
            key = item["prompt"].strip().lower()
            if key in existing:
                continue
            questions.append(item)
            existing.add(key)
            if len(questions) >= 10:
                break

    if len(questions) < 10:
        raise ValueError(
            "AI could not generate 10 contextual clarification questions. Refresh and retry."
        )

    final_questions = [
        {
            "id": question["id"] or _normalise_id(index, question["prompt"]),
            "prompt": question["prompt"],
            "rationale": question["rationale"],
        }
        for index, question in enumerate(questions[:10])
    ]
    return {
        "questions": final_questions,
        "model_used": _merge_model_labels(first_model, second_model),
    }


def _normalise_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    seen_prompts: set[str] = set()
    for item in history:
        prompt = _normalise_prompt(str(item.get("prompt", "")).strip())
        answer = str(item.get("answer", "")).strip().lower()
        if not prompt or answer not in {"yes", "no"}:
            continue
        key = prompt.lower()
        if key in seen_prompts:
            continue
        seen_prompts.add(key)
        cleaned.append(
            {
                "prompt": prompt,
                "answer": answer,
                "comment": str(item.get("comment", "")).strip(),
            }
        )
    return cleaned


def _format_history(history: list[dict[str, str]]) -> str:
    if not history:
        return "None yet."
    lines: list[str] = []
    for index, item in enumerate(history, start=1):
        comment = item.get("comment", "").strip()
        if comment:
            lines.append(
                f"{index}. Q: {item['prompt']} | A: {item['answer'].upper()} | Comment: {comment}"
            )
        else:
            lines.append(f"{index}. Q: {item['prompt']} | A: {item['answer'].upper()}")
    return "\n".join(lines)


def _format_no_history_prompts(history: list[dict[str, str]]) -> str:
    no_prompts = [item["prompt"] for item in history if item.get("answer") == "no"]
    if not no_prompts:
        return "None."
    return "\n".join(f"- {prompt}" for prompt in no_prompts)


def _coerce_single_question(
    parsed_payload: Any,
    *,
    context_tokens: set[str],
    existing_prompts: set[str],
    next_index: int,
) -> dict[str, str] | None:
    if not isinstance(parsed_payload, dict):
        return None
    raw_question = parsed_payload.get("question")
    if raw_question is None and "prompt" in parsed_payload:
        raw_question = parsed_payload
    if not isinstance(raw_question, dict):
        return None

    prompt = _normalise_prompt(str(raw_question.get("prompt", "")).strip())
    if not prompt:
        return None
    if prompt.lower() in existing_prompts:
        return None
    if not _is_contextual(prompt, context_tokens):
        return None

    rationale = re.sub(r"\s+", " ", str(raw_question.get("rationale", "")).strip())
    if not rationale:
        rationale = "Clarifies a key planning decision before section generation."
    question_id = str(raw_question.get("id", "")).strip() or _normalise_id(next_index, prompt)
    return {"id": question_id, "prompt": prompt, "rationale": rationale}


def _coerce_updated_fields(
    payload: Any,
    *,
    current_summary: str,
    current_research_category: str,
    current_study_type: str,
    current_interpretation_mode: str,
    current_article_type: str,
    current_word_length: str,
    study_type_options: list[str],
) -> dict[str, str]:
    if not isinstance(payload, dict):
        payload = {}
    summary_candidate = re.sub(
        r"\s+", " ", str(payload.get("summary_of_research", "")).strip()
    )
    if len(summary_candidate) < 20:
        summary_candidate = current_summary.strip()

    category_options = list(RESEARCH_CATEGORY_OPTIONS)
    research_category = _resolve_canonical_option(
        str(payload.get("research_category", "")), category_options
    ) or current_research_category.strip()

    resolved_study_type = _resolve_canonical_option(
        str(payload.get("study_type", "")),
        study_type_options,
    )
    study_type = resolved_study_type or current_study_type.strip()

    interpretation_mode = _resolve_canonical_option(
        str(payload.get("interpretation_mode", "")),
        list(INTERPRETATION_MODE_OPTIONS),
    ) or current_interpretation_mode.strip()

    article_type = str(payload.get("article_type", "")).strip() or current_article_type.strip()
    word_length = str(payload.get("word_length", "")).strip() or current_word_length.strip()

    return {
        "summary_of_research": summary_candidate,
        "research_category": research_category,
        "study_type": study_type,
        "interpretation_mode": interpretation_mode,
        "article_type": article_type,
        "word_length": word_length,
    }


def _build_next_question_prompt(
    *,
    project_title: str,
    target_journal: str,
    target_journal_label: str,
    research_category: str,
    study_type: str,
    interpretation_mode: str,
    article_type: str,
    word_length: str,
    summary_of_research: str,
    study_type_options: list[str],
    max_questions: int,
    history: list[dict[str, str]],
) -> str:
    missing_fields = [
        label
        for label, value in (
            ("project_title", project_title),
            ("target_journal", target_journal_label or target_journal),
            ("research_category", research_category),
            ("study_type", study_type),
            ("interpretation_mode", interpretation_mode),
            ("article_type", article_type),
            ("word_length", word_length),
        )
        if not value.strip()
    ]
    missing_block = ", ".join(missing_fields) if missing_fields else "none"
    history_block = _format_history(history)
    no_answers_block = _format_no_history_prompts(history)
    remaining = max(0, max_questions - len(history))
    study_type_block = "\n".join(f"- {item}" for item in study_type_options) or "- none supplied"
    research_category_block = "\n".join(f"- {item}" for item in RESEARCH_CATEGORY_OPTIONS)
    interpretation_mode_block = "\n".join(f"- {item}" for item in INTERPRETATION_MODE_OPTIONS)
    return f"""
You are generating the next single clarification question for manuscript planning.
This is an adaptive sequence; each prior answer must influence the next question choice.

Context:
- project_title: {project_title}
- target_journal_slug: {target_journal}
- target_journal_label: {target_journal_label}
- research_category: {research_category}
- study_type: {study_type}
- interpretation_mode: {interpretation_mode}
- article_type: {article_type}
- target_word_length: {word_length}
- summary_of_research: {summary_of_research}
- missing_fields: {missing_block}
- asked_so_far: {len(history)}
- max_questions: {max_questions}
- remaining_slots: {remaining}

Question/answer history:
{history_block}

Questions answered NO (avoid repeating these themes unless critical):
{no_answers_block}

Allowed research categories:
{research_category_block}

Allowed study types (choose from this list for updates):
{study_type_block}

Allowed interpretation modes:
{interpretation_mode_block}

Rules:
- Return exactly one new yes/no question.
- Question must start with one of: Should, Is, Are, Do, Does, Can.
- The question must be specific to this manuscript context.
- Do not repeat prior questions.
- If the user answered NO to a theme, move to a different unresolved uncertainty.
- Prefer the highest-impact unresolved decision for plan quality.
- Keep rationale to one sentence.
- Use British English.
- Update the summary_of_research after incorporating the full history.
- The updated summary must be factual, non-fabricated, and more specific than the prior summary.
- Provide an AI manuscript plan summary that describes planned Introduction, Methods, Results, Discussion, and Conclusion.
- Return valid JSON only.

Return JSON:
{{
  "updated_fields": {{
    "summary_of_research": "string",
    "research_category": "string",
    "study_type": "string",
    "interpretation_mode": "string",
    "article_type": "string",
    "word_length": "string"
  }},
  "manuscript_plan_summary": "string",
  "ready_for_plan": true | false,
  "confidence_percent": 0-100 integer,
  "additional_questions_for_full_confidence": non-negative integer,
  "advice": "string",
  "question": {{
    "id": "string",
    "prompt": "string",
    "rationale": "string"
  }} | null
}}
""".strip()


def generate_next_plan_clarification_question(
    *,
    project_title: str,
    target_journal: str,
    target_journal_label: str,
    research_category: str,
    study_type: str,
    interpretation_mode: str,
    article_type: str,
    word_length: str,
    summary_of_research: str,
    study_type_options: list[str],
    history: list[dict[str, str]],
    max_questions: int = 10,
    force_next_question: bool = False,
    preferred_model: str = PREFERRED_MODEL,
) -> dict[str, object]:
    safe_max_questions = max(1, min(max_questions, 20))
    hard_limit = 30
    cleaned_history = _normalise_history(history)
    cleaned_study_type_options = _clean_study_type_options(study_type_options)
    if current_study_type := study_type.strip():
        if current_study_type not in cleaned_study_type_options:
            cleaned_study_type_options.append(current_study_type)
    asked_count = len(cleaned_history)
    if asked_count >= hard_limit:
        return {
            "question": None,
            "completed": True,
            "ready_for_plan": True,
            "confidence_percent": 100,
            "additional_questions_for_full_confidence": 0,
            "advice": "Maximum clarification depth reached. Proceed to plan generation.",
            "updated_fields": {
                "summary_of_research": summary_of_research.strip(),
                "research_category": research_category.strip(),
                "study_type": study_type.strip(),
                "interpretation_mode": interpretation_mode.strip(),
                "article_type": article_type.strip(),
                "word_length": word_length.strip(),
            },
            "manuscript_plan_summary": "",
            "asked_count": asked_count,
            "max_questions": safe_max_questions,
            "model_used": preferred_model,
        }

    context_tokens = _content_tokens(
        project_title,
        target_journal_label,
        research_category,
        study_type,
        interpretation_mode,
        article_type,
        word_length,
        summary_of_research,
    )
    existing_prompts = {item["prompt"].strip().lower() for item in cleaned_history}
    base_prompt = _build_next_question_prompt(
        project_title=project_title,
        target_journal=target_journal,
        target_journal_label=target_journal_label,
        research_category=research_category,
        study_type=study_type,
        interpretation_mode=interpretation_mode,
        article_type=article_type,
        word_length=word_length,
        summary_of_research=summary_of_research,
        study_type_options=cleaned_study_type_options,
        max_questions=safe_max_questions,
        history=cleaned_history,
    )
    readiness_prompt = f"""
{base_prompt}

In addition to the next question logic, assess plan-readiness now.

Return JSON only with this schema:
{{
  "updated_fields": {{
    "summary_of_research": "string",
    "research_category": "string",
    "study_type": "string",
    "interpretation_mode": "string",
    "article_type": "string",
    "word_length": "string"
  }},
  "manuscript_plan_summary": "string",
  "ready_for_plan": true | false,
  "confidence_percent": 0-100 integer,
  "additional_questions_for_full_confidence": non-negative integer,
  "advice": "string",
  "question": {{
    "id": "string",
    "prompt": "string",
    "rationale": "string"
  }} | null
}}

Rules:
- If ready_for_plan is true and force_next_question is false, set question to null.
- If ready_for_plan is false, question is required.
- If force_next_question is true, question is required unless hard limit reached.
- confidence_percent reflects current plan-readiness from available context and history.
- additional_questions_for_full_confidence should estimate how many more targeted questions are needed for 100% confidence.
- Keep advice concise and actionable.
- updated_fields.summary_of_research must integrate the latest answer history without fabricating data.
- manuscript_plan_summary must describe the planned Introduction, Methods, Results, Discussion, and Conclusion.

force_next_question: {"true" if force_next_question else "false"}
""".strip()

    first_output, first_model = _ask_model(readiness_prompt, preferred_model=preferred_model)
    first_parsed = json.loads(_extract_json_object(first_output))
    ready_for_plan = _safe_bool(first_parsed.get("ready_for_plan"), default=False)
    confidence_percent = _safe_int(first_parsed.get("confidence_percent", 0), default=0)
    confidence_percent = max(0, min(100, confidence_percent))
    additional_questions_for_full_confidence = _safe_int(
        first_parsed.get("additional_questions_for_full_confidence", 0),
        default=0,
    )
    additional_questions_for_full_confidence = max(
        0, additional_questions_for_full_confidence
    )
    advice = re.sub(r"\s+", " ", str(first_parsed.get("advice", "")).strip())
    if not advice:
        advice = (
            "Proceed to plan generation."
            if ready_for_plan
            else "Answer the next clarification question to improve plan quality."
        )

    updated_fields = _coerce_updated_fields(
        first_parsed.get("updated_fields"),
        current_summary=summary_of_research,
        current_research_category=research_category,
        current_study_type=study_type,
        current_interpretation_mode=interpretation_mode,
        current_article_type=article_type,
        current_word_length=word_length,
        study_type_options=cleaned_study_type_options,
    )
    manuscript_plan_summary = re.sub(
        r"\s+",
        " ",
        str(first_parsed.get("manuscript_plan_summary", "")).strip(),
    )
    if len(manuscript_plan_summary) < 24:
        manuscript_plan_summary = (
            "The plan will structure the manuscript across Introduction, Methods, Results, Discussion, and Conclusion using the clarified context."
        )

    question = None
    should_return_question = force_next_question or not ready_for_plan
    if should_return_question:
        question = _coerce_single_question(
            first_parsed,
            context_tokens=context_tokens,
            existing_prompts=existing_prompts,
            next_index=asked_count,
        )

    second_model = ""
    if should_return_question and question is None:
        repair_prompt = f"""
Your prior output did not produce a valid new question.
Generate exactly one valid replacement question using the same context.
Avoid these already asked prompts:
{_format_history(cleaned_history)}

Return JSON only:
{{
  "question": {{
    "id": "string",
    "prompt": "string",
    "rationale": "string"
  }}
}}
""".strip()
        second_output, second_model = _ask_model(
            f"{readiness_prompt}\n\n{repair_prompt}",
            preferred_model=preferred_model,
        )
        second_parsed = json.loads(_extract_json_object(second_output))
        question = _coerce_single_question(
            second_parsed,
            context_tokens=context_tokens,
            existing_prompts=existing_prompts,
            next_index=asked_count,
        )

    if should_return_question and question is None:
        raise ValueError(
            "AI could not generate a valid contextual next question. Refresh and retry."
        )

    completed = ready_for_plan and not force_next_question
    if not ready_for_plan:
        completed = False
    if force_next_question and question is not None:
        completed = False

    return {
        "question": question,
        "completed": completed,
        "ready_for_plan": ready_for_plan,
        "confidence_percent": confidence_percent,
        "additional_questions_for_full_confidence": additional_questions_for_full_confidence,
        "advice": advice,
        "updated_fields": updated_fields,
        "manuscript_plan_summary": manuscript_plan_summary,
        "asked_count": asked_count,
        "max_questions": safe_max_questions,
        "model_used": _merge_model_labels(first_model, second_model),
    }
