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
cd analytics-api && npm ci
MONGODB_URI='mongodb://127.0.0.1:27017/analytics-dev' MONGODB_DB=analytics-dev \
  PORT=8080 HOST=127.0.0.1 npm start
```

In another terminal, from the repo root:

```bash
ANALYTICS_API_PROXY_TARGET=http://127.0.0.1:8080 npm start
```

`MONGODB_URI` for that process must be the local database. Do not point it at the Cloud Run / App Engine production URI.

### Copy production analytics into local Mongo (read-only on prod)

`scripts/copy-prod-analytics-readonly.sh` exports `events` and `api_keys` from production and restores them only into a MongoDB on `localhost` / `127.0.0.1`. It exits before any dump if the two URIs match, if the write target is not local, or if the source URI is local.

This environment does not include `PROD_MONGODB_URI`, `gcloud`, or `mongodump`. Do not guess the connection string. On a machine that can read the secret:

```bash
# Read the prod URI. Do not print it into tickets or commit it.
export PROD_MONGODB_URI="$(gcloud secrets versions access latest \
  --secret=analytics-mongodb-uri --project=node-server-apis)"
export LOCAL_MONGODB_URI='mongodb://127.0.0.1:27017'
export LOCAL_MONGODB_DB='analytics-dev'
# Optional. Comma-separated keys. Omit to copy every key in the analytics DB.
# export API_KEYS='PULZ-...'

# Local Mongo must already be listening, for example:
# docker run -d --name pulzivo-analytics-dev -p 27017:27017 mongo:7

./scripts/copy-prod-analytics-readonly.sh
```

Requires MongoDB Database Tools (`mongodump`, `mongorestore`). The script never passes the production URI to `mongorestore`.

After the copy, start `analytics-api` with `MONGODB_URI` pointing at `analytics-dev` and `ANALYTICS_API_PROXY_TARGET=http://127.0.0.1:8080`, as above. Sign in still uses the auth service on port 3004.

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

## Deploying the marketing site (single path: cPanel)

`pulzivo.com` (marketing pages + dashboard SPA) has **one** deploy path: merging to `main` runs the GitHub Actions workflow **Deploy to cPanel** ([`.github/workflows/deploy-cpanel.yml`](.github/workflows/deploy-cpanel.yml)), which builds and FTPs `dist/simpletrack-prime-ng/browser/` to the cPanel web root. Do not deploy this SPA anywhere else (the former root `Dockerfile` / `cloudrun.yaml` Cloud Run path was removed so search engines never see a duplicate copy of the site). `server.js` remains only as a local static preview (`npm run start:cloud`) and is covered by `npm run test:server`.

There are **no runtime secrets** in this frontend. Client API URLs stay in `src/environments/environment.ts` (do not invent new env vars).

- **Auth / billing / users / API-key CRUD** still call App Engine: `https://analytics-dot-node-server-apis.ue.r.appspot.com` (`environment.apiUrl`).
- **Homepage public-stats + tracker plan validate + ingest + dashboard metrics** go to Cloud Run `https://pulzivo-analytics-api-167308220305.us-east1.run.app` (`environment.analyticsApiUrl`, `environment.analyticsLogUrl`, tracker default, and `src/index.html` `data-api-url`).

SEO files live in `public/` (`robots.txt`, `sitemap.xml`, `og-image.png`, `.htaccess`). Per-route title, description, canonical and robots tags are set from route `data` in `src/app/app.routes.ts` by `src/app/services/title.strategy.ts`. When you add a public page, add it to `sitemap.xml` and give it a unique `title` + `data.description`.

## Analytics Node API Cloud Run (`pulzivo-analytics-api`)

The legacy Cloud Run service `analytics` (`https://analytics-167308220305.us-east1.run.app`) still serves an old copy of the marketing SPA. It is not a supported deploy target; do not redeploy it. `/analytics/log` there returns HTML.

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

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
