import os
import json
import re
from openai import OpenAI
from prompts import LANE_RUBRICS, SYSTEM_RULES


CRITIQUE_FALLBACKS = [
    (
        "Impact",
        "The bullet does not show a measurable outcome or clear result.",
        "Add a concrete outcome such as time saved, accuracy improved, revenue influenced, or scope delivered if you can verify it.",
    ),
    (
        "Specificity",
        "The experience is missing concrete tools, systems, or domain context.",
        "Name the stack, platform, dataset, workflow, or stakeholder context so the reader can understand what you actually worked on.",
    ),
    (
        "Ownership",
        "The phrasing does not make your personal contribution or decision-making clear.",
        "Lead with a strong action verb and state what you owned, designed, implemented, or improved.",
    ),
    (
        "Readability",
        "The content is harder to scan than it should be for a resume reviewer.",
        "Keep each bullet tight, front-load the action, and remove filler phrases so the result is obvious in one pass.",
    ),
]

QUESTION_FALLBACKS = [
    "What measurable outcome, scale, or business result can you verify for this work?",
    "Which tools, technologies, or platforms did you directly use?",
    "What was your specific ownership versus the broader team contribution?",
    "Who benefited from the work, and in what context or environment was it used?",
]
def extract_numbers(x):
    if x is None:
        s = ""
    elif isinstance(x, str):
        s = x
    else:
        try:
            s = json.dumps(x, ensure_ascii=False)
        except Exception:
            s = str(x)
    return set(re.findall(r"\d+(?:\.\d+)?%?", s)) # convert to avoid type errors


def extract_json_payload(raw):
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("Empty model response")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    return [value]


def _looks_like_tech_stack(text):
    patterns = [
        r"\bpython\b", r"\bjava\b", r"\bjavascript\b", r"\btypescript\b", r"\breact\b",
        r"\bnode\b", r"\bflask\b", r"\bdjango\b", r"\baws\b", r"\bazure\b", r"\bgcp\b",
        r"\bsql\b", r"\bkubernetes\b", r"\bdocker\b", r"\btensorflow\b", r"\bpytorch\b",
    ]
    lowered = text.lower()
    return any(re.search(pattern, lowered) for pattern in patterns)


def build_fallback_critique(text, critique):
    if critique:
        return critique

    items = []
    text_has_number = bool(extract_numbers(text))
    text_has_stack = _looks_like_tech_stack(text)
    sentences = [part.strip() for part in re.split(r"[\n.;]", text) if part.strip()]
    likely_long = any(len(sentence.split()) > 28 for sentence in sentences)

    for category, issue, suggestion in CRITIQUE_FALLBACKS:
        if category == "Impact" and text_has_number:
            continue
        if category == "Specificity" and text_has_stack:
            continue
        if category == "Readability" and not likely_long and len(sentences) <= 4:
            continue
        items.append({
            "category": category,
            "score_0_to_2": 1,
            "issue": issue,
            "suggestion": suggestion,
        })
        if len(items) >= 3:
            break

    while len(items) < 3:
        category, issue, suggestion = CRITIQUE_FALLBACKS[len(items)]
        items.append({
            "category": category,
            "score_0_to_2": 1,
            "issue": issue,
            "suggestion": suggestion,
        })

    return items


def build_fallback_questions(text, questions):
    clean_questions = [str(q).strip() for q in _as_list(questions) if str(q).strip()]
    if clean_questions:
        return clean_questions

    selected = []
    if not extract_numbers(text):
        selected.append(QUESTION_FALLBACKS[0])
    if not _looks_like_tech_stack(text):
        selected.append(QUESTION_FALLBACKS[1])
    selected.extend(QUESTION_FALLBACKS[2:])
    return selected[:3]


def normalize_review_payload(data, source_text):
    normalized = data if isinstance(data, dict) else {}
    critique = []
    for item in _as_list(normalized.get("critique")):
        if isinstance(item, dict):
            try:
                score = int(item.get("score_0_to_2", 1))
            except (TypeError, ValueError):
                score = 1
            critique.append({
                "category": str(item.get("category") or "Critique"),
                "score_0_to_2": max(0, min(2, score)),
                "issue": str(item.get("issue") or "").strip(),
                "suggestion": str(item.get("suggestion") or "").strip(),
            })
        elif str(item).strip():
            critique.append({
                "category": "Critique",
                "score_0_to_2": 1,
                "issue": str(item).strip(),
                "suggestion": "Revise this bullet to be more specific and outcome-oriented.",
            })

    critique = [
        item for item in critique
        if item["issue"] or item["suggestion"]
    ]
    critique = build_fallback_critique(source_text, critique)

    questions = []
    for question in build_fallback_questions(source_text, normalized.get("questions")):
        if question not in questions:
            questions.append(question)
    changes = [str(item).strip() for item in _as_list(normalized.get("changes")) if str(item).strip()]
    if not changes:
        changes = [item["suggestion"] for item in critique[:3] if item.get("suggestion")]

    safety_notes = [str(item).strip() for item in _as_list(normalized.get("safety_notes")) if str(item).strip()]

    normalized["rewrite"] = normalized.get("rewrite", "")
    normalized["critique"] = critique
    normalized["questions"] = questions
    normalized["changes"] = changes
    normalized["safety_notes"] = safety_notes
    return normalized


def _get_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (or is empty). Set it in your environment or a .env file.")
    return OpenAI(api_key=api_key)


def build_messages(text, lane, tone, action="", follow_up="", previous_rewrite=""):
    rubric = LANE_RUBRICS.get(lane, LANE_RUBRICS["SWE"])
    follow_up_block = ""
    if action or follow_up or previous_rewrite:
        follow_up_block = f"""
Revision context:
- Action: {action or "none"}
- User follow-up: {follow_up or "none"}
- Previous rewrite:
{previous_rewrite or "none"}
"""
    return [
        {"role": "system", "content": SYSTEM_RULES + "\n\n" + rubric},
        {"role": "user", "content": f"""
Input:
{text}
Lane: {lane}
Tone: {tone}
{follow_up_block}
Return STRICT JSON with keys:
rewrite,
critique (array of {{category, score_0_to_2, issue, suggestion}}),
questions (array),
changes (array),
safety_notes (array).
Requirements:
- Always return at least 3 critique items with actionable suggestions.
- Always return 2-3 constructive questions when information is missing or would strengthen the rewrite.
- If Action is approve, keep the facts the same and produce a more polished rewrite.
- If Action is provide_more_info, use the follow-up details to improve the rewrite and update critique/questions accordingly.
"""}
    ]


def review_text_openai(text, lane="SWE", tone="confident", action="", follow_up="", previous_rewrite=""):
    client = _get_client()

    resp = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=build_messages(text, lane, tone, action=action, follow_up=follow_up, previous_rewrite=previous_rewrite),
        temperature=0.3,
        max_tokens=1200,
        response_format={"type": "json_object"},
    )
    raw = (resp.choices[0].message.content or "").strip()
    data = normalize_review_payload(extract_json_payload(raw), text)
    if not extract_numbers(data.get("rewrite", "")).issubset(extract_numbers(text)):
        data.setdefault("safety_notes", []).append("Blocked potential added numbers/metrics.")
        data.setdefault("questions", []).append("What are the correct metrics/numbers to include (I won't invent them)?")
    return data
