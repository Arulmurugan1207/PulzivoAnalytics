/** Pure helpers for the usage meter and upgrade prompts. */

export interface UsageSnapshot {
  plan: string;
  periodStart: string;
  periodEnd: string;
  eventsUsed: number;
  /** Null on Enterprise: there is no cap, so the meter shows Unlimited. */
  eventsLimit: number | null;
  /** Null when eventsLimit is null. */
  percent: number | null;
  proFeatures: string[];
}

export type UsageLevel = 'ok' | 'soft' | 'full';

export const FOUNDER_OFFER =
  'Founder offer: 50% off any paid plan for 12 months with code FOUNDER50, limited to the first 10 paying customers. Enter the code at checkout.';

/** FOUNDER50 is for first-time customers. Paid plans do not see it. */
export function isFreePlan(plan: string | null | undefined): boolean {
  return String(plan || '').trim().toLowerCase() === 'free';
}

/** Plain-language Pro benefits. Shown with whatever the usage API lists. */
export const PRO_PLAN_BENEFITS = [
  '500,000 events a month',
  'Visitors, sessions, and countries',
  'Where people came from, including campaigns',
  'Entry and exit pages',
  'Performance and error tracking',
  'A full year of history',
];

const FEATURE_LABELS: Record<string, string> = {
  auto_clicks: 'Automatic click tracking',
  visibility: 'Element visibility',
  unique_visitors: 'Visitors',
  sessions: 'Sessions and time on site',
  performance: 'Performance',
  utm_attribution: 'Campaign attribution',
  user_identity: 'Signed-in visitors',
  error_tracking: 'JavaScript errors',
  page_exit: 'Entry and exit pages',
  form_tracking: 'Form tracking',
  rage_clicks: 'Rage clicks',
  dead_clicks: 'Dead clicks',
  heatmap_data: 'Heatmaps',
  client_hints: 'Browser and device details',
  custom_dimensions: 'Custom dimensions',
  resource_timing: 'Resource timing',
};

export function usagePercent(used: number, limit: number, raw?: unknown): number {
  if (limit > 0 && Number.isFinite(used)) {
    return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  }
  const p = Number(raw);
  if (!Number.isFinite(p)) return 0;
  const scaled = p > 0 && p <= 1 ? p * 100 : p;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseUsage(body: unknown): UsageSnapshot | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw['plan'] !== 'string' || !raw['plan']) return null;
  const eventsUsed = Number(raw['eventsUsed']);
  if (!Number.isFinite(eventsUsed)) return null;
  const eventsLimit = finiteOrNull(raw['eventsLimit']);
  if (raw['eventsLimit'] != null && raw['eventsLimit'] !== '' && eventsLimit == null) return null;
  const proFeatures = Array.isArray(raw['proFeatures'])
    ? raw['proFeatures'].filter((item) => typeof item === 'string' && item.trim()).map((item) => String(item))
    : [];
  return {
    plan: raw['plan'],
    periodStart: typeof raw['periodStart'] === 'string' ? raw['periodStart'] : '',
    periodEnd: typeof raw['periodEnd'] === 'string' ? raw['periodEnd'] : '',
    eventsUsed,
    eventsLimit,
    percent: eventsLimit == null ? null : usagePercent(eventsUsed, eventsLimit, raw['percent']),
    proFeatures,
  };
}

/** 80% is a soft nudge. 100% is a clear upgrade card. A null cap (Enterprise) stays quiet. */
export function usageLevel(snapshot: Pick<UsageSnapshot, 'percent' | 'eventsLimit'>): UsageLevel {
  if (snapshot.eventsLimit == null || !(snapshot.eventsLimit > 0) || snapshot.percent == null) return 'ok';
  if (snapshot.percent >= 100) return 'full';
  if (snapshot.percent >= 80) return 'soft';
  return 'ok';
}

export function isBelowPro(plan: string | null | undefined): boolean {
  return plan !== 'pro' && plan !== 'enterprise';
}

export function proBenefitLines(proFeatures: string[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const feature of proFeatures) {
    const label = FEATURE_LABELS[feature] || feature.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!label || seen.has(label)) continue;
    seen.add(label);
    lines.push(label);
  }
  for (const benefit of PRO_PLAN_BENEFITS) {
    if (seen.has(benefit)) continue;
    seen.add(benefit);
    lines.push(benefit);
  }
  return lines.slice(0, 8);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatPeriodEnd(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
