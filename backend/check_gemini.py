"""Checks that the Gemini key works and that Gemini can call one of our tools.

    python check_gemini.py      (run from the backend folder, with the venv active)

For each model it sends one question with one tool on offer, runs the tool
Gemini asks for against the stored data, sends the result back and prints
Gemini's reply. The key is read from GEMINI_API_KEY in backend/.env. Set
GEMINI_MODELS to a comma-separated list to try other models.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

import store

load_dotenv(Path(__file__).resolve().parent / ".env")
MODELS = os.getenv(
    "GEMINI_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
).split(",")

# Fail fast: without these the library retries a busy model for minutes.
HTTP_OPTIONS = types.HttpOptions(timeout=25_000, retry_options=types.HttpRetryOptions(attempts=1))

GET_TREND = types.FunctionDeclaration(
    name="get_trend",
    description="Bias-corrected population trend for one bird species in one US state.",
    parameters_json_schema={
        "type": "object",
        "properties": {
            "species": {"type": "string", "description": "Species key, for example wood_thrush"},
            "region": {"type": "string", "description": "Region id, for example US-OH"},
        },
        "required": ["species", "region"],
    },
)
CONFIG = types.GenerateContentConfig(
    system_instruction="Answer only from tool results. Call get_trend before you answer.",
    tools=[types.Tool(function_declarations=[GET_TREND])],
)
QUESTION = "Is the Wood Thrush (wood_thrush) declining in Ohio (US-OH)? Answer in one sentence."


def get_trend(species: str, region: str) -> dict:
    detail = store.detail(species, region)
    return {key: detail[key] for key in ("trend", "allBirdsTrend", "sufficiency")}


def round_trip(client: genai.Client, model: str) -> str:
    """Question -> tool call -> tool result -> answer. Returns a one-line report."""
    contents = [types.Content(role="user", parts=[types.Part(text=QUESTION)])]
    response = client.models.generate_content(model=model, contents=contents, config=CONFIG)
    if not response.function_calls:
        raise RuntimeError(f"answered without calling the tool: {response.text!r}")
    call = response.function_calls[0]
    result = get_trend(**call.args)

    # The model's own turn goes back unchanged, followed by the tool result.
    tool_result = types.FunctionResponse(id=call.id, name=call.name, response={"result": result})
    contents.append(response.candidates[0].content)
    contents.append(types.Content(role="user", parts=[types.Part(function_response=tool_result)]))
    final = client.models.generate_content(model=model, contents=contents, config=CONFIG)
    return f"called {call.name}({dict(call.args)}), then said: {final.text.strip()}"


def main() -> int:
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY is not set. Put it in backend/.env.")
        return 1
    client = genai.Client(http_options=HTTP_OPTIONS)
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
