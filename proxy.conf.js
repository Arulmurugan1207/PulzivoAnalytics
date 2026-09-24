/**
 * Local `ng serve` proxy for dashboard metric reads.
 *
 * Development builds call same-origin `/analytics/*`. This forwards those
 * requests to Cloud Run, which authorizes them with the `apiKey` query param.
 * The browser must not call Cloud Run directly: its CORS allowlist does not
 * include localhost, and a signed-in session sends `Authorization`, which
 * forces a preflight that host does not answer for this origin.
 *
 * Auth / API-key CRUD stay on `environment.apiUrl` and are not proxied.
 *
 * Local analytics-api instead of Cloud Run:
 *   ANALYTICS_API_PROXY_TARGET=http://127.0.0.1:8080 npm start
 */
const target =
  process.env.ANALYTICS_API_PROXY_TARGET ||
  'https://pulzivo-analytics-api-167308220305.us-east1.run.app';

module.exports = {
  '/analytics': {
    target,
    secure: target.startsWith('https:'),
    changeOrigin: true,
  },
};
