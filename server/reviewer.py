import os
import json
import re
from openai import OpenAI
from prompts import LANE_RUBRICS, SYSTEM_RULES

def extract_numbers(text: str):
    return set(re.findall(r"\d+(?:\.\d+)?%?", text))

def _get_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (or is empty). Set it in your environment or a .env file.")
    return OpenAI(api_key=api_key)

def build_messages(text, lane, tone):
    rubric = LANE_RUBRICS.get(lane, LANE_RUBRICS["SWE"])
    return [
        {"role": "system", "content": SYSTEM_RULES + "\n\n" + rubric},
        {"role": "user", "content": f"""
Input:
{text}

Lane: {lane}
Tone: {tone}

Return STRICT JSON with keys:
rewrite,
critique (array of {{category, score_0_to_2, issue, suggestion}}),
questions (array),
changes (array),
safety_notes (array).
"""}
    ]

def review_text_openai(text, lane="SWE", tone="confident"):
    client = _get_client()

    resp = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=build_messages(text, lane, tone),
        temperature=0.3,
        max_tokens=1200,
    )

    raw = (resp.choices[0].message.content or "").strip()
    data = json.loads(raw)

    # Guardrail: don't allow adding new numbers
    if not extract_numbers(data.get("rewrite", "")).issubset(extract_numbers(text)):
        data.setdefault("safety_notes", []).append("Blocked potential added numbers/metrics.")
        data.setdefault("questions", []).append("What are the correct metrics/numbers to include (I won't invent them)?")

    return data
