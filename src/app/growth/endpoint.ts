import { environment } from '../../environments/environment';

/**
 * Product endpoints from the node-server-api contract
 * (install status, usage, email prefs, insights, share, GA4 import).
 * Metric charts stay on `environment.analyticsApiUrl`.
 * A 404 or 501 means that contract is not deployed yet — hide the feature.
 */
export function accountApi(path: string): string {
  const base = String(environment.apiUrl || '').replace(/\/$/, '');
  return `${base}${path.charAt(0) === '/' ? path : `/${path}`}`;
}

export function isMissingEndpoint(status: unknown): boolean {
  return status === 404 || status === 501;
}
