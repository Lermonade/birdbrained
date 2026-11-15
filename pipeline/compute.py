"""Turn data/out/raw_counts.json into the files the API serves.

    python pipeline/compute.py

Writes to data/out/: series.json, trends.json, anomalies.json, effort.json and
counts.json, in the shapes listed in backend/README.md. The method is in
method.py and matches the spec's Science section. eBird is the main source;
iNaturalist gives the second-source check. Run load_bbs.py afterwards.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from method import build_series, count_slope, detect_anomalies, fit_trend

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "data" / "static"
OUT = ROOT / "data" / "out"

# A year counts as complete when eBird's national all-bird total is at least this share of the year
# before. eBird reaches GBIF once a year, so the latest year or two can be missing or partial.
COMPLETE_YEAR_SHARE = 0.8

# The second source: the trend in iNaturalist sightings from 2015, when it has enough records.
# iNaturalist has far fewer records than eBird, so its threshold is lower.
SECOND_SOURCE_FROM = 2015
INAT_MIN_SPECIES = 10
INAT_MIN_YEARS = 6


def complete_years(years: list[int], national_all_birds: list[int]) -> list[int]:
    """Years from the start up to the first year whose total drops below COMPLETE_YEAR_SHARE."""
    kept = [years[0]]
    for i in range(1, len(years)):
        if national_all_birds[i] < COMPLETE_YEAR_SHARE * national_all_birds[i - 1]:
            break
        kept.append(years[i])
    return kept


def write(name: str, data, pretty: bool = False) -> None:
    text = json.dumps(data, indent=2) if pretty else json.dumps(data, separators=(",", ":"))
    (OUT / name).write_text(text + "\n", encoding="utf-8")


def main() -> None:
    raw = json.loads((OUT / "raw_counts.json").read_text(encoding="utf-8"))
    species = json.loads((STATIC / "species.json").read_text(encoding="utf-8"))
    regions = json.loads((STATIC / "regions.json").read_text(encoding="utf-8"))

    all_years = raw["meta"]["years"]
    years = complete_years(all_years, raw["nationalTotals"]["ebird"]["all_birds"])
    keep = len(years)
    print(f"Years {years[0]} to {years[-1]} ({keep}); downloaded up to {all_years[-1]}")

    def counts_for(dataset: str, taxon: str, region_id: str) -> list[int]:
        return raw[f"{dataset}/{taxon}"][region_id][:keep]

    inat_from = years.index(SECOND_SOURCE_FROM)
    series, trends, fits, counts = {}, {}, {}, {}
    for s in species:
        key = s["key"]
        series[key] = {"species": key, "years": years, "baseYears": [], "regions": {}}
        trends[key], counts[key] = {}, {}
        for region in regions:
            rid = region["id"]
            n = counts_for("ebird", key, rid)
            n_all = counts_for("ebird", "all_birds", rid)
            counts[key][rid] = n
            region_series = build_series(n, n_all)
            series[key]["regions"][rid] = region_series
            trends[key][rid], fit = fit_trend(region_series, years, n)
            if fit is None:
                continue
            fits[key, rid] = fit
            slope = count_slope(counts_for("inaturalist", key, rid)[inat_from:], years[inat_from:],
                                INAT_MIN_SPECIES, INAT_MIN_YEARS)
            if slope is not None:
                trends[key][rid]["secondSource"] = {"changePerYear": slope}
        # The base years differ by state when early years lack data; this field gives the usual case.
        series[key]["baseYears"] = years[:3]

    anomalies = detect_anomalies(species, regions, trends, fits, years)
    area = {r["id"]: r["areaKm2"] for r in regions}
    effort = {
        rid: [
            {"year": year, "records": total, "recordsPer1000Km2": round(total / area[rid] * 1000)}
            for year, total in zip(years, counts_for("ebird", "all_birds", rid))
        ]
        for rid in area
    }

    write("series.json", series)
    write("trends.json", trends)
    write("anomalies.json", anomalies, pretty=True)
    write("effort.json", effort)
    write("counts.json", counts)

    # Summary ---------------------------------------------------------------------
    print(f"\n{len(fits)} species-states have a trend; "
          f"{sum(1 for k in trends for e in trends[k].values() if e['secondSource'])} also have an iNaturalist trend")
    thin = sum(1 for rows in effort.values() for row in rows if row["records"] < 20_000)
    print(f"{thin} of {len(effort) * keep} state-years have fewer than 20,000 all-bird records")
    print("\nTrend classes per species (raw sightings):")
    for s in species:
        classes = Counter(e["trend"]["class"] for e in trends[s["key"]].values() if e["trend"])
        print(f"  {s['commonName']:<23} " + ", ".join(f"{c} {n}" for c, n in classes.most_common()))
    print(f"\nTop anomalies ({len(anomalies)} kept):")
    for a in anomalies[:15]:
        print(f"  {a['score']:>5}  {a['type']:<19}  {a['headline']}"
              f"{'  [2 sources]' if a['confirmedBySecondSource'] else ''}")
    doves = [a for a in anomalies if a["species"] == "eurasian_collared_dove"]
    rank = anomalies.index(doves[0]) + 1 if doves else None
    print(f"\nValidation 1, Eurasian Collared-Dove: best rank {rank} of {len(anomalies)}, "
          f"{len(doves)} items in the list")


if __name__ == "__main__":
    main()
