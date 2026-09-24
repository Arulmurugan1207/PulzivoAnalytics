# SimpletrackPrimeNg

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.0.

## Development server

`npm start` runs the dashboard on **http://localhost:4201/** with the development environment.

Auth, billing, and API-key CRUD use `http://localhost:3004` (`environment.apiUrl`). Keep that local service running to sign in and load API keys.

Dashboard metric reads (`/analytics/metrics`, page views, devices, geography, and the rest) stay on the dev-server origin. `proxy.conf.js` forwards them to Cloud Run `pulzivo-analytics-api`, which accepts the selected `apiKey` and ignores the login JWT. Do not point those reads at `localhost:3004`: that host returns 401 for `/analytics/*`, and the overview then shows “No traffic yet” even when Cloud Run has page views.

```bash
npm start
```

Open `http://localhost:4201/dashboard/overview`, sign in, and select a site.

To serve metrics from a local `analytics-api` (only data in that process’s MongoDB) instead of Cloud Run:

```bash
cd analytics-api && npm ci && PORT=8080 HOST=127.0.0.1 npm start
ANALYTICS_API_PROXY_TARGET=http://127.0.0.1:8080 npm start
```

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Cloud Run (GCP project `node-server-apis`)

This repo is the Pulzivo Analytics Angular SPA. Cloud Run requires the container to bind `0.0.0.0` and `process.env.PORT` (default **8080**). `npm start` (`ng serve --port 4201`) does not do that — use the Dockerfile / `server.js` below.

`server.js` serves `dist/simpletrack-prime-ng/browser`, falls back to `index.html` for SPA routes, and treats `GET /` as the health check.

There are **no runtime secrets** in this frontend. Client API URLs stay in `src/environments/environment.ts` (do not invent new env vars).

- **Auth / billing / users / API-key CRUD** still call App Engine: `https://analytics-dot-node-server-apis.ue.r.appspot.com` (`environment.apiUrl`).
- **Homepage public-stats + tracker plan validate + ingest + dashboard metrics** go to Cloud Run `https://pulzivo-analytics-api-167308220305.us-east1.run.app` (`environment.analyticsApiUrl`, `environment.analyticsLogUrl`, tracker default, and `src/index.html` `data-api-url`). Routes there include `/analytics/log`, `/analytics/public-stats`, `/analytics/page-stats`, `/analytics/metrics`, `/analytics/page-views`, `/analytics/event-history`, `/api-keys/:apiKey/validate`, `/health`.

The dashboard Node API is **not** this repository. Deploying this SPA to Cloud Run does **not** replace that API and does **not** require MongoDB changes. Prefer service name `pulzivo-analytics` so it does not collide with the existing Cloud Run service `analytics` (marketing SPA) or App Engine service `analytics`.

### Deploy (source build)

From the repo root, authenticated as an account that can deploy to `node-server-apis`:

```bash
gcloud config set project node-server-apis

gcloud run deploy pulzivo-analytics \
  --source . \
  --project node-server-apis \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 256Mi \
  --concurrency 80 \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 3 \
  --cpu-boost
```

`256Mi` / `1` CPU is in the App Engine F1 class (256 MB). Scale-to-zero (`--min-instances 0`) avoids idle instance charges. `--max-instances 3` is enough for this low-traffic SPA.

To use the name `analytics` instead:

```bash
gcloud run deploy analytics \
  --source . \
  --project node-server-apis \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 256Mi \
  --concurrency 80 \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 3 \
  --cpu-boost
```

Do **not** stop or delete App Engine service `analytics` until auth / billing / users / API-key CRUD are migrated. Dashboard **metric** reads now live on Cloud Run `pulzivo-analytics-api` (same Mongo the tracker writes). Redeploy that service after merging metric-route changes; then FTP the SPA so `environment.analyticsApiUrl` is used for charts.

## Analytics Node API Cloud Run (`pulzivo-analytics-api`)

The existing Cloud Run service `analytics` (`https://analytics-167308220305.us-east1.run.app`) is the **marketing SPA**. `/analytics/log` there returns HTML. Do **not** replace or delete that service for the API cutover.

The ingest API is already deployed from `analytics-api/` as service `pulzivo-analytics-api`. Redeploy commands and Mongo notes: [`analytics-api/README.md`](analytics-api/README.md).

Live ingest URL:

`https://pulzivo-analytics-api-167308220305.us-east1.run.app/analytics/log`

## Tracker script and CDN (`cdn.pulzivo.com`)

Source of truth: `public/pulzivo-analytics.js`. The default `apiUrl` inside that file is what third-party sites get when they load the script **without** `data-api-url`.

This repo has **no standalone CDN deploy command**. Publishing the tracker is:

```bash
# From repo root — regenerates public/pulzivo-analytics.min.js
npm run minify:analytics

# Full site build (also runs minify:analytics, copies public/ into dist)
npm run build
```

Merge / push to `main` runs [`.github/workflows/deploy-cpanel.yml`](.github/workflows/deploy-cpanel.yml), which FTPs `dist/simpletrack-prime-ng/browser/` to cPanel `/public_html/`. That includes `pulzivo-analytics.min.js` (production build ignores the unminified `pulzivo-analytics.js`).

`https://cdn.pulzivo.com/pulzivo-analytics.min.js` is **not** deployed by a separate job in this repo. After the cPanel deploy:

1. If `cdn.pulzivo.com` is the same cPanel `public_html` (or a CNAME to it), the new min.js is live once FTP finishes — purge any CDN cache if the file is cached.
2. If `cdn.pulzivo.com` is a distinct origin, copy `public/pulzivo-analytics.min.js` there after minify. There is no `gcloud` / npm script here that does that.

SPA Cloud Run (`gcloud run deploy pulzivo-analytics --source . ...` above) serves the same built `pulzivo-analytics.min.js` from the container, but **does not** update `cdn.pulzivo.com`. Do **not** use `gcloud run deploy analytics` for this cutover.

### Local check that `$PORT` is bound

```bash
npm ci
npm run build
PORT=8080 HOST=127.0.0.1 npm run start:cloud
# in another terminal:
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

Expect `200`. The server unit test (no Angular build required):

```bash
npm run test:server
```

### After Cloud Run is serving

Point custom domains or load balancers at the Cloud Run URL. Keep cPanel / App Engine traffic on the current hosts until you cut over.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
