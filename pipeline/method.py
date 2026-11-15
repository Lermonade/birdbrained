"""The method, shared by the real pipeline and the mock data.

Trends and anomalies use the corrected index: a species' share of all bird
records in a state and year, which cancels out growth in the number of birders.
(For a few hours on Nov 14 the app used raw sightings instead; it went back to
corrected the same evening.) Raw sightings are kept for context.

1. Index: the corrected share and raw sightings, scaled so the base years average 100.
2. Sufficiency: a state-year counts only with enough all-bird and species
   records; a species-state gets a trend only when enough of its years pass.
3. Trend: Theil-Sen slope of ln(corrected index) against year, with a 95% interval.
4. Anomalies: regional divergence, sudden change and strong trend, ranked by
   robust z-score.
"""
from __future__ import annotations

import math
from itertools import combinations
from statistics import mean, median

MIN_ALL_BIRDS = 20_000  # all-bird records N a state-year needs
MIN_SPECIES = 30  # species records n a state-year needs
MIN_SHARE_OF_YEARS = 0.7  # share of years that must pass before a trend is fitted
GOOD_SHARE_OF_YEARS = 0.9  # at or above this, sufficiency is "good" rather than "limited"
BASE_YEARS = 3
# Sudden changes are not flagged in the first years. eBird coverage was thin and changing fast in
# many states then, and the first points of a fitted line are the least certain.
SUDDEN_CHANGE_SKIP_YEARS = 2


def pct(log_slope: float) -> float:
    """Log slope per year as percent change per year."""
    return round((math.exp(log_slope) - 1) * 100, 1)


def robust_z(value: float, values: list[float]) -> float:
    """z-score from the median and the median absolute deviation."""
    med = median(values)
    mad = median(abs(v - med) for v in values)
    return 0.6745 * (value - med) / mad if mad else 0.0


def theil_sen(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Median pairwise slope with its 95% interval (same as scipy.stats.theilslopes)."""
    slopes = sorted((y2 - y1) / (x2 - x1) for (x1, y1), (x2, y2) in combinations(points, 2))
    n, m = len(points), len(slopes)
    c = 1.96 * math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    low = slopes[max(0, round((m - c) / 2) - 1)]
    high = slopes[min(m - 1, round((m + c) / 2))]
    return median(slopes), low, high


def classify(low: float, high: float) -> str:
    """Trend class from the interval of percent change per year."""
    if low > 0:
        return "increasing"
    if high < 0:
        return "decreasing"
    if low >= -1 and high <= 1:
        return "stable"
    return "uncertain"


def build_series(n: list[int] | None, n_all: list[int],
                 min_all: int = MIN_ALL_BIRDS, min_species: int = MIN_SPECIES) -> dict:
    """Raw and corrected index per year (base period = 100) and a status per year.

    The base is the first three years that pass the thresholds, which are the
    spec's first three years whenever those have enough data.
    """
    years = len(n_all)
    ok = [n is not None and total >= min_all and n[i] >= min_species for i, total in enumerate(n_all)]
    base = [i for i, passed in enumerate(ok) if passed][:BASE_YEARS]
    if not base:
        blank = [None] * years
        return {"raw": blank, "corrected": blank, "status": ["insufficient"] * years}
    base_n = mean(n[i] for i in base)
    base_share = mean(n[i] / n_all[i] for i in base)
    return {
        "raw": [round(100 * n[i] / base_n, 1) if ok[i] else None for i in range(years)],
        "corrected": [round(100 * n[i] / n_all[i] / base_share, 1) if ok[i] else None for i in range(years)],
        "status": ["ok" if passed else "insufficient" for passed in ok],
    }


def fit_trend(series: dict, years: list[int], counts: list[int] | None = None,
              measure: str = "corrected") -> tuple[dict, dict | None]:
    """The trends.json entry for one species-state, and the fit behind it (None when insufficient).

    `measure` is the series to fit: "corrected" (used by the app) or "raw". The raw sightings trend
    is added as rawTrend for context. `counts` are the species' record counts per year; the anomaly
    rules use them to tell real jumps from sampling noise. The entry's secondSource is left as None
    for the caller to fill.
    """
    years_ok = series["status"].count("ok")
    share_ok = years_ok / len(years)
    label = ("good" if share_ok >= GOOD_SHARE_OF_YEARS
             else "limited" if share_ok >= MIN_SHARE_OF_YEARS else "insufficient")
    entry = {
        "trend": None,
        "rawTrend": None,
        "sufficiency": {"label": label, "yearsOk": years_ok, "yearsTotal": len(years)},
        "secondSource": None,
    }
    if label == "insufficient":
        return entry, None

    points = [(year, math.log(v)) for year, v in zip(years, series[measure]) if v is not None]
    slope, low, high = theil_sen(points)
    entry["trend"] = {
        "changePerYear": pct(slope),
        "low": pct(low),
        "high": pct(high),
        "class": classify(pct(low), pct(high)),
    }
    raw_points = [(year, math.log(v)) for year, v in zip(years, series["raw"]) if v is not None]
    entry["rawTrend"] = {"changePerYear": pct(theil_sen(raw_points)[0])}

    intercept = median(y - slope * x for x, y in points)
    residuals = [(x, y - intercept - slope * x) for x, y in points]
    return entry, {"slope": slope, "residuals": residuals, "counts": dict(zip(years, counts or []))}


def window_trend(values: list[float | None], years: list[int], start: int, end: int,
                 min_points: int = 3) -> dict | None:
    """Trend of an index between two years, from the years in that window that have data.

    Returns percent change per year with its 95% interval and class, the fitted change over the
    whole window, and the best-estimate direction. None when fewer than min_points years have data.
    """
    points = [(y, math.log(v)) for y, v in zip(years, values) if start <= y <= end and v]
    if len(points) < min_points:
        return None
    slope, low, high = theil_sen(points)
    per_year, lo, hi = pct(slope), pct(low), pct(high)
    trend_class = classify(lo, hi)
    return {
        "changePerYear": per_year,
        "low": lo,
        "high": hi,
        "class": trend_class,
        "changePct": round((math.exp(slope * (end - start)) - 1) * 100, 1),
        "direction": "up" if slope > 0 else "down",
        "confident": trend_class in ("increasing", "decreasing"),
    }


def share_slope(n: list[int], n_all: list[int], years: list[int],
                min_all: int, min_species: int, min_years: int) -> float | None:
    """Percent change per year of a species' share of all records, or None without enough years.

    The same corrected trend as fit_trend, used for the second source (iNaturalist).
    """
    points = [(year, math.log(s / total)) for year, s, total in zip(years, n, n_all)
              if total >= min_all and s >= min_species]
    return pct(theil_sen(points)[0]) if len(points) >= min_years else None


def count_slope(counts: list[int], years: list[int], min_count: int, min_years: int) -> float | None:
    """Percent change per year of a count (Theil-Sen on its log), or None without enough years.

    Only years with at least min_count are used. For the second source and the all-birds context.
    """
    points = [(year, math.log(c)) for year, c in zip(years, counts) if c >= min_count]
    return pct(theil_sen(points)[0]) if len(points) >= min_years else None


def sampling_spread(fits: list[dict], min_records: int = 1_000) -> float:
    """Typical year-to-year spread of residuals that is not sampling noise.

    Measured on years with many records, where counting noise is negligible, as a robust standard
    deviation (1.4826 x the median absolute deviation).
    """
    big = [r for fit in fits for year, r in fit["residuals"] if fit["counts"].get(year, 0) >= min_records]
    values = big if len(big) >= 20 else [r for fit in fits for _, r in fit["residuals"]]
    med = median(values)
    return 1.4826 * median(abs(v - med) for v in values)


def year_z(residual: float, n: int | None, spread: float) -> float:
    """How unusual one year's residual is, given the species' usual spread plus counting noise.

    A count of n records has a relative counting error of about 1/sqrt(n), so a year with 100
    records can move 10% by chance alone, and one with 10,000 records only 1%.
    """
    variance = spread ** 2 + (1 / n if n else 0)
    return residual / math.sqrt(variance) if variance else 0.0


def detect_anomalies(species: list[dict], regions: list[dict], trends: dict, fits: dict,
                     years: list[int], keep: int = 30) -> list[dict]:
    """The ranked anomaly list. `fits` maps (species key, region id) to fit_trend's fit."""
    species_name = {s["key"]: s["commonName"] for s in species}
    region_name = {r["id"]: r["name"] for r in regions}
    all_slopes = [fit["slope"] for fit in fits.values()]
    found = []

    def add(kind: str, key: str, region_id: str, z: float, span: list[int], direction: str, headline: str) -> None:
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
            "years": span,
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
        # A year's residual is judged against this species' usual spread across all states plus that
        # year's counting noise. Within one short series the spread is often tiny, and early years
        # have few records, so both would otherwise make ordinary noise look extreme.
        spread = sampling_spread([fit for (k, _), fit in fits.items() if k == key])
        # A jump that shows up in most states in the same year (eBird's surges in users, such as
        # 2012 and 2020) is about birders, not birds, so each year's median jump is taken out first.
        by_year: dict[int, list[float]] = {}
        for (k, _), fit in fits.items():
            if k == key:
                for year, r in fit["residuals"]:
                    by_year.setdefault(year, []).append(r)
        year_effect = {year: median(rs) for year, rs in by_year.items()}
        for region_id, slope in slopes.items():
            bird, place = species_name[key], region_name[region_id]
            trend = trends[key][region_id]["trend"]
            rising = trend["changePerYear"] > 0
            span = [years[0], years[-1]]

            # A species-state gets one trend item: whichever of the two rules is stronger.
            # Strong trend (the spec's rule): beyond 5% a year with an interval that excludes zero.
            # Regional divergence: unusual for this species compared with its other states.
            options = []
            if abs(trend["changePerYear"]) > 5 and trend["class"] in ("increasing", "decreasing"):
                headline = f"{bird} is {'rising' if rising else 'falling'} fast in {place}"
                options.append(("strong_trend", robust_z(slope, all_slopes), "up" if rising else "down", headline))
            z = robust_z(slope, list(slopes.values()))
            if len(slopes) >= 8 and abs(z) > 3:
                pace = "faster" if (z > 0) == rising else "more slowly"
                headline = f"{bird} is {'rising' if rising else 'falling'} {pace} in {place} than in other states"
                options.append(("regional_divergence", z, "up" if z > 0 else "down", headline))
            if options:
                kind, z, direction, headline = max(options, key=lambda o: abs(o[1]))
                add(kind, key, region_id, z, span, direction, headline)

            # Unusual years next to each other in the same direction are one event, e.g. a drop that
            # starts in 2023 and lasts. Each species-state gets at most one sudden-change item.
            runs: list[list[tuple[int, float]]] = []
            fit = fits[key, region_id]
            for year, residual in fit["residuals"]:
                if year < years[0] + SUDDEN_CHANGE_SKIP_YEARS:
                    continue
                residual -= year_effect[year]
                z = year_z(residual, fit["counts"].get(year), spread)
                if abs(z) <= 3 or abs(residual) <= 0.2:
                    continue
                last = runs[-1][-1] if runs else None
                if last and last[0] == year - 1 and (last[1] > 0) == (z > 0):
                    runs[-1].append((year, z))
                else:
                    runs.append([(year, z)])
            if runs:
                run = max(runs, key=lambda r: max(abs(z) for _, z in r))
                first, last = run[0][0], run[-1][0]
                z = max((z for _, z in run), key=abs)
                verb = "jumped" if z > 0 else "dropped"
                when = f"in {first}" if first == last else f"from {first} to {last}"
                headline = f"{bird} {verb} sharply in {place} {when}"
                add("sudden_change", key, region_id, z, [first, last], "up" if z > 0 else "down", headline)

    # The types score on different scales (one-year jumps reach far higher z-scores than trends), so the
    # feed interleaves them: the best of each type, then the second best, and so on. Long-term changes
    # come first in each round. A type that runs out leaves its places to the others.
    by_type: dict[str, list[dict]] = {}
    for anomaly in sorted(found, key=lambda a: (-a["score"], a["species"], a["region"])):
        by_type.setdefault(anomaly["type"], []).append(anomaly)
    order = [t for t in ("regional_divergence", "strong_trend", "sudden_change") if t in by_type]
    mixed: list[dict] = []
    for i in range(max((len(v) for v in by_type.values()), default=0)):
        mixed += [by_type[t][i] for t in order if i < len(by_type[t])]
    return [{"id": f"a_{rank:04d}", **anomaly} for rank, anomaly in enumerate(mixed[:keep], start=1)]
