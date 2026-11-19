/** Pure helpers for the plain-English insights card. */

/** Account API. Do not use /analytics/insights here; that path is the metrics host. */
export const INSIGHTS_SUMMARY_PATH = '/analytics/insights/summary';

export type InsightSeverity = 'up' | 'down' | 'info' | 'warn';

export interface InsightLine {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  metric: string;
  change: string;
  link: string;
}

const SEVERITIES = new Set<InsightSeverity>(['up', 'down', 'info', 'warn']);

export function parseInsights(body: unknown): InsightLine[] | null {
  if (!Array.isArray(body)) return null;
  const lines: InsightLine[] = [];
  body.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const raw = item as Record<string, unknown>;
    const severity = raw['severity'];
    const title = typeof raw['title'] === 'string' ? raw['title'].trim() : '';
    if (!SEVERITIES.has(severity as InsightSeverity) || !title) return;
    lines.push({
      id: typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : `insight-${index}`,
      severity: severity as InsightSeverity,
      title,
      detail: typeof raw['detail'] === 'string' ? raw['detail'] : '',
      metric: typeof raw['metric'] === 'string' ? raw['metric'] : '',
      change: raw['change'] == null ? '' : String(raw['change']),
      link: typeof raw['link'] === 'string' ? raw['link'] : '',
    });
  });
  return lines.slice(0, 5);
}

/** The insights API accepts 7d or 30d. Shorter ranges use 7d; everything else uses 30d. */
export function insightsRange(preset: string, start?: Date | null, end?: Date | null): '7d' | '30d' {
  if (start instanceof Date && end instanceof Date && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (days > 0 && days <= 8) return '7d';
    if (days > 8) return '30d';
  }
  const label = String(preset || '');
  if (/30|month|year|quarter/i.test(label)) return '30d';
  if (/today|yesterday|7|week/i.test(label)) return '7d';
  return '30d';
}

export interface InsightDestination {
  external: boolean;
  path: string;
  query: Record<string, string>;
}

export function insightDestination(link: string): InsightDestination {
  const raw = String(link || '').trim();
  if (/^https?:\/\//i.test(raw)) return { external: true, path: raw, query: {} };
  if (raw.startsWith('/')) {
    const [path, qs] = raw.split('?');
    return { external: false, path: path || '/dashboard/overview', query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  const tab = raw.toLowerCase();
  if (tab === 'events') return { external: false, path: '/dashboard/events', query: {} };
  if (tab === 'goals') return { external: false, path: '/dashboard/goals', query: {} };
  if (tab === 'reports') return { external: false, path: '/dashboard/reports', query: {} };
  if (tab === 'funnels') return { external: false, path: '/dashboard/funnels', query: {} };
  if (tab === 'acquisition') return { external: false, path: '/dashboard/overview', query: { tab: 'acquisition' } };
  if (tab === 'behaviour' || tab === 'behavior' || tab === 'technical') {
    return { external: false, path: '/dashboard/overview', query: { tab: 'behaviour' } };
  }
  return { external: false, path: '/dashboard/overview', query: raw ? { tab: 'overview' } : {} };
}

export function insightIcon(severity: InsightSeverity): string {
  if (severity === 'up') return 'pi-arrow-up';
  if (severity === 'down') return 'pi-arrow-down';
  if (severity === 'warn') return 'pi-exclamation-triangle';
  return 'pi-info-circle';
}
