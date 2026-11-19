/** Pure helpers for Settings → Email preferences. */

export interface EmailPrefs {
  weeklyReport: boolean;
  productTips: boolean;
}

export const DEFAULT_EMAIL_PREFS: EmailPrefs = { weeklyReport: true, productTips: true };

/** What the weekly email actually contains. Shown beside the toggle. */
export const WEEKLY_EMAIL_INCLUDES = [
  'How many people visited, and how many pages they opened',
  'The pages that got the most attention',
  'Where those visits started',
  'One or two things that changed from the week before',
];

export function parseEmailPrefs(body: unknown): EmailPrefs | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw['weeklyReport'] !== 'boolean' || typeof raw['productTips'] !== 'boolean') return null;
  return { weeklyReport: raw['weeklyReport'], productTips: raw['productTips'] };
}
