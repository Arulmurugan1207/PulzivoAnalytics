/**
 * Funnel events for Pulzivo's own tracker. One call, no listeners, no batching.
 * Missing or broken tracker must never block signup.
 */

export type ConversionEvent = 'cta_click' | 'signup_start' | 'signup_complete' | 'script_installed';

export function trackConversion(name: ConversionEvent, data: Record<string, unknown> = {}): void {
  const tracker = (globalThis as { PulzivoAnalytics?: unknown }).PulzivoAnalytics;
  if (typeof tracker !== 'function') return;
  try {
    tracker('event', name, data);
  } catch {
    // The page action already happened. Analytics must not throw into it.
  }
}
