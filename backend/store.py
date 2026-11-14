"""Loads the JSON files the API serves.

Reference data (species, regions) comes from data/static/. Each pipeline output
comes from data/out/ when the file exists there and from data/mock/ otherwise,
so an endpoint moves to real data as soon as the pipeline writes its file.
Files are read once; restart the server to pick up new ones.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "data" / "static"
OUT_DIR = ROOT / "data" / "out"
MOCK_DIR = ROOT / "data" / "mock"

PIPELINE_FILES = ("series.json", "trends.json", "anomalies.json", "effort.json", "climate.json", "bbs.json")


@lru_cache(maxsize=None)
def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _pipeline(name: str):
    real = OUT_DIR / name
    return _load(real if real.exists() else MOCK_DIR / name)


def data_sources() -> dict[str, str]:
    """Which pipeline files are real and which are still mock."""
    return {name: "real" if (OUT_DIR / name).exists() else "mock" for name in PIPELINE_FILES}


def species() -> list[dict]:
    return _load(STATIC_DIR / "species.json")


def regions() -> list[dict]:
    return _load(STATIC_DIR / "regions.json")


def find_species(key: str) -> dict | None:
    return next((s for s in species() if s["key"] == key), None)


def find_region(region_id: str) -> dict | None:
    return next((r for r in regions() if r["id"] == region_id), None)


def series(species_key: str) -> dict:
    return _pipeline("series.json")[species_key]


def anomalies() -> list[dict]:
    """Every stored anomaly, best first."""
    return _pipeline("anomalies.json")


def detail(species_key: str, region_id: str) -> dict:
    """Trend, checks, effort and climate for one species-region."""
    entry = _pipeline("trends.json")[species_key][region_id]
    trend = entry["trend"]

    def with_agreement(other: dict | None) -> dict | None:
        # "agrees" means the other source moves in the same direction as our trend.
        if other is None:
            return None
        agrees = None if trend is None else (other["changePerYear"] > 0) == (trend["changePerYear"] > 0)
        return {**other, "agrees": agrees}

    return {
        "species": species_key,
        "region": region_id,
        "trend": trend,
        "rawTrend": entry["rawTrend"],
        "sufficiency": entry["sufficiency"],
        "secondSource": with_agreement(entry.get("secondSource")),
        "survey": with_agreement(_pipeline("bbs.json").get(species_key, {}).get(region_id)),
        "effort": [{"year": e["year"], "records": e["records"]} for e in _pipeline("effort.json")[region_id]],
        "climate": _pipeline("climate.json")[region_id],
    }
