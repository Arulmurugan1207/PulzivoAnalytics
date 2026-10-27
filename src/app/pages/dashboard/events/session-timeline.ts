/**
 * Pure view model for the Session Timeline tab (no Angular deps; unit-tested).
 * Groups a session's events by page view, labels actions in plain language,
 * hides technical events unless asked, and computes gaps / idle dividers.
 */
export interface TimelineEventLike {
  id: string; event_name: string; timestamp: string; page?: string | null;
  device?: string | null; country?: string | null; data?: any;
}

export type StepKind = 'navigation' | 'click' | 'form' | 'error' | 'conversion' | 'other' | 'technical';

export interface TimelineStep<E> {
  event: E; label: string; kind: StepKind; icon: string; technical: boolean;
  gapMs: number | null; gapLabel: string; idleBefore: string | null; time: string;
}
export interface TimelinePage<E> {
  key: string; title: string; path: string; pageEvent: E | null;
  start: string; timeSpent: string; maxScroll: number | null;
  gapLabel: string; idleBefore: string | null;
  landed: boolean; left: boolean; steps: TimelineStep<E>[];
}
export interface SessionTimelineView<E> {
  summary: string[]; pages: TimelinePage<E>[]; technicalCount: number; total: number;
}

const PAGE_VIEWS = new Set(['page_view', 'page_views']);
const TECHNICAL = new Set([
  'session_start', 'session_end', 'unique_visitor', 'unique_visitor_session', 'unique_visitor_daily',
  'page_load', 'page_load_complete', 'page_load_time', 'page_hidden', 'page_visible', 'visibility', 'visibility_change',
  'page_exit', 'resource_timing', 'performance', 'impression', 'promo_impression', 'element_impression',
  'scroll', 'scroll_depth', 'heartbeat', 'engagement', 'ping', 'form_field_interaction', 'web_vitals', 'identify',
]);

export function isTechnicalEvent(name: string): boolean {
  const n = (name || '').toLowerCase();
  return TECHNICAL.has(n) || n.startsWith('web_vital') || n.endsWith('_impression');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const t = (e: { timestamp: string }) => { const x = Date.parse(e.timestamp); return Number.isNaN(x) ? 0 : x; };

export function humanizeEventName(name: string): string {
  const s = (name || 'event').replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Event';
}

/** "4 s", "1 min 3 s", "2 h 5 min". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), rs = s % 60;
  if (m < 60) return rs ? `${m} min ${rs} s` : `${m} min`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm ? `${h} h ${rm} min` : `${h} h`;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function fileOf(url: string): string {
  try { const p = new URL(url, 'https://x.invalid').pathname; return decodeURIComponent(p.split('/').filter(Boolean).pop() || ''); } catch { return ''; }
}
function money(value: number, currency: string): string {
  const cur = (currency || 'USD').toUpperCase();
  try {
    return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(value)} ${cur}`;
  } catch { return `${value.toFixed(2)} ${cur}`; }
}

/** Plain-language label and kind for one event. */
export function describeEvent(e: TimelineEventLike): { label: string; kind: StepKind; icon: string } {
  const name = (e.event_name || '').toLowerCase();
  const d = e.data || {};
  const c = d.custom || {};
  const label = str(d.label) || str(d.text) || str(c.text) || str(d.event_label);
  if (PAGE_VIEWS.has(name)) return { label: `Viewed ${str(d.page_title) || e.page || 'a page'}`, kind: 'navigation', icon: 'pi pi-file' };
  switch (name) {
    case 'click': case 'auto_click':
      return { label: label ? `Clicked '${clip(label)}'` : 'Clicked an element', kind: 'click', icon: 'pi pi-arrow-up-left' };
    case 'rage_click':
      return { label: label ? `Rage-clicked '${clip(label)}'` : 'Rage-clicked an element', kind: 'error', icon: 'pi pi-bolt' };
    case 'dead_click':
      return { label: label ? `Clicked '${clip(label)}' (no response)` : 'Clicked with no response', kind: 'error', icon: 'pi pi-ban' };
    case 'outbound_click': {
      const host = str(d.domain).replace(/^www\./, '') || hostOf(str(d.url) || str(d.href));
      return { label: host ? `Opened outbound link to ${host}` : 'Opened an outbound link', kind: 'navigation', icon: 'pi pi-external-link' };
    }
    case 'file_download': {
      const f = fileOf(str(d.url) || str(d.href)) || label;
      return { label: f ? `Downloaded ${clip(f)}` : 'Downloaded a file', kind: 'click', icon: 'pi pi-download' };
    }
    case 'site_search': {
      const term = str(d.term) || label;
      return { label: term ? `Searched for '${clip(term)}'` : 'Searched the site', kind: 'click', icon: 'pi pi-search' };
    }
    case 'form_start': case 'form_focus': {
      const f = str(d.formId) || str(d.form_id) || str(c.formId);
      return { label: f ? `Started form ${clip(f)}` : 'Started a form', kind: 'form', icon: 'pi pi-pencil' };
    }
    case 'form_submit': {
      const f = str(d.formId) || str(d.form_id) || str(c.formId);
      return { label: f ? `Submitted form ${clip(f)}` : 'Submitted a form', kind: 'form', icon: 'pi pi-send' };
    }
    case 'form_abandon': {
      const f = str(d.formId) || str(d.form_id) || str(c.formId);
      return { label: f ? `Abandoned form ${clip(f)}` : 'Abandoned a form', kind: 'error', icon: 'pi pi-times-circle' };
    }
    case 'not_found':
      return { label: 'Hit a 404 page', kind: 'error', icon: 'pi pi-exclamation-circle' };
    case 'goal': {
      const g = str(d.goal) || label;
      return { label: g ? `Reached goal '${clip(g)}'` : 'Reached a goal', kind: 'conversion', icon: 'pi pi-flag-fill' };
    }
    case 'revenue': case 'purchase': case 'checkout_completed': {
      const v = Number(d.revenue ?? d.value);
      const amount = Number.isFinite(v) ? ` ${money(v, str(d.currency))}` : '';
      return { label: `Purchase${amount}`, kind: 'conversion', icon: 'pi pi-shopping-cart' };
    }
    case 'navigation':
      return { label: label ? `Navigated: ${clip(label)}` : 'Navigated', kind: 'navigation', icon: 'pi pi-compass' };
  }
  if (name.includes('error') || name.includes('exception') || name === 'unhandled_rejection' || d.category === 'error') {
    const msg = str(d.message) || str(c.error_message) || label;
    const prefix = name.includes('javascript') || name === 'js_error' ? 'JavaScript error' : 'Error';
    return { label: msg ? `${prefix}: ${clip(msg, 90)}` : prefix, kind: 'error', icon: 'pi pi-exclamation-triangle' };
  }
  if (name.startsWith('signup') || name.startsWith('sign_up') || name === 'user_sign_up' || name.endsWith('_completed') || d.category === 'goal') {
    return { label: humanizeEventName(e.event_name), kind: 'conversion', icon: 'pi pi-check-circle' };
  }
  if (isTechnicalEvent(name)) return { label: humanizeEventName(e.event_name), kind: 'technical', icon: 'pi pi-cog' };
  return { label: humanizeEventName(e.event_name) + (label ? `: ${clip(label)}` : ''), kind: 'other', icon: 'pi pi-circle' };
}

const IDLE_MS = 60_000;

export interface BuildTimelineOptions {
  showTechnical?: boolean;
  /** Plain source text, e.g. "came from Google". Empty = unknown. */
  source?: string;
  /** Time formatter for hover/clock text (injected so tests are locale-stable). */
  formatTime?: (iso: string) => string;
}

export function buildSessionTimeline<E extends TimelineEventLike>(events: E[] | null | undefined, opts: BuildTimelineOptions = {}): SessionTimelineView<E> {
  const fmt = opts.formatTime || ((iso: string) => iso);
  const list = [...(events || [])].sort((a, b) => t(a) - t(b));

  // 1) Group by page view (view_id when present, else the most recent page view).
  interface G { key: string; pageEvent: E | null; path: string; title: string; start: number; startIso: string; events: E[]; exitMs: number | null }
  const groups: G[] = [];
  const byView = new Map<string, G>();
  let current: G | null = null;
  for (const e of list) {
    const d = e.data || {};
    const viewId = str(d.view_id);
    const isPv = PAGE_VIEWS.has((e.event_name || '').toLowerCase());
    let g: G | null | undefined = null;
    if (isPv) {
      const pending = viewId ? byView.get(viewId) : undefined;
      if (pending && !pending.pageEvent) {
        // Events of this view arrived before its page_view (same timestamp): adopt them.
        pending.pageEvent = e; pending.path = e.page || str(d.page) || pending.path;
        pending.title = str(d.page_title) || pending.title; current = pending;
        continue;
      }
      g = { key: viewId || e.id, pageEvent: e, path: e.page || str(d.page) || '', title: str(d.page_title), start: t(e), startIso: e.timestamp, events: [], exitMs: null };
      groups.push(g);
      if (viewId) byView.set(viewId, g);
      current = g;
      continue;
    }
    g = (viewId && byView.get(viewId)) || current;
    if (!g || (!viewId && e.page && g.path && e.page !== g.path && !g.pageEvent)) {
      g = { key: viewId || `pre-${e.id}`, pageEvent: null, path: e.page || str(d.page) || '', title: str(d.page_title), start: t(e), startIso: e.timestamp, events: [], exitMs: null };
      groups.push(g);
      if (viewId) byView.set(viewId, g);
      current = g;
    }
    if ((e.event_name || '').toLowerCase() === 'page_exit') {
      const ms = Number(d.time_on_page);
      if (Number.isFinite(ms) && ms >= 0) g.exitMs = Math.max(g.exitMs ?? 0, ms);
    }
    g.events.push(e);
  }
  groups.sort((a, b) => a.start - b.start);

  // 2) Build visible steps with gaps.
  let technicalCount = 0;
  let prevTs: number | null = null;
  const gapOf = (ts: number) => {
    const gap = prevTs == null ? null : Math.max(0, ts - prevTs);
    prevTs = ts;
    return { gapMs: gap, gapLabel: gap == null ? '' : `+${formatDuration(gap)}`, idleBefore: gap != null && gap > IDLE_MS ? `Idle ${formatDuration(gap)}` : null };
  };

  const pages: TimelinePage<E>[] = groups.map((g, i) => {
    const head = gapOf(g.start);
    const next = groups[i + 1];
    const lastTs = g.events.length ? t(g.events[g.events.length - 1]) : g.start;
    const spentMs = g.exitMs ?? (next ? next.start - g.start : (lastTs > g.start ? lastTs - g.start : null));
    let maxScroll: number | null = null;
    for (const e of [g.pageEvent, ...g.events]) {
      const s = Number(e?.data?.scroll_depth);
      if (Number.isFinite(s) && s > 0) maxScroll = Math.max(maxScroll ?? 0, Math.min(100, Math.round(s)));
    }
    const steps: TimelineStep<E>[] = [];
    for (const e of g.events) {
      const desc = describeEvent(e);
      const technical = desc.kind === 'technical' || isTechnicalEvent(e.event_name);
      if (technical) technicalCount++;
      if (technical && !opts.showTechnical) continue;
      steps.push({ event: e, ...desc, kind: technical ? 'technical' : desc.kind, technical, time: fmt(e.timestamp), ...gapOf(t(e)) });
    }
    return {
      key: g.key, title: g.title || g.path || 'Unknown page', path: g.path, pageEvent: g.pageEvent,
      start: fmt(g.startIso), timeSpent: formatDuration(spentMs), maxScroll,
      gapLabel: head.gapLabel, idleBefore: head.idleBefore,
      landed: i === 0, left: i === groups.length - 1 && groups.length > 0, steps,
    };
  });

  // 3) Summary line from real data; unknown parts are dropped.
  const summary: string[] = [];
  const visit = Number(list.find((e) => Number(e.data?.visit_count) > 0)?.data?.visit_count);
  if (Number.isFinite(visit) && visit > 0) summary.push(`Visit ${visit}`);
  if (list.length > 1) { const dur = formatDuration(t(list[list.length - 1]) - t(list[0])); if (dur) summary.push(dur); }
  const pageCount = groups.filter((g) => g.pageEvent).length;
  if (pageCount) summary.push(`${pageCount} page${pageCount === 1 ? '' : 's'}`);
  const clicks = list.filter((e) => ['click', 'auto_click', 'outbound_click', 'file_download'].includes((e.event_name || '').toLowerCase())).length;
  if (clicks) summary.push(`${clicks} click${clicks === 1 ? '' : 's'}`);
  if (opts.source) summary.push(opts.source);
  const where = [list.find((e) => e.device)?.device, list.find((e) => e.country)?.country].filter((x) => x && x !== 'Unknown').join(', ');
  if (where) summary.push(where);

  return { summary, pages, technicalCount, total: list.length };
}

const KNOWN_SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\./, 'Yahoo'], [/(^|\.)youtube\.com$/, 'YouTube'], [/(^|\.)facebook\.com$|^l\.facebook\.com$/, 'Facebook'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'], [/(^|\.)(x|twitter)\.com$|^t\.co$/, 'X'], [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)instagram\.com$/, 'Instagram'], [/chatgpt\.com$|openai\.com$/, 'ChatGPT'],
];

/** Turn the Details tab's "How they got here" text into a short summary phrase ('' when unknown). */
export function sourcePhrase(visitSource: string | null | undefined): string {
  const s = (visitSource || '').trim();
  if (!s || s === '—' || s === 'Not recorded') return '';
  if (s.startsWith('Direct')) return 'direct visit';
  if (s.startsWith('Bot')) return 'bot / crawler';
  const first = s.split(' · ')[0].trim().toLowerCase().replace(/^www\./, '');
  for (const [re, name] of KNOWN_SOURCES) if (re.test(first)) return `came from ${name}`;
  return `came from ${s.split(' · ')[0].trim().replace(/^www\./, '')}`;
}
