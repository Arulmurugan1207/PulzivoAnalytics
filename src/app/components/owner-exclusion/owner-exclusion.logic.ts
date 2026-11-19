/** Pure helpers for the owner/visit exclusion settings (unit-tested with node --test). */

export interface ExclusionSettings {
  apiKey: string;
  excludeMyVisits: boolean;
  ownerEmail: string | null;
  excludedEmails: string[];
  excludedUserIds: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EXCLUDED = 50;

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw));
}

/** Add an email to the list; returns the new list or an error message. */
export function addEmail(list: string[], raw: string): { list: string[]; error?: string } {
  const email = normalizeEmail(raw);
  if (!email) return { list, error: 'Enter an email.' };
  if (!isValidEmail(email)) return { list, error: `“${raw.trim()}” is not a valid email.` };
  if (list.includes(email)) return { list, error: 'That email is already excluded.' };
  if (list.length >= MAX_EXCLUDED) return { list, error: `You can exclude up to ${MAX_EXCLUDED} emails.` };
  return { list: [...list, email] };
}

export function removeEmail(list: string[], email: string): string[] {
  return list.filter((e) => e !== email);
}

/** URL params the tracker reads. Any one of them turns owner mode on; 0 turns it off. */
export const OWNER_URL_PARAMS = ['pulz_owner', 'exclude_owner', 'pulz_exclude_owner'] as const;

export const OWNER_EXCLUSION_FAQ =
  'Run PulzivoAnalytics.disableTracking() once in your browser console — it persists via localStorage so all your future visits on that device are excluded. You can also use role-based exclusion (setOwner(true)) after login, or open your site with ?pulz_owner=1 (also ?exclude_owner=1 or ?pulz_exclude_owner=1; ?pulz_owner=0 undoes it). See the Owner Exclusion section for all 6 methods.';

export type BrowserExclusion = 'on' | 'off' | 'unknown';

export function browserExclusionStorageKey(apiKey: string): string {
  return `pulz_browser_exclusion:${apiKey}`;
}

export function readBrowserExclusion(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  apiKey: string,
): BrowserExclusion {
  try {
    const value = storage?.getItem(browserExclusionStorageKey(apiKey));
    if (value === 'on' || value === 'off') return value;
  } catch { /* private mode */ }
  return 'unknown';
}

export function writeBrowserExclusion(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  apiKey: string,
  state: 'on' | 'off',
): void {
  try { storage?.setItem(browserExclusionStorageKey(apiKey), state); } catch { /* private mode */ }
}

export function browserExclusionLabel(state: BrowserExclusion): string {
  if (state === 'on') return 'Your visits on this browser are excluded.';
  if (state === 'off') return 'Your visits on this browser are counted.';
  return 'Not set on this browser yet.';
}

/** Only an absolute site URL can be opened. A bare "?pulz_owner=1" needs a domain first. */
export function canOpenOwnerLink(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Link that turns on browser-level owner mode (tracker sets localStorage pulz_is_owner).
 * Works on any page of the tracked site, incl. mobile where devtools are unavailable.
 */
export function ownerModeLink(siteUrl: string | null | undefined, on = true): string {
  const flag = on ? '1' : '0';
  const raw = String(siteUrl || '').trim();
  if (!raw) return `?pulz_owner=${flag}`;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.searchParams.set('pulz_owner', flag);
    return url.toString();
  } catch {
    return `?pulz_owner=${flag}`;
  }
}

/** Is owner mode on in *this* browser? Only meaningful on the tracked site's origin. */
export function isOwnerModeOn(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try { return storage?.getItem('pulz_is_owner') === 'true'; } catch { return false; }
}
