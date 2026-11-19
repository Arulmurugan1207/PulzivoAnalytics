import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublicUrl,
  pageSpeedEndpoint,
  pageSpeedErrorMessage,
  summarizePageSpeed,
} from './page-speed.ts';

const lab = {
  lighthouseResult: {
    finalUrl: 'https://example.com/',
    categories: { performance: { score: 0.72 } },
    audits: {
      'largest-contentful-paint': { numericValue: 3200, scoreDisplayMode: 'numeric' },
      'cumulative-layout-shift': { numericValue: 0.02, scoreDisplayMode: 'numeric' },
      'total-blocking-time': { numericValue: 180, scoreDisplayMode: 'numeric', title: 'Total Blocking Time' },
      'interaction-to-next-paint': { numericValue: 40, scoreDisplayMode: 'notApplicable' },
      'unused-javascript': {
        title: 'Reduce unused JavaScript',
        description: 'Reduce unused JavaScript. [Learn more](https://web.dev/unused-javascript/).',
        score: 0.2,
        details: { type: 'opportunity', overallSavingsMs: 800 },
      },
      'unused-css-rules': {
        title: 'Reduce unused CSS',
        score: 0.5,
        details: { type: 'opportunity', overallSavingsMs: 120 },
      },
      'offscreen-images': {
        title: 'Defer offscreen images',
        score: 0.4,
        details: { type: 'opportunity', overallSavingsMs: 400 },
      },
      'modern-image-formats': {
        title: 'Serve images in next-gen formats',
        score: 0.3,
        details: { type: 'opportunity', overallSavingsMs: 40 },
      },
      'render-blocking-resources': {
        title: 'Eliminate render-blocking resources',
        score: 1,
        details: { type: 'opportunity', overallSavingsMs: 900 },
      },
    },
  },
};

test('a lab result uses TBT as a labelled proxy when field INP is missing', () => {
  const { report, error } = summarizePageSpeed(lab, 'mobile');
  assert.equal(error, '');
  assert.ok(report);
  assert.equal(report.score, 72);
  assert.equal(report.scoreBand, 'needs-work');
  assert.equal(report.metrics[0].name, 'LCP');
  assert.equal(report.metrics[0].valueLabel, '3.20 s');
  assert.equal(report.metrics[0].band, 'needs-work');
  assert.equal(report.metrics[1].id, 'tbt');
  assert.equal(report.metrics[1].valueLabel, '180 ms');
  assert.equal(report.metrics[1].band, 'good');
  assert.match(report.metrics[1].detail, /lab proxy/);
  assert.match(report.metrics[1].detail, /not INP/);
  assert.equal(report.metrics[2].name, 'CLS');
  assert.equal(report.metrics[2].band, 'good');
  assert.deepEqual(
    report.opportunities.map((item) => item.id),
    ['unused-javascript', 'offscreen-images', 'unused-css-rules'],
  );
  assert.match(report.opportunities[0].text, /does not run on the first view/);
  assert.match(report.opportunities[0].text, /800 ms/);
  assert.doesNotMatch(report.opportunities[0].text, /Learn more/);
});

test('Chrome field INP replaces the TBT proxy and says where it came from', () => {
  const urlField = summarizePageSpeed(
    { ...lab, loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 240 } } } },
    'desktop',
  );
  assert.equal(urlField.report?.metrics[1].id, 'inp');
  assert.equal(urlField.report?.metrics[1].valueLabel, '240 ms');
  assert.equal(urlField.report?.metrics[1].band, 'needs-work');
  assert.match(urlField.report?.metrics[1].detail || '', /this URL/);
  assert.doesNotMatch(urlField.report?.metrics[1].detail || '', /lab proxy/);

  const originField = summarizePageSpeed(
    { ...lab, originLoadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 90 } } } },
    'mobile',
  );
  assert.equal(originField.report?.metrics[1].id, 'inp');
  assert.equal(originField.report?.metrics[1].band, 'good');
  assert.match(originField.report?.metrics[1].detail || '', /origin/);
});

test('the endpoint omits an empty key and adds one when configured', () => {
  const open = pageSpeedEndpoint('https://example.com/', 'mobile', '');
  assert.match(open, /pagespeedonline\/v5\/runPagespeed/);
  assert.match(open, /strategy=mobile/);
  assert.match(open, /category=performance/);
  assert.doesNotMatch(open, /[?&]key=/);
  const keyed = new URL(pageSpeedEndpoint('https://example.com/', 'desktop', ' test-key '));
  assert.equal(keyed.searchParams.get('key'), 'test-key');
  assert.equal(keyed.searchParams.get('strategy'), 'desktop');
});

test('rate limits and private URLs get a plain message', () => {
  assert.match(pageSpeedErrorMessage(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }), /rate-limiting/);
  assert.match(pageSpeedErrorMessage(429, {}), /shared quota/);
  assert.match(pageSpeedErrorMessage(403, { error: { status: 'OVER_QUERY_LIMIT' } }), /rate-limiting/);
  assert.match(pageSpeedErrorMessage(403, { error: { status: 'PERMISSION_DENIED' } }), /HTTP 403/);
  assert.match(normalizePublicUrl('http://127.0.0.1:4201').error, /private network/);
  assert.match(normalizePublicUrl('localhost/pricing').error, /localhost/);
  assert.equal(normalizePublicUrl('example.com/pricing').href, 'https://example.com/pricing');
});
