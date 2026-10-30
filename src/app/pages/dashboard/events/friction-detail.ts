/**
 * Friction drill-down (Events page "Form Signals" card): pure helpers that turn
 * /analytics/friction-details rows into display rows with a plain-language hint.
 */
export type FrictionKind = 'rage' | 'dead' | 'abandon' | 'errors';

export interface FrictionRecent { time: string | null; visitor?: string | null; device?: string; browser?: string; page?: string; }

export interface FrictionRow {
  page: string;
  count: number;
  visitors?: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
  devices?: Record<string, number>;
  browsers?: Record<string, number>;
  recent?: FrictionRecent[];
  // clicks
  element?: string; text?: string | null; label?: string | null; elementId?: string | null; elementClass?: string | null;
  // forms
  form?: string; lastField?: string | null; avgFieldsCompleted?: number | null;
  // errors
  message?: string; type?: string; source?: string | null; line?: number | null; column?: number | null;
}

export interface FrictionView {
  title: string;
  what: string;
  detail: string;
  where: string;
  href?: string;
  count: number;
  visitors: number | null;
  split: string;
  firstSeen: string;
  lastSeen: string;
  hint: string;
  recent: { time: string; meta: string }[];
}

export const FRICTION_TITLES: Record<FrictionKind, string> = {
  rage: 'Rage clicks',
  dead: 'Dead clicks',
  abandon: 'Form abandons',
  errors: 'JavaScript errors',
};

export const FRICTION_ABOUT: Record<FrictionKind, string> = {
  rage: 'Visitors clicked the same element several times in quick succession — usually because it looked clickable but did nothing, or reacted too slowly.',
  dead: 'Clicks that changed nothing on the page (no navigation, no scroll). Often a non-clickable element styled like a link or button.',
  abandon: 'Visitors started filling a form and left the page without submitting it.',
  errors: 'Uncaught JavaScript errors and unhandled promise rejections reported by visitors’ browsers.',
};

export function localTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Desktop 70% · Mobile 30% · Chrome 80% · Safari 20%" (top 2 of each). */
export function splitLabel(devices?: Record<string, number>, browsers?: Record<string, number>): string {
  const part = (m?: Record<string, number>) => {
    const entries = Object.entries(m || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    if (!total) return '';
    return entries.slice(0, 2).map(([k, n]) => `${k} ${Math.round((n / total) * 100)}%`).join(' · ');
  };
  return [part(devices), part(browsers)].filter(Boolean).join(' · ') || '—';
}

function elementWhat(r: FrictionRow): { what: string; detail: string } {
  const tag = (r.element || 'element').toLowerCase();
  const label = (r.label || '').trim();
  const text = (r.text || (label && label.toLowerCase() !== tag ? label : '')).trim();
  const what = text ? `“${text.length > 60 ? text.slice(0, 57) + '…' : text}”` : `<${tag}>`;
  const cls = (r.elementClass || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('');
  const detail = `<${tag}${r.elementId ? ' #' + r.elementId : ''}${cls ? ' ' + cls : ''}>`;
  return { what, detail };
}

export function frictionHint(kind: FrictionKind, r: FrictionRow): string {
  const tag = (r.element || '').toLowerCase();
  if (kind === 'rage') {
    if (['button', 'a'].includes(tag)) return 'This control is clickable but visitors keep re-clicking: it probably responds slowly or gives no feedback. Add a loading/disabled state or speed up the action.';
    if (['img', 'svg', 'path'].includes(tag)) return 'Visitors expect this image/icon to do something (zoom, open, link). Make it interactive or style it so it does not look clickable.';
    return 'Visitors repeatedly click something that does not react. Check it works on this page, or make it look less clickable.';
  }
  if (kind === 'dead') {
    if (tag === 'a') return 'A link that goes nowhere (empty or # href, or blocked by script). Fix the href or the click handler.';
    return 'Looks clickable but does nothing. Either wire up an action or remove the pointer cursor / link-like styling.';
  }
  if (kind === 'abandon') {
    if (r.lastField) return `Most visitors stop around “${r.lastField}”. Check that field: is it required, confusing, or failing validation?`;
    return 'Visitors start this form but leave. Shorten it, mark optional fields, and check validation messages are clear.';
  }
  const msg = (r.message || '').toLowerCase();
  if (/is not defined|undefined is not|cannot read prop|of undefined|of null|is null/.test(msg)) return 'Code is using a value that does not exist yet (often data not loaded, or a missing element). Add a null check at the source line shown.';
  if (/is not a function/.test(msg)) return 'Code calls something that is not a function — often a script loaded out of order, a renamed API, or a browser lacking that feature.';
  if (/resizeobserver loop/.test(msg)) return 'Usually harmless browser noise from layout resizing; safe to ignore unless visitors report broken layouts.';
  if (/script error/.test(msg)) return 'Error from a cross-origin script (details hidden by the browser). Add crossorigin="anonymous" to that script tag to see the real message.';
  if (/chunk|loading .*failed|failed to fetch|networkerror|load failed/.test(msg)) return 'A file or request failed to load — often after a deploy (stale cached chunks) or a flaky network. Consider retrying or reloading on chunk-load errors.';
  if (r.type === 'promise_rejection') return 'A promise rejected and nothing caught it. Add a .catch / try-catch around this async call and show the visitor a friendly error.';
  return 'Open the source file at the line shown, reproduce in the same browser, and add error handling there.';
}

export function buildFrictionView(kind: FrictionKind, r: FrictionRow, domain?: string): FrictionView {
  let what = '', detail = '';
  if (kind === 'rage' || kind === 'dead') ({ what, detail } = elementWhat(r));
  else if (kind === 'abandon') {
    what = r.form && r.form !== 'unknown-form' ? `Form “${r.form}”` : 'Unnamed form';
    detail = [r.lastField ? `last field: ${r.lastField}` : 'last field: not reported',
      r.avgFieldsCompleted != null ? `~${r.avgFieldsCompleted} fields filled` : ''].filter(Boolean).join(' · ');
  } else {
    what = r.message || 'Unknown error';
    const src = r.source ? r.source.replace(/^https?:\/\/[^/]+/, '') || r.source : '';
    detail = src ? `${src}${r.line != null ? ':' + r.line : ''}${r.column != null ? ':' + r.column : ''}` : 'source not reported';
  }
  const page = r.page || '/';
  return {
    title: FRICTION_TITLES[kind],
    what,
    detail,
    where: page,
    href: domain && page.startsWith('/') ? `https://${domain}${page}` : undefined,
    count: r.count || 0,
    visitors: r.visitors ?? null,
    split: splitLabel(r.devices, r.browsers),
    firstSeen: localTime(r.firstSeen),
    lastSeen: localTime(r.lastSeen),
    hint: frictionHint(kind, r),
    recent: (r.recent || []).slice(0, 5).map(x => ({
      time: localTime(x.time),
      meta: [x.device, x.browser, x.visitor ? 'visitor ' + String(x.visitor).slice(0, 8) : ''].filter(v => v && v !== 'Unknown').join(' · '),
    })),
  };
}
