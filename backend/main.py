"""BirdBrained API. The routes follow the API contract in the master spec.

    uvicorn main:app --reload --port 8000      (run from the backend folder)

Interactive docs are at http://localhost:8000/docs.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

import analyst
import store

app = FastAPI(title="BirdBrained API", version="0.1.0")

# Any localhost port is allowed. The deployed frontend URL goes in FRONTEND_ORIGINS (comma-separated).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


def error_response(status: int, code: str, message: str) -> JSONResponse:
    """Every error leaves in the contract's shape."""
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.status, exc.code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    codes = {404: "not_found", 405: "method_not_allowed"}
    return error_response(exc.status_code, codes.get(exc.status_code, "http_error"), str(exc.detail))


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    problems = [f"{'.'.join(str(part) for part in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
    return error_response(400, "bad_request", "; ".join(problems))


@app.exception_handler(analyst.AnalystUnavailable)
async def handle_analyst_unavailable(request: Request, exc: analyst.AnalystUnavailable) -> JSONResponse:
    return error_response(503, "analyst_unavailable", str(exc))


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    return error_response(500, "internal_error", "Something went wrong on the server.")


def require_species(key: str) -> None:
    if store.find_species(key) is None:
        raise ApiError(404, "not_found", f"Unknown species '{key}'. GET /api/species lists the keys.")


def require_region(region_id: str) -> None:
    if store.find_region(region_id) is None:
        raise ApiError(404, "not_found", f"Unknown region '{region_id}'. GET /api/regions lists the ids.")


@app.get("/api/health")
def health() -> dict:
    """Says whether each data file being served is real or still mock."""
    return {"status": "ok", "data": store.data_sources()}


@app.get("/api/species")
def list_species() -> list[dict]:
    """The demo species."""
    return store.species()


@app.get("/api/regions")
def list_regions() -> list[dict]:
    """The 50 states and DC, each with its centroid and area."""
    return store.regions()


@app.get("/api/series")
def get_series(species: str) -> dict:
    """Raw and corrected index for every region and year of one species."""
    require_species(species)
    return store.series(species)


@app.get("/api/anomalies")
def get_anomalies(species: str | None = None, limit: int = Query(10, ge=1, le=30)) -> list[dict]:
    """Ranked anomalies, best first. Leave out species to get all of them."""
    if species is not None:
        require_species(species)
    matching = [a for a in store.anomalies() if species is None or a["species"] == species]
    return matching[:limit]


@app.get("/api/detail")
def get_detail(species: str, region: str) -> dict:
    """Trend, checks, effort and climate for one species in one region."""
    require_species(species)
    require_region(region)
    return store.detail(species, region)


@app.get("/api/grab_data")
def grab_data(species: str | None = None, start: int | None = None, end: int | None = None) -> dict:
    """Raw sighting counts for the globe: one point per state, with the change from start to end year.

    species is a comma-separated list of keys (default: all). start and end are years (default: the
    full range in availableYears). States where the species has no records in either year are left out.
    """
    keys = [k.strip() for k in species.split(",") if k.strip()] if species else [s["key"] for s in store.species()]
    for key in keys:
        require_species(key)
    years = store.years()
    start = years[0] if start is None else start
    end = years[-1] if end is None else end
    if start not in years or end not in years or start > end:
        raise ApiError(400, "bad_request", f"start and end must be years from {years[0]} to {years[-1]}, start <= end.")
    return {
        "startYear": start,
        "endYear": end,
        "availableYears": {"start": years[0], "end": years[-1]},
        "species": [store.raw_change(key, start, end) for key in keys],
    }


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    species: str
    region: str
    year: int | None = None


@app.post("/api/ask")
def ask(body: AskRequest) -> dict:
    """Run the analyst on one question about a species in a region. Takes about 5 to 30 seconds.

    Returns 503 with the code analyst_unavailable when Gemini fails and no saved answer exists."""
    require_species(body.species)
    require_region(body.region)
    return analyst.ask(body.question, body.species, body.region, body.year)
