"""The "Ask why" analyst.

Mock for now: it builds an answer in the contract's shape from the stored data
and never calls Gemini. The Gemini function-calling loop will replace the body
of `ask` and keep the same return value, so the route and the frontend stay as
they are. Keep every model call inside this module so the model can be swapped.
"""
from __future__ import annotations

import os
import time

import store

# The real analyst takes several seconds. A short pause lets the frontend build its loading state.
MOCK_DELAY_S = float(os.getenv("MOCK_ASK_DELAY_S", "1"))


def ask(question: str, species_key: str, region_id: str, year: int | None = None) -> dict:
    """Answer one question. Returns {"answer", "toolCalls", "cached"}."""
    time.sleep(MOCK_DELAY_S)

    bird = store.find_species(species_key)["commonName"]
    place = store.find_region(region_id)["name"]
    detail = store.detail(species_key, region_id)
    args = {"species": species_key, "region": region_id}
    sufficiency = detail["sufficiency"]
    years_note = f"{sufficiency['yearsOk']} of {sufficiency['yearsTotal']} years pass the sampling thresholds"

    if detail["trend"] is None:
        answer = {
            "summary": f"Mock answer. There is not enough data to judge {bird} in {place}: only {years_note}.",
            "data_check": {"sufficient": False, "note": years_note},
            "evidence": [],
            "hypotheses": [],
            "could_be_artifact": "Not assessed, because the data is insufficient.",
            "next_steps": [f"More surveys in {place} would help most."],
        }
        return {"answer": answer, "toolCalls": [{"tool": "check_sampling", "args": args, "ms": 9}], "cached": False}

    trend, raw = detail["trend"], detail["rawTrend"]
    first, last = detail["climate"][0], detail["climate"][-1]
    span = f"{first['year']} to {last['year']}"
    falling = trend["changePerYear"] < 0

    evidence = [
        {
            "claim": f"Corrected index changed {trend['changePerYear']:+.1f}% a year, {span} "
            f"(interval {trend['low']:+.1f} to {trend['high']:+.1f})",
            "tool": "get_trend",
        },
        {"claim": f"Raw index changed {raw['changePerYear']:+.1f}% a year over the same years", "tool": "get_trend"},
    ]
    tool_calls = [
        {"tool": "check_sampling", "args": args, "ms": 9},
        {"tool": "get_trend", "args": args, "ms": 12},
    ]
    if detail["secondSource"]:
        evidence.append({
            "claim": f"iNaturalist trend is {detail['secondSource']['changePerYear']:+.1f}% a year",
            "tool": "compare_sources",
        })
        tool_calls.append({"tool": "compare_sources", "args": args, "ms": 11})
    if detail["survey"]:
        evidence.append({
            "claim": f"Breeding Bird Survey trend is {detail['survey']['changePerYear']:+.1f}% a year "
            f"({detail['survey']['period']})",
            "tool": "get_survey_trend",
        })
        tool_calls.append({"tool": "get_survey_trend", "args": args, "ms": 8})
    evidence.append({
        "claim": f"Breeding-season temperature averaged {first['tempC']} °C in {first['year']} "
        f"and {last['tempC']} °C in {last['year']}",
        "tool": "get_climate",
    })
    tool_calls.append({"tool": "get_climate", "args": {"region": region_id}, "ms": 7})
    tool_calls.append({"tool": "get_species_profile", "args": {"species": species_key}, "ms": 5})

    if falling:
        causes = [
            ("Loss of breeding habitat (placeholder)", "Species profile lists habitat loss as a known threat"),
            ("Fewer insects to feed on (placeholder)", "Species profile lists insects as the main diet"),
        ]
    else:
        causes = [
            ("Range expansion into the state (placeholder)", "Neighbouring states show the same direction"),
            ("Milder breeding seasons (placeholder)", "Temperature rose over the period"),
        ]
    answer = {
        "summary": f"Mock answer, Gemini is not connected yet. Corrected for observer growth, {bird} in {place} "
        f"changed {trend['changePerYear']:+.1f}% a year from {span}. "
        f"Raw sightings changed {raw['changePerYear']:+.1f}% a year.",
        "data_check": {"sufficient": True, "note": years_note},
        "evidence": evidence,
        "hypotheses": [
            {
                "cause": cause,
                "support": [support],
                "against": ["We have no data for this state that tests it directly"],
                "confidence": "low",
            }
            for cause, support in causes
        ],
        "could_be_artifact": "Unlikely. The index is a share of all bird records, so growth in the number "
        "of observers cancels out, and enough years pass the sampling thresholds.",
        "next_steps": [
            f"Compare with Breeding Bird Survey routes in {place}",
            "Check land-cover change over the same years",
        ],
    }
    return {"answer": answer, "toolCalls": tool_calls, "cached": False}
