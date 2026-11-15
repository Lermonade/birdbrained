"""Download bird record counts from GBIF and write data/out/raw_counts.json.

    python pipeline/fetch_gbif.py

For each dataset (eBird and iNaturalist), each taxon (the 8 demo species plus
all birds) and each year, one GBIF call returns the count of May-to-July
records in every US state at once (a facet on the state's GADM id). That is
2 x 9 x 17 = 306 calls, about 5 minutes. No API key is needed.

The output keeps every year that was downloaded; compute.py decides which
years have complete data. The file is committed, so trends can be recomputed
without calling GBIF again. Uses only the Python standard library.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "data" / "static"
OUT_FILE = ROOT / "data" / "out" / "raw_counts.json"

SEARCH_URL = "https://api.gbif.org/v1/occurrence/search"
DATASETS = {
    "ebird": "4fa7b334-ce0d-4e88-aaae-2e0c138d049e",  # eBird Observation Dataset
    "inaturalist": "50c9509d-22c7-4a22-a47d-8c48425ef4a7",  # iNaturalist research-grade observations
}
ALL_BIRDS = ("all_birds", 212)  # GBIF taxon key of the class Aves
FIRST_YEAR = 2010
MONTHS = "5,7"  # May to July, the breeding season
PAUSE_S = 0.3  # between calls; GBIF answers 429 when called too fast


def get_json(params: dict) -> dict:
    """One GBIF call, retried up to 3 times on rate limits, server errors and network errors."""
    url = SEARCH_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "birdbrained-pipeline"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500 or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(2 ** (attempt + 1))
    raise AssertionError("unreachable")


def count_by_state(dataset_key: str, taxon_key: int, year: int) -> tuple[dict[str, int], int]:
    """({GADM state id: record count}, national total) for one taxon and year."""
    data = get_json({
        "datasetKey": dataset_key,
        "taxonKey": taxon_key,
        "gadmLevel0Gid": "USA",
        "year": year,
        "month": MONTHS,
        "occurrenceStatus": "PRESENT",
        "facet": "gadmLevel1Gid",
        "facetLimit": 100,
        "limit": 0,
    })
    facets = data.get("facets") or [{"counts": []}]
    return {item["name"]: item["count"] for item in facets[0]["counts"]}, data["count"]


def main() -> None:
    species = json.loads((STATIC / "species.json").read_text(encoding="utf-8"))
    regions = json.loads((STATIC / "regions.json").read_text(encoding="utf-8"))
    region_by_gadm = {r["gadmGid"]: r["id"] for r in regions}
    taxa = [ALL_BIRDS] + [(s["key"], s["gbifKey"]) for s in species]
    years = list(range(FIRST_YEAR, date.today().year + 1))

    counts: dict = {}
    totals: dict = {}
    unmatched: set[str] = set()
    started = time.perf_counter()
    for dataset, dataset_key in DATASETS.items():
        for taxon, taxon_key in taxa:
            per_region = {r["id"]: [0] * len(years) for r in regions}
            national = []
            for i, year in enumerate(years):
                by_gadm, total = count_by_state(dataset_key, taxon_key, year)
                national.append(total)
                for gadm, n in by_gadm.items():
                    if gadm in region_by_gadm:
                        per_region[region_by_gadm[gadm]][i] = n
                    else:
                        unmatched.add(gadm)
                time.sleep(PAUSE_S)
            counts.setdefault(dataset, {})[taxon] = per_region
            totals.setdefault(dataset, {})[taxon] = national
            print(f"{time.perf_counter() - started:6.0f} s  {dataset:<11} {taxon:<23} "
                  f"{sum(national):>11,} records")

    if unmatched:
        print(f"Warning: GBIF returned state ids not in regions.json: {sorted(unmatched)}")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "source": "GBIF occurrence search, facet by gadmLevel1Gid",
        "datasets": DATASETS,
        "months": "May to July",
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "years": years,
    }
    lines = ['  "meta": ' + json.dumps(meta), '  "nationalTotals": ' + json.dumps(totals)]
    for dataset, by_taxon in counts.items():
        for taxon, per_region in by_taxon.items():
            lines.append(f'  "{dataset}/{taxon}": ' + json.dumps(per_region, separators=(",", ":")))
    OUT_FILE.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE.relative_to(ROOT)} in {time.perf_counter() - started:.0f} s")


if __name__ == "__main__":
    main()
