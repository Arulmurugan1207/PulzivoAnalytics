'use strict';

/**
 * Known crawler / headless user agents. Events from these never count in stats.
 *
 * KEEP IN SYNC with CRAWLER_UA_PATTERN in public/pulzivo-analytics.js
 * (bots.spec.js fails if the two sources drift).
 *
 * Deliberately does NOT match in-app browsers (FBAN/FBAV, Instagram, Twitter,
 * LinkedInApp, Snapchat, TikTok/Bytedance WebView): those are real people.
 * `bot` only matches as a word ending ("Googlebot/", "AdsBot-Google", "bingbot"),
 * and the Cubot phone brand is stripped before testing. Generic HTTP clients
 * (curl, axios, node-fetch) are not listed so server-side forwarders keep working.
 */
const CRAWLER_UA_PATTERN =
  'bot\\b|crawl|spider|slurp|mediapartners-google|adsbot|googlebot|google-inspectiontool|' +
  'storebot-google|feedfetcher|google-read-aloud|apis-google|bingpreview|facebookexternalhit|' +
  'facebookcatalog|meta-externalagent|headlesschrome|phantomjs|lighthouse|pagespeed|ptst\\/|' +
  'gtmetrix|pingdom|uptimerobot|' +
  'scrapy|bytespider|petalbot|baiduspider|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|' +
  'ccbot|amazonbot|applebot|duckduckbot|jsdom|cypress\\/';

const CRAWLER_UA = new RegExp(CRAWLER_UA_PATTERN, 'i');

function isCrawlerUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return false;
  return CRAWLER_UA.test(ua.replace(/cubot/gi, ''));
}

/**
 * Per-visitor event-rate guard (per instance, in memory). A real browser sends
 * a batch every few seconds; scripted traffic replaying one visitor ID sends
 * hundreds of events a minute. Events beyond `limit` per visitor in a
 * `windowMs` window are dropped (the tracker still gets 200).
 */
function createRateGuard({ limit = 300, windowMs = 60000, maxVisitors = 50000, now = () => Date.now() } = {}) {
  const seen = new Map();
  const visitorKey = (event) => {
    const uid = event?.user_id || event?.data?.user_id || event?.session_id || event?.data?.session_id;
    return uid ? `${event?.apiKey || ''}|${uid}` : '';
  };
  return function filter(events) {
    const list = Array.isArray(events) ? events : [];
    const t = now();
    if (seen.size > maxVisitors) {
      for (const [key, entry] of seen) if (t - entry.start >= windowMs) seen.delete(key);
      if (seen.size > maxVisitors) seen.clear();
    }
    const kept = [];
    for (const event of list) {
      const key = visitorKey(event);
      if (!key) { kept.push(event); continue; }
      let entry = seen.get(key);
      if (!entry || t - entry.start >= windowMs) {
        entry = { start: t, n: 0 };
        seen.set(key, entry);
      }
      entry.n += 1;
      if (entry.n <= limit) kept.push(event);
    }
    return { kept, dropped: list.length - kept.length };
  };
}

module.exports = { CRAWLER_UA_PATTERN, CRAWLER_UA, isCrawlerUserAgent, createRateGuard };
