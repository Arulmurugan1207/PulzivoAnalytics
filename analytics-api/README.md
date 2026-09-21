# pulzivo-analytics-api

Distinct Cloud Run service for the Analytics Node API (`POST /analytics/log`).

This is **not** the Pulzivo marketing SPA. Do **not** deploy this over Cloud Run service `analytics` (`https://analytics-167308220305.us-east1.run.app`). Do **not** stop App Engine `analytics` — auth / billing / users / API-key CRUD still run there.

Live URL: `https://pulzivo-analytics-api-167308220305.us-east1.run.app`. Tracker ingest, homepage public-stats, site-key validate, and **dashboard metric reads** use this host.

## Contract

| Method | Path | Result |
|--------|------|--------|
| OPTIONS | `/analytics/log` | `204` + CORS |
| POST | `/analytics/log` | `200` `{"status":"ok"}` |
| GET | `/analytics/log` | `404` |
| GET | `/analytics/public-stats` | `200` `{ totalPageViews, scriptCopied }` |
| GET | `/analytics/page-stats` | `200` per-path counters |
| GET | `/api-keys/:apiKey/validate` | `200` plan / `401` invalid |
| GET | `/analytics/metrics` | `200` overview KPIs for `apiKey` + date range |
| GET | `/analytics/page-views` | `200` `{ trend, period }` |
| GET | `/analytics/top-pages` | `200` paginated page-view ranks |
| GET | `/analytics/event-history` | `200` `{ events, total, eventTypes, filterOptions }` |
| GET | `/analytics/events-breakdown` | `200` event / click / custom breakdown |
| GET | `/health` | `200` |

Auth / billing / users / API-key CRUD stay on App Engine. Point only `environment.analyticsApiUrl` (dashboard metric clients) at this service — do **not** point `environment.apiUrl` here.

CORS allowlist:

- `https://tabletennistube.com`
- `https://www.tabletennistube.com`
- `https://pulzivo.com`
- `https://www.pulzivo.com`

## Deploy (GCP project `node-server-apis`)

```bash
gcloud config set project node-server-apis

gcloud run deploy pulzivo-analytics-api \
  --source analytics-api \
  --project node-server-apis \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --concurrency 80 \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 5 \
  --cpu-boost \
  --set-env-vars "NODE_ENV=production,MONGODB_DB=analytics,API_KEYS_COLLECTION=api_keys,EVENTS_COLLECTION=events" \
  --set-secrets "MONGODB_URI=analytics-mongodb-uri:latest"
```

CORS origins default in `server.js` (tabletennistube.com / pulzivo.com + www). Override with `CORS_ORIGINS` using gcloud's `^@^` delimiter if needed.

`MONGODB_URI` must be the **same prod Mongo** used by App Engine service `analytics` (database `analytics`). Create the Secret Manager secret if it does not exist:

```bash
# Use the AE analytics connection string — do not invent a new cluster.
echo -n "$AE_ANALYTICS_MONGODB_URI" | gcloud secrets create analytics-mongodb-uri \
  --project node-server-apis \
  --data-file=-
```

## Local

```bash
cd analytics-api
npm ci
npm test
PORT=8080 HOST=127.0.0.1 npm start
```
