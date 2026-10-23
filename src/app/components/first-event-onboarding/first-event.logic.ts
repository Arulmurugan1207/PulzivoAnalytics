/** Pure helpers for the "get started" flow (unit-tested with node --test). */

export const TRACKER_SRC = 'https://cdn.pulzivo.com/pulzivo-analytics.min.js';

export function trackingSnippet(apiKey: string): string {
  const key = String(apiKey || '').trim() || 'YOUR_API_KEY';
  return `<script src="${TRACKER_SRC}" data-api-key="${key}"></script>`;
}

export type FirstEventState = 'idle' | 'checking' | 'waiting' | 'found' | 'error';

export interface PollPlan {
  intervalMs: number;
  maxAttempts: number;
}

/** Check every 5 s for up to 2 minutes after the user clicks. */
export const DEFAULT_POLL: PollPlan = { intervalMs: 5000, maxAttempts: 24 };

/** Interpret an /analytics/event-history response. */
export function hasFirstEvent(resp: any): boolean {
  if (!resp) return false;
  if (typeof resp.total === 'number' && resp.total > 0) return true;
  return Array.isArray(resp.events) && resp.events.length > 0;
}

export function firstEventSummary(resp: any): string {
  const ev = Array.isArray(resp?.events) ? resp.events[0] : null;
  if (!ev) return '';
  const name = ev.event_name || ev.eventName || ev.name || 'event';
  const page = ev.page || ev.path || '';
  return page ? `${name} on ${page}` : String(name);
}

/** Next state after one poll attempt. */
export function nextState(found: boolean, attempt: number, plan: PollPlan = DEFAULT_POLL): FirstEventState {
  if (found) return 'found';
  return attempt >= plan.maxAttempts ? 'idle' : 'waiting';
}
