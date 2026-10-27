/** Pure view model for the Core Web Vitals card (no Angular deps; unit-tested). */
export interface VitalMetricLike { avg: number | null; p75: number | null; count: number; rating?: string }
export type VitalRating = 'good' | 'needs-improvement' | 'poor' | 'no-data';
export interface VitalCard {
  key: string; name: string; desc: string; threshold: string;
  value: string; rating: VitalRating; ratingLabel: string; count: number;
}

// Google thresholds (good ≤ a, poor > b), applied to p75 per web.dev guidance.
const DEFS: Record<string, { name: string; desc: string; good: number; poor: number; unit: 'ms' | 's' | ''; threshold: string }> = {
  LCP:  { name: 'LCP',  desc: 'Largest Contentful Paint',  good: 2500, poor: 4000, unit: 's',  threshold: '≤ 2.5s is good' },
  INP:  { name: 'INP',  desc: 'Interaction to Next Paint', good: 200,  poor: 500,  unit: 'ms', threshold: '≤ 200ms is good' },
  FID:  { name: 'FID',  desc: 'First Input Delay (legacy)', good: 100, poor: 300,  unit: 'ms', threshold: '≤ 100ms is good' },
  CLS:  { name: 'CLS',  desc: 'Cumulative Layout Shift',   good: 0.1,  poor: 0.25, unit: '',   threshold: '≤ 0.1 is good' },
  FCP:  { name: 'FCP',  desc: 'First Contentful Paint',    good: 1800, poor: 3000, unit: 's',  threshold: '≤ 1.8s is good' },
  TTFB: { name: 'TTFB', desc: 'Time to First Byte',        good: 800,  poor: 1800, unit: 'ms', threshold: '≤ 0.8s is good' },
};

export function rateVital(key: string, value: number | null | undefined): VitalRating {
  const d = DEFS[key];
  if (!d || value == null || !Number.isFinite(value)) return 'no-data';
  if (value <= d.good) return 'good';
  if (value <= d.poor) return 'needs-improvement';
  return 'poor';
}

export function formatVital(key: string, value: number | null | undefined): string {
  const d = DEFS[key];
  if (!d || value == null || !Number.isFinite(value)) return '—';
  if (d.unit === 's') return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)}s`;
  if (d.unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
  return value.toFixed(2);
}

const has = (m?: VitalMetricLike | null) => !!m && m.count > 0 && (m.p75 != null || m.avg != null);

/** LCP, INP (FID only when INP has no data but FID does), CLS, FCP, TTFB. */
export function buildVitalCards(v: Record<string, VitalMetricLike | undefined> | null | undefined): VitalCard[] {
  const vitals = v || {};
  const resp = !has(vitals['INP']) && has(vitals['FID']) ? 'FID' : 'INP';
  return ['LCP', resp, 'CLS', 'FCP', 'TTFB'].map((key) => {
    const m = vitals[key];
    const d = DEFS[key];
    const ok = has(m);
    const value = ok ? (m!.p75 ?? m!.avg) : null;
    const rating = ok ? rateVital(key, value) : 'no-data';
    return {
      key, name: d.name, desc: d.desc, threshold: d.threshold,
      value: formatVital(key, value), rating,
      ratingLabel: rating === 'no-data' ? 'No data' : rating === 'needs-improvement' ? 'Needs improvement' : rating === 'good' ? 'Good' : 'Poor',
      count: ok ? m!.count : 0,
    };
  });
}

export function hasAnyVitals(cards: VitalCard[]): boolean {
  return cards.some((c) => c.rating !== 'no-data');
}
