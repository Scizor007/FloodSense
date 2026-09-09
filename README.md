# FloodSense Hyderabad

AI-powered urban waterlogging early-warning concept for Hyderabad — live risk
map, rainfall-driven prediction, community reporting, authority feed and
citizen alerts. Built as a hackathon-grade civic-tech prototype with a
frontend-first architecture (mock data shaped exactly like the future API
payloads, so backend integration is a swap, not a rewrite).

## Historical Flood Calendar

**What it does** — answers "what happened at this location historically when
rainfall occurred?" Pick a flood-prone location and a month; explore its
rainfall and waterlogging/flood situation day by day:

- **Location-based historical analysis** — select any of 18 flood-prone
  locations (Moosapet, Tolichowki, Moosarambagh, Malakpet, Amberpet, Attapur,
  Bahadurpura, Gachibowli, …). The 15 live-map hotspots are reused from the
  centralised hotspot registry, so location data is never duplicated.
- **Monthly calendar** — navigate May → September 2025 (pre-monsoon dry,
  onset, moderate, peak and tapering months, each with a distinct rainfall
  character). Every day shows rainfall amount, flood status
  (Normal / Rainfall-Watch / Waterlogging / Severe) and severity.
- **Rainfall visualisation** — a compact daily bar chart beside the calendar;
  clicking a bar selects the same day in the calendar (single shared dataset,
  never two sources of truth).
- **Daily details** — clicking a day opens a details sheet with observed
  rainfall, peak intensity, documented incident reports, model-estimated
  waterlogging duration + occurrence window, "why was this day high risk"
  factors, and a step-by-step event timeline.
- **Monthly summary** — total rainfall, rainy days, waterlogging days,
  severe days, estimated total waterlogged hours, highest-rainfall and
  highest-risk day. Updates instantly on any location/month change.

**Observed vs model-estimated (data honesty)** — the feature never pretends
every historical detail is an officially recorded fact. Observed data
(historical rainfall, documented flood/waterlogging reports, reported
severity) is visually separated from model-derived values (waterlogging
duration, onset timing, estimated severity). Estimated values carry a dashed
"Model-estimated" tag, and a tooltip explains the distinction:

> Historical rainfall can be obtained from weather datasets. Exact
> waterlogging duration and timing are shown as estimates unless supported by
> a documented incident report.

**Current implementation** — Historical Flood Calendar is currently a
frontend prototype using mock data. Historical rainfall and documented
flood-event datasets will be connected during backend integration. No
network calls are made; the service layer resolves against a local,
deterministic dataset, and the UI already implements loading / error / empty
states so the real API drops in without UI changes.

**Planned data pipeline:**

```
Historical weather data  (Open-Meteo / IMD archives)
        ↓
Flood / event records    (GHMC incident logs, citizen reports)
        ↓
Data processing          (alignment, quality flags, observed-vs-estimated)
        ↓
Historical Calendar API  (GET /historical/{locationId}?month=YYYY-MM)
        ↓
FloodSense frontend      (src/lib/flood/historical-service.ts)
```

**Code map:**

| Concern | File |
| --- | --- |
| Dataset (types, locations, monsoon scenarios, builder) | `src/lib/flood/historical-data.ts` |
| Service abstraction (`getHistoricalData`, summary, factors, timeline) | `src/lib/flood/historical-service.ts` |
| Data-loading hook (loading/error structure for the future API) | `src/components/floodsense/historical/use-historical-month.ts` |
| Screen container (location + month state) | `src/components/floodsense/historical/historical-screen.tsx` |
| Calendar pieces | `calendar-header.tsx`, `calendar-day.tsx` |
| Summary / chart | `historical-summary.tsx`, `rainfall-chart.tsx` |
| Details sheet / event timeline | `day-details-panel.tsx`, `event-timeline.tsx` |
| Legend / observed-vs-estimated tag | `historical-legend.tsx`, `estimate-tag.tsx` |
| Entry points | sidebar "Calendar" (bottom of the nav) + "View Historical Data" in the map hotspot panel |

**Demo flow** — open Moosapet → August 2025 (286 mm, 11 rainy days, 4
waterlogging days, 2 severe) → click Aug 12 (61 mm, severe, documented,
3 reports) → show rainfall, flood status, estimated duration, event timeline
→ switch to Tolichowki to see a different historical pattern.
