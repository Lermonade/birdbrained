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

For the AI analyst, put the API key in `backend/.env` as `OPENAI_API_KEY=your-key`. Without it, the analyst returns a placeholder answer. Open http://localhost:8000/docs to try every endpoint.

**2. Frontend** (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173. The frontend expects the backend at http://localhost:8000.

The data is already in the repo (`data/out/`), so nothing is downloaded at startup. An internet connection is still needed for the analyst and for the globe's images. To rebuild the data, see `backend/README.md`.

## Data sources

- **eBird** (Cornell Lab of Ornithology) and **iNaturalist** research-grade observations, through the [GBIF API](https://www.gbif.org/): bird records per state or province worldwide, in each hemisphere's breeding season, 2010 to 2025.
- **USGS North American Breeding Bird Survey**, analysis results 1966 to 2024: state trends for 2014 to 2024.
- **NOAA NCEI nClimDiv**: statewide monthly temperature and rainfall.

## Limits

- The map shows each bird's share of all sightings, corrected for the growth in birders (eBird records of all birds grew about 10x from 2010 to 2025). It is a relative trend, not a head count, and it shifts if birders change what they report. States where the trend is not statistically clear are flagged.
- 160 species (our original 8, the most-reported birds of each continent and the 30 most-reported owls) in 600 states and provinces across 84 countries, wherever eBird has enough records. Owls are reported far less than songbirds, so outside North America most owls show sightings but too few records for a trend. Each place uses its own breeding season: May to July in the north, October to December in the south.
- Climate data (NOAA) and the Breeding Bird Survey cover only the US (and Canada for the survey); elsewhere the analyst has less evidence.
- The analyst's causes are hypotheses, each with its evidence and a confidence level.
