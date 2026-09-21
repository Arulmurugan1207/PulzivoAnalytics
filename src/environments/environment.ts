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
  siteApiKey: 'PULZ-PRD-C0XUTWK838ZHRFEA8VOC1YVR'
};