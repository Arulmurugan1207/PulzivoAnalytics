export const environment = {
  production: false,
  // Auth, billing, users, and API-key CRUD. Not the metrics host.
  apiUrl: 'http://localhost:3004',
  // Same-origin metric reads. `ng serve` proxies `/analytics` (proxy.conf.js).
  analyticsApiUrl: '',
  analyticsLogUrl: '/analytics/log',
  siteApiKey: 'PULZ-DEV-6XQ0ONGT74Q2VBZA72HN91HI',
  // Same placeholder as production. Leave it until a site key is issued so
  // local signup against an API with no TURNSTILE_SECRET_KEY is not blocked.
  turnstileSiteKey: 'YOUR_TURNSTILE_SITE_KEY',
  // Same as production: leave empty. A key here is bundled into the dev app.
  pageSpeedApiKey: '',
};