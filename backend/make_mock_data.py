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
from itertools import combinations
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "data" / "static"
OUT = ROOT / "data" / "mock"

YEARS = list(range(2010, 2025))
MIN_ALL_BIRDS = 20_000  # all-bird records N a region-year needs
MIN_SPECIES = 30  # species records n a region-year needs
MIN_YEARS_OK = 0.7  # share of years that must pass before a trend is fitted

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


def pct(log_slope: float) -> float:
    """Log slope per year as percent change per year."""
    return round((math.exp(log_slope) - 1) * 100, 1)


def robust_z(value: float, values: list[float]) -> float:
    med = median(values)
    mad = median(abs(v - med) for v in values)
    return 0.6745 * (value - med) / mad if mad else 0.0


def theil_sen(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Median pairwise slope with its 95% interval."""
    slopes = sorted((y2 - y1) / (x2 - x1) for (x1, y1), (x2, y2) in combinations(points, 2))
    n, m = len(points), len(slopes)
    c = 1.96 * math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    low = slopes[max(0, round((m - c) / 2) - 1)]
    high = slopes[min(m - 1, round((m + c) / 2))]
    return median(slopes), low, high


def classify(low: float, high: float) -> str:
    if low > 0:
        return "increasing"
    if high < 0:
        return "decreasing"
    if low >= -1 and high <= 1:
        return "stable"
    return "uncertain"


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


def build_series(n: list[int] | None, n_all: list[int]) -> dict:
    """Raw and corrected index per year (base period = 100) and a status per year.

    The base is the first three years. Where those fail the thresholds, this mock
    uses the first three years that pass; the real pipeline may decide otherwise.
    """
    ok = [n is not None and total >= MIN_ALL_BIRDS and n[i] >= MIN_SPECIES for i, total in enumerate(n_all)]
    base = [i for i, passed in enumerate(ok) if passed][:3]
    if not base:
        blank = [None] * len(YEARS)
        return {"raw": blank, "corrected": blank, "status": ["insufficient"] * len(YEARS)}
    base_n = mean(n[i] for i in base)
    base_share = mean(n[i] / n_all[i] for i in base)
    return {
        "raw": [round(100 * n[i] / base_n, 1) if ok[i] else None for i in range(len(YEARS))],
        "corrected": [round(100 * n[i] / n_all[i] / base_share, 1) if ok[i] else None for i in range(len(YEARS))],
        "status": ["ok" if passed else "insufficient" for passed in ok],
    }


def build_trend(key: str, region_id: str, series: dict) -> tuple[dict, dict | None]:
    """The trends.json entry for one species-region, and the fit behind it."""
    years_ok = series["status"].count("ok")
    share_ok = years_ok / len(YEARS)
    label = "good" if share_ok >= 0.9 else "limited" if share_ok >= MIN_YEARS_OK else "insufficient"
    entry = {
        "trend": None,
        "rawTrend": None,
        "sufficiency": {"label": label, "yearsOk": years_ok, "yearsTotal": len(YEARS)},
        "secondSource": None,
    }
    if label == "insufficient":
        return entry, None

    points = [(year, math.log(v)) for year, v in zip(YEARS, series["corrected"]) if v is not None]
    slope, low, high = theil_sen(points)
    entry["trend"] = {
        "changePerYear": pct(slope),
        "low": pct(low),
        "high": pct(high),
        "class": classify(pct(low), pct(high)),
    }
    raw_points = [(year, math.log(v)) for year, v in zip(YEARS, series["raw"]) if v is not None]
    entry["rawTrend"] = {"changePerYear": pct(theil_sen(raw_points)[0])}

    g = rng("second-source", key, region_id)
    if g.random() < 0.8:
        entry["secondSource"] = {"changePerYear": round(pct(slope) + g.gauss(0, 1.5), 1)}

    intercept = median(y - slope * x for x, y in points)
    residuals = [(x, y - intercept - slope * x) for x, y in points]
    return entry, {"slope": slope, "residuals": residuals}


def detect_anomalies(species: list[dict], regions: list[dict], trends: dict, fits: dict) -> list[dict]:
    species_name = {s["key"]: s["commonName"] for s in species}
    region_name = {r["id"]: r["name"] for r in regions}
    all_slopes = [fit["slope"] for fit in fits.values()]
    found = []

    def add(kind: str, key: str, region_id: str, z: float, years: list[int], direction: str, headline: str) -> None:
        entry = trends[key][region_id]
        change = entry["trend"]["changePerYear"]
        second = entry["secondSource"]
        confirmed = second is not None and (second["changePerYear"] > 0) == (change > 0)
        label = entry["sufficiency"]["label"]
        weight = 1.0 if label == "good" else 0.75
        found.append({
            "type": kind,
            "species": key,
            "region": region_id,
            "years": years,
            "direction": direction,
            "headline": headline,
            "changePerYear": change,
            "z": round(abs(z), 1),
            "score": round(abs(z) * weight * (1.25 if confirmed else 1), 1),
            "sufficiency": label,
            "confirmedBySecondSource": confirmed,
        })

    for key in species_name:
        slopes = {region_id: fit["slope"] for (k, region_id), fit in fits.items() if k == key}
        for region_id, slope in slopes.items():
            bird, place = species_name[key], region_name[region_id]
            trend = trends[key][region_id]["trend"]
            rising = trend["changePerYear"] > 0
            span = [YEARS[0], YEARS[-1]]

            # A species-region gets one trend item: whichever of the two rules is stronger.
            options = []
            if abs(trend["changePerYear"]) > 5 and trend["class"] in ("increasing", "decreasing"):
                headline = f"{bird} is {'rising' if rising else 'falling'} fast in {place}"
                options.append(("strong_trend", robust_z(slope, all_slopes), "up" if rising else "down", headline))
            z = robust_z(slope, list(slopes.values()))
            if len(slopes) >= 8 and abs(z) > 3:
                pace = "faster" if (z > 0) == rising else "more slowly"
                headline = f"{bird} is {'rising' if rising else 'falling'} {pace} in {place} than nationally"
                options.append(("regional_divergence", z, "up" if z > 0 else "down", headline))
            if options:
                kind, z, direction, headline = max(options, key=lambda o: abs(o[1]))
                add(kind, key, region_id, z, span, direction, headline)

            residuals = fits[key, region_id]["residuals"]
            for year, residual in residuals:
                z = robust_z(residual, [r for _, r in residuals])
                if abs(z) > 3 and abs(residual) > 0.2:
                    verb = "jumped" if residual > 0 else "dropped"
                    headline = f"{bird} {verb} sharply in {place} in {year}"
                    add("sudden_change", key, region_id, z, [year, year], "up" if residual > 0 else "down", headline)

    found.sort(key=lambda a: (-a["score"], a["species"], a["region"]))
    return [{"id": f"a_{rank:04d}", **anomaly} for rank, anomaly in enumerate(found[:30], start=1)]


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
    series, trends, bbs, fits = {}, {}, {}, {}
    for s in species:
        key = s["key"]
        series[key] = {"species": key, "years": YEARS, "baseYears": YEARS[:3], "regions": {}}
        trends[key], bbs[key] = {}, {}
        for region in regions:
            rid = region["id"]
            region_series = build_series(simulate_counts(key, region, n_all[rid]), n_all[rid])
            series[key]["regions"][rid] = region_series
            trends[key][rid], fit = build_trend(key, rid, region_series)
            if fit is None:
                continue
            fits[key, rid] = fit
            g = rng("bbs", key, rid)
            if g.random() < 0.75:
                change = round(0.7 * trends[key][rid]["trend"]["changePerYear"] + g.gauss(0, 1.0), 1)
                bbs[key][rid] = {"changePerYear": change, "period": "1993-2023"}

    anomalies = detect_anomalies(species, regions, trends, fits)
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

    print(f"{len(fits)} species-regions with a trend, {len(anomalies)} anomalies kept")
    for anomaly in anomalies[:10]:
        print(f"  {anomaly['score']:>5}  {anomaly['type']:<19}  {anomaly['headline']}")


if __name__ == "__main__":
    main()
