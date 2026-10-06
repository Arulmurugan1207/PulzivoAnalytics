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
  'ccbot|amazonbot|applebot|duckduckbot';

const CRAWLER_UA = new RegExp(CRAWLER_UA_PATTERN, 'i');

function isCrawlerUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return false;
  return CRAWLER_UA.test(ua.replace(/cubot/gi, ''));
}

module.exports = { CRAWLER_UA_PATTERN, CRAWLER_UA, isCrawlerUserAgent };
