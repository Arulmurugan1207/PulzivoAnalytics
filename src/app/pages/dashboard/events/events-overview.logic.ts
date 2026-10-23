/**
 * Pure helpers for the Events page overview: human labels, click names,
 * route breadcrumbs, % change, sparklines and the frustration insight.
 * Kept framework-free so they run under `node --test`.
 */

/** Plain-English names. Anything not listed falls back to Title Case. */
export const HUMAN_EVENT_LABELS: Record<string, string> = {
  page_view: 'Page views',
  page_views: 'Page views',
  click: 'Clicks',
  auto_click: 'Clicks',
  scroll: 'Scrolls',
  scroll_depth: 'Scroll depth',
  route_change: 'Page changes',
  navigation: 'Page changes',
  page_exit: 'Exits',
  form_submit: 'Form submissions',
  form_abandon: 'Abandoned forms',
  form_focus: 'Form starts',
  form_start: 'Form starts',
  form_error: 'Form errors',
  form_field_interaction: 'Form field edits',
  error: 'Errors',
  javascript_error: 'Errors',
  rage_click: 'Frustrated clicks',
  dead_click: 'Clicks that did nothing',
  web_vital_lcp: 'Page speed',
  web_vital_fcp: 'First paint',
  web_vital_cls: 'Layout stability',
  web_vital_fid: 'Input delay',
  web_vital_inp: 'Responsiveness',
  web_vital_ttfb: 'Server response',
  page_load_complete: 'Page loads',
  session_start: 'Sessions',
  unique_visitor_session: 'Sessions',
  unique_visitor_daily: 'Daily visitors',
  return_visit: 'Return visits',
  outbound_click: 'Outbound links',
  file_download: 'Downloads',
  signup_completed: 'Sign-ups',
  impression: 'Impressions',
  promo_impression: 'Promo views',
  promo_click: 'Promo clicks',
};

/**
 * Plumbing the tracker emits for its own bookkeeping. Hidden from the main
 * view (still visible with Advanced on and in the event stream).
 */
export const INTERNAL_EVENTS = new Set([
  'visibility',
  'page_hidden',
  'performance',
  'resource_timing',
  'interaction',
  'heartbeat',
  'session_heartbeat',
  'page_exit',
  'hover',
  'input',
  'form_blur',
  'tooltip_view',
]);

export function humanEventLabel(name: string): string {
  if (!name) return 'Unknown';
  if (HUMAN_EVENT_LABELS[name]) return HUMAN_EVENT_LABELS[name];
  const words = name.replace(/[_\-.]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

export function isInternalEvent(name: string): boolean {
  return INTERNAL_EVENTS.has(name) || name.startsWith('debug_') || name.startsWith('_');
}

interface NamedCount { name: string; count: number; }

/**
 * Merge events that share a human label (click + auto_click → "Clicks"),
 * drop internal ones unless advanced, and recompute shares.
 */
export function humanizeEvents<T extends NamedCount>(
  events: T[],
  advanced: boolean,
): { name: string; label: string; raw: string[]; count: number; share: number }[] {
  const rows = new Map<string, { name: string; label: string; raw: string[]; count: number; share: number }>();
  for (const evt of events || []) {
    if (!advanced && isInternalEvent(evt.name)) continue;
    const label = humanEventLabel(evt.name);
    const key = advanced ? evt.name : label;
    const row = rows.get(key) || { name: evt.name, label, raw: [], count: 0, share: 0 };
    row.raw.push(evt.name);
    row.count += evt.count || 0;
    rows.set(key, row);
  }
  const list = [...rows.values()].sort((a, b) => b.count - a.count);
  const total = list.reduce((s, r) => s + r.count, 0) || 1;
  for (const r of list) r.share = Math.round((r.count / total) * 1000) / 10;
  return list;
}

const TAG_NAMES: Record<string, string> = {
  A: 'Link',
  BUTTON: 'Button',
  INPUT: 'Input',
  IMG: 'Image',
  svg: 'Icon',
  SVG: 'Icon',
  DIV: 'Element',
  SPAN: 'Element',
  LI: 'List item',
};

/** Element text / aria label when captured, else a friendly tag name. */
export function clickLabel(click: { element?: string; label?: string }): string {
  const raw = (click.label || '').replace(/\s+/g, ' ').trim();
  if (raw && !/^https?:\/\//i.test(raw)) return raw.length > 48 ? raw.slice(0, 47) + '…' : raw;
  if (raw) return 'Link to ' + routeBreadcrumb(safePath(raw));
  const tag = (click.element || '').split(/[.#\s]/)[0];
  return TAG_NAMES[tag] || TAG_NAMES[tag.toUpperCase()] || (tag ? tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase() : 'Element');
}

function safePath(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,}|\d+|[A-Za-z0-9_-]{20,})$/i;

export function isIdSegment(seg: string): boolean {
  return ID_SEGMENT.test(seg) && (/\d/.test(seg) || seg.length >= 20);
}

/** "/tournaments/6AA0EAF5…/matches" → "Tournaments › Matches". "/" → "Home". */
export function routeBreadcrumb(path: string | null | undefined): string {
  if (!path) return '—';
  const clean = String(path).split(/[?#]/)[0];
  const parts = clean
    .split('/')
    .filter((s) => s && !isIdSegment(s))
    .map((s) => {
      const words = decodeURIComponent(s).replace(/[-_]+/g, ' ').trim();
      return words.charAt(0).toUpperCase() + words.slice(1);
    });
  return parts.length ? parts.join(' › ') : 'Home';
}

/** Rounded % change; null when there is nothing to compare against. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null) return null;
  if (previous === 0) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** SVG polyline points for a 100×28 sparkline. */
export function sparklinePoints(series: number[], width = 100, height = 28): string {
  if (!series || series.length < 2) return '';
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const step = width / (series.length - 1);
  return series
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
}

export interface FrustrationInsight {
  total: number;
  headline: string;
  detail: string;
  page: string | null;
}

/** "138 frustrated clicks, most on “Submit” on Tournaments › Matches". */
export function frustrationInsight(
  rage: { label?: string; element?: string; page?: string; count: number }[],
  dead: { label?: string; element?: string; page?: string; count: number }[],
  totals: { rageClicks?: number; deadClicks?: number },
): FrustrationInsight | null {
  const total = (totals.rageClicks || 0) + (totals.deadClicks || 0);
  if (!total) return null;
  const top = [...(rage || []), ...(dead || [])].sort((a, b) => b.count - a.count)[0];
  const noun = total === 1 ? 'frustrated click' : 'frustrated clicks';
  const headline = `${total.toLocaleString('en-US')} ${noun}`;
  if (!top) return { total, headline, detail: 'Visitors clicked repeatedly or got no response.', page: null };
  const share = Math.round((top.count / total) * 100);
  const where = routeBreadcrumb(top.page);
  return {
    total,
    headline,
    detail: `${share}% on “${clickLabel(top)}” on ${where}`,
    page: top.page || null,
  };
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString('en-US');
}

// ─────────────── Categories, icons, descriptions ───────────────

export type EventCategoryKey = 'clicks' | 'navigation' | 'forms' | 'errors' | 'performance' | 'custom';

export const CATEGORY_META: Record<EventCategoryKey, { label: string; color: string }> = {
  // One violet accent in graded tints, so the stacked chart reads as one family.
  navigation: { label: 'Navigation', color: '#4c1d95' },
  clicks: { label: 'Clicks', color: '#6d28d9' },
  forms: { label: 'Forms', color: '#8b5cf6' },
  custom: { label: 'Custom', color: '#a78bfa' },
  performance: { label: 'Performance', color: '#c4b5fd' },
  errors: { label: 'Errors', color: '#f97316' },
};

const CATEGORY_OF: Record<string, EventCategoryKey> = {
  page_view: 'navigation', page_views: 'navigation', route_change: 'navigation', navigation: 'navigation',
  scroll: 'navigation', scroll_depth: 'navigation', session_start: 'navigation', unique_visitor_session: 'navigation',
  unique_visitor_daily: 'navigation', return_visit: 'navigation', page_exit: 'navigation',
  click: 'clicks', auto_click: 'clicks', rage_click: 'clicks', dead_click: 'clicks', outbound_click: 'clicks',
  promo_click: 'clicks', file_download: 'clicks',
  form_submit: 'forms', form_abandon: 'forms', form_focus: 'forms', form_start: 'forms', form_error: 'forms',
  form_field_interaction: 'forms', signup_completed: 'forms',
  error: 'errors', javascript_error: 'errors', unhandled_rejection: 'errors', resource_error: 'errors',
  web_vital_lcp: 'performance', web_vital_fcp: 'performance', web_vital_cls: 'performance', web_vital_fid: 'performance',
  web_vital_inp: 'performance', web_vital_ttfb: 'performance', page_load_complete: 'performance', performance: 'performance',
  resource_timing: 'performance',
};

export function eventCategory(name: string): EventCategoryKey {
  return CATEGORY_OF[name] || (name.startsWith('web_vital') ? 'performance' : name.includes('error') ? 'errors' : 'custom');
}

const DESCRIPTIONS: Record<string, string> = {
  page_view: 'A page was opened',
  page_views: 'A page was opened',
  click: 'A button or link was clicked',
  auto_click: 'A button or link was clicked',
  rage_click: 'Someone clicked the same spot over and over',
  dead_click: 'A click that changed nothing on the page',
  scroll: 'Visitors scrolled down a page',
  scroll_depth: 'How far down visitors scrolled',
  route_change: 'Moved to another page in the app',
  navigation: 'Moved to another page in the app',
  form_submit: 'A form was sent',
  form_abandon: 'A form was started but not sent',
  form_focus: 'Someone started filling a form',
  form_start: 'Someone started filling a form',
  error: 'Something broke in the browser',
  javascript_error: 'Something broke in the browser',
  web_vital_lcp: 'How fast the main content appeared',
  web_vital_fcp: 'How fast anything appeared',
  web_vital_cls: 'How much the layout jumped around',
  web_vital_inp: 'How fast the page reacted to taps',
  web_vital_ttfb: 'How fast the server answered',
  page_load_complete: 'A page finished loading',
  unique_visitor_session: 'A new visit started',
  session_start: 'A new visit started',
  unique_visitor_daily: 'First visit of the day',
  return_visit: 'A visitor came back',
};

export function eventDescription(name: string): string {
  if (DESCRIPTIONS[name]) return DESCRIPTIONS[name];
  return eventCategory(name) === 'custom' ? 'Your custom event' : '';
}

const CATEGORY_ICON: Record<EventCategoryKey, string> = {
  navigation: 'pi pi-file', clicks: 'pi pi-hand-pointer', forms: 'pi pi-pen-to-square',
  errors: 'pi pi-exclamation-triangle', performance: 'pi pi-bolt', custom: 'pi pi-star',
};

export function eventIconFor(name: string): string {
  if (name === 'rage_click' || name === 'dead_click') return 'pi pi-exclamation-circle';
  if (name === 'scroll' || name === 'scroll_depth') return 'pi pi-arrows-v';
  return CATEGORY_ICON[eventCategory(name)];
}

/** Stack raw per-event daily series into per-category daily series. */
export function categorySeries(
  events: { name: string; series: number[] }[],
  days: number,
): Record<EventCategoryKey, number[]> {
  const out = {} as Record<EventCategoryKey, number[]>;
  for (const key of Object.keys(CATEGORY_META) as EventCategoryKey[]) out[key] = new Array(days).fill(0);
  for (const e of events || []) {
    if (isInternalEvent(e.name)) continue;
    const bucket = out[eventCategory(e.name)];
    (e.series || []).forEach((v, i) => { if (i < days) bucket[i] += v; });
  }
  return out;
}

// ─────────────── "What happened" story + journey ───────────────

export interface StoryInput {
  visitors?: { current: number; change: number | null } | null;
  topLanding?: { path: string; count: number } | null;
  topClick?: { label: string; page?: string; count: number } | null;
  busiestDay?: { date: string; count: number; unit?: string } | null;
  countries?: { country: string; share: number }[];
  sources?: { source: string; visits: number }[];
  frustration?: { total: number; label: string; page?: string } | null;
  forms?: { submits: number; abandons: number } | null;
}

export interface StorySentence { key: string; text: string; target: string; }

function changePhrase(change: number | null | undefined): string {
  if (change == null) return '';
  if (Math.abs(change) < 1) return ', about the same as before';
  return `, ${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change))}%`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
}

const n = (v: number) => v.toLocaleString('en-US');

/** 3–5 plain sentences; any sentence with no data is dropped. */
export function buildStory(input: StoryInput): StorySentence[] {
  const out: StorySentence[] = [];
  if (input.visitors && input.visitors.current > 0) {
    const v = input.visitors.current;
    out.push({ key: 'visits', target: 'kpis', text: `${n(v)} ${v === 1 ? 'person' : 'people'} visited${changePhrase(input.visitors.change)}.` });
  }
  const land = input.topLanding && input.topLanding.count ? routeBreadcrumb(input.topLanding.path) : '';
  const click = input.topClick && input.topClick.count ? input.topClick.label : '';
  if (land && click) out.push({ key: 'path', target: 'clicks', text: `Most landed on ${land} and clicked “${click}”.` });
  else if (land) out.push({ key: 'path', target: 'journey', text: `Most landed on ${land}.` });
  else if (click) out.push({ key: 'path', target: 'clicks', text: `The most clicked thing was “${click}”.` });
  if (input.busiestDay && input.busiestDay.count > 0) {
    const d = new Date(input.busiestDay.date + 'T12:00:00Z');
    const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    out.push({ key: 'busiest', target: 'chart', text: `Busiest day was ${day}, with ${n(input.busiestDay.count)} ${input.busiestDay.unit || 'interactions'}.` });
  }
  const countries = (input.countries || []).filter((c) => c.country && !/unknown/i.test(c.country)).slice(0, 2).map((c) => c.country);
  const sources = (input.sources || []).filter((s) => s.visits > 0 && s.source && !/unknown/i.test(s.source)).slice(0, 2).map((s) => s.source);
  if (countries.length || sources.length) {
    const from = countries.length ? ` from ${joinWords(countries)}` : '';
    const via = sources.length ? ` via ${joinWords(sources)}` : '';
    out.push({ key: 'where', target: 'kpis', text: `Visitors mostly came${from}${via}.` });
  }
  if (input.frustration && input.frustration.total > 0) {
    const where = input.frustration.page ? ` on ${routeBreadcrumb(input.frustration.page)}` : '';
    out.push({ key: 'frustration', target: 'insights', text: `${n(input.frustration.total)} frustrated clicks, mostly on “${input.frustration.label}”${where}.` });
  } else if (input.forms && input.forms.submits > 0) {
    const ab = input.forms.abandons ? `, ${n(input.forms.abandons)} abandoned` : ', none abandoned';
    out.push({ key: 'forms', target: 'insights', text: `${n(input.forms.submits)} forms were submitted${ab}.` });
  }
  return out.slice(0, 5);
}

export interface JourneyStep { label: string; detail: string; count: number; target: string; icon: string; }

/** Landing page → top action → next page (or form submit). Steps with no data are skipped. */
export function buildJourney(input: {
  landing?: { path: string; count: number } | null;
  action?: { label: string; count: number } | null;
  next?: { from: string; to: string; count: number } | null;
  formSubmits?: number;
}): JourneyStep[] {
  const steps: JourneyStep[] = [];
  if (input.landing && input.landing.count) {
    steps.push({ label: 'Land on', detail: routeBreadcrumb(input.landing.path), count: input.landing.count, target: 'journey-detail', icon: 'pi pi-sign-in' });
  }
  if (input.action && input.action.count) {
    steps.push({ label: 'Click', detail: input.action.label, count: input.action.count, target: 'clicks', icon: 'pi pi-hand-pointer' });
  }
  if (input.next && input.next.count) {
    steps.push({ label: 'Go to', detail: routeBreadcrumb(input.next.to), count: input.next.count, target: 'all-events', icon: 'pi pi-arrow-right' });
  } else if (input.formSubmits) {
    steps.push({ label: 'Submit', detail: 'a form', count: input.formSubmits, target: 'insights', icon: 'pi pi-send' });
  }
  return steps;
}

export function busiestDay(days: string[], series: number[]): { date: string; count: number } | null {
  if (!days?.length || !series?.length) return null;
  let best = 0;
  series.forEach((v, i) => { if (v > series[best]) best = i; });
  return series[best] > 0 ? { date: days[best], count: series[best] } : null;
}
