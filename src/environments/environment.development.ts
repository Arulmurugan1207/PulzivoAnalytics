export const environment = {
  production: false,
  // Auth, billing, users, and API-key CRUD. Not the metrics host.
  apiUrl: 'http://localhost:3004',
  // Same-origin metric reads. `ng serve` proxies `/analytics` (proxy.conf.js).
  analyticsApiUrl: '',
  analyticsLogUrl: '/analytics/log',
  siteApiKey: 'PULZ-DEV-6XQ0ONGT74Q2VBZA72HN91HI'
};