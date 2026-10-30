import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { canonicalSourceName, mergeSourceRows } from './source-name.ts';

const cases: Record<string, string[]> = JSON.parse(
  readFileSync(new URL('../../../analytics-api/test-fixtures/source-name-cases.json', import.meta.url), 'utf8'),
);

test('frontend mapper matches the shared backend table', () => {
  for (const [name, inputs] of Object.entries(cases)) {
    for (const input of inputs) assert.strictEqual(canonicalSourceName(input), name, input);
  }
});

test('mergeSourceRows combines duplicates from an un-normalized API, keeps top host, re-sorts', () => {
  const row = (name: string, host: string, visits: number, channel = 'Referral') => ({ name, host, visits, channel, percentage: visits / 10 });
  const out = mergeSourceRows([
    row('Direct', '', 400, 'Direct'),
    row('Instagram', 'l.instagram.com', 70, 'Social Media'),
    row('YouTube', 'youtube.com', 73, 'Social Media'),
    row('copy', '', 59),
    row('youtube', '', 8),
    row('ig', '', 3),
    row('tabletennistube.com', 'tabletennistube.com', 156),
  ]);
  assert.deepStrictEqual(out.map((r) => [r.name, r.visits, r.host]), [
    ['Direct', 400, ''],
    ['tabletennistube.com', 156, 'tabletennistube.com'],
    ['YouTube', 81, 'youtube.com'],
    ['Instagram', 73, 'l.instagram.com'],
    ['Copied link', 59, ''],
  ]);
  assert.strictEqual(out[2].channel, 'Social Media');
  assert.deepStrictEqual(mergeSourceRows(out), out);
  const labels = mergeSourceRows([row('Google Ads', 'googleads.g.doubleclick.net', 5, 'Paid Search'), row('Email', '', 4, 'Email')]);
  assert.deepStrictEqual(labels.map((r) => r.name), ['Google Ads', 'Email']);
});
