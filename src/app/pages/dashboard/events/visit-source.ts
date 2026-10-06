/**
 * "How they got here" for the Event Details modal.
 *
 * Pure helper (no Angular imports) so it runs under `node --test`.
 * Order: known crawler UA -> external referrer host + UTMs -> Direct (only when the
 * tracker recorded attribution, i.e. a landing_page key exists) -> Not recorded.
 */

export interface VisitSourceEvent {
  timestamp?: string | null;
  data?: any;
}

/** KEEP IN SYNC with analytics-api/bots.js (bots.spec.js fails on drift). */
export const CRAWLER_UA_PATTERN =
  'bot\\b|crawl|spider|slurp|mediapartners-google|adsbot|googlebot|google-inspectiontool|' +
  'storebot-google|feedfetcher|google-read-aloud|apis-google|bingpreview|facebookexternalhit|' +
  'facebookcatalog|meta-externalagent|headlesschrome|phantomjs|lighthouse|pagespeed|ptst\\/|' +
  'gtmetrix|pingdom|uptimerobot|' +
  'scrapy|bytespider|petalbot|baiduspider|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|' +
  'ccbot|amazonbot|applebot|duckduckbot';

const CRAWLER_UA = new RegExp(CRAWLER_UA_PATTERN, 'i');

export function isCrawlerUserAgent(ua: unknown): boolean {
  if (!ua || typeof ua !== 'string') return false;
  return CRAWLER_UA.test(ua.replace(/cubot/gi, ''));
}

function clean(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  return text === 'null' || text === 'undefined' ? '' : text;
}

function attributionOf(evt: VisitSourceEvent | null | undefined): Record<string, unknown> | null {
  const attr = evt?.data?.attribution;
  return attr && typeof attr === 'object' && !Array.isArray(attr) ? attr : null;
}

function hostOf(value: string): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').toLowerCase();
  }
}

/** External referrer host; a referrer from the site's own domain is a self-referral, not a source. */
function referrerHost(attr: Record<string, unknown>): string {
  const host = hostOf(clean(attr['referrer_domain'])) || hostOf(clean(attr['referrer']));
  const landing = hostOf(clean(attr['landing_domain']));
  if (!host || (landing && host === landing)) return '';
  return host;
}

function utmLabel(attr: Record<string, unknown>): string {
  return ['utm_source', 'utm_medium', 'utm_campaign']
    .map((key) => clean(attr[key]))
    .filter(Boolean)
    .join(' / ');
}

function timeOf(evt: VisitSourceEvent): number {
  const t = evt?.timestamp ? Date.parse(evt.timestamp) : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

export function describeVisitSource(
  selected: VisitSourceEvent | null | undefined,
  sessionEvents: VisitSourceEvent[] = [],
): string {
  if (!selected) return '—';
  const ordered = [...(sessionEvents || [])].sort((a, b) => timeOf(a) - timeOf(b));
  const all = [...ordered, selected];

  const ua = clean(selected.data?.userAgent) || clean(all.find((e) => clean(e?.data?.userAgent))?.data?.userAgent);
  if (isCrawlerUserAgent(ua)) return `Bot / crawler (${ua})`;

  // Earliest event in the session that carries a real source wins (first touch).
  for (const evt of all) {
    const attr = attributionOf(evt);
    if (!attr) continue;
    const host = referrerHost(attr);
    const utm = utmLabel(attr);
    if (host && utm) return `${host} · ${utm}`;
    if (host || utm) return host || utm;
  }

  if (all.some((evt) => {
    const attr = attributionOf(evt);
    return !!attr && Object.prototype.hasOwnProperty.call(attr, 'landing_page');
  })) {
    return 'Direct (no referrer)';
  }
  return 'Not recorded';
}
