"""Checks that the API key works and that each model can call one of our tools.

    python check_openai.py      (run from the backend folder, with the venv active)

For each model it sends one question with one tool on offer, runs the tool the
model asks for against the stored data, sends the result back and prints the
reply. The key is read from OPENAI_API_KEY in backend/.env. Set OPENAI_MODELS
to a comma-separated list to try other models.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

import store

load_dotenv(Path(__file__).resolve().parent / ".env")
MODELS = [m.strip() for m in os.getenv("OPENAI_MODELS", "gpt-6.1-terra,gpt-6-luna").split(",") if m.strip()]

GET_TREND = {
    "type": "function",
    "name": "get_trend",
    "description": "Trend in raw sightings of one bird species in one US state.",
    "parameters": {
        "type": "object",
        "properties": {
            "species": {"type": "string", "description": "Species key, for example wood_thrush"},
            "region": {"type": "string", "description": "Region id, for example US-OH"},
        },
        "required": ["species", "region"],
    },
    "strict": False,
}
QUESTION = "Are Wood Thrush (wood_thrush) sightings going up in Ohio (US-OH)? Answer in one sentence."


def get_trend(species: str, region: str) -> dict:
    detail = store.detail(species, region)
    return {key: detail[key] for key in ("trend", "allBirdsTrend", "sufficiency")}


def round_trip(client: OpenAI, model: str) -> str:
    """Question -> tool call -> tool result -> answer. Returns a one-line report."""
    inputs: list = [{"role": "user", "content": QUESTION}]
    response = client.responses.create(model=model, input=inputs, tools=[GET_TREND],
                                       instructions="Answer only from tool results. Call get_trend first.")
    calls = [item for item in response.output if item.type == "function_call"]
    if not calls:
        raise RuntimeError(f"answered without calling the tool: {response.output_text!r}")
    call = calls[0]
    args = json.loads(call.arguments)
    inputs += response.output
    inputs.append({"type": "function_call_output", "call_id": call.call_id, "output": json.dumps(get_trend(**args))})
    final = client.responses.create(model=model, input=inputs, tools=[GET_TREND])
    return f"called {call.name}({args}), then said: {final.output_text.strip()}"


def main() -> int:
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set. Put it in backend/.env.")
        return 1
    client = OpenAI(timeout=25, max_retries=0)
    working = []
    for model in MODELS:
        started = time.perf_counter()
        try:
            report = round_trip(client, model)
        except Exception as exc:  # report every kind of failure and move on to the next model
            print(f"FAIL  {model}  {time.perf_counter() - started:.1f} s  {str(exc)[:200]}")
        else:
            working.append(model)
            print(f"OK    {model}  {time.perf_counter() - started:.1f} s  {report}")
    print(f"\n{len(working)} of {len(MODELS)} models completed a tool call: {', '.join(working) or 'none'}")
    return 0 if working else 1


if __name__ == "__main__":
    sys.exit(main())
