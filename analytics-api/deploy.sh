#!/usr/bin/env bash
# Deploy the DISTINCT analytics ingest API. Never targets Cloud Run service `analytics` (SPA).
set -euo pipefail

PROJECT="${PROJECT:-node-server-apis}"
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-pulzivo-analytics-api}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${SERVICE}" == "analytics" ]]; then
  echo "Refusing to deploy over Cloud Run service 'analytics' (Pulzivo marketing SPA)." >&2
  exit 1
fi

gcloud config set project "${PROJECT}"

DEPLOY_ARGS=(
  run deploy "${SERVICE}"
  --source "${SOURCE_DIR}"
  --project "${PROJECT}"
  --region "${REGION}"
  --allow-unauthenticated
  --port 8080
  --cpu 1
  --memory 512Mi
  --concurrency 80
  --timeout 60s
  --min-instances 0
  --max-instances 5
  --cpu-boost
  --set-env-vars "NODE_ENV=production,MONGODB_DB=analytics,API_KEYS_COLLECTION=api_keys,EVENTS_COLLECTION=events"
)

if [[ -n "${MONGODB_URI_SECRET:-analytics-mongodb-uri}" ]]; then
  DEPLOY_ARGS+=(--set-secrets "MONGODB_URI=${MONGODB_URI_SECRET:-analytics-mongodb-uri}:latest")
fi

gcloud "${DEPLOY_ARGS[@]}"

gcloud run services describe "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format='value(status.url)'
