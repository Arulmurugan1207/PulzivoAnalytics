import test from 'node:test';
import assert from 'node:assert/strict';
import { planButtonDisabled, planButtonLabel } from './pricing-cta.ts';

const free = { planType: 'free', planPrice: 0 };
const pro = { planType: 'pro', planPrice: 29 };

test('logged-out visitors see a signup CTA on every plan, including Free', () => {
  const current = { currentPlanType: 'free', currentPlanPrice: 0, loggedIn: false };
  assert.equal(planButtonLabel({ ...free, ...current }), 'Get started free');
  assert.equal(planButtonLabel({ ...pro, ...current }), 'Get started free');
  assert.equal(planButtonDisabled({ ...free, ...current }), false);
  assert.equal(planButtonDisabled({ ...pro, ...current }), false);
});

test('logged-in visitors still see Current Plan on the plan they have', () => {
  const current = { currentPlanType: 'free', currentPlanPrice: 0, loggedIn: true };
  assert.equal(planButtonLabel({ ...free, ...current }), 'Current Plan');
  assert.equal(planButtonDisabled({ ...free, ...current }), true);
  assert.equal(planButtonLabel({ ...pro, ...current }), 'Upgrade');
  assert.equal(planButtonDisabled({ ...pro, ...current }), false);
});

test('a paid subscriber is not told the cheaper plan is current', () => {
  const current = { currentPlanType: 'pro', currentPlanPrice: 29, loggedIn: true };
  assert.equal(planButtonLabel({ ...free, ...current }), 'Get Started Free');
  assert.equal(planButtonLabel({ planType: 'starter', planPrice: 9, ...current }), 'Select');
  assert.equal(planButtonLabel({ ...pro, ...current }), 'Current Plan');
  assert.equal(planButtonLabel({ planType: 'enterprise', planPrice: 99, ...current }), 'Upgrade');
});
