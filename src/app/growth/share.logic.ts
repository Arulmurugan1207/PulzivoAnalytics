/** Pure helpers for the public share link and the read-only summary. */

export interface ShareLink {
  token: string;
  url: string;
}

export interface SummaryRow { label: string; value: number; }

export interface PublicSummary {
  siteName: string;
  visitors: number;
  pageviews: number;
  topPages: SummaryRow[];
  sources: SummaryRow[];
  countries: SummaryRow[];
  chart: SummaryRow[];
}

export interface Ga4ImportResult {
  rowsImported: number;
  dateRange: string;
}

export function shareStorageKey(apiKey: string): string {
  return `pulz_share:${apiKey}`;
}

export function parseShareLink(body: unknown): ShareLink | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const token = typeof raw['token'] === 'string' ? raw['token'].trim() : '';
  if (!token) return null;
  const url = typeof raw['url'] === 'string' && raw['url'].trim() ? raw['url'].trim() : `/share/${token}`;
  return { token, url };
}

export function displayShareUrl(link: ShareLink, origin = ''): string {
  if (/^https?:\/\//i.test(link.url)) return link.url;
  const path = link.url.startsWith('/') ? link.url : `/share/${link.token}`;
  return `${String(origin || '').replace(/\/$/, '')}${path}`;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rows(value: unknown, labels: string[], values: string[]): SummaryRow[] {
  if (!Array.isArray(value)) return [];
  const out: SummaryRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const label = labels.map((key) => raw[key]).find((entry) => typeof entry === 'string' && entry.trim()) as string | undefined;
    if (!label) continue;
    const picked = values.map((key) => raw[key]).find((entry) => Number.isFinite(Number(entry)));
    out.push({ label: label.trim(), value: num(picked ?? raw['value'] ?? raw['count']) });
    if (out.length >= 8) break;
  }
  return out;
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function parsePublicSummary(body: unknown): PublicSummary | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const site = text(raw['site']) || text(raw['siteName']);
  return {
    siteName: site || 'Shared dashboard',
    visitors: num(raw['visitors'] ?? raw['uniqueVisitors']),
    pageviews: num(raw['pageviews'] ?? raw['pageViews'] ?? raw['totalPageViews']),
    topPages: rows(raw['topPages'] ?? raw['pages'], ['title', 'path', 'page', 'label'], ['visitors', 'views', 'pageviews', 'value', 'count']),
    sources: rows(raw['sources'] ?? raw['trafficSources'], ['name', 'source', 'label'], ['visitors', 'visits', 'views', 'value', 'count']),
    countries: rows(raw['countries'] ?? raw['geo'], ['name', 'code', 'country', 'label'], ['visitors', 'views', 'value', 'count']),
    chart: rows(raw['chart'] ?? raw['series'], ['date', 'label', 'day'], ['pageviews', 'visitors', 'value', 'views']),
  };
}

/** SVG polyline in a 100×28 box. Empty when there is nothing to draw. */
export function chartPoints(rowsIn: SummaryRow[]): string {
  if (!rowsIn.length) return '';
  const max = Math.max(...rowsIn.map((row) => row.value), 1);
  return rowsIn.map((row, index) => {
    const x = rowsIn.length === 1 ? 50 : (index / (rowsIn.length - 1)) * 100;
    const y = 26 - (row.value / max) * 22;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function parseGa4Import(body: unknown): Ga4ImportResult | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const rowsImported = Number(raw['rowsImported']);
  if (!Number.isFinite(rowsImported)) return null;
  const range = raw['dateRange'];
  let dateRange = '';
  if (typeof range === 'string') dateRange = range;
  else if (range && typeof range === 'object') {
    const obj = range as Record<string, unknown>;
    dateRange = [obj['start'], obj['end']].filter((part) => typeof part === 'string' && part).join(' – ');
  }
  return { rowsImported, dateRange };
}
