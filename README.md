# SimpletrackPrimeNg

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

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

There are **no runtime secrets** in this frontend. Client API URLs stay in `src/environments/environment.ts` (do not invent new env vars). The production client currently calls the App Engine API:

`https://analytics-dot-node-server-apis.ue.r.appspot.com`

That Node API is **not** this repository. Deploying this SPA to Cloud Run does **not** replace that API and does **not** require MongoDB changes. Prefer service name `pulzivo-analytics` so it does not collide with the existing App Engine service `analytics`.

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

Do **not** delete App Engine service `analytics` until the Node API behind `/analytics/log` has its own Cloud Run (or other) host. Removing it now would break the dashboard and the tracking script.

## Analytics Node API Cloud Run (`pulzivo-analytics-api`)

The existing Cloud Run service `analytics` (`https://analytics-167308220305.us-east1.run.app`) is the **marketing SPA**. `/analytics/log` there returns HTML. Do **not** replace or delete that service for the API cutover.

Deploy the ingest API from `analytics-api/` as a **new** service named `pulzivo-analytics-api` (`min-instances=0`). Full commands and Mongo notes: [`analytics-api/README.md`](analytics-api/README.md).

Leave App Engine `https://analytics-dot-node-server-apis.ue.r.appspot.com` running until clients switch to the new Cloud Run API URL.

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
