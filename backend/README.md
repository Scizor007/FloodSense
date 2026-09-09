# FloodSense Hyderabad Backend

Backend service for **FloodSense Hyderabad** — an AI-powered urban flood prediction and early-warning system for the Greater Hyderabad Municipal Corporation (GHMC) area.

Built with **FastAPI** (Python 3.11) and **MongoDB Atlas** using the asynchronous **Motor** driver.

---

## Important Phase Disclaimer

> **At this stage the risk model, Open-Meteo integration, AI vision verification, routing integration, and production alert delivery are placeholders and will be implemented in subsequent phases.**

This foundation step establishes:
- Async connection to MongoDB Atlas
- Pydantic v2 document models and collections
- Geotagged MongoDB indexes for spatial/temporal querying
- Idempotent seeding for 25 documented Hyderabad waterlogging hotspots
- Clean, modular API routes with OpenAPI (Swagger) documentation
- Strict isolation from the frontend Next.js application

---

## Architecture & Technology Stack

- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (ASGI)
- **Runtime**: Python 3.11
- **Server**: [Uvicorn](https://www.uvicorn.org/)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas) (async via `motor` + `pymongo`)
- **Validation**: [Pydantic v2](https://docs.pydantic.dev/) & `pydantic-settings`

### Database Details
- **Database Name**: `floodsense`
- **Collections**:
  1. `hotspots` — Monitored vulnerable locations with baseline risk, coordinates, and causes.
  2. `rainfall_cache` — Spatial/temporal weather cache for historical and forecast rainfall.
  3. `reports` — Citizen waterlogging reports with verification status and metadata.
  4. `alerts` — Multi-channel broadcast alerts (App, SMS, WhatsApp records).
  5. `users` — Citizens and municipal authority profiles.
  6. `risk_history` — Historical risk scores computed across scenarios.

---

## Directory Structure

```
backend/
├── main.py                # FastAPI application entry point, lifespan, & CORS
├── config.py              # Environment configuration loader
├── requirements.txt       # Pinned Python package dependencies
├── .env.example           # Example environment variables (placeholders only)
├── seed.py                # Idempotent hotspot database seeder
├── db/
│   ├── mongodb.py         # Async MongoDB client & connection lifecycle
│   └── indexes.py         # Collection indexes (2D geospatial, temporal, unique)
├── models/
│   ├── common.py          # PyObjectId for MongoDB BSON serialization
│   ├── hotspot.py         # Hotspot document & response schemas
│   ├── rainfall.py        # Rainfall cache schema
│   ├── report.py          # Citizen report schemas (create, update, read)
│   ├── alert.py           # Early-warning alert schemas
│   ├── user.py            # User profile schema
│   └── risk_history.py    # Risk computation history schema
├── data/
│   └── hotspots_seed.py   # 25 historical Hyderabad waterlogging hotspots
├── routers/
│   ├── hotspots.py        # GET /hotspots, GET /hotspots/{id}
│   ├── risk.py            # POST /risk/predict (placeholder)
│   ├── reports.py         # POST /reports, GET /reports, PATCH /reports/{id}/status
│   ├── routing.py         # POST /routing/reroute (placeholder)
│   ├── alerts.py          # POST /alerts/trigger, GET /alerts
│   └── weather.py         # GET /weather/current, GET /weather/historical (placeholder)
└── services/              # Future integration services (ML, Weather, Vision, Routing)
```

---

## Local Setup & Installation

### 1. Prerequisites
- Python 3.11 installed (`py -3.11 --version`)
- MongoDB Atlas connection string

### 2. Virtual Environment Setup
From the project root:
```bash
# Windows
py -3.11 -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt
```

### 3. Environment Variables
Create a local `.env` file in the root or `backend/` directory (see `.env.example`):
```env
MONGODB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=floodsense
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
PORT=8000
HOST=0.0.0.0
```
> **Security Notice**: Never commit `.env` or paste actual connection credentials into repository files.

### 4. Seed 25 Historical Hotspots
Populate or update the 25 documented Hyderabad waterlogging hotspots in MongoDB Atlas:
```bash
backend/.venv/Scripts/python backend/seed.py
```
This script is idempotent (safe to run repeatedly using upserts).

### 5. Start the Development Server
Run Uvicorn from the `backend/` directory:
```bash
cd backend
../backend/.venv/Scripts/uvicorn main:app --reload --port 8000
```
Or directly from the project root:
```bash
backend/.venv/Scripts/uvicorn backend.main:app --reload --port 8000
```

---

## Interactive API Documentation

Once the server is running:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI Schema**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

---

## Available Endpoints

| Method | Endpoint | Description | Status |
|---|---|---|---|
| `GET` | `/` | API status and service name | Functional |
| `GET` | `/health` | API & MongoDB Atlas connection health | Functional |
| `GET` | `/hotspots` | List all 25 monitored flood hotspots | Functional (DB backed) |
| `GET` | `/hotspots/{id}` | Retrieve single hotspot details | Functional (DB backed) |
| `POST` | `/risk/predict` | Simulate rainfall risk score | **Placeholder** |
| `POST` | `/reports` | Submit citizen waterlogging report | Functional (DB backed) |
| `GET` | `/reports` | List citizen reports (with status filter) | Functional (DB backed) |
| `PATCH` | `/reports/{id}/status` | Update report verification status | Functional (DB backed) |
| `POST` | `/routing/reroute` | Suggest safe detour avoiding flooded hotspots | **Placeholder** |
| `POST` | `/alerts/trigger` | Create broadcast alert record | Functional (DB backed) |
| `GET` | `/alerts` | List triggered alerts | Functional (DB backed) |
| `GET` | `/weather/current` | Current rainfall/weather conditions | **Placeholder** |
| `GET` | `/weather/historical` | Historical rainfall archive conditions | **Placeholder** |

---

## Future Implementation Phases

1. **Phase 4**: Real hydrological ML risk prediction engine (elevation, drainage vulnerability, rainfall intensity).
2. **Phase 5**: Live & historical weather integration with Open-Meteo & IMD APIs.
3. **Phase 6**: AI Vision verification for citizen flood reports (Gemini Vision / multimodal depth detection).
4. **Phase 7**: Dynamic routing engine integration (OpenRouteService avoid-polygons / OSRM).
5. **Phase 8**: Production alert delivery channels (Twilio SMS, WhatsApp Business API, WebPush).
