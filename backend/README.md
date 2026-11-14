# BirdBrained backend

A FastAPI server for the API contract in the master spec. It serves mock data for now, and `/api/ask` returns a canned answer without calling Gemini.

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
| `POST /api/ask` | The analyst's answer (mock for now) |
| `GET /api/health` | Whether each data file being served is real or mock |

The frontend can call `http://localhost:8000` from any localhost port. For the deployed frontend, set `FRONTEND_ORIGINS` to its URL (comma-separated if several).

## Where the data comes from

| Folder | Contents |
| --- | --- |
| `data/static/` | `species.json` and `regions.json`. Real reference data: the GBIF species keys and GADM region ids were checked against the GBIF API. |
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

## Choices the spec leaves open

These are what the server does today. Tell the team before changing them.

- `sufficiency.label` is `good` (at least 90% of years pass), `limited` (at least 70%) or `insufficient`.
- When a species-region is `insufficient`, `trend` and `rawTrend` are `null` in `/api/detail`, and the series values for failing years are `null`.
- `agrees` on `secondSource` and `survey` means the same direction as our trend. The server works it out; the data files don't store it.
- `limit` on `/api/anomalies` goes up to 30.
- Bad or missing parameters return 400 with the code `bad_request`. Unknown species or regions return 404 with `not_found`.
- `POST /api/ask` accepts an optional `year` next to `question`, `species` and `region`.
- The mock analyst waits 1 second before answering, so loading states are visible. Set `MOCK_ASK_DELAY_S=0` to turn that off.
