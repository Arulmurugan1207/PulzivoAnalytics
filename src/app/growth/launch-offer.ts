/**
 * Launch offer: 50% off every paid plan for the customer's first 12 months,
 * until Pulzivo reaches 100 users.
 *
 * LAUNCH_OFFER_ENABLED is the single switch (on in this release). A public
 * GET can turn the offer off without a redeploy. The route must match the
 * node-server-api PR:
 *
 *   GET {apiUrl}/billing/launch-offer
 *   { active: boolean, percent?: number, months?: number, spotsRemaining?: number }
 *
 * A failed or unexpected response keeps this default. spotsRemaining is never
 * invented and stays hidden unless LAUNCH_OFFER_SHOW_SPOTS_REMAINING is on.
 */

const LAUNCH_OFFER_ENABLED = true;
const LAUNCH_OFFER_PERCENT = 50;
const LAUNCH_OFFER_MONTHS = 12;
const LAUNCH_OFFER_USER_CAP = 100;
/** Yearly billing charges 80% of monthly x 12 (20% off). */
const YEARLY_BILLING_RATE = 0.8;
const LAUNCH_OFFER_SHOW_SPOTS_REMAINING = false;
const LAUNCH_OFFER_PATH = '/billing/launch-offer';

export {
  LAUNCH_OFFER_ENABLED,
  LAUNCH_OFFER_PERCENT,
  LAUNCH_OFFER_MONTHS,
  LAUNCH_OFFER_USER_CAP,
  YEARLY_BILLING_RATE,
  LAUNCH_OFFER_SHOW_SPOTS_REMAINING,
  LAUNCH_OFFER_PATH,
};

export type BillingCycle = 'month' | 'year';

export interface LaunchOfferState {
  active: boolean;
  percent: number;
  months: number;
  /** Set only from the public endpoint. Null when the endpoint did not send one. */
  spotsRemaining: number | null;
}

function launchOfferLine(
  percent = LAUNCH_OFFER_PERCENT,
  months = LAUNCH_OFFER_MONTHS,
): string {
  return `${percent}% off your first ${months} months, launch offer until we reach ${LAUNCH_OFFER_USER_CAP} users.`;
}

function defaultLaunchOffer(): LaunchOfferState {
  return {
    active: LAUNCH_OFFER_ENABLED,
    percent: LAUNCH_OFFER_PERCENT,
    months: LAUNCH_OFFER_MONTHS,
    spotsRemaining: null,
  };
}

/**
 * List price for a catalog monthly amount.
 * Pass the monthly catalog price (Free 0, Starter 9, Pro 29, Enterprise 99).
 * Yearly is rounded once: Math.round(monthly * 12 * 0.8) → 86 / 278 / 950.
 */
function cycleListPrice(monthlyPrice: number, cycle: BillingCycle): number {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return 0;
  if (cycle === 'year') return Math.round(monthlyPrice * 12 * YEARLY_BILLING_RATE);
  return monthlyPrice;
}

/** Percent off a list price, rounded to the nearest cent. Free stays 0. */
function discountedAmount(listPrice: number, percent: number): number {
  if (!Number.isFinite(listPrice) || listPrice <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return listPrice;
  const rate = Math.min(percent, 100) / 100;
  return Math.round(listPrice * (1 - rate) * 100) / 100;
}

function formatPlanAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2);
}

/** "$9/mo", "$4.50/mo", "$86/year". Free is "$0". percent null is the list price. */
function planPriceLabel(
  monthlyPrice: number,
  cycle: BillingCycle,
  percent: number | null,
): string {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return '$0';
  const list = cycleListPrice(monthlyPrice, cycle);
  const amount = percent == null ? list : discountedAmount(list, percent);
  const period = cycle === 'year' ? 'year' : 'mo';
  return `$${formatPlanAmount(amount)}/${period}`;
}

/** Monthly equivalent of the yearly charge (after the launch percent, when set). */
function yearlyPerMonth(monthlyPrice: number, percent: number | null): number {
  const list = cycleListPrice(monthlyPrice, 'year');
  const billed = percent == null || percent <= 0 ? list : discountedAmount(list, percent);
  return Math.round((billed / 12) * 100) / 100;
}

function launchOfferUrl(apiBase: string): string {
  return `${String(apiBase || '').replace(/\/$/, '')}${LAUNCH_OFFER_PATH}`;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Apply a public offer payload. Anything other than an object with a boolean
 * `active` is ignored so a bad response cannot blank the page.
 * `active: false` hides the offer. `active: true` may update percent, months,
 * and spotsRemaining.
 */
function applyLaunchOfferResponse(
  current: LaunchOfferState,
  body: unknown,
): LaunchOfferState {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return current;
  const raw = body as Record<string, unknown>;
  if (typeof raw['active'] !== 'boolean') return current;
  if (raw['active'] === false) return { ...current, active: false, spotsRemaining: null };
  const percent = readNumber(raw['percent']);
  const months = readNumber(raw['months']);
  const spots = readNumber(raw['spotsRemaining']);
  return {
    active: true,
    percent: percent != null && percent > 0 && percent <= 100 ? percent : current.percent,
    months: months != null && months > 0 && months <= 36 ? Math.round(months) : current.months,
    spotsRemaining: spots != null && spots >= 0 ? Math.round(spots) : null,
  };
}

/**
 * Spots copy is off unless the flag is on AND the endpoint sent a number.
 * Passing `showSpots` lets tests cover the on path without flipping the default.
 */
function launchSpotsLabel(
  status: LaunchOfferState,
  showSpots = LAUNCH_OFFER_SHOW_SPOTS_REMAINING,
): string | null {
  if (!showSpots || !status.active) return null;
  const n = status.spotsRemaining;
  if (n == null || !Number.isInteger(n) || n < 0) return null;
  return `${n} spots remaining`;
}

export {
  launchOfferLine,
  defaultLaunchOffer,
  cycleListPrice,
  discountedAmount,
  formatPlanAmount,
  planPriceLabel,
  yearlyPerMonth,
  launchOfferUrl,
  applyLaunchOfferResponse,
  launchSpotsLabel,
};
