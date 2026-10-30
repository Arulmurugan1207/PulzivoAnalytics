/**
 * View model for the Event Details modal: groups an event's fields into plain-language
 * sections and drops empty values. Pure helper (no Angular imports) so it runs under
 * `node --test`.
 */

export interface DetailEvent {
  id?: string;
  event_name?: string;
  user_id?: string | null;
  user_email?: string | null;
  email_inferred?: boolean;
  session_id?: string | null;
  timestamp?: string | null;
  page?: string | null;
  country?: string | null;
  flag?: string | null;
  timezone?: string | null;
  device?: string | null;
  data?: any;
}

export interface DetailRow {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
  title?: string;
  link?: string;
}

export interface WhoCard {
  email: string;
  emailInferred: boolean;
  userType: string;
  userId: string;
  sessionId: string;
  visitCount: number | null;
  firstVisit: string;
  returning: boolean | null;
}

export interface EventDetailView {
  who: WhoCard;
  event: DetailRow[];
  page: DetailRow[];
  source: DetailRow[];
  device: DetailRow[];
  custom: DetailRow[];
}

/** Keys rendered elsewhere (or internal plumbing) so they are not repeated as custom. */
const KNOWN_KEYS = new Set([
  'event_category', 'event_label', 'label', 'category', 'value', 'custom_parameters', 'custom',
  'user_id', 'user_email', 'session_id', 'view_id', 'user_type', 'first_visit', 'visit_count',
  'page', 'page_title', 'title', 'page_load_time', 'scroll_depth', 'time_on_page', 'url', 'href',
  'attribution', 'referrer', 'userAgent', 'language', 'screenResolution', 'viewport', 'timezone',
  'cookieEnabled', 'online', 'platform', 'mobile', 'brands', 'country', 'city', 'region',
  'timestamp', 'service', 'apiKey',
]);

export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' || t === 'null' || t === 'undefined';
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

export function displayValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function push(rows: DetailRow[], label: string, value: unknown, extra: Partial<DetailRow> = {}): void {
  if (isEmpty(value)) return;
  rows.push({ label, value: displayValue(value), ...extra });
}

/** "3 minutes ago" style, relative to `now`. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  const s = Math.round((now - t) / 1000);
  const abs = Math.abs(s);
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  let text: string;
  if (abs < 45) text = 'just now';
  else if (abs < 3600) text = fmt(Math.round(abs / 60), 'minute');
  else if (abs < 86400) text = fmt(Math.round(abs / 3600), 'hour');
  else if (abs < 86400 * 30) text = fmt(Math.round(abs / 86400), 'day');
  else if (abs < 86400 * 365) text = fmt(Math.round(abs / (86400 * 30)), 'month');
  else text = fmt(Math.round(abs / (86400 * 365)), 'year');
  if (text === 'just now') return text;
  return s >= 0 ? `${text} ago` : `in ${text}`;
}

/** Local date/time in the viewer's timezone (the site owner's browser). */
export function localDateTime(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
    ...opts,
  });
}

export function browserAndOs(ua: unknown): { browser: string; os: string } {
  const s = typeof ua === 'string' ? ua : '';
  const pick = (pairs: [RegExp, string][]) => {
    for (const [re, name] of pairs) {
      const m = s.match(re);
      if (m) return m[1] ? `${name} ${m[1]}` : name;
    }
    return '';
  };
  const browser = pick([
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
  ]);
  const os = pick([
    [/Windows NT 10/, 'Windows 10/11'],
    [/Windows/, 'Windows'],
    [/iPhone OS (\d+)/, 'iOS'],
    [/iPad.*OS (\d+)/, 'iPadOS'],
    [/Android (\d+)/, 'Android'],
    [/Mac OS X/, 'macOS'],
    [/CrOS/, 'ChromeOS'],
    [/Linux/, 'Linux'],
  ]);
  return { browser, os };
}

function fmtMs(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

function fmtDuration(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  const secs = Math.round(n / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function buildEventDetail(evt: DetailEvent | null | undefined, visitSource = '', now = Date.now()): EventDetailView | null {
  if (!evt) return null;
  const d = evt.data && typeof evt.data === 'object' ? evt.data : {};
  const attr = d.attribution && typeof d.attribution === 'object' ? d.attribution : {};
  const email = evt.user_email || d.user_email || '';
  const visitCount = Number.isFinite(Number(d.visit_count)) && !isEmpty(d.visit_count) ? Number(d.visit_count) : null;

  const who: WhoCard = {
    email: email || '',
    emailInferred: !!(email && evt.email_inferred),
    userType: !isEmpty(d.user_type) ? String(d.user_type) : (email ? 'authenticated' : 'anonymous'),
    userId: evt.user_id || d.user_id || '',
    sessionId: evt.session_id || d.session_id || '',
    visitCount,
    firstVisit: localDateTime(d.first_visit, { hour: undefined, minute: undefined, second: undefined }),
    returning: visitCount == null ? null : visitCount > 1,
  };

  const event: DetailRow[] = [];
  push(event, 'Event', evt.event_name, { mono: true });
  push(event, 'Category', d.event_category ?? d.category);
  push(event, 'Label', d.event_label ?? d.label);
  push(event, 'Value', d.value);
  const when = localDateTime(evt.timestamp);
  if (when) event.push({ label: 'Time', value: `${when} · ${relativeTime(evt.timestamp, now)}`, title: evt.timestamp || '' });
  push(event, 'Event ID', evt.id, { mono: true, copy: true });

  const page: DetailRow[] = [];
  push(page, 'Page title', d.page_title ?? d.title);
  push(page, 'Path', evt.page || d.page, { mono: true });
  const url = d.url || d.href;
  push(page, 'Full URL', url, { mono: true, copy: true, link: typeof url === 'string' && /^https?:\/\//.test(url) ? url : undefined });
  push(page, 'Load time', fmtMs(d.page_load_time ?? d.custom?.load_time));
  push(page, 'Time on page', fmtDuration(d.time_on_page));
  const scroll = Number(d.scroll_depth);
  if (Number.isFinite(scroll) && scroll > 0) page.push({ label: 'Scroll depth', value: `${Math.min(100, Math.round(scroll))}%` });

  const source: DetailRow[] = [];
  push(source, 'How they got here', visitSource);
  const ref = attr.referrer || d.referrer;
  push(source, 'Referrer', ref, { link: typeof ref === 'string' && /^https?:\/\//.test(ref) ? ref : undefined });
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    push(source, k.replace('utm_', 'UTM ').replace(/^UTM (\w)/, (_m: string, c: string) => `UTM ${c.toUpperCase()}`), attr[k]);
  }
  push(source, 'Landing page', attr.landing_page, { mono: true });

  const device: DetailRow[] = [];
  const country = evt.country || d.country;
  push(device, 'Country', country ? `${evt.flag ? evt.flag + ' ' : ''}${country}` : '');
  push(device, 'City / region', [d.city, d.region].filter((v) => !isEmpty(v)).join(', '));
  push(device, 'Timezone', evt.timezone || d.timezone);
  push(device, 'Device', evt.device);
  const { browser, os } = browserAndOs(d.userAgent);
  push(device, 'Browser', browser || d.brands);
  push(device, 'OS', os || d.platform);
  push(device, 'Screen', d.screenResolution);
  push(device, 'Window', d.viewport);
  push(device, 'Language', d.language);
  push(device, 'User agent', d.userAgent, { mono: true });

  const custom: DetailRow[] = [];
  const params = { ...(d.custom && typeof d.custom === 'object' ? d.custom : {}), ...(d.custom_parameters || {}) };
  for (const [k, v] of Object.entries(params)) push(custom, k, v, { mono: true });
  for (const [k, v] of Object.entries(d)) {
    if (!KNOWN_KEYS.has(k)) push(custom, k, v, { mono: true });
  }

  return { who, event, page, source, device, custom };
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Event Stream time: viewer's locale with seconds; date added when not today. */
export function streamTime(iso: string | null | undefined, now: number = Date.now(), locale?: string): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  if (sameDay(d, new Date(now))) return time;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const date = d.toLocaleDateString(locale, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

/** Hover text: full date, time and timezone. */
export function streamTimeTitle(iso: string | null | undefined, locale?: string): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(locale, {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  });
}
