import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackingSnippet, hasFirstEvent, nextState, firstEventSummary, DEFAULT_POLL } from './first-event.logic.ts';

test('snippet embeds the key', () => {
  assert.equal(trackingSnippet('PULZ-PRD-ABC'),
    '<script src="https://cdn.pulzivo.com/pulzivo-analytics.min.js" data-api-key="PULZ-PRD-ABC"></script>');
  assert.match(trackingSnippet(''), /YOUR_API_KEY/);
});

test('hasFirstEvent reads total or events', () => {
  assert.equal(hasFirstEvent({ total: 0, events: [] }), false);
  assert.equal(hasFirstEvent({ total: 3, events: [] }), true);
  assert.equal(hasFirstEvent({ events: [{}] }), true);
  assert.equal(hasFirstEvent(null), false);
});

test('nextState stops polling when found or out of attempts', () => {
  assert.equal(nextState(true, 1), 'found');
  assert.equal(nextState(false, 1), 'waiting');
  assert.equal(nextState(false, DEFAULT_POLL.maxAttempts), 'idle');
});

test('firstEventSummary', () => {
  assert.equal(firstEventSummary({ events: [{ event_name: 'page_view', page: '/' }] }), 'page_view on /');
  assert.equal(firstEventSummary({ events: [] }), '');
});
