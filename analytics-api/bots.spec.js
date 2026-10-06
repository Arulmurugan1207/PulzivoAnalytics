'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CRAWLER_UA_PATTERN, isCrawlerUserAgent } = require('./bots');

const CRAWLERS = [
  'Mediapartners-Google',
  'Mozilla/5.0 (compatible; Mediapartners-Google/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'AdsBot-Google (+http://www.google.com/adsbot.html)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
];

const HUMANS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/530.0.0.40.73;FBBV/812345678;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/530.0.0.48.74;]',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.21.88 (iPhone15,3; iOS 18_6; en_US; en; scale=3.00; 1290x2796; 812345678)',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Instagram 400.0.0.45.110 Android',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/11.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1',
  'Mozilla/5.0 (Linux; Android 12; 2201117TG) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 trill_340302 BytedanceWebview/d8a21c6',
  'Mozilla/5.0 (Linux; Android 9; CUBOT X19) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.50.0.43 (like Safari/8617.1.17.10.12, panda)',
];

test('known crawlers match', () => {
  for (const ua of CRAWLERS) assert.equal(isCrawlerUserAgent(ua), true, ua);
});

test('real browsers and in-app browsers (FBAN/FBAV, Instagram, ...) do not match', () => {
  for (const ua of HUMANS) assert.equal(isCrawlerUserAgent(ua), false, ua);
  assert.equal(isCrawlerUserAgent(''), false);
  assert.equal(isCrawlerUserAgent(undefined), false);
});

test('tracker and dashboard crawler patterns stay in sync with the API list', () => {
  const copies = [
    path.join(__dirname, '..', 'public', 'pulzivo-analytics.js'),
    path.join(__dirname, '..', 'src', 'app', 'pages', 'dashboard', 'events', 'visit-source.ts'),
  ];
  for (const file of copies) {
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(/const CRAWLER_UA_PATTERN =\s*((?:'[^']*'\s*\+?\s*)+);/);
    assert.ok(m, `CRAWLER_UA_PATTERN not found in ${file}`);
    // eslint-disable-next-line no-new-func
    const copy = Function(`return ${m[1]};`)();
    assert.equal(copy, CRAWLER_UA_PATTERN, file);
  }
});
