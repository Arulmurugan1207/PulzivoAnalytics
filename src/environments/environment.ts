export const environment = {
  production: true,
  // Dashboard / billing / users / metrics still live on App Engine.
  // Do not point this at Cloud Run `pulzivo-analytics-api` (ingest-only).
  apiUrl: 'https://analytics-dot-node-server-apis.ue.r.appspot.com',
  // Tracker POST /analytics/log + plan validate origin.
  analyticsLogUrl: 'https://pulzivo-analytics-api-167308220305.us-east1.run.app/analytics/log',
  siteApiKey: 'PULZ-PRD-C0XUTWK838ZHRFEA8VOC1YVR'
};