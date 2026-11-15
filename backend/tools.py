"""The analyst's tools, from the AI analyst section of the spec.

Each tool reads the stored JSON and returns a small dict that is sent to the
model as the tool result. `declarations()` describes them to the model, and
`run` executes one call by name with whatever arguments the model sent.
"""
from __future__ import annotations

from itertools import combinations
from statistics import median

import store

# The spec's data-sufficiency rule, repeated in check_sampling's result so the model can quote it.
THRESHOLDS = {"minAllBirdRecords": 20_000, "minSpeciesRecords": 30, "minShareOfYearsPassing": 0.7}


def _name(region_id: str) -> str:
    return store.find_region(region_id)["name"]


def _median_slope(xs: list[float], ys: list[float]) -> float | None:
    """Theil-Sen slope: the median of the slopes between every pair of points."""
    slopes = [(y2 - y1) / (x2 - x1) for (x1, y1), (x2, y2) in combinations(zip(xs, ys), 2) if x2 != x1]
    return median(slopes) if slopes else None


def check_sampling(species: str, region: str) -> dict:
    """Records per year and whether there are enough for a trend."""
    years = store.series(species)["years"]
    regional = store.series_region(species, region) or {"status": ["insufficient"] * len(years)}
    all_birds = {row["year"]: row["records"] for row in store.effort(region)}
    species_counts = store.counts(species, region) or [0] * len(years)
    sufficiency = store.trend_entry(species, region)["sufficiency"]
    return {
        "sufficient": sufficiency["label"] != "insufficient",
        "sufficiency": sufficiency,
        "thresholds": THRESHOLDS,
        "years": [
            {"year": year, "allBirdRecords": all_birds.get(year), "speciesRecords": n, "status": status}
            for year, n, status in zip(years, species_counts, regional["status"])
        ],
    }


def get_trend(species: str, region: str) -> dict:
    """Corrected index per year (the species' share of all bird sightings) and its trend, with raw sightings for context."""
    years = store.years()
    regional = store.series_region(species, region) or {"corrected": [None] * len(years)}
    entry = store.trend_entry(species, region)
    all_birds = {row["year"]: row["records"] for row in store.effort(region)}
    return {
        "years": years,
        "correctedIndex": regional["corrected"],
        "correctedTrend": entry["trend"],
        "sightings": store.counts(species, region) or [0] * len(years),
        "sightingsTrend": entry["rawTrend"],
        "allBirdSightings": [all_birds.get(year) for year in years],
        "allBirdsTrend": store.all_birds_trend(region),
        "note": "The corrected index is the species' share of all bird sightings in the state, scaled so the "
        "first years average 100; it cancels out growth in the number of birders. Raw sightings rise with the "
        "number of birders. Trends are percent change per year; low and high bound the 95% interval. Null "
        "values are years without enough records.",
    }


def get_national_context(species: str) -> dict:
    """How this species' corrected trend varies across all states, to separate local from range-wide change."""
    with_trend = [(rid, e["trend"]) for rid, e in store.trends(species).items() if e["trend"] is not None]
    if not with_trend:
        return {"statesWithTrend": 0}
    ranked = sorted(with_trend, key=lambda item: item[1]["changePerYear"])
    classes: dict[str, int] = {}
    for _, trend in with_trend:
        classes[trend["class"]] = classes.get(trend["class"], 0) + 1

    def row(item):
        rid, trend = item
        return {"region": rid, "name": _name(rid), "changePerYear": trend["changePerYear"]}

    return {
        "statesWithTrend": len(with_trend),
        "medianChangePerYear": round(median(t["changePerYear"] for _, t in with_trend), 1),
        "statesByClass": classes,
        "highestChange": [row(item) for item in reversed(ranked[-3:])],
        "lowestChange": [row(item) for item in ranked[:3]],
    }


def compare_sources(species: str, region: str) -> dict:
    """Our corrected eBird trend against the same method run on iNaturalist records, from 2015."""
    entry = store.trend_entry(species, region)
    second = entry.get("secondSource")
    if entry["trend"] is None or second is None:
        return {"available": False, "reason": "No iNaturalist trend for this species and state."}
    return {
        "available": True,
        "eBirdChangePerYear": entry["trend"]["changePerYear"],
        "iNaturalistChangePerYear": second["changePerYear"],
        "sameDirection": store.same_direction(second, entry["trend"]),
    }


def get_survey_trend(species: str, region: str) -> dict:
    """The USGS Breeding Bird Survey trend: birds counted the same way on fixed routes every year."""
    survey = store.survey(species, region)
    if survey is None:
        return {"available": False, "reason": "No Breeding Bird Survey trend for this species and state."}
    trend = store.trend_entry(species, region)["trend"]
    return {
        "available": True,
        "surveyChangePerYear": survey["changePerYear"],
        "surveyLow": survey.get("low"),
        "surveyHigh": survey.get("high"),
        "surveyPeriod": survey["period"],
        "surveyCredibility": survey.get("credibility"),
        "ourCorrectedChangePerYear": trend["changePerYear"] if trend else None,
        "sameDirection": store.same_direction(survey, trend),
        "note": "The survey counts birds the same way every year, so it is the best independent check.",
    }


def get_climate(region: str) -> dict:
    """Breeding-season temperature and rainfall per year, with their trends."""
    rows = store.climate(region)
    if not rows:
        return {"available": False, "reason": "Climate data covers US states only."}
    years = [r["year"] for r in rows]
    temp_slope = _median_slope(years, [r["tempC"] for r in rows])
    rain_slope = _median_slope(years, [r["rainMm"] for r in rows])
    return {
        "season": "May to July",
        "years": rows,
        "tempTrendCPerDecade": None if temp_slope is None else round(temp_slope * 10, 2),
        "rainTrendMmPerDecade": None if rain_slope is None else round(rain_slope * 10, 1),
        "note": "Statewide averages from NOAA nClimDiv; the District of Columbia uses Maryland's."
        if store.data_sources()["climate.json"] == "real" else "Simulated values for testing.",
    }


def get_species_profile(species: str) -> dict:
    """Habitat, diet, migration and known threats, from our hand-written file."""
    found = store.profile(species)
    return {"available": False} if found is None else {"available": True, **found}


def list_anomalies(species: str | None = None, region: str | None = None) -> dict:
    """Anomalies from the radar feed that match; both filters are optional."""
    matching = [
        a for a in store.anomalies()
        if (species is None or a["species"] == species) and (region is None or a["region"] == region)
    ]
    keep = ("id", "type", "species", "region", "years", "headline", "changePerYear", "z", "confirmedBySecondSource")
    return {"count": len(matching), "anomalies": [{k: a[k] for k in keep} for a in matching[:10]]}


FUNCTIONS = {
    f.__name__: f
    for f in (
        check_sampling, get_trend, get_national_context, compare_sources,
        get_survey_trend, get_climate, get_species_profile, list_anomalies,
    )
}
TOOL_NAMES = list(FUNCTIONS)


def run(name: str, args: dict) -> dict:
    """Run one tool call from the model. Bad calls return an error the model can read and recover from."""
    function = FUNCTIONS.get(name)
    if function is None:
        return {"error": f"Unknown tool '{name}'."}
    if "species" in args and store.find_species(args["species"]) is None:
        return {"error": f"Unknown species '{args['species']}'."}
    if "region" in args and store.find_region(args["region"]) is None:
        return {"error": f"Unknown region '{args['region']}'."}
    try:
        return function(**args)
    except TypeError as exc:
        return {"error": f"Bad arguments for {name}: {exc}"}


def declarations() -> list[dict]:
    """The tool list the model sees. Species and regions are enums so the model can only
    pick real ids."""
    species_param = {
        "type": "string",
        "enum": [s["key"] for s in store.species()],
        "description": "Species key",
    }
    region_param = {
        "type": "string",
        "enum": [r["id"] for r in store.regions()],
        "description": "US state id, for example US-NE",
    }
    both = {"type": "object", "properties": {"species": species_param, "region": region_param},
            "required": ["species", "region"]}
    only_species = {"type": "object", "properties": {"species": species_param}, "required": ["species"]}
    only_region = {"type": "object", "properties": {"region": region_param}, "required": ["region"]}
    optional_both = {"type": "object", "properties": {"species": species_param, "region": region_param}}

    def declare(name: str, schema: dict) -> dict:
        description = " ".join(FUNCTIONS[name].__doc__.split())
        return {"type": "function", "name": name, "description": description, "parameters": schema,
                "strict": False}

    return [
        declare("check_sampling", both),
        declare("get_trend", both),
        declare("get_national_context", only_species),
        declare("compare_sources", both),
        declare("get_survey_trend", both),
        declare("get_climate", only_region),
        declare("get_species_profile", only_species),
        declare("list_anomalies", optional_both),
    ]
