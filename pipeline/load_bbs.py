"""Write data/out/bbs.json: the USGS Breeding Bird Survey trend per species and state.

    python pipeline/load_bbs.py      (after compute.py)

Source: USGS, The North American Breeding Bird Survey, Analysis Results
1966-2024, file BBS_Expanded_Decadal_Trends_2014-2024.csv. Its 2014-2024 trends
are the closest match to our own period. No key is needed.
https://www.sciencebase.gov/catalog/item/692f0fa7d4be026ff273a98e

It also prints the spec's second validation number: in how many species-states
our corrected eBird trend and the survey trend have the same direction.
Uses only the Python standard library.
"""
from __future__ import annotations

import csv
import io
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "data" / "static"
OUT = ROOT / "data" / "out"

BBS_URL = (
    "https://www.sciencebase.gov/catalog/file/get/692f0fa7d4be026ff273a98e"
    "?f=__disk__a5%2F3f%2F3d%2Fa53f3db73e18f24f5ca35aec463f0cdb31020aab"
)
PERIOD = "2014-2024"
# The survey's own warning on each estimate: R = important deficiency, Y = some deficiency, blank = none.
CREDIBILITY = {"R": "low", "Y": "medium", "": "high"}


def main() -> None:
    species = json.loads((STATIC / "species.json").read_text(encoding="utf-8"))
    regions = json.loads((STATIC / "regions.json").read_text(encoding="utf-8"))
    trends = json.loads((OUT / "trends.json").read_text(encoding="utf-8"))
    key_by_name = {s["commonName"].lower(): s["key"] for s in species}
    region_by_name = {r["name"].lower(): r["id"] for r in regions
                      if r.get("country", "United States") in ("United States", "Canada")}

    request = urllib.request.Request(BBS_URL, headers={"User-Agent": "birdbrained-pipeline"})
    with urllib.request.urlopen(request, timeout=120) as response:
        text = response.read().decode("latin-1")
    rows = list(csv.DictReader(io.StringIO(text)))
    print(f"Downloaded {len(rows):,} survey trend rows")

    bbs: dict[str, dict] = {s["key"]: {} for s in species}
    for row in rows:
        key = key_by_name.get(row["Species"].strip().lower())
        region_id = region_by_name.get(row["Region Name"].strip().lower())
        if key is None or region_id is None:
            continue
        if "NA" in (row["Trend"], row["2.5%CI"], row["97.5%CI"]):
            continue  # the survey publishes no estimate for this species and state
        bbs[key][region_id] = {
            "changePerYear": round(float(row["Trend"]), 1),
            "period": PERIOD,
            "low": round(float(row["2.5%CI"]), 1),
            "high": round(float(row["97.5%CI"]), 1),
            "nRoutes": int(row["N Routes"]) if row["N Routes"].isdigit() else None,
            "credibility": CREDIBILITY.get(row["Credibility Code"].strip(), "unknown"),
        }

    body = ",\n".join(f'  "{k}": ' + json.dumps(v, separators=(",", ":")) for k, v in bbs.items())
    (OUT / "bbs.json").write_text("{\n" + body + "\n}\n", encoding="utf-8")
    print(f"Wrote data/out/bbs.json: {sum(len(v) for v in bbs.values())} species-states")

    # Validation 2: same direction as our corrected trend, where both exist.
    compared = agree = compared_credible = agree_credible = 0
    for key, by_region in bbs.items():
        missing = [r["name"] for r in regions if r["id"] not in by_region]
        print(f"  {key:<23} {len(by_region):>2} states (none for {len(missing)})")
        for region_id, survey in by_region.items():
            ours = trends.get(key, {}).get(region_id, {}).get("trend")
            if ours is None:
                continue
            same = (ours["changePerYear"] > 0) == (survey["changePerYear"] > 0)
            compared += 1
            agree += same
            if survey["credibility"] != "low":
                compared_credible += 1
                agree_credible += same
    print(f"\nValidation 2: agrees in direction in {agree} of {compared} species-states "
          f"({agree_credible} of {compared_credible} when the survey's own estimate is not flagged low credibility)")


if __name__ == "__main__":
    main()
