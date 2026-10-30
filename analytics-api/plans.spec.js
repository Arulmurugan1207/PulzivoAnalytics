'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PLAN_FEATURES } = require('./plans');

function planMapFrom(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const m = src.match(/PLAN_FEATURES[^=]*=\s*(\{[\s\S]*?\n\s*\});?/);
  assert.ok(m, `PLAN_FEATURES not found in ${rel}`);
  // eslint-disable-next-line no-new-func
  return Function(`return (${m[1]});`)();
}

const sorted = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));

test('tracker plan map matches analytics-api/plans.js exactly', () => {
  assert.deepEqual(sorted(planMapFrom('public/pulzivo-analytics.js')), sorted(PLAN_FEATURES));
});

// Dashboard maps carry a few dashboard-only keys (heatmap_data, …); every
// tracker feature that changes what a plan shows must agree.
const GATED = ['scroll_depth', 'page_exit', 'web_vitals', 'error_tracking', 'unique_visitors', 'sessions',
  'utm_attribution', 'form_tracking', 'rage_clicks', 'dead_clicks'];
for (const rel of ['src/app/pages/dashboard/overview/overview.ts', 'src/app/pages/dashboard/settings/settings.ts']) {
  test(`${rel} plan gates match analytics-api/plans.js`, () => {
    const map = planMapFrom(rel);
    for (const plan of Object.keys(PLAN_FEATURES)) {
      for (const f of GATED) {
        assert.equal(map[plan].includes(f), PLAN_FEATURES[plan].includes(f), `${plan}.${f}`);
      }
    }
  });
}

test('Web Vitals and scroll depth on every plan; error tracking from Pro', () => {
  for (const plan of Object.keys(PLAN_FEATURES)) {
    assert.ok(PLAN_FEATURES[plan].includes('web_vitals'), plan);
    assert.ok(PLAN_FEATURES[plan].includes('scroll_depth'), plan);
  }
  assert.ok(!PLAN_FEATURES.starter.includes('error_tracking'));
  assert.ok(PLAN_FEATURES.pro.includes('error_tracking'));
});
