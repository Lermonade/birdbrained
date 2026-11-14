"""Loads the JSON files the API serves.

Reference data (species, regions, species profiles) comes from data/static/.
Each pipeline output comes from data/out/ when the file exists there and from
data/mock/ otherwise, so an endpoint moves to real data as soon as the pipeline
writes its file. Files are read once; restart the server to pick up new ones.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "data" / "static"
OUT_DIR = ROOT / "data" / "out"
MOCK_DIR = ROOT / "data" / "mock"

PIPELINE_FILES = (
    "series.json", "trends.json", "anomalies.json", "effort.json", "climate.json", "bbs.json", "counts.json",
)


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


def profile(species_key: str) -> dict | None:
    """Habitat, diet, migration and threats, from the hand-written profiles file."""
    path = STATIC_DIR / "species_profiles.json"
    return _load(path).get(species_key) if path.exists() else None


def series(species_key: str) -> dict:
    return _pipeline("series.json")[species_key]


def trends(species_key: str) -> dict[str, dict]:
    """The trends.json entry for every region of one species."""
    return _pipeline("trends.json")[species_key]


def anomalies() -> list[dict]:
    """Every stored anomaly, best first."""
    return _pipeline("anomalies.json")


def effort(region_id: str) -> list[dict]:
    """All-bird records per year: [{year, records, recordsPer1000Km2}]."""
    return _pipeline("effort.json")[region_id]


def climate(region_id: str) -> list[dict]:
    """Breeding-season weather per year: [{year, tempC, rainMm}]."""
    return _pipeline("climate.json")[region_id]


def survey(species_key: str, region_id: str) -> dict | None:
    """Breeding Bird Survey trend {changePerYear, period}, or None."""
    return _pipeline("bbs.json").get(species_key, {}).get(region_id)


def counts(species_key: str, region_id: str) -> list[int] | None:
    """The species' record count per series year, or None where it has none."""
    return _pipeline("counts.json").get(species_key, {}).get(region_id)


def years() -> list[int]:
    """The years the bird data covers."""
    return series(species()[0]["key"])["years"]


def change_pct(before: int, after: int) -> float | None:
    return round((after - before) / before * 100, 1) if before else None


def all_birds_trend(region_id: str) -> dict:
    """Percent change per year in sightings of all birds in a state (Theil-Sen slope of the log).

    This is the "more birders" baseline that a species' raw sightings should be read against.
    """
    rows = [r for r in effort(region_id) if r["records"] > 0]
    slopes = sorted(
        (math.log(b["records"]) - math.log(a["records"])) / (b["year"] - a["year"])
        for i, a in enumerate(rows) for b in rows[i + 1:]
    )
    if not slopes:
        return {"changePerYear": None}
    mid = len(slopes) // 2
    slope = slopes[mid] if len(slopes) % 2 else (slopes[mid - 1] + slopes[mid]) / 2
    return {"changePerYear": round((math.exp(slope) - 1) * 100, 1)}


def raw_change(species_key: str, start: int, end: int) -> dict:
    """Raw sighting counts per state in two years, and the change between them.

    allBirdsChangePct is the change in sightings of all birds in the same state, which shows how
    much of a species' change comes from more people birding.
    """
    all_years = years()
    i, j = all_years.index(start), all_years.index(end)
    points = []
    for region in regions():
        n = counts(species_key, region["id"])
        if not n or (n[i] == 0 and n[j] == 0):
            continue
        all_birds = effort(region["id"])
        points.append({
            "region": region["id"],
            "name": region["name"],
            "lat": region["centroid"][0],
            "lng": region["centroid"][1],
            "startCount": n[i],
            "endCount": n[j],
            "change": n[j] - n[i],
            "changePct": change_pct(n[i], n[j]),
            "allBirdsChangePct": change_pct(all_birds[i]["records"], all_birds[j]["records"]),
        })
    return {"key": species_key, "name": find_species(species_key)["commonName"], "dataPoints": points}


def same_direction(other: dict | None, trend: dict | None) -> bool | None:
    """Whether another source's change per year has the same sign as our trend."""
    if other is None or trend is None:
        return None
    return (other["changePerYear"] > 0) == (trend["changePerYear"] > 0)


def detail(species_key: str, region_id: str) -> dict:
    """Trend in raw sightings, checks, effort and climate for one species-region."""
    entry = trends(species_key)[region_id]
    trend = entry["trend"]

    def with_agreement(other: dict | None) -> dict | None:
        return None if other is None else {**other, "agrees": same_direction(other, trend)}

    return {
        "species": species_key,
        "region": region_id,
        "trend": trend,
        "allBirdsTrend": all_birds_trend(region_id),
        "sufficiency": entry["sufficiency"],
        "secondSource": with_agreement(entry.get("secondSource")),
        "survey": with_agreement(survey(species_key, region_id)),
        "effort": [{"year": e["year"], "records": e["records"]} for e in effort(region_id)],
        "climate": climate(region_id),
    }
