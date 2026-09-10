# 🌊 FloodSense Hyderabad

> **AI-Powered Urban Waterlogging & Flood Early-Warning System for the Greater Hyderabad Municipal Corporation (GHMC)**

FloodSense Hyderabad is a civic-tech intelligence platform designed to predict, monitor, and mitigate urban waterlogging across Hyderabad before rainfall turns into severe flooding. By fusing live meteorological data, digital elevation models (DEM), machine learning risk prediction, citizen reporting with Google Gemini multimodal vision verification, and dynamic flood-avoidance routing, FloodSense gives both citizens and municipal authorities the foresight needed to keep the city moving safely.

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Getting Started Locally](#-getting-started-locally)
  - [Prerequisites](#prerequisites)
  - [Backend Setup (FastAPI)](#1-backend-setup-fastapi)
  - [Frontend Setup (Next.js)](#2-frontend-setup-nextjs)
- [Environment Variables](#-environment-variables)
- [Deployment Guide](#-deployment-guide)
  - [Render (Backend / API)](#1-render-backend)
  - [Vercel (Frontend)](#2-vercel-frontend)
- [Contributing & License](#-license)

---

## 🚀 Key Features

### 1. 🗺️ Live Risk Map & Critical Corridors
- **15 High-Risk Urban Corridors**: Real-time monitoring of chronically flood-prone arterial roads (Tolichowki, Moosapet, Moosarambagh Causeway, Malakpet ROB, Amberpet, Attapur, Gachibowli, etc.).
- **Live Weather Integration**: Automatic polling of temperature, humidity, precipitation rate, and 24-hour rainfall totals via Open-Meteo.
- **Topographic Elevation Analysis**: Digital elevation models (DEM) via Open-Elevation to calculate runoff accumulation in low-lying depressions.
- **Interactive Risk Heatmap**: Visual color-coded severity levels (**Low / Green**, **Moderate / Amber**, **High / Orange**, **Severe / Red**) projected over Leaflet maps.

### 2. 🤖 Machine Learning Flood Risk Engine
- **Random Forest Model**: Trained Scikit-Learn pipeline (`backend/data/risk_model.joblib`) combining rainfall intensity, soil drainage index, terrain elevation, slope, and historical vulnerability.
- **Lifespan Startup**: Model weights are loaded once in memory on application startup (~120MB RAM footprint) for millisecond inference.
- **Hybrid Resilience**: Gracefully falls back to a calibrated heuristic hydrology engine if input telemetry is incomplete.

### 3. 📸 Multimodal Gemini Vision Verification
- **AI-Powered Flood Verification**: Citizens upload flood photos, which are verified using Google Gemini Vision (`gemini-3.6-flash` via `google-genai`).
- **Separation of Evidence & Citizen Input**: Gemini determines whether visible flooding/waterlogging is present on the roadway, while the citizen-reported water depth (*Ankle-deep, Knee-deep, Waist-deep, Vehicle-submerged*) is tracked as a distinct metric.
- **Spatial Corroboration Engine**: Auto-corroborates reports submitted within a 300-meter radius in the last 24 hours using the Haversine formula.
- **Strict Anti-Tamper Rule**: AI-rejected photos (*e.g., dry roads, unrelated photos*) can never be overridden by nearby reports.
- **Local Media Persistence**: Images are decoded and served safely from `backend/uploads/` rather than bloating MongoDB documents.

### 4. 🚗 Dynamic Safe Routing (Flood Avoidance)
- **Turn-by-Turn Safe Navigation**: Computes route directions between any two points in Hyderabad using OpenRouteService.
- **Automated Hazard Avoidance**: Converts High and Severe flood risk areas into dynamic polygon exclusion zones, routing motorists around submerged underpasses and waterlogged corridors.

### 5. 📢 Multi-Channel Emergency Alerts
- **Real-Time Dispatch**: Instant notification broadcasting during flash floods and cloudburst events.
- **Email Alerts**: Formatted emergency reports delivered via SMTP (Gmail TLS).
- **SMS & WhatsApp Alerts**: Integration with Twilio for cellular SMS and WhatsApp message dispatch to registered community members.

### 6. 🏛️ GHMC Community Reports & Authority Triage
- **Live Community Feed**: Public transparency stream displaying citizen reports, AI confidence ratings, GPS coordinates, and corroboration counts.
- **Municipal Authority Workflow**: Municipal officers can triage incidents with single-click actions (*Mark Verified, Reject, Mark Resolved, Close*).

### 7. 📅 Historical Flood Calendar
- **Monsoon Retrospective**: Day-by-day analysis across historical monsoon seasons (May–September).
- **Data Honesty**: Explicitly demarcates observed historical records from model-estimated waterlogging durations.

---

## 🏗️ System Architecture

```
                                  +-----------------------+
                                  |    Citizen / User     |
                                  +-----------------------+
                                       |             ^
                      Next.js 16 (SSR) |             | Leaflet Map / Alerts
                                       v             |
                         +-----------------------------------+
                         |      VERCEL HOSTED FRONTEND       |
                         |   (Next.js App Router, React 19)  |
                         +-----------------------------------+
                                           |
                                           | HTTPS REST Calls
                                           v
                         +-----------------------------------+
                         |       RENDER HOSTED BACKEND       |
                         |        (FastAPI + Uvicorn)        |
                         +-----------------------------------+
                             |          |             |
        +--------------------+          |             +--------------------+
        |                               |                                  |
        v                               v                                  v
+----------------+            +-------------------+              +-------------------+
|  Google Gemini |            | Scikit-Learn ML   |              |  MongoDB Atlas    |
|  Vision API    |            | Risk Model Engine |              |  Cloud Database   |
| (Photo Triage) |            | (In-Memory Model) |              | (Corridors, Logs) |
+----------------+            +-------------------+              +-------------------+
        |                               |                                  |
        +--------------------+          |             +--------------------+
                             v          v             v
                         +-----------------------------------+
                         |   OpenRouteService / Twilio /     |
                         |   Open-Meteo External Providers   |
                         +-----------------------------------+
```

---

## 💻 Tech Stack

### Frontend
- **Framework**: [Next.js 16.1](https://nextjs.org/) (App Router)
- **Library**: [React 19](https://react.dev/)
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Vanilla CSS, Lucide React Icons
- **Mapping**: Leaflet, React-Leaflet
- **Hosting**: Vercel

### Backend
- **Framework**: [FastAPI 0.115](https://fastapi.tiangolo.com/) & Uvicorn
- **Language**: Python 3.11+
- **Machine Learning**: Scikit-Learn, Joblib, NumPy, SciPy
- **Database**: MongoDB Atlas via Motor (Async Driver)
- **Computer Vision / GenAI**: Google Gemini API (`google-genai 2.22+`)
- **Geospatial & Routing**: OpenRouteService, Haversine, Open-Elevation
- **Hosting**: Render (Web Service Container)

---

## 📁 Project Structure

```
floodsense/
├── src/                               # Next.js App Router Frontend
│   ├── app/                           # Main routes & layouts
│   ├── components/                    # React UI components
│   │   └── floodsense/
│   │       ├── map/                   # Leaflet risk map & overlays
│   │       ├── report/                # Citizen flood reporting screen
│   │       ├── reports-feed/          # Community reports feed & triage
│   │       ├── routing/               # Dynamic safe navigation sheet
│   │       └── historical/            # Historical flood calendar
│   └── lib/                           # Shared utility libraries
│       └── flood/                     # API client & domain types
│
├── backend/                           # FastAPI Python Backend
│   ├── config.py                      # Pydantic Settings & dynamic CORS
│   ├── main.py                        # FastAPI lifespan, routes, static mount
│   ├── requirements.txt               # Production Python dependencies
│   ├── Dockerfile                     # Container definition for container hosting
│   ├── Procfile                       # Process definition for PaaS runners
│   ├── data/                          # Bundled ML models & corridor definitions
│   │   └── risk_model.joblib          # Scikit-learn flood prediction pipeline
│   ├── models/                        # Pydantic schema contracts
│   ├── routers/                       # API route controllers
│   │   ├── risk.py                    # Flood risk predictions
│   │   ├── reports.py                 # Gemini verification & corroboration
│   │   ├── routing.py                 # Flood-avoidance routing
│   │   ├── weather.py                 # Open-Meteo telemetry
│   │   └── alerts.py                  # Multi-channel emergency alerts
│   ├── services/                      # Business logic & ML services
│   │   ├── risk_model.py              # ML model inference
│   │   ├── vision.py                  # Google Gemini multimodal vision
│   │   ├── routing.py                 # OpenRouteService integration
│   │   └── email.py                   # SMTP alert dispatching
│   └── tests/                         # Unit and integration test suites
│
├── vercel.json                        # Vercel configuration for Next.js
├── .vercelignore                      # Excludes backend & logs from Vercel builds
├── render.yaml                        # Render Blueprint specification
├── .env.example                       # Root environment variables template
└── README.md                          # Project documentation
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health status & database connectivity check |
| `GET` | `/corridors` | Returns 15 monitored flood corridors in Hyderabad |
| `POST` | `/risk/predict` | Predicts flood risk index (0.0–1.0) and severity level |
| `GET` | `/risk/points` | Returns live calculated risk scores across all corridors |
| `POST` | `/reports` | Submit citizen report with photo (triggers Gemini AI verification) |
| `GET` | `/reports` | Retrieve list of verified, pending, and resolved reports |
| `PATCH`| `/reports/{id}/status` | Update incident triage status (*Authority action*) |
| `POST` | `/route/safe-directions`| Calculates navigation route avoiding waterlogged corridors |
| `GET` | `/weather/current` | Fetches real-time precipitation and weather telemetry |
| `POST` | `/alerts/broadcast` | Dispatches emergency flood alerts via Email and SMS |

Interactive Swagger documentation is available at `http://localhost:8000/docs`.

---

## 🛠️ Getting Started Locally

### Prerequisites
- **Node.js**: v18.18+ (Node 20+ recommended)
- **Python**: v3.11 or v3.12
- **MongoDB Atlas** account (or local MongoDB daemon)
- **Git**

---

### 1. Backend Setup (FastAPI)

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a Python virtual environment
# Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
python3 -m venv .venv
source .venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Create your local environment file
cp .env.example .env
# Open .env and insert your MONGODB_URL and GEMINI_API_KEY

# 5. Start the FastAPI development server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will start at `http://localhost:8000`. Test it by visiting `http://localhost:8000/health`.

---

### 2. Frontend Setup (Next.js)

```bash
# 1. Return to the root repository folder
cd ..

# 2. Install Node dependencies
npm install

# 3. Create your frontend environment configuration
# Copy .env.example into .env.local
cp .env.example .env.local
# Ensure NEXT_PUBLIC_API_URL is pointing to your backend:
# NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# 4. Start the development server with Turbopack
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## 🔐 Environment Variables

### Frontend (`.env.local` or Vercel Environment Settings)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of your deployed or local FastAPI backend | `https://floodsense-backend.onrender.com` |
| `VITE_API_URL` | *(Optional fallback)* Equivalent to `NEXT_PUBLIC_API_URL` | `https://floodsense-backend.onrender.com` |

---

### Backend (`backend/.env` or Render Environment Settings)

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URL` | **Yes** | MongoDB Atlas connection URI string |
| `DATABASE_NAME` | No | Database name (Defaults to `floodsense`) |
| `FRONTEND_URL` | **Yes** | Your deployed Vercel domain (e.g. `https://your-app.vercel.app`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins for browser requests |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API Key for multimodal photo triage |
| `GEMINI_MODEL` | No | Model version (Defaults to `gemini-3.6-flash`) |
| `ORS_API_KEY` | No | OpenRouteService API key for dynamic avoidance routing |
| `SMTP_HOST` | No | SMTP host for email dispatches (`smtp.gmail.com`) |
| `SMTP_PORT` | No | SMTP TLS port (`587`) |
| `SMTP_USERNAME` | No | Gmail address for emergency alerts |
| `SMTP_PASSWORD` | No | Gmail App Password |
| `ALERT_RECIPIENTS`| No | Comma-separated recipient emails for flood alerts |
| `TWILIO_ACCOUNT_SID`| No | Twilio Account SID for SMS alerts |
| `TWILIO_AUTH_TOKEN` | No | Twilio Auth Token |
| `TWILIO_SMS_NUMBER` | No | Twilio Sender Phone Number |

---

## 🚀 Deployment Guide

FloodSense uses a decoupled production architecture:
* **Frontend** $\to$ **Vercel** (Edge CDN, fast SSR, zero-config Next.js 16)
* **Backend** $\to$ **Render** (Continuous Python Web Service, in-memory ML model, photo uploads)

### Step 1: Render (Backend)
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** $\to$ **Web Service**.
3. Select your repository.
4. Set the following parameters:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
5. Add all backend environment variables (`MONGODB_URL`, `GEMINI_API_KEY`, etc.).
6. Click **Create Web Service** and copy your backend URL (`https://<your-backend>.onrender.com`).

---

### Step 2: Vercel (Frontend)
1. In the [Vercel Dashboard](https://vercel.com), click **Add New...** $\to$ **Project**.
2. Select your repository.
3. Configure the project:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./` *(Leave as root directory)*
   - **Build Command**: `next build`
   - **Output Directory**: `.next`
4. Add the environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://<your-backend>.onrender.com`
5. Click **Deploy**.

---

### Step 3: Connect Frontend to Backend CORS
1. Return to your Render backend service settings.
2. Set `FRONTEND_URL` to your Vercel production domain:
   - `FRONTEND_URL` = `https://<your-app>.vercel.app`
3. Save changes. Render will redeploy with the updated CORS configuration.

---

## 📄 License

Developed for urban resilience and disaster risk reduction under the **MIT License**.
