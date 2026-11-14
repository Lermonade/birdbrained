"""The "Ask why" analyst: Gemini with function calling over our tools.

`ask` returns {"answer", "toolCalls", "cached", "model"}. The answer has the
shape in the spec's AI analyst section. Every model call stays in this module so
the model can be swapped.

Reliability, because Gemini's busy models fail often:
- Models are tried in order (GEMINI_MODELS). A model that fails is skipped for
  5 minutes, so later questions don't wait on it again.
- Each Gemini call times out after 15 seconds, and one question gets 30 seconds
  in total across all models.
- Every good answer is saved in backend/cache/. When every model fails, the
  saved answer for the same species and state is returned with "cached": true.
  Set ANALYST_CACHE_FIRST=1 to serve saved answers before asking Gemini (for
  the live demo).
- Without GEMINI_API_KEY, a mock answer built from the data is returned.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

import prompts
import store
import tools

load_dotenv(Path(__file__).resolve().parent / ".env")
log = logging.getLogger("analyst")
# The library warns on every tool-call turn that the reply has no text; that is expected here.
logging.getLogger("google_genai.types").setLevel(logging.ERROR)

MODELS = [m.strip() for m in os.getenv("GEMINI_MODELS", "gemini-3.8-flash,gemini-3.5-flash-lite").split(",") if m.strip()]
CALL_TIMEOUT_MS = 15_000
QUESTION_BUDGET_S = 30
MAX_TOOL_CALLS = 8
SKIP_FAILED_MODEL_S = 300
CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_FIRST = os.getenv("ANALYST_CACHE_FIRST") == "1"
MOCK_DELAY_S = float(os.getenv("MOCK_ASK_DELAY_S", "1"))

_failed_at: dict[str, float] = {}
_client: genai.Client | None = None


class AnalystUnavailable(Exception):
    """Every model failed and no saved answer exists."""


class Evidence(BaseModel):
    claim: str
    tool: str


class Hypothesis(BaseModel):
    cause: str
    support: list[str]
    against: list[str]
    confidence: str


class DataCheck(BaseModel):
    sufficient: bool
    note: str


class Answer(BaseModel):
    summary: str
    data_check: DataCheck
    evidence: list[Evidence]
    hypotheses: list[Hypothesis]
    could_be_artifact: str
    next_steps: list[str]


def ask(question: str, species_key: str, region_id: str, year: int | None = None) -> dict:
    question = " ".join(question.split())
    species = store.find_species(species_key)
    region = store.find_region(region_id)

    # Rule 1 from the spec, enforced here as well as in the prompt: no data, no hypotheses, no Gemini call.
    started = time.perf_counter()
    sampling = tools.check_sampling(species_key, region_id)
    if not sampling["sufficient"]:
        call = {"tool": "check_sampling", "args": {"species": species_key, "region": region_id},
                "ms": round((time.perf_counter() - started) * 1000)}
        return {"answer": _insufficient_answer(species, region, sampling), "toolCalls": [call],
                "cached": False, "model": None}

    if not os.getenv("GEMINI_API_KEY"):
        return _mock_answer(species, region)

    key = _cache_key(question, species_key, region_id)
    if CACHE_FIRST and (saved := _read_cache(key, species_key, region_id)):
        return saved

    deadline = time.monotonic() + QUESTION_BUDGET_S
    message = prompts.user_message(question, species, region, year)
    for model in _models_to_try():
        if time.monotonic() > deadline:
            break
        try:
            answer, calls = _run_model(model, message, deadline)
        except Exception as exc:  # any failure moves on to the next model
            _failed_at[model] = time.monotonic()
            log.warning("analyst: %s failed: %s", model, str(exc)[:200])
            continue
        result = {"answer": answer, "toolCalls": calls, "cached": False, "model": model}
        _write_cache(key, species_key, region_id, question, result)
        return result

    if saved := _read_cache(key, species_key, region_id):
        return saved
    raise AnalystUnavailable("The analyst is busy right now. Try again in a minute.")


def _models_to_try() -> list[str]:
    """Models in order, leaving out recently failed ones unless all of them failed."""
    now = time.monotonic()
    healthy = [m for m in MODELS if now - _failed_at.get(m, -SKIP_FAILED_MODEL_S) >= SKIP_FAILED_MODEL_S]
    return healthy or sorted(MODELS, key=lambda m: _failed_at.get(m, 0))


def _gemini() -> genai.Client:
    global _client
    if _client is None:
        options = types.HttpOptions(timeout=CALL_TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=1))
        _client = genai.Client(http_options=options)
    return _client


def _config(force_answer: bool) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=prompts.SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=tools.declarations())],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(mode="NONE" if force_answer else "AUTO")
        ),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        response_mime_type="application/json",
        response_json_schema=prompts.ANSWER_SCHEMA,
    )


def _run_model(model: str, message: str, deadline: float) -> tuple[dict, list[dict]]:
    """One full conversation with one model: tool calls until it answers."""
    contents = [types.Content(role="user", parts=[types.Part(text=message)])]
    calls: list[dict] = []
    while True:
        if time.monotonic() > deadline:
            raise TimeoutError("question budget used up")
        response = _generate(model, contents, _config(force_answer=len(calls) >= MAX_TOOL_CALLS), deadline)
        if not response.function_calls:
            return _parse_answer(response.text, calls), calls

        # The model's turn goes back unchanged (it carries signatures Gemini checks), then the results.
        contents.append(response.candidates[0].content)
        results = []
        for call in response.function_calls:
            args = dict(call.args or {})
            started = time.perf_counter()
            if len(calls) >= MAX_TOOL_CALLS:
                result = {"error": "Tool call limit reached. Give your answer now."}
            else:
                result = tools.run(call.name, args)
            calls.append({"tool": call.name, "args": args, "ms": round((time.perf_counter() - started) * 1000)})
            results.append(types.Part(function_response=types.FunctionResponse(
                id=call.id, name=call.name, response={"result": result},
            )))
        contents.append(types.Content(role="user", parts=results))


def _generate(model: str, contents: list, config: types.GenerateContentConfig, deadline: float):
    """One Gemini call. A "busy" error comes back fast, so it gets one retry after a second. A timeout is
    not retried (it has already used 15 seconds), and neither is a quota error (a second won't fix it)."""
    try:
        return _gemini().models.generate_content(model=model, contents=contents, config=config)
    except errors.APIError as exc:
        if exc.code != 503 or time.monotonic() + 1 > deadline:
            raise
        time.sleep(1)
        return _gemini().models.generate_content(model=model, contents=contents, config=config)


def _parse_answer(text: str | None, calls: list[dict]) -> dict:
    """Check the model's JSON against the answer shape. Evidence citing a tool that never ran is dropped."""
    if not text:
        raise ValueError("empty answer")
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        answer = Answer.model_validate(json.loads(cleaned)).model_dump()
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValueError(f"answer is not in the expected shape: {exc}") from exc
    used = {c["tool"] for c in calls}
    answer["evidence"] = [e for e in answer["evidence"] if e["tool"] in used]
    return answer


# Saved answers -------------------------------------------------------------

def _cache_key(question: str, species_key: str, region_id: str) -> str:
    digest = hashlib.sha1(question.lower().encode("utf-8")).hexdigest()[:10]
    return f"{species_key}__{region_id}__{digest}"


def _data_version() -> str:
    """Answers given on mock data must not be served once real data arrives, and the reverse."""
    return store.data_sources()["trends.json"]


def _write_cache(key: str, species_key: str, region_id: str, question: str, result: dict) -> None:
    try:
        CACHE_DIR.mkdir(exist_ok=True)
        entry = {"question": question, "species": species_key, "region": region_id,
                 "data": _data_version(), "savedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "result": result}
        (CACHE_DIR / f"{key}.json").write_text(json.dumps(entry, indent=2), encoding="utf-8")
    except OSError as exc:
        log.warning("analyst: could not save answer: %s", exc)


def _read_cache(key: str, species_key: str, region_id: str) -> dict | None:
    """The saved answer to this question, or else the newest one for the same species and state."""
    exact = CACHE_DIR / f"{key}.json"
    candidates = [exact] if exact.exists() else []
    candidates += sorted(CACHE_DIR.glob(f"{species_key}__{region_id}__*.json"),
                         key=lambda p: p.stat().st_mtime, reverse=True) if CACHE_DIR.exists() else []
    for path in candidates:
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if entry.get("data") == _data_version():
            return {**entry["result"], "cached": True}
    return None


# Answers that need no model ----------------------------------------------------

def _insufficient_answer(species: dict, region: dict, sampling: dict) -> dict:
    s = sampling["sufficiency"]
    note = f"Only {s['yearsOk']} of {s['yearsTotal']} years have enough records for a trend."
    return {
        "summary": f"There isn't enough data to judge how {species['commonName']} is doing in {region['name']}. {note}",
        "data_check": {"sufficient": False, "note": note},
        "evidence": [],
        "hypotheses": [],
        "could_be_artifact": "Not assessed, because the data is insufficient.",
        "next_steps": [f"More bird surveys in {region['name']} would make a trend possible."],
    }


def _mock_answer(species: dict, region: dict) -> dict:
    """Stand-in for running without a Gemini key: real numbers from the data, placeholder causes."""
    time.sleep(MOCK_DELAY_S)
    args = {"species": species["key"], "region": region["id"]}
    detail = store.detail(species["key"], region["id"])
    trend, raw = detail["trend"], detail["rawTrend"]
    span = f"{detail['climate'][0]['year']} to {detail['climate'][-1]['year']}"
    answer = {
        "summary": f"Mock answer: no GEMINI_API_KEY is set. Corrected for observer growth, {species['commonName']} "
        f"in {region['name']} changed {trend['changePerYear']:+.1f}% a year from {span}; raw sightings changed "
        f"{raw['changePerYear']:+.1f}% a year.",
        "data_check": {"sufficient": True, "note": "Enough years pass the sampling thresholds."},
        "evidence": [
            {"claim": f"Corrected index changed {trend['changePerYear']:+.1f}% a year "
             f"(interval {trend['low']:+.1f} to {trend['high']:+.1f})", "tool": "get_trend"},
            {"claim": f"Raw index changed {raw['changePerYear']:+.1f}% a year", "tool": "get_trend"},
        ],
        "hypotheses": [{"cause": "Placeholder cause", "support": ["Placeholder"], "against": ["Placeholder"],
                        "confidence": "untested"}],
        "could_be_artifact": "Placeholder.",
        "next_steps": ["Set GEMINI_API_KEY in backend/.env to get real answers."],
    }
    calls = [{"tool": "check_sampling", "args": args, "ms": 9}, {"tool": "get_trend", "args": args, "ms": 12}]
    return {"answer": answer, "toolCalls": calls, "cached": False, "model": None}
