# BirdBrained backend

A FastAPI server for the API contract in the master spec. It serves mock data until the pipeline writes real files, and `/api/ask` runs the Gemini analyst over whichever data is loaded.

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
| `data/mock/` | Simulated pipeline outputs, written by `python backend/make_mock_data.py`. |
| `data/out/` | Real pipeline outputs. Empty until the pipeline runs. |

For each file, the server reads `data/out/<file>` if it exists and `data/mock/<file>` otherwise. So the pipeline only has to write a file to `data/out/` in the shape below, and a server restart switches that file to real data.

| File | Shape |
| --- | --- |
| `series.json` | `{species: {species, years, baseYears, regions: {regionId: {raw[], corrected[], status[]}}}}` |
| `trends.json` | `{species: {regionId: {trend: {changePerYear, low, high, class}, rawTrend: {changePerYear}, sufficiency: {label, yearsOk, yearsTotal}, secondSource: {changePerYear}}}}` |
| `anomalies.json` | The `/api/anomalies` list, best first |
| `effort.json` | `{regionId: [{year, records, recordsPer1000Km2}]}` |
| `climate.json` | `{regionId: [{year, tempC, rainMm}]}` |
| `bbs.json` | `{species: {regionId: {changePerYear, period}}}` |
| `counts.json` | `{species: {regionId: [species record count per series year] or null}}`, the eBird `n` from `counts.parquet`. The analyst's `check_sampling` tool reads it. |

## Choices the spec leaves open

These are what the server does today. Tell the team before changing them.

- `sufficiency.label` is `good` (at least 90% of years pass), `limited` (at least 70%) or `insufficient`.
- When a species-region is `insufficient`, `trend` and `rawTrend` are `null` in `/api/detail`, and the series values for failing years are `null`.
- `agrees` on `secondSource` and `survey` means the same direction as our trend. The server works it out; the data files don't store it.
- `limit` on `/api/anomalies` goes up to 30.
- Bad or missing parameters return 400 with the code `bad_request`. Unknown species or regions return 404 with `not_found`.
- `POST /api/ask` accepts an optional `year` next to `question`, `species` and `region`.
- `POST /api/ask` also returns `model`: the Gemini model that answered, or `null` when no model was needed.
- When the analyst can't answer, `POST /api/ask` returns 503 with the code `analyst_unavailable`. The frontend should show a "try again" state.

## Gemini analyst

Put your key in `backend/.env` (git ignores this file):

```
GEMINI_API_KEY=your-key
```

Without a key, `/api/ask` returns a mock answer marked "Mock answer", so the frontend can still be built.

How a question is answered (`analyst.py`, with the tools in `tools.py` and the prompt in `prompts.py`):

1. The server runs `check_sampling` itself. If the data is insufficient, it answers that without calling Gemini.
2. Gemini gets the question and the 8 tools from the spec, calls the tools it wants (at most 8 calls), and returns the answer in the spec's JSON shape. Evidence that cites a tool which never ran is removed.
3. Models are tried in the order of `GEMINI_MODELS` (default `gemini-3.8-flash,gemini-3.5-flash-lite`). A model that fails is skipped for 5 minutes. Each Gemini call times out after 15 seconds, and a question gets 30 seconds in total.
4. Every good answer is saved in `backend/cache/` (git ignores it). If every model fails, the saved answer for the same species and state is returned with `"cached": true`. With `ANALYST_CACHE_FIRST=1`, saved answers are served before asking Gemini; use that for the live demo.

`python check_gemini.py` tests each Flash model with one real tool call and says which ones work right now. Run it before a demo.

Known limits as of Nov 14, 3 PM:

- Google's main Flash models (`gemini-3.8-flash`, `gemini-3.7-flash`) were returning "high demand" errors or timing out at both 1:30 AM and 3 PM. `gemini-3.5-flash-lite` answers reliably in about 4 seconds. Rerun the check later; the main model may come back.
- One question uses 3 to 4 Gemini requests. After about 5 questions in quick succession, the free tier returned a per-minute quota error, which cleared within 2 minutes. Check the exact limits at https://aistudio.google.com/rate-limit.
