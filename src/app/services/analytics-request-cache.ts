import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, finalize, of, share, tap } from 'rxjs';

/**
 * Short-lived, in-memory cache + in-flight de-duplication for dashboard report
 * reads (GET <analytics api>/analytics/...).
 *
 * - Identical concurrent GETs share one HTTP request.
 * - Completed responses for date-ranged report queries (URL has startDate=)
 *   are reused for TTL_MS. Undated reads (realtime metrics polled every 30s,
 *   live events, session/user history) are only de-duplicated, never cached.
 * - Key = auth token + full URL (which already carries apiKey, date range,
 *   filters, pagination), so data never crosses sites or users. Timestamps in
 *   the key are rounded to the minute so "last 30 days ending now" requests
 *   issued moments apart share an entry.
 * - Cleared on manual refresh, sign-out, and whenever the auth token changes.
 */
export const ANALYTICS_CACHE_TTL_MS = 60_000;
const MAX_ENTRIES = 200;

interface Entry { at: number; res: HttpResponse<unknown>; }
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Observable<HttpEvent<unknown>>>();
let lastToken: string | null | undefined;

export function clearAnalyticsCache(): void {
  cache.clear();
  inFlight.clear();
}

function isAnalyticsRead(url: string): boolean {
  return /\/analytics\//.test(url) && !/\/analytics\/events(\?|$)/.test(url);
}

function cacheKey(token: string | null, url: string): string {
  const normalized = url.replace(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(\.\d+)?Z/g, '$1Z');
  return `${token ?? ''}|${normalized}`;
}

export const analyticsCacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || !isAnalyticsRead(req.urlWithParams)) return next(req);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
  if (token !== lastToken) {
    // Different (or no) user since last read: never serve their data.
    clearAnalyticsCache();
    lastToken = token;
  }

  const url = req.urlWithParams;
  const key = cacheKey(token, url);
  const cacheable = url.includes('startDate=');

  if (cacheable) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ANALYTICS_CACHE_TTL_MS) return of(hit.res.clone());
    if (hit) cache.delete(key);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const shared = next(req).pipe(
    tap(ev => {
      if (cacheable && ev instanceof HttpResponse && ev.ok && inFlight.get(key) === shared) {
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(key, { at: Date.now(), res: ev });
      }
    }),
    finalize(() => { if (inFlight.get(key) === shared) inFlight.delete(key); }),
    share()
  );
  inFlight.set(key, shared);
  return shared;
};
