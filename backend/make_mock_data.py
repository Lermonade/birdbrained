"""Write mock versions of the pipeline's output files to data/mock/.

The numbers are simulated, not real. They let the API and the frontend be built
before the pipeline has run. The simulation follows the spec's method (share of
all-bird records, sufficiency thresholds, Theil-Sen trend, robust z-scores), so
the files agree with each other and cover every case the API contract allows:
insufficient years, species-regions with no trend, a missing second source.

    python backend/make_mock_data.py

The output is deterministic, so rerunning it changes nothing.
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from method import build_series, detect_anomalies, fit_trend, pct  # noqa: E402  (the shared method)

STATIC = ROOT / "data" / "static"
OUT = ROOT / "data" / "mock"

YEARS = list(range(2010, 2025))

NORTHEAST = "ME NH VT MA RI CT NY NJ PA".split()
SOUTHEAST = "DE MD DC VA WV NC SC GA FL AL MS TN KY LA AR".split()
MIDWEST = "OH IN MI IL WI MN IA MO".split()
PLAINS = "ND SD NE KS OK TX".split()
WEST = "MT WY CO NM ID UT AZ NV WA OR CA".split()
EAST = NORTHEAST + SOUTHEAST + MIDWEST
LOWER_48 = EAST + PLAINS + WEST

# States that start with too few records, so some early years fail the threshold.
LOW_EFFORT = {"ND": 9_000, "SD": 13_000, "WY": 14_000, "WV": 16_000, "MS": 17_000}

# Per species: its share of all bird records, its national slope (log units per
# year), an optional extra slope per degree of latitude north of 38, the states
# it occurs in, state slopes that differ from the national one, and one-year shocks.
# Rough guesses that follow each species' expected story in the spec.
SPECIES = {
    "eurasian_collared_dove": {
        "share": 0.004,
        "slope": 0.03,
        "range": SOUTHEAST + MIDWEST + PLAINS + WEST + ["PA", "NY"],
        "local": {"MT": 0.20, "ID": 0.15, "ND": 0.14, "WA": 0.13, "WY": 0.13,
                  "OR": 0.12, "SD": 0.12, "MN": 0.10, "WI": 0.09, "MI": 0.08},
    },
    "chimney_swift": {
        "share": 0.004,
        "slope": -0.025,
        "range": EAST + PLAINS,
        "local": {"IL": -0.055},
    },
    "western_meadowlark": {
        "share": 0.006,
        "slope": -0.015,
        "range": PLAINS + WEST + ["MN", "IA", "WI", "IL", "MO"],
        "local": {"NE": -0.045},
    },
    "eastern_meadowlark": {
        "share": 0.004,
        "slope": -0.035,
        "range": EAST + ["NE", "KS", "OK", "TX", "AZ", "NM"],
        "local": {"PA": -0.07},
    },
    "wood_thrush": {
        "share": 0.004,
        "slope": -0.02,
        "range": EAST,
        "local": {"OH": -0.045},
    },
    "bald_eagle": {
        "share": 0.003,
        "slope": 0.04,
        "range": LOWER_48 + ["AK"],
    },
    "carolina_wren": {
        "share": 0.01,
        "slope": 0.012,
        "north": 0.006,
        "range": [c for c in EAST if c not in ("ME", "MN")] + ["TX", "OK", "KS", "NE"],
        "shocks": {("KY", 2018): 0.5},
    },
    "black_vulture": {
        "share": 0.004,
        "slope": 0.03,
        "north": 0.008,
        "range": SOUTHEAST + "PA NJ NY CT MA OH IN IL MO TX OK AZ".split(),
    },
}


def rng(*parts) -> random.Random:
    """A generator seeded by name, so one species' numbers don't depend on another's."""
    return random.Random("birdbrained-mock:" + ":".join(map(str, parts)))


def simulate_effort(regions: list[dict]) -> dict[str, list[int]]:
    """All-bird record counts N per region and year, growing about 10% a year."""
    effort = {}
    for region in regions:
        code = region["id"][3:]
        g = rng("effort", code)
        start = LOW_EFFORT.get(code) or math.exp(g.uniform(math.log(40_000), math.log(900_000)))
        growth = g.uniform(0.08, 0.13)
        effort[region["id"]] = [
            round(start * math.exp(growth * i) * g.lognormvariate(0, 0.03)) for i in range(len(YEARS))
        ]
    return effort


def simulate_counts(key: str, region: dict, n_all: list[int]) -> list[int] | None:
    """Species record counts n per year, or None where the species doesn't occur."""
    cfg = SPECIES[key]
    code = region["id"][3:]
    if code not in cfg["range"]:
        return None
    g = rng("counts", key, code)
    national = cfg["slope"] + cfg.get("north", 0) * (region["centroid"][0] - 38)
    slope = cfg.get("local", {}).get(code, national) + g.gauss(0, 0.006)
    share = cfg["share"] * g.uniform(0.6, 1.6)
    counts = []
    for i, (year, total) in enumerate(zip(YEARS, n_all)):
        shock = cfg.get("shocks", {}).get((code, year), 1)
        counts.append(round(share * math.exp(slope * i) * g.lognormvariate(0, 0.05) * shock * total))
    return counts


def simulate_climate(regions: list[dict]) -> dict[str, list[dict]]:
    """Breeding-season mean temperature and total rainfall per region and year."""
    climate = {}
    for region in regions:
        g = rng("climate", region["id"])
        lat, lon = region["centroid"]
        dry = lon < -100 and region["id"] not in ("US-AK", "US-HI")
        rain = g.uniform(80, 220) if dry else g.uniform(260, 420)
        climate[region["id"]] = [
            {
                "year": year,
                "tempC": round(31 - 0.62 * (lat - 25) + 0.03 * i + g.gauss(0, 0.5), 1),
                "rainMm": round(rain * g.lognormvariate(0, 0.18)),
            }
            for i, year in enumerate(YEARS)
        ]
    return climate


def write(name: str, data, pretty: bool = False) -> None:
    text = json.dumps(data, indent=2) if pretty else json.dumps(data, separators=(",", ":"))
    (OUT / name).write_text(text + "\n", encoding="utf-8")


def main() -> None:
    regions = json.loads((STATIC / "regions.json").read_text(encoding="utf-8"))
    species = json.loads((STATIC / "species.json").read_text(encoding="utf-8"))
    assert {s["key"] for s in species} == set(SPECIES), "species.json and SPECIES disagree"

    n_all = simulate_effort(regions)
    series, trends, bbs, fits, counts = {}, {}, {}, {}, {}
    for s in species:
        key = s["key"]
        series[key] = {"species": key, "years": YEARS, "baseYears": YEARS[:3], "regions": {}}
        trends[key], bbs[key], counts[key] = {}, {}, {}
        for region in regions:
            rid = region["id"]
            counts[key][rid] = simulate_counts(key, region, n_all[rid])
            region_series = build_series(counts[key][rid], n_all[rid])
            series[key]["regions"][rid] = region_series
            trends[key][rid], fit = fit_trend(region_series, YEARS, counts[key][rid])
            if fit is None:
                continue
            fits[key, rid] = fit
            g = rng("second-source", key, rid)
            if g.random() < 0.8:
                trends[key][rid]["secondSource"] = {"changePerYear": round(pct(fit["slope"]) + g.gauss(0, 1.5), 1)}
            g = rng("bbs", key, rid)
            if g.random() < 0.75:
                change = round(0.7 * trends[key][rid]["trend"]["changePerYear"] + g.gauss(0, 1.0), 1)
                bbs[key][rid] = {"changePerYear": change, "period": "1993-2023"}

    anomalies = detect_anomalies(species, regions, trends, fits, YEARS)
    effort = {
        region["id"]: [
            {"year": year, "records": total, "recordsPer1000Km2": round(total / region["areaKm2"] * 1000)}
            for year, total in zip(YEARS, n_all[region["id"]])
        ]
        for region in regions
    }

    OUT.mkdir(parents=True, exist_ok=True)
    write("series.json", series)
    write("trends.json", trends)
    write("anomalies.json", anomalies, pretty=True)
    write("effort.json", effort)
    write("climate.json", simulate_climate(regions))
    write("bbs.json", bbs)
    write("counts.json", counts)

    print(f"{len(fits)} species-regions with a trend, {len(anomalies)} anomalies kept")
    for anomaly in anomalies[:10]:
        print(f"  {anomaly['score']:>5}  {anomaly['type']:<19}  {anomaly['headline']}")


if __name__ == "__main__":
    main()
