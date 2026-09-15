# pulzivo-analytics-api

Distinct Cloud Run service for the Analytics Node API (`POST /analytics/log`).

This is **not** the Pulzivo marketing SPA. Do **not** deploy this over Cloud Run service `analytics` (`https://analytics-167308220305.us-east1.run.app`). Do **not** stop App Engine `analytics` until clients have switched to this URL.

## Contract (matches AE analytics)

| Method | Path | Result |
|--------|------|--------|
| OPTIONS | `/analytics/log` | `204` + CORS |
| POST | `/analytics/log` | `200` `{"status":"ok"}` |
| GET | `/analytics/log` | `404` |
| GET | `/api-keys/:apiKey/validate` | `200` plan / `401` invalid |
| GET | `/health` | `200` |

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
