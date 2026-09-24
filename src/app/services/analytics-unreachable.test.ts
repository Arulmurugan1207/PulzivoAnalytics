import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyticsUnreachableConsole,
  metricReadFailureMessage,
} from './analytics-unreachable.ts';

test('production pulzivo.com does not mention npm start', () => {
  const ui = metricReadFailureMessage('Couldn’t load metrics for this site.', 0, {
    production: true,
    hostname: 'pulzivo.com',
  });
  assert.match(ui, /CORS or the analytics service is unreachable/);
  assert.doesNotMatch(ui, /npm start/);

  const log = analyticsUnreachableConsole('https://example.run.app/analytics/metrics', {
    production: true,
    hostname: 'www.pulzivo.com',
  });
  assert.match(log, /blocked by CORS or unreachable/);
  assert.doesNotMatch(log, /npm start/);
});

test('development and localhost keep the proxy hint', () => {
  const dev = metricReadFailureMessage('Couldn’t load metrics for this site.', 0, {
    production: false,
    hostname: 'pulzivo.com',
  });
  assert.match(dev, /npm start/);

  const localProdBuild = analyticsUnreachableConsole('', {
    production: true,
    hostname: 'localhost',
  });
  assert.match(localProdBuild, /npm start proxies \/analytics to Cloud Run/);
});

test('http errors still name the status', () => {
  const message = metricReadFailureMessage('Couldn’t load sessions.', 401, {
    production: true,
    hostname: 'pulzivo.com',
  });
  assert.match(message, /returned 401/);
  assert.doesNotMatch(message, /npm start/);
});
