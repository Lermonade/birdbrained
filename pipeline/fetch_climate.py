"""Write data/out/climate.json: breeding-season weather per state and year.

    python pipeline/fetch_climate.py

Source: NOAA NCEI nClimDiv statewide monthly averages, which are area-weighted
averages of a 5 km grid built from weather-station data. Two files cover every
state, so this makes two downloads and needs no API key.
https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/

For each state and year it writes the mean temperature and the total rainfall
over May to July, the same months as the bird counts. The District of Columbia
has no series of its own, so it uses Maryland's. Years run from START_YEAR to
the latest year with all three months published.

Uses only the Python standard library.
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from statistics import mean

BASE_URL = "https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/"
ROOT = Path(__file__).resolve().parent.parent
REGIONS_FILE = ROOT / "data" / "static" / "regions.json"
OUT_FILE = ROOT / "data" / "out" / "climate.json"

START_YEAR = 2010
MONTHS = (5, 6, 7)  # May to July
STAND_INS = {"District of Columbia": "Maryland"}

# NOAA's state codes 001 to 050, from the state code table in state-readme.txt in the folder above.
NOAA_STATES = [
    "Alabama", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
    "Georgia", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana",
    "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
    "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
    "Wisconsin", "Wyoming", "Hawaii", "Alaska",
]
NOAA_CODE = {name: f"{i:03d}" for i, name in enumerate(NOAA_STATES, start=1)}

TEMPERATURE = {"file": "tmpcst", "element": "02", "missing": -99.90}  # degrees Fahrenheit
PRECIPITATION = {"file": "pcpnst", "element": "01", "missing": -9.99}  # inches


def download(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "birdbrained-pipeline"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("ascii", errors="replace")


def latest_file_name(listing: str, kind: str) -> str:
    """The newest file of one kind in the folder listing, e.g. climdiv-tmpcst-v1.0.0-20261105."""
    names = set(re.findall(rf"climdiv-{kind}-v[\d.]+-\d{{8}}", listing))
    if not names:
        raise SystemExit(f"No climdiv-{kind} file found at {BASE_URL}")
    return max(names, key=lambda name: name[-8:])


def parse(text: str, element: str, missing: float) -> dict[str, dict[int, list[float | None]]]:
    """{state code: {year: 12 monthly values, None where missing}} for statewide rows."""
    values: dict[str, dict[int, list[float | None]]] = {}
    for line in text.splitlines():
        fields = line.split()
        if len(fields) != 13 or len(fields[0]) != 10:
            continue
        head = fields[0]
        state, division, row_element, year = head[:3], head[3], head[4:6], int(head[6:10])
        if division != "0" or row_element != element:
            continue
        months = [float(v) for v in fields[1:]]
        values.setdefault(state, {})[year] = [None if abs(v - missing) < 0.005 else v for v in months]
    return values


def season(months: list[float | None]) -> list[float] | None:
    picked = [months[m - 1] for m in MONTHS]
    return None if any(v is None for v in picked) else picked


def main() -> None:
    listing = download(BASE_URL)
    temp_name = latest_file_name(listing, TEMPERATURE["file"])
    rain_name = latest_file_name(listing, PRECIPITATION["file"])
    temperature = parse(download(BASE_URL + temp_name), TEMPERATURE["element"], TEMPERATURE["missing"])
    precipitation = parse(download(BASE_URL + rain_name), PRECIPITATION["element"], PRECIPITATION["missing"])
    print(f"Downloaded {temp_name} and {rain_name}")

    regions = [r for r in json.loads(REGIONS_FILE.read_text(encoding="utf-8")) if r["id"].startswith("US-")]
    climate: dict[str, list[dict]] = {}
    for region in regions:
        code = NOAA_CODE[STAND_INS.get(region["name"], region["name"])]
        rows = []
        for year in sorted(y for y in temperature[code] if y >= START_YEAR):
            temp = season(temperature[code][year])
            rain = season(precipitation.get(code, {}).get(year, [None] * 12))
            if temp is None or rain is None:
                continue
            rows.append({
                "year": year,
                "tempC": round((mean(temp) - 32) * 5 / 9, 1),
                "rainMm": round(sum(rain) * 25.4),
            })
        climate[region["id"]] = rows

    year_spans = {(rows[0]["year"], rows[-1]["year"], len(rows)) for rows in climate.values()}
    if len(year_spans) != 1:
        raise SystemExit(f"States cover different years: {year_spans}")
    first, last, count = year_spans.pop()

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = [f'  "{rid}": {json.dumps(rows, separators=(",", ":"))}' for rid, rows in climate.items()]
    OUT_FILE.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE.relative_to(ROOT)}: {len(climate)} regions, {first} to {last} ({count} years)")


if __name__ == "__main__":
    main()
