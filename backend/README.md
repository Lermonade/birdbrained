# BirdBrained backend

A FastAPI server for the API contract in the master spec. It serves the real data in `data/out/` (eBird and iNaturalist through GBIF, 2010 to 2025), falls back to mock data for any file that is missing, and `/api/ask` runs the AI analyst (OpenAI).

As of Nov 14 the app shows raw sighting counts only; see the decision note at the top of the spec. Trends, anomalies and the analyst all work on raw sightings. The corrected index is still written to `series.json` but nothing uses it.

## Run it

Needs Python 3.11 or newer.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open http://localhost:8000/docs to try every endpoint in the browser.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET /api/species` | The 8 demo species |
| `GET /api/regions` | The 50 states and DC, with centroid and area |
| `GET /api/grab_data?species=<key>,<key>&start=2015&end=2025` | For the globe: raw sightings per state in the start and end years, and the change between them |
| `GET /api/series?species=<key>` | Raw and corrected index for every region and year |
| `GET /api/anomalies?species=<key>&limit=10` | Ranked anomalies; leave out `species` for all |
| `GET /api/detail?species=<key>&region=<id>` | Trend, checks, effort and climate for one species-region |
| `POST /api/ask` | The analyst's answer, in 5 to 30 seconds |
| `GET /api/health` | Whether each data file being served is real or mock |

The frontend can call `http://localhost:8000` from any localhost port. For the deployed frontend, set `FRONTEND_ORIGINS` to its URL (comma-separated if several).

## Where the data comes from

| Folder | Contents |
| --- | --- |
| `data/static/` | `species.json` and `regions.json`: real reference data; the GBIF species keys and GADM region ids were checked against the GBIF API. `species_profiles.json`: a hand-written draft for the analyst, to be checked by the Product lead. |
| `data/mock/` | Simulated pipeline outputs, written by `python backend/make_mock_data.py`. Same method as the real pipeline, simulated counts. |
| `data/out/` | Real pipeline outputs, written by the scripts in `pipeline/` (see below). |

### Rebuilding the real data

From the repo root, with the backend's venv active (the scripts need only the Python standard library):

```bash
python pipeline/fetch_gbif.py      # about 5 min: eBird and iNaturalist counts from GBIF -> data/out/raw_counts.json
python pipeline/compute.py         # seconds: series, trends, anomalies, effort, counts
python pipeline/load_bbs.py        # seconds: Breeding Bird Survey trends -> bbs.json
python pipeline/fetch_climate.py   # seconds: NOAA statewide climate -> climate.json
```

`compute.py` and `load_bbs.py` print the two validation numbers from the spec. The method (thresholds, trend fit, anomaly rules) is in `pipeline/method.py`, shared with `make_mock_data.py`. Restart the server after rebuilding.

For each file, the server reads `data/out/<file>` if it exists and `data/mock/<file>` otherwise. So the pipeline only has to write a file to `data/out/` in the shape below, and a server restart switches that file to real data.

| File | Shape |
| --- | --- |
| `series.json` | `{species: {species, years, baseYears, regions: {regionId: {raw[], corrected[], status[]}}}}` |
| `trends.json` | `{species: {regionId: {trend: {changePerYear, low, high, class}, sufficiency: {label, yearsOk, yearsTotal}, secondSource: {changePerYear}}}}`. `trend` is the trend in raw eBird sightings; `secondSource` is the trend in iNaturalist sightings from 2015. |
| `anomalies.json` | The `/api/anomalies` list, best first |
| `effort.json` | `{regionId: [{year, records, recordsPer1000Km2}]}` |
| `climate.json` | `{regionId: [{year, tempC, rainMm}]}`. Real: May to July mean temperature and total rainfall, 2010 to 2026, from NOAA's statewide averages (nClimDiv). DC uses Maryland's. |
| `bbs.json` | `{species: {regionId: {changePerYear, period, low, high, nRoutes, credibility}}}`. Real: USGS Breeding Bird Survey trends for 2014 to 2024. The survey lumps the two meadowlarks together, so they have none. |
| `counts.json` | `{species: {regionId: [species record count per series year] or null}}`, the eBird `n` from `counts.parquet`. The analyst's `check_sampling` tool reads it. |

## Choices the spec leaves open

These are what the server does today. Tell the team before changing them.

- `sufficiency.label` is `good` (at least 90% of years pass), `limited` (at least 70%) or `insufficient`.
- When a species-region is `insufficient`, `trend` is `null` in `/api/detail`, and the series values for failing years are `null`.
- `/api/detail` returns `allBirdsTrend` (the trend in sightings of all birds in that state, the "more birders" baseline) in place of the spec's `rawTrend`, since `trend` is now itself raw.
- `agrees` on `secondSource` and `survey` means the same direction as our trend. The server works it out; the data files don't store it.
- `limit` on `/api/anomalies` goes up to 30.
- Bad or missing parameters return 400 with the code `bad_request`. Unknown species or regions return 404 with `not_found`.
- `POST /api/ask` accepts optional `year`, `start` and `end` next to `question`, `species` and `region`. Send the same `start` and `end` as `/api/grab_data`.
- Anomaly rules on raw sightings: *regional divergence* is a state whose sightings trend is more than 3 robust z-scores from the species' other states; *strong trend* is one more than 3 robust z-scores from every species-state; *sudden change* is a year (or run of years) that departs from the state's trend by more than 20% and 3 z-scores, after removing that year's nationwide jump (eBird's user surges) and allowing for counting noise. The first two years are not checked for sudden changes. Headlines say "sightings".
- `GET /api/grab_data`: `species` defaults to all, `start` and `end` to the full year range. States with no records of the species in either year are left out. `changePct` is null when `startCount` is 0. `allBirdsChangePct` is the change in sightings of all birds in that state, for context.
- `POST /api/ask` also returns `model`: the OpenAI model that answered, or `null` when no model was needed.
- When the analyst can't answer, `POST /api/ask` returns 503 with the code `analyst_unavailable`. The frontend should show a "try again" state.

## AI analyst (OpenAI)

Put your key in `backend/.env` (git ignores this file). The OpenAI account needs billing set up:

```
OPENAI_API_KEY=your-key
```

Without a key, `/api/ask` returns a mock answer marked "Mock answer", so the frontend can still be built.

How a question is answered (`analyst.py`, with the tools in `tools.py` and the prompt in `prompts.py`):

1. The server runs `check_sampling` itself. If the data is insufficient, it answers that without calling the model.
2. The model gets the question and the 8 tools, calls the tools it wants (at most 8 calls), and returns the answer in the spec's JSON shape, enforced by OpenAI's structured outputs. Evidence that cites a tool which never ran is removed.
3. Models are tried in the order of `OPENAI_MODELS` (default `gpt-6.1-terra,gpt-6-luna`). A model that fails is skipped for 5 minutes. Each call times out after 20 seconds, and a question gets 45 seconds in total.
4. Every good answer is saved in `backend/cache/` (git ignores it). If every model fails, the saved answer for the same species and state is returned with `"cached": true`. With `ANALYST_CACHE_FIRST=1`, saved answers are served before asking the model; use that for the live demo.

`python check_openai.py` tests each model with one real tool call and says which ones work right now. Run it before a demo.

The analyst used Gemini until Nov 14. It was switched because Google's Flash models kept returning "high demand" errors all day.
