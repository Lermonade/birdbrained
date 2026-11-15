# BirdBrained

An intuitive and comprehensive wildlife population shift visualization and analysis app. Focus on integrating international data sources for comprehensive global coverage. Uses ai analysis to explain trends and locate anomalies.

## Run it locally

You need Python 3.11 or newer and Node 20.19 or newer. Use two terminals.

**1. Backend** (http://localhost:8000)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

For the AI analyst, put an OpenAI API key in `backend/.env` as `OPENAI_API_KEY=your-key` (from platform.openai.com; the account needs billing set up). Without it, the analyst returns a placeholder answer. Open http://localhost:8000/docs to try every endpoint.

**2. Frontend** (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173. The frontend expects the backend at http://localhost:8000.

The data is already in the repo (`data/out/`), so nothing is downloaded at startup. An internet connection is still needed for the analyst (OpenAI) and for the globe's images. To rebuild the data, see `backend/README.md`.

## Data sources

- **eBird** (Cornell Lab of Ornithology) and **iNaturalist** research-grade observations, through the [GBIF API](https://www.gbif.org/): bird records per state, May to July, 2010 to 2025.
- **USGS North American Breeding Bird Survey**, analysis results 1966 to 2024: state trends for 2014 to 2024.
- **NOAA NCEI nClimDiv**: statewide monthly temperature and rainfall.
- **OpenAI API**: the analyst.

## Limits

- The map shows sightings, not birds. Sightings grow with the number of people birding: eBird records of all birds grew about 10x from 2010 to 2025. Each state's change in all-bird sightings is shown next to each species for context.
- 8 species, US states only, breeding season (May to July) only.
- Climate data is a statewide average; the District of Columbia uses Maryland's.
- The analyst's causes are hypotheses, each with its evidence and a confidence level.
