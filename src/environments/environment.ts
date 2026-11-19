export const environment = {
  production: true,
  // Auth / billing / users / API-key CRUD stay on App Engine.
  apiUrl: 'https://analytics-dot-node-server-apis.ue.r.appspot.com',
  // Tracker ingest + dashboard metric reads (same Mongo event store).
  // /analytics/log, /analytics/public-stats, /analytics/page-stats,
  // /analytics/metrics, /analytics/page-views, /analytics/event-history, …
  // /api-keys/:apiKey/validate, /health
  analyticsApiUrl: 'https://pulzivo-analytics-api-167308220305.us-east1.run.app',
  analyticsLogUrl: 'https://pulzivo-analytics-api-167308220305.us-east1.run.app/analytics/log',
  siteApiKey: 'PULZ-PRD-C0XUTWK838ZHRFEA8VOC1YVR',
  // Optional public Cloudflare Turnstile site key. YOUR_TURNSTILE_SITE_KEY
  // hides the widget. Signup never waits on it: the API defaults to soft mode
  // and still creates the account when no token is sent. Replace this only
  // if you later set TURNSTILE_MODE=enforce (that also needs the secret on
  // the API). Test site key that always passes: 1x00000000000000000000AA.
  turnstileSiteKey: 'YOUR_TURNSTILE_SITE_KEY',
  // Optional Google PageSpeed Insights API key for /tools/page-speed-checker.
  // Empty uses the public endpoint and Google's shared quota. A key is sent
  // from the browser, so it is visible in the page. Use an HTTP-referrer
  // restricted key if you set one, and do not commit the key.
  pageSpeedApiKey: '',
};