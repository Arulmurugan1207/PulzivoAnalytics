export const environment = {
  production: true,
  // Dashboard / billing / users / metrics still target App Engine.
  // That host is currently an idle stub (plain text, no CORS) — do not send
  // homepage public-stats or tracker validate here.
  apiUrl: 'https://analytics-dot-node-server-apis.ue.r.appspot.com',
  // Cloud Run routes that exist today:
  // /analytics/log, /analytics/public-stats, /analytics/page-stats,
  // /api-keys/:apiKey/validate, /health
  analyticsApiUrl: 'https://pulzivo-analytics-api-167308220305.us-east1.run.app',
  analyticsLogUrl: 'https://pulzivo-analytics-api-167308220305.us-east1.run.app/analytics/log',
  siteApiKey: 'PULZ-PRD-C0XUTWK838ZHRFEA8VOC1YVR'
};