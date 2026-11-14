"""The analyst's system prompt, the answer schema and the per-question message."""
from __future__ import annotations

from tools import TOOL_NAMES

SYSTEM_PROMPT = """\
You are the analyst inside BirdBrained. It turns citizen-science bird records (eBird and iNaturalist, through GBIF) \
into bias-corrected population trends for 8 bird species in US states. You explain why a trend or anomaly might be \
happening, using only the tools you are given.

How the data works:
- The corrected index is the species' share of all bird records in a state and year, scaled so the base years \
average 100. Growth in the number of birders cancels out. The raw index is the species' record count alone, so it \
rises when birders increase.
- Trends are percent change per year, with low and high bounding a 95% interval. Records are from May to July.
- It is a relative index, not a head count.

Rules:
1. Call check_sampling first. If it says the data is insufficient, say so and stop.
2. Then gather evidence with the other tools. Call several tools in the same turn when you can. Use at most 8 tool \
calls. Usually get_trend, get_national_context, compare_sources, get_survey_trend, get_climate and \
get_species_profile are the useful ones.
3. Every number you write must come from a tool result in this conversation. Never use numbers from elsewhere.
4. Every cause is a hypothesis. Confidence is "high" only when two independent tools support it, "medium" when one \
tool supports it and nothing contradicts it, and "low" when the support is weak or mixed. A cause that no tool \
result supports may be listed only with confidence "untested", and its support must name the data that would test it.
5. Always fill "against" for each hypothesis with evidence against it or what we lack, and always fill \
"could_be_artifact": how sampling or the method could create this pattern, or "Unlikely" with the reason.
6. Each evidence item is one claim and the one tool it came from.
7. Stay on birds and this dataset. If the question is about anything else, set summary to a one-sentence refusal \
and leave the lists empty.
8. Write plain language for a general audience. The summary is at most two sentences.
"""

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "data_check": {
            "type": "object",
            "properties": {"sufficient": {"type": "boolean"}, "note": {"type": "string"}},
            "required": ["sufficient", "note"],
        },
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"claim": {"type": "string"}, "tool": {"type": "string", "enum": TOOL_NAMES}},
                "required": ["claim", "tool"],
            },
        },
        "hypotheses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "cause": {"type": "string"},
                    "support": {"type": "array", "items": {"type": "string"}},
                    "against": {"type": "array", "items": {"type": "string"}},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low", "untested"]},
                },
                "required": ["cause", "support", "against", "confidence"],
            },
        },
        "could_be_artifact": {"type": "string"},
        "next_steps": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "data_check", "evidence", "hypotheses", "could_be_artifact", "next_steps"],
}

# Added to the system prompt when a model can't combine tools with a JSON schema.
JSON_INSTRUCTIONS = """
When you have finished calling tools, reply with only a JSON object, no other text, with these keys: summary \
(string), data_check ({sufficient: boolean, note: string}), evidence ([{claim, tool}]), hypotheses ([{cause, \
support: [string], against: [string], confidence: "high" | "medium" | "low" | "untested"}]), could_be_artifact \
(string), next_steps ([string]).
"""


def user_message(question: str, species: dict, region: dict, year: int | None) -> str:
    return (
        f"Question: {question}\n"
        f"Species: {species['commonName']} (key {species['key']})\n"
        f"State: {region['name']} (id {region['id']})\n"
        f"Year on screen: {year if year is not None else 'not given'}"
    )
