"""Download worldwide bird record counts from GBIF.

    python pipeline/fetch_gbif.py            (about 15 minutes)

Writes:
  data/static/species.json   the species: our original 8 plus the most-reported birds of each continent
  data/static/regions.json   every state or province with enough bird records, with a name and a center
  data/out/raw_counts.json   records per species, region and year, from eBird and iNaturalist

Counts cover the breeding season of each region's hemisphere: May to July in the
north, October to December in the south. One GBIF call returns the count for
every state and province in the world at once (a facet on the GADM id), so the
work grows with species x years, not with places. No API key is needed.
Uses only the Python standard library.
"""
from __future__ import annotations

import hashlib
import json
import re
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "data" / "static"
OUT_FILE = ROOT / "data" / "out" / "raw_counts.json"
CACHE_DIR = ROOT / "data" / "gbif_cache"  # every GBIF answer, so a rerun resumes instead of starting over

API = "https://api.gbif.org/v1"
DATASETS = {
    "ebird": "4fa7b334-ce0d-4e88-aaae-2e0c138d049e",  # eBird Observation Dataset
    "inaturalist": "50c9509d-22c7-4a22-a47d-8c48425ef4a7",  # iNaturalist research-grade observations
}
EBIRD = DATASETS["ebird"]
ALL_BIRDS = ("all_birds", 212)  # GBIF taxon key of the class Aves
SEASONS = {"north": "5,7", "south": "10,12"}  # breeding-season months by hemisphere
SEASON_LABEL = {"north": "May to July", "south": "October to December"}
FIRST_YEAR = 2010
SECOND_SOURCE_FROM = 2015  # iNaturalist is only used from this year (see compute.py)
CONTINENTS = ["NORTH_AMERICA", "SOUTH_AMERICA", "EUROPE", "AFRICA", "ASIA", "OCEANIA"]
PER_CONTINENT = 15  # most-reported species taken from each continent
TARGET_SPECIES = 100
MIN_REGION_RECORDS = 20_000  # all-bird eBird records a region needs in the latest full year to be kept
WORKERS = 4  # GBIF answers 429 (too many requests) above this


def get_json(path: str, params: dict | None = None) -> dict:
    """One GBIF call, cached on disk, retried on rate limits, server errors and network errors."""
    url = f"{API}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    cached = CACHE_DIR / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    request = urllib.request.Request(url, headers={"User-Agent": "birdbrained-pipeline"})
    for attempt in range(8):
        wait = min(60, 5 * 2 ** attempt)
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                data = json.load(response)
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps(data), encoding="utf-8")
            return data
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500 or attempt == 7:
                raise
            wait = int(exc.headers.get("Retry-After") or wait)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 7:
                raise
        time.sleep(wait)
    raise AssertionError("unreachable")


def facet(params: dict, field: str, limit: int = 10_000) -> tuple[dict[str, int], int]:
    """({facet value: count}, total) for an occurrence search."""
    data = get_json("/occurrence/search", {**params, "facet": field, "facetLimit": limit, "limit": 0})
    counts = (data.get("facets") or [{"counts": []}])[0]["counts"]
    return {c["name"]: c["count"] for c in counts}, data["count"]


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def run_parallel(function, jobs: list, label: str) -> list:
    """Run function(*job) for every job with a few threads, printing progress."""
    started, done, results = time.perf_counter(), 0, []
    with ThreadPoolExecutor(WORKERS) as pool:
        for result in pool.map(lambda job: function(*job), jobs):
            results.append(result)
            done += 1
            if done % 250 == 0 or done == len(jobs):
                print(f"  {label}: {done}/{len(jobs)} calls, {time.perf_counter() - started:.0f} s", flush=True)
    return results


# Species ---------------------------------------------------------------------------------------

def english_name(key: int) -> tuple[str, str]:
    """(English common name, scientific name) for a GBIF species key."""
    info = get_json(f"/species/{key}")
    scientific = info.get("canonicalName") or info.get("scientificName", str(key))
    names = get_json(f"/species/{key}/vernacularNames", {"limit": 200}).get("results", [])
    english = [n for n in names if n.get("language") == "eng" and n.get("vernacularName")]
    preferred = [n for n in english if "IOC" in (n.get("source") or "")] or english
    name = preferred[0]["vernacularName"] if preferred else scientific
    return name[:1].upper() + name[1:], scientific


def choose_species(original: list[dict]) -> list[dict]:
    """Our original species, then the most-reported of each continent, then the world's, up to the target."""
    chosen: dict[int, dict | None] = {s["gbifKey"]: s for s in original}
    order = [s["gbifKey"] for s in original]
    base = {"datasetKey": EBIRD, "taxonKey": ALL_BIRDS[1], "year": date.today().year - 2}
    for continent in CONTINENTS:
        counts, _ = facet({**base, "continent": continent}, "speciesKey", 60)
        added = 0
        for key in counts:
            if added == PER_CONTINENT:
                break
            if int(key) not in chosen:
                chosen[int(key)] = None
                order.append(int(key))
                added += 1
    world, _ = facet(base, "speciesKey", 300)
    for key in world:
        if len(order) >= TARGET_SPECIES:
            break
        if int(key) not in chosen:
            chosen[int(key)] = None
            order.append(int(key))

    new_keys = [k for k in order if chosen[k] is None]
    names = dict(zip(new_keys, run_parallel(english_name, [(k,) for k in new_keys], "species names")))
    species, used = [], {s["key"] for s in original}
    for key in order:
        if chosen[key] is not None:
            species.append(chosen[key])
            continue
        common, scientific = names[key]
        species_key = slug(common)
        while species_key in used:
            species_key += "_2"
        used.add(species_key)
        species.append({"key": species_key, "commonName": common, "scientificName": scientific,
                        "gbifKey": key, "story": ""})
    return species


# Regions ---------------------------------------------------------------------------------------

def region_info(gadm: str) -> dict:
    """Name, country and a center for a state or province (the median position of its bird records)."""
    info = get_json(f"/geocode/gadm/{urllib.parse.quote(gadm)}")
    country = (info.get("higherRegions") or [{}])[0].get("name", "")
    params = {"datasetKey": EBIRD, "taxonKey": ALL_BIRDS[1], "gadmGid": gadm, "hasCoordinate": "true", "limit": 300}
    records = get_json("/occurrence/search", {**params, "year": date.today().year - 2}).get("results", [])
    if len(records) < 20:
        records = get_json("/occurrence/search", params).get("results", [])
    lats = [r["decimalLatitude"] for r in records if "decimalLatitude" in r]
    lngs = [r["decimalLongitude"] for r in records if "decimalLongitude" in r]
    center = [round(statistics.median(lats), 2), round(statistics.median(lngs), 2)] if lats else None
    return {"gadmGid": gadm, "name": info.get("name", gadm), "country": country, "centroid": center}


def main() -> None:
    started = time.perf_counter()
    years = list(range(FIRST_YEAR, date.today().year))  # the current year is never complete
    # The original 8 species are the ones with a written story; the US states keep their ids.
    original_species = [s for s in json.loads((STATIC / "species.json").read_text(encoding="utf-8")) if s["story"]]
    us_regions = {r["gadmGid"]: r for r in json.loads((STATIC / "regions.json").read_text(encoding="utf-8"))
                  if r["id"].startswith("US-")}

    print("Choosing species...", flush=True)
    species = choose_species(original_species)
    print(f"{len(species)} species", flush=True)

    print("Counting all birds per province...", flush=True)
    jobs = [(dataset, season, year) for dataset in DATASETS for season in SEASONS for year in years]

    def all_birds(dataset, season, year):
        return facet({"datasetKey": DATASETS[dataset], "taxonKey": ALL_BIRDS[1], "year": year,
                      "month": SEASONS[season]}, "gadmLevel1Gid")

    results = dict(zip(jobs, run_parallel(all_birds, jobs, "all birds")))
    season_totals = {s: [results["ebird", s, y][1] for y in years] for s in SEASONS}

    # Candidate provinces: enough eBird records in the latest full year of either season
    latest = years[-2]
    candidates = {g for s in SEASONS for g, n in results["ebird", s, latest][0].items() if n >= MIN_REGION_RECORDS}
    others = sorted(g for g in candidates if g not in us_regions)
    print(f"Looking up {len(others)} provinces outside the US...", flush=True)
    infos = run_parallel(region_info, [(g,) for g in others], "provinces")

    regions = [{**r, "country": "United States", "season": "north"} for r in us_regions.values()]
    for info in infos:
        if not info["centroid"]:
            continue
        season = "north" if info["centroid"][0] >= 0 else "south"
        if results["ebird", season, latest][0].get(info["gadmGid"], 0) < MIN_REGION_RECORDS:
            continue  # its own breeding season doesn't have enough records
        regions.append({"id": info["gadmGid"], "name": info["name"], "country": info["country"],
                        "gadmGid": info["gadmGid"], "centroid": info["centroid"], "areaKm2": None,
                        "season": season})
    regions.sort(key=lambda r: (r["country"] != "United States", r["country"], r["name"]))
    by_gadm = {r["gadmGid"]: r for r in regions}
    print(f"{len(regions)} regions kept ({sum(r['season'] == 'south' for r in regions)} in the south)", flush=True)

    # Which hemispheres each species is reported in: one call per species and season over all years.
    # Per-year calls are only made where a kept region has at least 30 records in total.
    print("Checking where each species is reported...", flush=True)
    region_ids = {s: {r["gadmGid"] for r in regions if r["season"] == s} for s in SEASONS}
    presence_jobs = [(sp["gbifKey"], season) for sp in species for season in SEASONS]

    def present(key, season):
        found, _ = facet({"datasetKey": EBIRD, "taxonKey": key, "year": f"{years[0]},{years[-1]}",
                          "month": SEASONS[season]}, "gadmLevel1Gid")
        return any(n >= 30 for g, n in found.items() if g in region_ids[season])

    reported = dict(zip(presence_jobs, run_parallel(present, presence_jobs, "presence")))
    print(f"{sum(reported.values())} species-season combinations to count", flush=True)

    print("Counting each species per province...", flush=True)
    jobs = [(sp["key"], sp["gbifKey"], dataset, season, year)
            for sp in species for season in SEASONS if reported[sp["gbifKey"], season]
            for dataset in DATASETS for year in years
            if dataset == "ebird" or year >= SECOND_SOURCE_FROM]

    def species_counts(name, key, dataset, season, year):
        return facet({"datasetKey": DATASETS[dataset], "taxonKey": key, "year": year,
                      "month": SEASONS[season]}, "gadmLevel1Gid")[0]

    fetched = dict(zip(jobs, run_parallel(species_counts, jobs, "species")))
    fetched.update({(ALL_BIRDS[0], ALL_BIRDS[1], d, s, y): results[d, s, y][0]
                    for d in DATASETS for s in SEASONS for y in years})

    # Keep each region's own season only. Regions where a species never appears are left out.
    counts: dict = {}
    for (name, _, dataset, season, year), by_region in fetched.items():
        table = counts.setdefault(f"{dataset}/{name}", {})
        for gadm, n in by_region.items():
            region = by_gadm.get(gadm)
            if region and region["season"] == season:
                table.setdefault(region["id"], [0] * len(years))[years.index(year)] = n

    (STATIC / "species.json").write_text(
        "[\n" + ",\n".join("  " + json.dumps(s, ensure_ascii=False) for s in species) + "\n]\n", encoding="utf-8")
    (STATIC / "regions.json").write_text(
        "[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in regions) + "\n]\n", encoding="utf-8")

    meta = {
        "source": "GBIF occurrence search, facet by gadmLevel1Gid",
        "datasets": DATASETS,
        "seasons": SEASON_LABEL,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "years": years,
    }
    lines = ['  "meta": ' + json.dumps(meta), '  "seasonTotals": ' + json.dumps(season_totals)]
    for table_name, table in counts.items():
        lines.append(f'  "{table_name}": ' + json.dumps(table, separators=(",", ":")))
    OUT_FILE.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    size = OUT_FILE.stat().st_size / 1e6
    print(f"Wrote {len(species)} species, {len(regions)} regions, {OUT_FILE.name} ({size:.1f} MB) "
          f"in {time.perf_counter() - started:.0f} s", flush=True)


if __name__ == "__main__":
    main()
