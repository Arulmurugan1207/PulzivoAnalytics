import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAUNCH_OFFER_ENABLED,
  LAUNCH_OFFER_PATH,
  LAUNCH_OFFER_SHOW_SPOTS_REMAINING,
  applyLaunchOfferResponse,
  cycleListPrice,
  defaultLaunchOffer,
  discountedAmount,
  launchOfferLine,
  launchOfferUrl,
  launchSpotsLabel,
  planPriceLabel,
  yearlyPerMonth,
} from './launch-offer.ts';

const starter = 9;
const pro = 29;
const enterprise = 99;

test('launch offer defaults to on, half off, with spots hidden', () => {
  assert.equal(LAUNCH_OFFER_ENABLED, true);
  assert.equal(LAUNCH_OFFER_SHOW_SPOTS_REMAINING, false);
  assert.equal(LAUNCH_OFFER_PATH, '/billing/launch-offer');
  assert.equal(defaultLaunchOffer().active, true);
  assert.equal(defaultLaunchOffer().percent, 50);
  assert.equal(defaultLaunchOffer().months, 12);
  assert.equal(defaultLaunchOffer().spotsRemaining, null);
  assert.equal(
    launchOfferLine(),
    '50% off your first 12 months, launch offer until we reach 100 users.',
  );
});

test('monthly and yearly list prices, then 50% off, including Free', () => {
  assert.equal(cycleListPrice(0, 'month'), 0);
  assert.equal(cycleListPrice(0, 'year'), 0);
  assert.equal(planPriceLabel(0, 'month', 50), '$0');
  assert.equal(planPriceLabel(0, 'year', 50), '$0');
  assert.equal(discountedAmount(0, 50), 0);

  assert.equal(planPriceLabel(starter, 'month', null), '$9/mo');
  assert.equal(planPriceLabel(pro, 'month', null), '$29/mo');
  assert.equal(planPriceLabel(enterprise, 'month', null), '$99/mo');
  assert.equal(planPriceLabel(starter, 'month', 50), '$4.50/mo');
  assert.equal(planPriceLabel(pro, 'month', 50), '$14.50/mo');
  assert.equal(planPriceLabel(enterprise, 'month', 50), '$49.50/mo');

  // 20% off the annual amount, rounded once: 9*12*0.8=86.4 → 86, 29 → 278, 99 → 950.
  assert.equal(cycleListPrice(starter, 'year'), 86);
  assert.equal(cycleListPrice(pro, 'year'), 278);
  assert.equal(cycleListPrice(enterprise, 'year'), 950);
  assert.equal(planPriceLabel(starter, 'year', null), '$86/year');
  assert.equal(planPriceLabel(pro, 'year', null), '$278/year');
  assert.equal(planPriceLabel(enterprise, 'year', null), '$950/year');
  assert.equal(planPriceLabel(starter, 'year', 50), '$43/year');
  assert.equal(planPriceLabel(pro, 'year', 50), '$139/year');
  assert.equal(planPriceLabel(enterprise, 'year', 50), '$475/year');

  assert.equal(yearlyPerMonth(starter, null), 7.17);
  assert.equal(yearlyPerMonth(starter, 50), 3.58);
  assert.equal(yearlyPerMonth(pro, 50), 11.58);
  assert.equal(yearlyPerMonth(enterprise, 50), 39.58);
});

test('yearly discount is applied once to the monthly catalog price', () => {
  const yearlyList = cycleListPrice(starter, 'year');
  const yearlySale = discountedAmount(yearlyList, 50);
  assert.equal(yearlySale, 43);
  // Feeding the already-yearly amount through the yearly formula again is the
  // double-discount bug (86 * 12 * 0.8). The sale price must not do that.
  const doubled = discountedAmount(cycleListPrice(yearlyList, 'year'), 50);
  assert.equal(cycleListPrice(yearlyList, 'year'), 826);
  assert.notEqual(doubled, yearlySale);
});

test('a public active:false hides the offer; a bad payload does not', () => {
  const current = defaultLaunchOffer();
  assert.equal(applyLaunchOfferResponse(current, { active: false }).active, false);
  assert.equal(applyLaunchOfferResponse(current, null), current);
  assert.equal(applyLaunchOfferResponse(current, []), current);
  assert.equal(applyLaunchOfferResponse(current, { percent: 10 }), current);
  assert.equal(applyLaunchOfferResponse(current, { active: 'false' }), current);
  assert.equal(applyLaunchOfferResponse(current, 'nope'), current);

  const updated = applyLaunchOfferResponse(current, {
    active: true,
    percent: 50,
    months: 12,
    spotsRemaining: 17,
  });
  assert.equal(updated.active, true);
  assert.equal(updated.percent, 50);
  assert.equal(updated.months, 12);
  assert.equal(updated.spotsRemaining, 17);
  assert.equal(launchOfferLine(updated.percent, updated.months), launchOfferLine());
});

test('spots remaining stays hidden unless the flag is on and the endpoint sent a number', () => {
  const withSpots = applyLaunchOfferResponse(defaultLaunchOffer(), {
    active: true,
    spotsRemaining: 17,
  });
  assert.equal(launchSpotsLabel(withSpots), null);
  assert.equal(launchSpotsLabel(defaultLaunchOffer(), true), null);
  assert.equal(launchSpotsLabel(withSpots, true), '17 spots remaining');
  assert.equal(launchSpotsLabel({ ...withSpots, active: false }, true), null);
  assert.match(launchOfferUrl('https://analytics.example'), /\/billing\/launch-offer$/);
  assert.doesNotMatch(launchOfferLine(), /only \d+ left|countdown|hurry|spots remaining/i);
});
