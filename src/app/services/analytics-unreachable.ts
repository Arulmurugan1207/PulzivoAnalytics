/** Copy for a metric read the browser could not complete (status 0). */

export function isLocalDashboardHost(hostname: string | null | undefined): boolean {
  const host = (hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** npm start / proxy guidance is for local dev only, including a prod build opened on localhost. */
export function showDevProxyGuidance(production: boolean, hostname?: string | null): boolean {
  return !production || isLocalDashboardHost(hostname);
}

export function metricReadFailureMessage(
  summary: string,
  status: number,
  options: { production: boolean; hostname?: string | null },
): string {
  if (status === 0) {
    if (showDevProxyGuidance(options.production, options.hostname)) {
      return `${summary} The analytics API did not respond. Start the dashboard with npm start so /analytics is proxied to Cloud Run.`;
    }
    return `${summary} The analytics API did not respond. The request was blocked by CORS or the analytics service is unreachable.`;
  }
  if (status === 401 || status === 403) {
    return `${summary} The metrics API returned ${status} for this API key. Sign-in uses the auth server; metric reads use the selected key.`;
  }
  if (status) {
    return `${summary} The metrics API returned ${status}.`;
  }
  return summary;
}

export function analyticsUnreachableConsole(
  url: string,
  options: { production: boolean; hostname?: string | null },
): string {
  const where = url ? `: ${url}` : '';
  if (showDevProxyGuidance(options.production, options.hostname)) {
    return `Analytics API unreachable${where}. npm start proxies /analytics to Cloud Run.`;
  }
  return `Analytics API unreachable${where}. The analytics service did not respond (blocked by CORS or unreachable).`;
}
