'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { runPipeline } = require('./memory-agg');
const { frictionDetailPipeline, shapeFrictionDetail, topPagesPipeline, shapeTopPages } = require('./aggregate');

const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36';
const ev = (name, t, data) => ({ apiKey: 'k', event_name: name, timestamp: new Date(t), user_id: data.user_id, data: Object.assign({ userAgent: ua }, data) });

test('friction details group rage clicks by page + element with samples', () => {
  const docs = [
    ev('rage_click', '2026-10-01T10:00:00Z', { user_id: 'a', page: '/x', element: 'BUTTON', text: 'Save', custom_parameters: { element_id: 'save' } }),
    ev('rage_click', '2026-10-02T10:00:00Z', { user_id: 'b', page: '/x', element: 'BUTTON', text: 'Save', custom_parameters: { element_id: 'save' } }),
    ev('rage_click', '2026-10-03T10:00:00Z', { user_id: 'a', page: '/y', element: 'DIV', text: 'Card' }),
  ];
  const shaped = shapeFrictionDetail(runPipeline(docs, frictionDetailPipeline({ apiKey: 'k' }, 'rage'))[0], 'rage');
  assert.strictEqual(shaped.totalEvents, 3);
  const top = shaped.rows[0];
  assert.strictEqual(top.page, '/x');
  assert.strictEqual(top.elementId, 'save');
  assert.strictEqual(top.count, 2);
  assert.strictEqual(top.visitors, 2);
  assert.strictEqual(top.browsers.Chrome, 2);
  assert.strictEqual(top.recent.length, 2);
  assert.strictEqual(top.recent[0].time, '2026-10-02T10:00:00.000Z');
  assert.strictEqual(top.firstSeen, '2026-10-01T10:00:00.000Z');
});

test('friction details for errors carry source file and line', () => {
  const docs = [
    ev('javascript_error', '2026-10-01T10:00:00Z', { user_id: 'a', page: '/p', message: 'x is undefined', custom_parameters: { filename: 'https://s/app.js', line: 12, column: 3 } }),
  ];
  const shaped = shapeFrictionDetail(runPipeline(docs, frictionDetailPipeline({ apiKey: 'k' }, 'errors'))[0], 'errors');
  assert.deepStrictEqual([shaped.rows[0].message, shaped.rows[0].source, shaped.rows[0].line], ['x is undefined', 'https://s/app.js', 12]);
});

test('friction details for form abandons group by form id', () => {
  const docs = [ev('form_abandon', '2026-10-01T10:00:00Z', { user_id: 'a', page: '/c', formId: 'signup', fieldsCompleted: 3 })];
  const row = shapeFrictionDetail(runPipeline(docs, frictionDetailPipeline({ apiKey: 'k' }, 'abandon'))[0], 'abandon').rows[0];
  assert.deepStrictEqual([row.form, row.avgFieldsCompleted, row.lastField], ['signup', 3, null]);
});

test('top pages return the most recent non-empty title', () => {
  const docs = [
    ev('page_view', '2026-10-01T10:00:00Z', { user_id: 'a', page: '/t', page_title: 'Old' }),
    ev('page_view', '2026-10-03T10:00:00Z', { user_id: 'a', page: '/t', page_title: 'New title' }),
    ev('page_view', '2026-10-04T10:00:00Z', { user_id: 'a', page: '/t', page_title: '' }),
    ev('page_view', '2026-10-04T10:00:00Z', { user_id: 'a', page: '/n' }),
  ];
  const shaped = shapeTopPages(runPipeline(docs, topPagesPipeline({ apiKey: 'k' })), 1, 10);
  const byPath = Object.fromEntries(shaped.pages.map((p) => [p.path, p.title]));
  assert.strictEqual(byPath['/t'], 'New title');
  assert.strictEqual(byPath['/n'], null);
});
