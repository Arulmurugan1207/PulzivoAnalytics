import test from 'node:test';
import assert from 'node:assert/strict';
import { UTM_PRESETS, buildCampaignUrl, normalizeUtmToken } from './utm-url.ts';

const empty = { url: '', source: '', medium: '', campaign: '', term: '', content: '' };

test('normalizeUtmToken trims, lowercases, and turns spaces into hyphens', () => {
  assert.equal(normalizeUtmToken('  Google Ads  '), 'google-ads');
  assert.equal(normalizeUtmToken('cpc'), 'cpc');
  assert.equal(normalizeUtmToken('Spring   Sale'), 'spring-sale');
});

test('presets match the documented source and medium pairs', () => {
  assert.deepEqual(
    UTM_PRESETS.map((preset) => [preset.source, preset.medium]),
    [
      ['google', 'cpc'],
      ['facebook', 'social'],
      ['newsletter', 'email'],
      ['x', 'social'],
      ['linkedin', 'social'],
      ['whatsapp', 'social'],
      ['youtube', 'video'],
    ],
  );
});

test('builds a campaign URL, encodes reserved characters, and keeps the hash', () => {
  const result = buildCampaignUrl({
    ...empty,
    url: 'https://example.com/a?b=1&utm_source=old#start',
    source: ' Google ',
    medium: 'CPC',
    campaign: 'Spring Sale',
    term: 'analytics tool',
    content: 'A & B',
  });
  assert.equal(result.error, '');
  assert.equal(
    result.url,
    'https://example.com/a?b=1&utm_source=google&utm_medium=cpc&utm_campaign=spring-sale&utm_term=analytics-tool&utm_content=a-%26-b#start',
  );
  assert.ok(result.hints.some((hint) => hint.includes('utm_source') && hint.includes('google')));
  assert.ok(result.hints.some((hint) => hint.includes('a-&-b')));
});

test('a worked example lowercases the campaign and omits an empty term', () => {
  const result = buildCampaignUrl({
    ...empty,
    url: 'https://example.com/pricing',
    source: 'newsletter',
    medium: 'email',
    campaign: 'spring launch',
    content: 'hero',
  });
  assert.equal(
    result.url,
    'https://example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=spring-launch&utm_content=hero',
  );
});

test('adds https when the scheme is missing and replaces existing utm params', () => {
  const result = buildCampaignUrl({
    ...empty,
    url: 'example.com/docs?utm_medium=old&ref=home',
    source: 'x',
    medium: 'social',
    campaign: 'launch',
  });
  assert.equal(
    result.url,
    'https://example.com/docs?ref=home&utm_source=x&utm_medium=social&utm_campaign=launch',
  );
});

test('rejects non-http URLs and requires a source once a URL is entered', () => {
  assert.match(buildCampaignUrl({ ...empty, url: 'javascript:alert(1)', source: 'x' }).error, /http or https/);
  const missing = buildCampaignUrl({ ...empty, url: 'https://example.com', medium: 'email' });
  assert.equal(missing.url, '');
  assert.match(missing.error, /source/);
});

test('an empty form stays quiet', () => {
  assert.deepEqual(buildCampaignUrl(empty), { url: '', error: '', hints: [] });
});
