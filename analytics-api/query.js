'use strict';

/**
 * Shared query helpers for ingest + dashboard metrics.
 * Date filters must match Cloud Run ingest timestamps, which historically
 * were stored as epoch numbers, Date objects, or ISO strings.
 */

const PAGE_VIEW_EVENTS = ['page_view', 'page_views'];
const CLICK_EVENTS = ['click', 'auto_click'];
const CONVERSION_EVENTS = ['form_submit', 'signup_completed'];
const SYSTEM_EVENTS = new Set([
  'page_view',
  'page_views',
  'click',
  'auto_click',
  'scroll',
  'page_exit',
  'visibility',
  'performance',
  'error',
  'javascript_error',
  'interaction',
  'navigation',
  'route_change',
  'promo_impression',
  'promo_click',
  'form_focus',
  'form_submit',
  'form_abandon',
  'form_blur',
  'form_error',
  'rage_click',
  'dead_click',
  'web_vital_lcp',
  'web_vital_fid',
  'web_vital_cls',
  'resource_timing',
  'session_start',
  'hover',
  'input',
  'tooltip_view',
  'article_share',
  'script_copied',
]);

const EVENT_CATEGORIES = {
  user_actions: ['click', 'auto_click', 'scroll', 'hover', 'input'],
  navigation: ['page_view', 'page_views', 'route_change', 'navigation'],
  forms: ['form_submit', 'form_abandon', 'form_focus', 'form_blur', 'form_error'],
  errors: ['error', 'rage_click', 'dead_click', 'javascript_error'],
  performance: ['web_vital_lcp', 'web_vital_fid', 'web_vital_cls', 'resource_timing', 'performance'],
};

const TIMEZONE_COUNTRY = {
  'America/New_York': 'United States',
  'America/Chicago': 'United States',
  'America/Denver': 'United States',
  'America/Los_Angeles': 'United States',
  'America/Phoenix': 'United States',
  'America/Anchorage': 'United States',
  'America/Toronto': 'Canada',
  'America/Vancouver': 'Canada',
  'America/Sao_Paulo': 'Brazil',
  'America/Mexico_City': 'Mexico',
  'Europe/London': 'United Kingdom',
  'Europe/Dublin': 'Ireland',
  'Europe/Paris': 'France',
  'Europe/Berlin': 'Germany',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Madrid': 'Spain',
  'Europe/Rome': 'Italy',
  'Europe/Stockholm': 'Sweden',
  'Europe/Warsaw': 'Poland',
  'Europe/Zurich': 'Switzerland',
  'Europe/Vienna': 'Austria',
  'Europe/Brussels': 'Belgium',
  'Europe/Lisbon': 'Portugal',
  'Europe/Prague': 'Czechia',
  'Europe/Helsinki': 'Finland',
  'Europe/Athens': 'Greece',
  'Europe/Bucharest': 'Romania',
  'Europe/Budapest': 'Hungary',
  'Europe/Moscow': 'Russia',
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'Asia/Tokyo': 'Japan',
  'Asia/Shanghai': 'China',
  'Asia/Hong_Kong': 'Hong Kong',
  'Asia/Singapore': 'Singapore',
  'Asia/Seoul': 'South Korea',
  'Asia/Bangkok': 'Thailand',
  'Asia/Jakarta': 'Indonesia',
  'Asia/Manila': 'Philippines',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Karachi': 'Pakistan',
  'Asia/Dhaka': 'Bangladesh',
  'Asia/Taipei': 'Taiwan',
  'Asia/Ho_Chi_Minh': 'Vietnam',
  'Australia/Sydney': 'Australia',
  'Australia/Melbourne': 'Australia',
  'Australia/Perth': 'Australia',
  'Pacific/Auckland': 'New Zealand',
  'Africa/Johannesburg': 'South Africa',
  'Africa/Cairo': 'Egypt',
  'Africa/Lagos': 'Nigeria',
  'Africa/Nairobi': 'Kenya',
};

const COUNTRY_ISO = {
  'United States': 'US',
  USA: 'US',
  'United Kingdom': 'GB',
  England: 'GB',
  Canada: 'CA',
  Germany: 'DE',
  France: 'FR',
  India: 'IN',
  Australia: 'AU',
  Netherlands: 'NL',
  Brazil: 'BR',
  Mexico: 'MX',
  Ireland: 'IE',
  Spain: 'ES',
  Italy: 'IT',
  Sweden: 'SE',
  Poland: 'PL',
  Switzerland: 'CH',
  Japan: 'JP',
  China: 'CN',
  Singapore: 'SG',
  'South Korea': 'KR',
  'New Zealand': 'NZ',
  'South Africa': 'ZA',
};

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim() !== '') {
      return toDate(asNum);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toMs(value) {
  const d = toDate(value);
  return d ? d.getTime() : null;
}

function parseDateRange(req) {
  const { startDate, endDate } = (req && req.query) || {};
  const start = startDate ? toDate(startDate) : null;
  const end = endDate ? toDate(endDate) : null;
  if (!start && !end) return null;
  return { start, end };
}

/**
 * Match timestamp whether it was stored as Date, epoch ms/seconds, or ISO string.
 * Also accepts createdAt / receivedAt for docs missing timestamp.
 */
function buildDateFilter(req) {
  const range = parseDateRange(req);
  if (!range) return {};
  const clauses = [];
  const addRange = (field, gte, lte) => {
    const bound = {};
    if (gte != null) bound.$gte = gte;
    if (lte != null) bound.$lte = lte;
    if (Object.keys(bound).length) clauses.push({ [field]: bound });
  };

  if (range.start || range.end) {
    addRange('timestamp', range.start || undefined, range.end || undefined);
    addRange('createdAt', range.start || undefined, range.end || undefined);
    addRange('receivedAt', range.start || undefined, range.end || undefined);
    if (range.start || range.end) {
      const startMs = range.start ? range.start.getTime() : undefined;
      const endMs = range.end ? range.end.getTime() : undefined;
      addRange('timestamp', startMs, endMs);
      if (startMs != null || endMs != null) {
        const startSec = startMs != null ? startMs / 1000 : undefined;
        const endSec = endMs != null ? endMs / 1000 : undefined;
        addRange('timestamp', startSec, endSec);
      }
      addRange(
        'timestamp',
        range.start ? range.start.toISOString() : undefined,
        range.end ? range.end.toISOString() : undefined,
      );
    }
  }
  return clauses.length ? { $or: clauses } : {};
}

function composeMatch(apiKey, req, extra = {}) {
  const parts = [];
  if (apiKey) parts.push({ apiKey });
  const date = buildDateFilter(req);
  if (Object.keys(date).length) parts.push(date);
  if (extra && Object.keys(extra).length) parts.push(extra);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

function requireApiKey(req, res) {
  const apiKey = String(
    (req.query && (req.query.apiKey || req.query.apikey)) ||
    req.headers['x-api-key'] ||
    '',
  ).trim();
  if (!apiKey || apiKey === 'unknown') {
    res.status(400).json({ error: 'apiKey query param required' });
    return null;
  }
  return apiKey;
}

function eventTime(doc) {
  return toDate(doc?.timestamp) || toDate(doc?.createdAt) || toDate(doc?.receivedAt);
}

function eventPage(doc) {
  const page = doc?.page || doc?.data?.page || '/';
  return typeof page === 'string' && page.trim() ? page : '/';
}

function countryOf(doc) {
  const data = doc?.data || {};
  const raw = data.country || data.country_name || data.countryName || data.geo?.country || doc?.country;
  if (raw && String(raw).trim() && String(raw).toLowerCase() !== 'unknown') {
    return String(raw).trim();
  }
  const tz = data.timezone || data.timeZone;
  if (tz && TIMEZONE_COUNTRY[tz]) return TIMEZONE_COUNTRY[tz];
  return 'Unknown';
}

function countryFlag(country) {
  const iso = COUNTRY_ISO[country] || (country && country.length === 2 ? country.toUpperCase() : '');
  if (!iso || iso.length !== 2) return '🏳️';
  const chars = [...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...chars);
}

function deviceLabel(data = {}) {
  const raw = data.device || data.device_type || data.deviceType;
  if (raw) {
    const s = String(raw).toLowerCase();
    if (s.includes('tablet')) return 'Tablet';
    if (s.includes('mobile') || s.includes('phone')) return 'Mobile';
    if (s.includes('desktop') || s.includes('laptop')) return 'Desktop';
  }
  if (data.mobile === true) return 'Mobile';
  const ua = String(data.userAgent || data.ua || '');
  if (/ipad|tablet|kindle/i.test(ua)) return 'Tablet';
  if (/mobile|android|iphone|ipod|webos|blackberry/i.test(ua)) return 'Mobile';
  if (ua || data.platform) return 'Desktop';
  return 'Unknown';
}

function browserName(data = {}) {
  const brands = String(data.brands || '');
  const ua = String(data.userAgent || data.ua || brands);
  if (/edg/i.test(ua)) return 'Edge';
  if (/opr|opera/i.test(ua)) return 'Opera';
  if (/chrome|crios|chromium/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome|crios|chromium/i.test(ua)) return 'Safari';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (ua) return 'Other';
  return 'Unknown';
}

function osName(data = {}) {
  const platform = String(data.platform || '');
  const ua = String(data.userAgent || data.ua || platform);
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod|ios/i.test(ua)) return 'iOS';
  if (/mac os|macintosh|macintel/i.test(ua) || /mac/i.test(platform)) return 'macOS';
  if (/windows/i.test(ua) || /win/i.test(platform)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  if (platform) return platform;
  return 'Unknown';
}

function percent(part, total, digits = 2) {
  if (!total) return 0;
  const value = (part / total) * 100;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function trendPct(current, previous) {
  if (previous == null || previous === 0) {
    return current ? 100 : 0;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function vitalRating(name, value) {
  if (value == null || Number.isNaN(value)) return 'no-data';
  if (name === 'LCP') {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-improvement';
    return 'poor';
  }
  if (name === 'FID') {
    if (value <= 100) return 'good';
    if (value <= 300) return 'needs-improvement';
    return 'poor';
  }
  if (name === 'CLS') {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'needs-improvement';
    return 'poor';
  }
  return 'no-data';
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function avg(nums) {
  const list = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function classifySource(data = {}) {
  const attr = data.attribution && typeof data.attribution === 'object' ? data.attribution : {};
  const utmSource = attr.utm_source || data.utm_source;
  const utmMedium = String(attr.utm_medium || data.utm_medium || '').toLowerCase();
  if (utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'paid') return 'Paid Search';
  if (utmMedium === 'email') return 'Email';
  if (utmMedium === 'social') return 'Social Media';
  if (utmSource) {
    const s = String(utmSource).toLowerCase();
    if (/google|bing|duckduckgo|yahoo|baidu/.test(s)) {
      return utmMedium === 'cpc' ? 'Paid Search' : 'Organic Search';
    }
    if (SOCIAL_HOST.test(s)) return 'Social Media';
    return 'Referral';
  }
  const ref = attr.referrer_domain || hostnameOf(attr.referrer || data.referrer);
  if (!ref) return 'Direct';
  if (/google|bing|duckduckgo|yahoo|baidu/.test(ref)) return 'Organic Search';
  if (SOCIAL_HOST.test(ref)) return 'Social Media';
  return 'Referral';
}

const SOCIAL_HOST = /facebook|fb\.me|fb\.com|twitter|instagram|linkedin|reddit|tiktok|youtube|t\.co|x\.com|whatsapp|wa\.me|telegram|t\.me|snapchat|pinterest|threads\.net/;

const NAMED_REFERRERS = [
  [/(^|\.)facebook\.com$|^fb\.com$|^fb\.me$/, 'Facebook'],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, 'WhatsApp'],
  [/(^|\.)twitter\.com$|^t\.co$|^x\.com$/, 'X'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)reddit\.com$|^redd\.it$/, 'Reddit'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)pinterest\.com$|^pin\.it$/, 'Pinterest'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
  [/(^|\.)telegram\.org$|^t\.me$/, 'Telegram'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'Yahoo'],
  [/(^|\.)baidu\.com$/, 'Baidu'],
  [/news\.ycombinator\.com$/, 'Hacker News'],
  [/(^|\.)github\.com$/, 'GitHub'],
];

function namedReferrer(value) {
  const host = String(value || '').replace(/^www\./, '').toLowerCase();
  if (!host) return '';
  for (const [pattern, name] of NAMED_REFERRERS) {
    if (pattern.test(host)) return name;
  }
  return '';
}

/** The actual place a visit came from, plus the bucket that place belongs to. */
function referrerIdentity(data = {}) {
  const attr = data.attribution && typeof data.attribution === 'object' ? data.attribution : {};
  const channel = classifySource(data);
  const host = String(attr.referrer_domain || hostnameOf(attr.referrer || data.referrer) || '').replace(/^www\./, '');
  const utm = String(attr.utm_source || data.utm_source || '').trim();
  if (channel === 'Direct' && !host && !utm) {
    return { name: 'Direct', channel: 'Direct', host: '' };
  }
  const name = namedReferrer(host) || namedReferrer(utm) || host || utm || channel;
  return { name, channel, host };
}

function hostnameOf(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(url).replace(/^www\./, '').toLowerCase();
  }
}

function formatHistoryEvent(doc) {
  const data = doc.data && typeof doc.data === 'object' ? doc.data : {};
  const ts = eventTime(doc);
  return {
    id: doc._id != null ? String(doc._id) : `${doc.apiKey || ''}-${ts ? ts.getTime() : ''}-${doc.event_name || ''}`,
    event_name: doc.event_name || 'unknown',
    user_id: doc.user_id || data.user_id || null,
    session_id: doc.session_id || data.session_id || null,
    timestamp: ts ? ts.toISOString() : null,
    page: eventPage(doc),
    country: countryOf(doc),
    timezone: data.timezone || null,
    device: deviceLabel(data),
    data,
  };
}

function sessionIdOf(doc) {
  return doc?.session_id || doc?.data?.session_id || null;
}

function userIdOf(doc) {
  return doc?.user_id || doc?.data?.user_id || null;
}

function isPageView(name) {
  return PAGE_VIEW_EVENTS.includes(name);
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function previousRange(req) {
  const range = parseDateRange(req);
  if (!range || !range.start || !range.end) return null;
  const duration = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - duration - 1),
    end: new Date(range.start.getTime() - 1),
  };
}

function reqWithRange(start, end) {
  return {
    query: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    },
  };
}

module.exports = {
  PAGE_VIEW_EVENTS,
  CLICK_EVENTS,
  CONVERSION_EVENTS,
  SYSTEM_EVENTS,
  EVENT_CATEGORIES,
  toDate,
  toMs,
  parseDateRange,
  buildDateFilter,
  composeMatch,
  requireApiKey,
  eventTime,
  eventPage,
  countryOf,
  countryFlag,
  deviceLabel,
  browserName,
  osName,
  percent,
  trendPct,
  vitalRating,
  percentile,
  avg,
  classifySource,
  referrerIdentity,
  hostnameOf,
  formatHistoryEvent,
  sessionIdOf,
  userIdOf,
  isPageView,
  clampInt,
  previousRange,
  reqWithRange,
};
