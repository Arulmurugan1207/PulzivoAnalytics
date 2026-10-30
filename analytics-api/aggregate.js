'use strict';

/**
 * Dashboard metrics run as MongoDB aggregations.
 * Node receives grouped rows, not every matching event.
 * Date bounds still come from buildDateFilter so numeric, Date, and ISO timestamps match.
 */

const {
  PAGE_VIEW_EVENTS,
  CLICK_EVENTS,
  CONVERSION_EVENTS,
  SYSTEM_EVENTS,
  EVENT_CATEGORIES,
  TIMEZONE_COUNTRY,
  composeMatch,
  reqWithRange,
  percent,
  countryFlag,
  isoForCountry,
  vitalRating,
  classifySource,
} = require('./query');
const { countryNameForIso } = require('./geo');

const PAGE_VIEWS = [...PAGE_VIEW_EVENTS];
const CONVERSIONS = [...CONVERSION_EVENTS];
const CLICKS = [...CLICK_EVENTS];
const SYSTEM_NAMES = [...SYSTEM_EVENTS];

async function aggregate(col, pipeline) {
  const cursor = col.aggregate(pipeline, { allowDiskUse: true });
  if (cursor && typeof cursor.toArray === 'function') return cursor.toArray();
  if (Array.isArray(cursor)) return cursor;
  throw new Error('aggregate did not return a cursor');
}

function asString(expr) {
  return { $convert: { input: expr, to: 'string', onError: '', onNull: '' } };
}

function numericOrNull(expr) {
  return { $convert: { input: expr, to: 'double', onError: null, onNull: null } };
}

function nullIfEmpty(stringExpr) {
  return {
    $cond: [{ $gt: [{ $strLenCP: stringExpr }, 0] }, stringExpr, null],
  };
}

function firstPresentString(fieldExprs) {
  let expr = null;
  for (let i = fieldExprs.length - 1; i >= 0; i -= 1) {
    expr = {
      $let: {
        vars: { raw: fieldExprs[i] },
        in: {
          $let: {
            vars: {
              s: {
                $switch: {
                  branches: [
                    { case: { $eq: [{ $type: '$$raw' }, 'string'] }, then: { $trim: { input: '$$raw' } } },
                    {
                      case: { $in: [{ $type: '$$raw' }, ['double', 'int', 'long', 'decimal']] },
                      then: { $toString: '$$raw' },
                    },
                  ],
                  default: '',
                },
              },
            },
            in: {
              $cond: [{ $gt: [{ $strLenCP: '$$s' }, 0] }, '$$s', expr],
            },
          },
        },
      },
    };
  }
  return expr;
}

function firstStringOr(fieldExprs, fallback) {
  return { $ifNull: [firstPresentString(fieldExprs), fallback] };
}

function instantExpr(field) {
  const type = { $type: field };
  return {
    $switch: {
      branches: [
        { case: { $eq: [type, 'date'] }, then: field },
        {
          case: { $in: [type, ['double', 'int', 'long', 'decimal']] },
          then: {
            $cond: [
              { $lt: [field, 100000000000] },
              { $toDate: { $multiply: [field, 1000] } },
              { $toDate: field },
            ],
          },
        },
        {
          case: { $eq: [type, 'string'] },
          then: {
            $let: {
              vars: { s: { $trim: { input: field } } },
              in: {
                $cond: [
                  { $regexMatch: { input: '$$s', regex: '^-?\\d+(\\.\\d+)?$' } },
                  {
                    $cond: [
                      { $lt: [{ $toDouble: '$$s' }, 100000000000] },
                      { $toDate: { $multiply: [{ $toDouble: '$$s' }, 1000] } },
                      { $toDate: { $toDouble: '$$s' } },
                    ],
                  },
                  { $convert: { input: '$$s', to: 'date', onError: null, onNull: null } },
                ],
              },
            },
          },
        },
      ],
      default: null,
    },
  };
}

function eventTimeExpr() {
  return {
    $ifNull: [instantExpr('$timestamp'), { $ifNull: [instantExpr('$createdAt'), instantExpr('$receivedAt')] }],
  };
}

function sessionIdExpr() {
  return firstPresentString(['$session_id', '$data.session_id']);
}

function userIdExpr() {
  return firstPresentString(['$user_id', '$data.user_id']);
}

function pagePick(field) {
  return {
    $let: {
      vars: { raw: field },
      in: {
        $cond: [
          {
            $and: [
              { $eq: [{ $type: '$$raw' }, 'string'] },
              { $gt: [{ $strLenCP: { $trim: { input: '$$raw' } } }, 0] },
            ],
          },
          '$$raw',
          null,
        ],
      },
    },
  };
}

function pageExpr() {
  return { $ifNull: [pagePick('$page'), { $ifNull: [pagePick('$data.page'), '/'] }] };
}

function countryExpr() {
  const raw = {
    $ifNull: [
      '$data.country',
      { $ifNull: [
        '$data.country_name',
        { $ifNull: ['$data.countryName', { $ifNull: ['$data.geo.country', '$country'] }] },
      ] },
    ],
  };
  const branches = Object.entries(TIMEZONE_COUNTRY).map(([zone, country]) => ({
    case: { $eq: ['$$tz', zone] },
    then: country,
  }));
  return {
    $let: {
      vars: { raw, tz: { $ifNull: ['$data.timezone', { $ifNull: ['$data.timeZone', { $ifNull: ['$timezone', '$timeZone'] }] }] } },
      in: {
        $cond: [
          {
            $and: [
              { $eq: [{ $type: '$$raw' }, 'string'] },
              { $gt: [{ $strLenCP: { $trim: { input: '$$raw' } } }, 0] },
              { $ne: [{ $toLower: { $trim: { input: '$$raw' } } }, 'unknown'] },
            ],
          },
          { $trim: { input: '$$raw' } },
          { $switch: { branches, default: 'Unknown' } },
        ],
      },
    },
  };
}

function regexMatchExpr(inputExpr, pattern, insensitive = false) {
  const spec = { input: inputExpr, regex: pattern };
  if (insensitive) spec.options = 'i';
  return { $regexMatch: spec };
}

function deviceExpr() {
  const rawLower = { $toLower: asString({ $ifNull: ['$data.device', { $ifNull: ['$data.device_type', '$data.deviceType'] }] }) };
  const ua = { $toLower: asString({ $ifNull: ['$data.userAgent', '$data.ua'] }) };
  const platform = asString('$data.platform');
  return {
    $switch: {
      branches: [
        { case: regexMatchExpr(rawLower, 'tablet', true), then: 'Tablet' },
        { case: { $or: [regexMatchExpr(rawLower, 'mobile', true), regexMatchExpr(rawLower, 'phone', true)] }, then: 'Mobile' },
        { case: { $or: [regexMatchExpr(rawLower, 'desktop', true), regexMatchExpr(rawLower, 'laptop', true)] }, then: 'Desktop' },
        { case: { $eq: ['$data.mobile', true] }, then: 'Mobile' },
        { case: regexMatchExpr(ua, 'ipad|tablet|kindle', true), then: 'Tablet' },
        { case: regexMatchExpr(ua, 'mobile|android|iphone|ipod|webos|blackberry', true), then: 'Mobile' },
        {
          case: { $or: [{ $gt: [{ $strLenCP: ua }, 0] }, { $gt: [{ $strLenCP: platform }, 0] }] },
          then: 'Desktop',
        },
      ],
      default: 'Unknown',
    },
  };
}

function browserExpr() {
  const ua = {
    $toLower: asString({
      $ifNull: ['$data.userAgent', { $ifNull: ['$data.ua', '$data.brands'] }],
    }),
  };
  return {
    $switch: {
      branches: [
        { case: regexMatchExpr(ua, 'edg', true), then: 'Edge' },
        { case: regexMatchExpr(ua, 'opr|opera', true), then: 'Opera' },
        { case: regexMatchExpr(ua, 'chrome|crios|chromium', true), then: 'Chrome' },
        {
          case: {
            $and: [
              regexMatchExpr(ua, 'safari', true),
              { $not: [regexMatchExpr(ua, 'chrome|crios|chromium', true)] },
            ],
          },
          then: 'Safari',
        },
        { case: regexMatchExpr(ua, 'firefox|fxios', true), then: 'Firefox' },
        { case: { $gt: [{ $strLenCP: ua }, 0] }, then: 'Other' },
      ],
      default: 'Unknown',
    },
  };
}

function osExpr() {
  const platformRaw = asString('$data.platform');
  const platform = { $toLower: platformRaw };
  const ua = { $toLower: asString({ $ifNull: ['$data.userAgent', { $ifNull: ['$data.ua', '$data.platform'] }] }) };
  return {
    $switch: {
      branches: [
        { case: regexMatchExpr(ua, 'android', true), then: 'Android' },
        { case: regexMatchExpr(ua, 'iphone|ipad|ipod|ios', true), then: 'iOS' },
        {
          case: { $or: [regexMatchExpr(ua, 'mac os|macintosh|macintel', true), regexMatchExpr(platform, 'mac', true)] },
          then: 'macOS',
        },
        {
          case: { $or: [regexMatchExpr(ua, 'windows', true), regexMatchExpr(platform, 'win', true)] },
          then: 'Windows',
        },
        { case: regexMatchExpr(ua, 'linux', true), then: 'Linux' },
        { case: { $gt: [{ $strLenCP: platformRaw }, 0] }, then: platformRaw },
      ],
      default: 'Unknown',
    },
  };
}

function hostnameExpr(expr) {
  return {
    $let: {
      vars: { u: { $toLower: asString(expr) } },
      in: {
        $cond: [
          { $regexMatch: { input: '$$u', regex: '^[a-z][a-z0-9+.-]*://' } },
          {
            $let: {
              vars: {
                rest: { $arrayElemAt: [{ $split: ['$$u', '://'] }, 1] },
              },
              in: {
                $let: {
                  vars: {
                    hostport: { $arrayElemAt: [{ $split: [{ $ifNull: ['$$rest', ''] }, '/'] }, 0] },
                  },
                  in: {
                    $let: {
                      vars: {
                        host: { $arrayElemAt: [{ $split: [{ $ifNull: ['$$hostport', ''] }, ':'] }, 0] },
                      },
                      in: {
                        $cond: [
                          { $regexMatch: { input: { $ifNull: ['$$host', ''] }, regex: '^www\\.' } },
                          { $substrCP: [{ $ifNull: ['$$host', ''] }, 4, 10000] },
                          { $ifNull: ['$$host', ''] },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          {
            $cond: [
              { $regexMatch: { input: '$$u', regex: '^www\\.' } },
              { $substrCP: ['$$u', 4, 10000] },
              '$$u',
            ],
          },
        ],
      },
    },
  };
}

function sourceExpr() {
  return {
    $let: {
      vars: {
        medium: { $toLower: asString({ $ifNull: ['$data.attribution.utm_medium', '$data.utm_medium'] }) },
        utmSource: { $toLower: asString({ $ifNull: ['$data.attribution.utm_source', '$data.utm_source'] }) },
        refDomain: asString('$data.attribution.referrer_domain'),
        refUrl: { $ifNull: ['$data.attribution.referrer', '$data.referrer'] },
      },
      in: {
        $let: {
          vars: {
            ref: {
              $cond: [
                { $gt: [{ $strLenCP: '$$refDomain' }, 0] },
                '$$refDomain',
                hostnameExpr('$$refUrl'),
              ],
            },
          },
          in: {
            $switch: {
              branches: [
                { case: { $in: ['$$medium', ['cpc', 'ppc', 'paid']] }, then: 'Paid Search' },
                { case: { $eq: ['$$medium', 'email'] }, then: 'Email' },
                { case: { $eq: ['$$medium', 'social'] }, then: 'Social Media' },
                {
                  case: {
                    $and: [
                      { $gt: [{ $strLenCP: '$$utmSource' }, 0] },
                      regexMatchExpr('$$utmSource', 'google|bing|duckduckgo|yahoo|baidu'),
                    ],
                  },
                  then: 'Organic Search',
                },
                {
                  case: {
                    $and: [
                      { $gt: [{ $strLenCP: '$$utmSource' }, 0] },
                      regexMatchExpr('$$utmSource', 'facebook|twitter|instagram|linkedin|reddit|tiktok|youtube|t\\.co'),
                    ],
                  },
                  then: 'Social Media',
                },
                { case: { $gt: [{ $strLenCP: '$$utmSource' }, 0] }, then: 'Referral' },
                { case: { $lte: [{ $strLenCP: '$$ref' }, 0] }, then: 'Direct' },
                { case: regexMatchExpr('$$ref', 'google|bing|duckduckgo|yahoo|baidu'), then: 'Organic Search' },
                {
                  case: regexMatchExpr('$$ref', 'facebook|twitter|instagram|linkedin|reddit|tiktok|youtube|t\\.co'),
                  then: 'Social Media',
                },
              ],
              default: 'Referral',
            },
          },
        },
      },
    },
  };
}

function normalizedFields() {
  return {
    _t: eventTimeExpr(),
    _sid: sessionIdExpr(),
    _uid: userIdExpr(),
    _page: pageExpr(),
    _pv: { $cond: [{ $in: ['$event_name', PAGE_VIEWS] }, 1, 0] },
    _eng: engExpr(),
    _conv: { $cond: [{ $in: ['$event_name', CONVERSIONS] }, 1, 0] },
  };
}

// Engagement (time on page, scroll depth) is reported on page_exit, not on the page_view
// itself. Older trackers sent page_view with time_on_page 0 and the scroll depth at load.
const ENGAGEMENT_EVENTS = ['page_exit'];

function engExpr() {
  return { $cond: [{ $in: ['$event_name', ENGAGEMENT_EVENTS] }, 1, 0] };
}

/** One row per page view: page_exit events from the same view share data.view_id. */
function viewKeyExpr() {
  return { $ifNull: ['$data.view_id', '$_id'] };
}

function scrollExpr() {
  const n = numericOrNull('$data.scroll_depth');
  return {
    $cond: [{ $and: [{ $eq: ['$_eng', 1] }, { $ne: [n, null] }, { $gte: [n, 0] }] }, { $cond: [{ $gt: [n, 100] }, 100, n] }, null],
  };
}

// time_on_page is milliseconds on the wire; the dashboard shows seconds.
function timeOnPageExpr() {
  const n = numericOrNull('$data.time_on_page');
  return {
    $cond: [{ $and: [{ $eq: ['$_eng', 1] }, { $gt: [n, 0] }] }, { $divide: [n, 1000] }, null],
  };
}

function derivedFields() {
  return {
    _who: { $ifNull: ['$_uid', '$_sid'] },
    _scroll: scrollExpr(),
    _top: timeOnPageExpr(),
    _visit: numericOrNull('$data.visit_count'),
  };
}

function sessionGroupStage() {
  const pvKey = {
    $cond: [{ $eq: ['$_pv', 1] }, { t: '$_t', p: '$_page' }, null],
  };
  return {
    $group: {
      _id: '$_sid',
      start: { $min: '$_t' },
      end: { $max: '$_t' },
      pageViews: { $sum: '$_pv' },
      visitCount: { $max: { $ifNull: ['$_visit', numericOrNull('$data.visit_count')] } },
      entryKey: { $min: pvKey },
      exitKey: { $max: pvKey },
      // Earliest/latest event of any type, via $min/$max on {t, p} so no raw-event $sort is needed.
      fallbackKey0: { $min: { t: '$_t', p: '$_page' } },
      fallbackKey1: { $max: { t: '$_t', p: '$_page' } },
    },
  };
}

function sessionDecorateStage() {
  return {
    $addFields: {
      dur: {
        $cond: [
          {
            $and: [
              { $eq: [{ $type: '$start' }, 'date'] },
              { $eq: [{ $type: '$end' }, 'date'] },
              { $gt: ['$end', '$start'] },
            ],
          },
          { $divide: [{ $subtract: ['$end', '$start'] }, 1000] },
          0,
        ],
      },
      entryPage: { $ifNull: ['$entryKey.p', { $ifNull: ['$fallbackKey0.p', '/'] }] },
      exitPage: { $ifNull: ['$exitKey.p', { $ifNull: ['$fallbackKey1.p', { $ifNull: ['$entryKey.p', '/'] }] }] },
    },
  };
}

function sessionSummaryGroup() {
  return {
    $group: {
      _id: null,
      total: { $sum: 1 },
      bounced: { $sum: { $cond: [{ $lte: ['$pageViews', 1] }, 1, 0] } },
      pagesSum: { $sum: '$pageViews' },
      durSum: { $sum: { $cond: [{ $gt: ['$dur', 0] }, '$dur', 0] } },
      durN: { $sum: { $cond: [{ $gt: ['$dur', 0] }, 1, 0] } },
      returning: { $sum: { $cond: [{ $gt: ['$visitCount', 1] }, 1, 0] } },
      fresh: { $sum: { $cond: [{ $not: [{ $gt: ['$visitCount', 1] }] }, 1, 0] } },
    },
  };
}

function coreMetricsPipeline(match) {
  return [
    { $match: match },
    { $addFields: normalizedFields() },
    { $addFields: derivedFields() },
    // Slim before $facet. $facet cannot spill to disk and is capped at 100MB.
    {
      $project: {
        _t: 1,
        _sid: 1,
        _uid: 1,
        _page: 1,
        _pv: 1,
        _eng: 1,
        _view: viewKeyExpr(),
        _conv: 1,
        _who: 1,
        _scroll: 1,
        _top: 1,
        _visit: 1,
      },
    },
    {
      $facet: {
        pageStats: [
          { $match: { _pv: 1 } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        engagement: [
          { $match: { _eng: 1 } },
          { $group: { _id: '$_view', scroll: { $max: '$_scroll' }, top: { $max: '$_top' } } },
          {
            $group: {
              _id: null,
              scrollSum: { $sum: { $cond: [{ $ne: ['$scroll', null] }, '$scroll', 0] } },
              scrollN: { $sum: { $cond: [{ $ne: ['$scroll', null] }, 1, 0] } },
              timeSum: { $sum: { $cond: [{ $ne: ['$top', null] }, '$top', 0] } },
              timeN: { $sum: { $cond: [{ $ne: ['$top', null] }, 1, 0] } },
            },
          },
        ],
        uniqueUsers: [
          { $match: { _pv: 1, _uid: { $nin: [null, ''] } } },
          { $group: { _id: '$_uid' } },
          { $count: 'n' },
        ],
        conversions: [
          { $match: { _conv: 1, _who: { $nin: [null, ''] } } },
          { $group: { _id: '$_who' } },
          { $count: 'n' },
        ],
        sessions: [
          { $match: { _sid: { $nin: [null, ''] } } },
          sessionGroupStage(),
          sessionDecorateStage(),
          sessionSummaryGroup(),
        ],
      },
    },
  ];
}

function shapeCoreMetrics(facet, liveCount = 0) {
  const doc = facet || {};
  const page = {
    ...((doc.pageStats && doc.pageStats[0]) || {}),
    ...((doc.engagement && doc.engagement[0]) || {}),
  };
  const unique = doc.uniqueUsers && doc.uniqueUsers[0] ? doc.uniqueUsers[0].n : 0;
  const conversions = doc.conversions && doc.conversions[0] ? doc.conversions[0].n : 0;
  const sessions = (doc.sessions && doc.sessions[0]) || {};
  const sessionTotal = sessions.total || 0;
  const fresh = sessions.fresh || 0;
  const returning = sessions.returning || 0;
  const visitorTotal = fresh + returning;
  const durMean = sessions.durN ? sessions.durSum / sessions.durN : 0;
  const pagesMean = sessionTotal ? sessions.pagesSum / sessionTotal : 0;
  const scrollMean = page.scrollN ? page.scrollSum / page.scrollN : 0;
  const timeMean = page.timeN ? page.timeSum / page.timeN : 0;
  return {
    liveVisitors: liveCount,
    totalPageViews: page.count || 0,
    uniqueVisitors: unique,
    conversionRate: percent(conversions, unique || sessionTotal || 1, 1),
    bounceRate: percent(sessions.bounced || 0, sessionTotal || 1, 1),
    avgSessionDuration: Math.round(durMean || 0),
    avgPagesPerSession: Math.round(((pagesMean || 0) * 10)) / 10,
    avgScrollDepth: Math.round(((scrollMean || 0) * 10)) / 10,
    avgTimeOnPage: Math.round(timeMean || 0),
    newVsReturning: {
      new: percent(fresh, visitorTotal || 1, 0),
      returning: percent(returning, visitorTotal || 1, 0),
    },
    totalSessions: sessionTotal,
  };
}

function liveVisitorsPipeline(apiKey) {
  const since = new Date(Date.now() - 5 * 60 * 1000);
  return [
    { $match: composeMatch(apiKey, reqWithRange(since, new Date())) },
    { $addFields: { _sid: sessionIdExpr() } },
    { $match: { _sid: { $nin: [null, ''] } } },
    { $group: { _id: '$_sid' } },
    { $count: 'n' },
  ];
}

function sessionBase(match) {
  return [
    { $match: match },
    { $addFields: normalizedFields() },
    { $match: { _sid: { $nin: [null, ''] } } },
    // Keep only what sessionGroupStage reads; never sort raw events (shared-tier Atlas ignores allowDiskUse).
    { $project: { _t: 1, _sid: 1, _page: 1, _pv: 1, _visit: numericOrNull('$data.visit_count') } },
    sessionGroupStage(),
    sessionDecorateStage(),
  ];
}

function sessionStatsPipeline(match) {
  return [
    ...sessionBase(match),
    {
      $facet: {
        summary: [sessionSummaryGroup()],
        entry: [
          { $group: { _id: '$entryPage', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ],
        exit: [
          { $group: { _id: '$exitPage', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ],
      },
    },
  ];
}

function shapeSessionStats(facet) {
  const summary = (facet && facet.summary && facet.summary[0]) || {};
  const total = summary.total || 0;
  const mapPages = (rows) => (rows || []).map((row) => ({
    page: row._id,
    count: row.count,
    percentage: percent(row.count, total || 1),
  }));
  const durMean = summary.durN ? summary.durSum / summary.durN : 0;
  const pagesMean = total ? (summary.pagesSum || 0) / total : 0;
  return {
    totalSessions: total,
    avgPagesPerSession: Math.round(((pagesMean || 0) * 10)) / 10,
    avgSessionDuration: Math.round(durMean || 0),
    topEntryPages: mapPages(facet && facet.entry),
    topExitPages: mapPages(facet && facet.exit),
  };
}

function entryPagesPipeline(match) {
  return [
    ...sessionBase(match),
    { $group: { _id: '$entryPage', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ];
}

function exitPagesPipeline(match) {
  return [
    ...sessionBase(match),
    { $group: { _id: '$exitPage', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ];
}

function shapeRankedPages(rows, limit, kind) {
  const ranked = rows || [];
  const sessionTotal = ranked.reduce((sum, row) => sum + row.count, 0);
  const flag = kind === 'entrances' ? { isEntry: true } : { isExit: true };
  return {
    pages: ranked.slice(0, limit).map((row) => ({
      path: row._id,
      views: row.count,
      [kind]: row.count,
      percentage: percent(row.count, sessionTotal || 1),
      ...flag,
    })),
    total: ranked.length,
  };
}

function funnelPipeline(match) {
  return [
    { $match: match },
    { $group: { _id: '$event_name', count: { $sum: 1 } } },
  ];
}

function shapeFunnel(rows) {
  const counts = new Map((rows || []).map((row) => [row._id, row.count]));
  const first = (counts.get('page_view') || 0) + (counts.get('page_views') || 0);
  const steps = [
    { label: 'Page views', count: first },
    { label: 'Clicks', count: counts.get('click') || 0 },
    { label: 'Form submit', count: counts.get('form_submit') || 0 },
  ];
  return {
    steps: steps.map((step) => ({
      label: step.label,
      count: step.count,
      percentage: percent(step.count, first || 1, 1),
    })),
  };
}

function bucketExpr(period) {
  if (period === 'hourly') {
    return { $dateToString: { format: '%Y-%m-%dT%H:00', date: '$_t' } };
  }
  if (period === 'weekly') {
    return {
      $let: {
        vars: {
          dow: {
            $cond: [
              { $eq: [{ $dayOfWeek: '$_t' }, 1] },
              7,
              { $subtract: [{ $dayOfWeek: '$_t' }, 1] },
            ],
          },
        },
        in: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: {
              $dateSubtract: {
                startDate: { $dateTrunc: { date: '$_t', unit: 'day' } },
                unit: 'day',
                amount: { $subtract: ['$$dow', 1] },
              },
            },
          },
        },
      },
    };
  }
  return { $dateToString: { format: '%Y-%m-%d', date: '$_t' } };
}

function pageViewsPipeline(match, period) {
  return [
    { $match: match },
    { $addFields: { _t: eventTimeExpr() } },
    { $match: { _t: { $type: 'date' } } },
    { $group: { _id: bucketExpr(period), pageViews: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ];
}

function shapePageViews(rows, period) {
  return {
    trend: (rows || []).map((row) => ({ date: row._id, pageViews: row.pageViews })),
    period,
  };
}

/** Match page views plus the page_exit events that carry their engagement. */
function topPagesPipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _page: pageExpr(),
        _pv: { $cond: [{ $in: ['$event_name', PAGE_VIEWS] }, 1, 0] },
        _eng: engExpr(),
      },
    },
    { $addFields: { _scroll: scrollExpr(), _top: timeOnPageExpr() } },
    {
      $group: {
        _id: { p: '$_page', v: { $cond: [{ $eq: ['$_eng', 1] }, viewKeyExpr(), null] } },
        views: { $sum: '$_pv' },
        scroll: { $max: '$_scroll' },
        top: { $max: '$_top' },
      },
    },
    {
      $group: {
        _id: '$_id.p',
        views: { $sum: '$views' },
        scrollSum: { $sum: { $cond: [{ $ne: ['$scroll', null] }, '$scroll', 0] } },
        scrollN: { $sum: { $cond: [{ $ne: ['$scroll', null] }, 1, 0] } },
        timeSum: { $sum: { $cond: [{ $ne: ['$top', null] }, '$top', 0] } },
        timeN: { $sum: { $cond: [{ $ne: ['$top', null] }, 1, 0] } },
      },
    },
    { $match: { views: { $gt: 0 } } },
    { $sort: { views: -1, _id: 1 } },
  ];
}

function shapeTopPages(rows, page, limit) {
  const rankedRows = rows || [];
  const totalPageViews = rankedRows.reduce((sum, row) => sum + row.views, 0);
  const ranked = rankedRows.map((row) => ({
    path: row._id,
    views: row.views,
    percentage: percent(row.views, totalPageViews || 1),
    avgTimeOnPage: row.timeN ? Math.round(row.timeSum / row.timeN) : null,
    avgScrollDepth: row.scrollN ? Math.round((((row.scrollSum / row.scrollN) || 0) * 10)) / 10 : null,
  }));
  const start = (page - 1) * limit;
  return {
    pages: ranked.slice(start, start + limit),
    total: ranked.length,
    totalPageViews,
  };
}

function countRowsPipeline(match, labelExpr, valueName = 'count') {
  return [
    { $match: match },
    { $addFields: { _label: labelExpr } },
    { $group: { _id: '$_label', [valueName]: { $sum: 1 } } },
    { $sort: { [valueName]: -1, _id: 1 } },
  ];
}

function shapeGeographic(rows) {
  // Merge rows whose label is an ISO code (e.g. "MY") into the country name row.
  const merged = new Map();
  for (const row of rows || []) {
    const label = /^[A-Za-z]{2}$/.test(String(row._id || '')) ? (countryNameForIso(row._id) || row._id) : row._id;
    merged.set(label, (merged.get(label) || 0) + row.visitors);
  }
  const list = [...merged.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const total = list.reduce((sum, [, v]) => sum + v, 0);
  return {
    geographic: list.map(([country, visitors]) => ({
      country,
      visitors,
      views: visitors,
      percentage: percent(visitors, total || 1),
      countryCode: isoForCountry(country),
      flag: countryFlag(country),
    })),
  };
}

function shapeNamedCounts(rows, nameKey) {
  const total = (rows || []).reduce((sum, row) => sum + row.count, 0);
  return (rows || []).map((row) => ({
    [nameKey]: row._id,
    count: row.count,
    percentage: percent(row.count, total || 1),
  }));
}

function browserPipeline(match) {
  return [
    { $match: match },
    { $addFields: { _browser: browserExpr(), _os: osExpr() } },
    { $project: { _browser: 1, _os: 1 } },
    {
      $facet: {
        browsers: [
          { $group: { _id: '$_browser', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        operatingSystems: [
          { $group: { _id: '$_os', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
      },
    },
  ];
}

function trafficPipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _source: sourceExpr(),
        _utmSource: asString({ $ifNull: ['$data.attribution.utm_source', '$data.utm_source'] }),
        _utmMedium: asString({ $ifNull: ['$data.attribution.utm_medium', '$data.utm_medium'] }),
        _utmCampaign: asString({ $ifNull: ['$data.attribution.utm_campaign', '$data.utm_campaign'] }),
      },
    },
    { $project: { _source: 1, _utmSource: 1, _utmMedium: 1, _utmCampaign: 1 } },
    {
      $facet: {
        sources: [
          { $group: { _id: '$_source', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        utm: [
          {
            $match: {
              _utmSource: { $nin: [null, ''] },
              _utmMedium: { $nin: [null, ''] },
              _utmCampaign: { $nin: [null, ''] },
            },
          },
          {
            $group: {
              _id: { source: '$_utmSource', medium: '$_utmMedium', campaign: '$_utmCampaign' },
              visits: { $sum: 1 },
            },
          },
          { $sort: { visits: -1, '_id.source': 1 } },
        ],
      },
    },
  ];
}

function shapeTraffic(facet) {
  const sources = shapeNamedCounts(facet && facet.sources, 'source').map((row) => ({
    source: row.source,
    visits: row.count,
    percentage: row.percentage,
  }));
  const totalVisits = (facet && facet.sources || []).reduce((sum, row) => sum + row.count, 0);
  const utmSources = (facet && facet.utm || []).map((row) => ({
    source: row._id.source,
    medium: row._id.medium,
    campaign: row._id.campaign,
    visits: row.visits,
  }));
  return { sources, utmSources, totalVisits };
}

function clickElementExpr() {
  return firstStringOr(['$data.element', '$data.target', '$data.selector'], 'unknown');
}

function eventsBreakdownPipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _t: eventTimeExpr(),
        _page: pageExpr(),
        _element: clickElementExpr(),
        _label: firstPresentString(['$data.event_label', '$data.label']),
        _text: firstPresentString(['$data.text']),
      },
    },
    { $project: { event_name: 1, _t: 1, _page: 1, _element: 1, _label: 1, _text: 1 } },
    {
      $facet: {
        names: [
          { $group: { _id: { $ifNull: ['$event_name', 'unknown'] }, count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        custom: [
          { $match: { event_name: { $nin: SYSTEM_NAMES } } },
          {
            $group: {
              _id: { $ifNull: ['$event_name', 'unknown'] },
              count: { $sum: 1 },
              lastSeen: { $max: '$_t' },
            },
          },
          { $sort: { count: -1, _id: 1 } },
        ],
        clicks: [
          { $match: { event_name: { $in: CLICKS } } },
          {
            $group: {
              _id: {
                element: '$_element',
                label: { $ifNull: ['$_label', ''] },
                text: { $ifNull: ['$_text', ''] },
                page: '$_page',
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, '_id.element': 1 } },
        ],
        rageTop: [
          { $match: { event_name: 'rage_click' } },
          { $group: { _id: '$_page', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 1 },
        ],
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              rageClicks: { $sum: { $cond: [{ $eq: ['$event_name', 'rage_click'] }, 1, 0] } },
              deadClicks: { $sum: { $cond: [{ $eq: ['$event_name', 'dead_click'] }, 1, 0] } },
              formSubmits: { $sum: { $cond: [{ $eq: ['$event_name', 'form_submit'] }, 1, 0] } },
              formAbandons: { $sum: { $cond: [{ $eq: ['$event_name', 'form_abandon'] }, 1, 0] } },
              formFocuses: { $sum: { $cond: [{ $eq: ['$event_name', 'form_focus'] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ];
}

/**
 * Events page KPI strip: one aggregation over [previous start, current end].
 * Each row is tagged current/previous and bucketed by UTC day, so the API returns
 * totals, % change, and a daily sparkline without loading raw events into Node.
 */
const FRUSTRATION_EVENTS = ['rage_click', 'dead_click'];

function eventsTrendPipeline(match, currentStart) {
  return [
    { $match: match },
    { $addFields: { _t: eventTimeExpr(), _sid: sessionIdExpr() } },
    { $match: { _t: { $type: 'date' } } },
    {
      $project: {
        _sid: 1,
        _name: { $ifNull: ['$event_name', 'unknown'] },
        _cur: { $cond: [{ $gte: ['$_t', currentStart] }, 1, 0] },
        _d: { $dateToString: { format: '%Y-%m-%d', date: '$_t' } },
        _pv: { $cond: [{ $in: ['$event_name', PAGE_VIEWS] }, 1, 0] },
        _click: { $cond: [{ $in: ['$event_name', CLICKS] }, 1, 0] },
        _frus: { $cond: [{ $in: ['$event_name', FRUSTRATION_EVENTS] }, 1, 0] },
      },
    },
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: { c: '$_cur', d: '$_d' },
              events: { $sum: 1 },
              pageViews: { $sum: '$_pv' },
              clicks: { $sum: '$_click' },
              frustrated: { $sum: '$_frus' },
            },
          },
        ],
        byName: [
          { $group: { _id: { c: '$_cur', d: '$_d', n: '$_name' }, count: { $sum: 1 } } },
        ],
        sessions: [
          { $match: { _sid: { $nin: [null, ''] } } },
          { $group: { _id: { c: '$_cur', s: '$_sid' }, d: { $min: '$_d' } } },
          { $group: { _id: { c: '$_id.c', d: '$d' }, sessions: { $sum: 1 } } },
        ],
      },
    },
  ];
}

const TREND_METRICS = ['events', 'pageViews', 'sessions', 'clicks', 'frustrated'];

function dayKeys(start, end) {
  const keys = [];
  const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (day <= end && keys.length < 400) {
    keys.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return keys;
}

/** null change means "no previous data" so the UI can say "New" instead of +100%. */
function changePct(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function shapeEventsTrend(facet, { start, end }) {
  const rows = new Map();
  const bump = (c, d, key, n) => {
    const id = `${c}|${d}`;
    const row = rows.get(id) || { c, d };
    row[key] = (row[key] || 0) + (n || 0);
    rows.set(id, row);
  };
  for (const r of (facet && facet.counts) || []) {
    for (const key of ['events', 'pageViews', 'clicks', 'frustrated']) bump(r._id.c, r._id.d, key, r[key]);
  }
  for (const r of (facet && facet.sessions) || []) bump(r._id.c, r._id.d, 'sessions', r.sessions);
  const days = dayKeys(start, end);
  const out = { days, metrics: {} };
  for (const key of TREND_METRICS) {
    let current = 0;
    let previous = 0;
    const byDay = new Map();
    for (const row of rows.values()) {
      if (row.c === 1) {
        current += row[key] || 0;
        byDay.set(row.d, (byDay.get(row.d) || 0) + (row[key] || 0));
      } else {
        previous += row[key] || 0;
      }
    }
    out.metrics[key] = {
      current,
      previous,
      change: changePct(current, previous),
      series: days.map((d) => byDay.get(d) || 0),
    };
  }
  // Per event name: totals, % change and daily series, for the All events table and the
  // per-category stacked chart. Capped to the 200 busiest names to bound payload size.
  const names = new Map();
  for (const r of (facet && facet.byName) || []) {
    const row = names.get(r._id.n) || { name: r._id.n, current: 0, previous: 0, byDay: new Map() };
    if (r._id.c === 1) {
      row.current += r.count;
      row.byDay.set(r._id.d, (row.byDay.get(r._id.d) || 0) + r.count);
    } else {
      row.previous += r.count;
    }
    names.set(r._id.n, row);
  }
  out.events = [...names.values()]
    .sort((a, b) => b.current - a.current || b.previous - a.previous)
    .slice(0, 200)
    .map((row) => ({
      name: row.name,
      current: row.current,
      previous: row.previous,
      change: changePct(row.current, row.previous),
      series: days.map((d) => row.byDay.get(d) || 0),
    }));
  return out;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shapeEventsBreakdown(facet, { clicksPage, clicksLimit, customPage, customLimit }) {
  const names = (facet && facet.names) || [];
  const custom = (facet && facet.custom) || [];
  const clicks = (facet && facet.clicks) || [];
  const summary = (facet && facet.summary && facet.summary[0]) || {};
  const rageTop = (facet && facet.rageTop && facet.rageTop[0]) || null;
  const totalEvents = summary.total || names.reduce((sum, row) => sum + row.count, 0);
  const nameCounts = new Map(names.map((row) => [row._id, row.count]));
  const customTotal = custom.reduce((sum, row) => sum + row.count, 0);
  const categoryCounts = {};
  for (const [name, list] of Object.entries(EVENT_CATEGORIES)) {
    categoryCounts[name] = list.reduce((sum, eventName) => sum + (nameCounts.get(eventName) || 0), 0);
  }
  categoryCounts.custom = customTotal;
  const clickStart = (clicksPage - 1) * clicksLimit;
  const customStart = (customPage - 1) * customLimit;
  return {
    events: names.map((row) => ({
      name: row._id,
      count: row.count,
      percentage: percent(row.count, totalEvents || 1, 1),
    })),
    customEvents: custom.slice(customStart, customStart + customLimit).map((row) => ({
      name: row._id,
      count: row.count,
      last_seen: isoOrNull(row.lastSeen),
      lastSeen: isoOrNull(row.lastSeen),
      percentage: percent(row.count, customTotal || 1),
    })),
    customEventsTotal: custom.length,
    topClicks: clicks.slice(clickStart, clickStart + clicksLimit).map((row) => ({
      element: row._id.element,
      label: row._id.label || '',
      text: row._id.text || '',
      page: row._id.page,
      count: row.count,
    })),
    topClicksTotal: clicks.length,
    summary: {
      rageClicks: summary.rageClicks || 0,
      deadClicks: summary.deadClicks || 0,
      formSubmits: summary.formSubmits || 0,
      formAbandons: summary.formAbandons || 0,
      formFocuses: summary.formFocuses || 0,
      rageTopPage: rageTop && rageTop._id ? rageTop._id : null,
      rageTopPageCount: rageTop ? rageTop.count : 0,
    },
    categoryCounts,
    totalEvents,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function historyNormalizeStages() {
  return [
    {
      $addFields: {
        _t: eventTimeExpr(),
        _sid: sessionIdExpr(),
        _uid: userIdExpr(),
        _page: pageExpr(),
        _country: countryExpr(),
        _device: deviceExpr(),
      },
    },
    {
      $addFields: {
        _deviceLower: { $toLower: '$_device' },
        _hay: {
          $toLower: {
            $concat: [
              asString('$event_name'),
              ' ',
              asString('$_page'),
              ' ',
              asString('$_uid'),
              ' ',
              asString('$_country'),
              ' ',
              asString('$_sid'),
            ],
          },
        },
      },
    },
  ];
}

function historyFilterStage(clientMatch) {
  if (clientMatch && Object.keys(clientMatch).length) return { $match: clientMatch };
  return { $match: {} };
}

function eventHistoryOptionsPipeline(match) {
  return [
    { $match: match },
    ...historyNormalizeStages(),
    { $project: { event_name: 1, _country: 1, _device: 1, _page: 1 } },
    {
      $facet: {
        eventTypes: [
          { $group: { _id: '$event_name' } },
          { $match: { _id: { $nin: [null, ''] } } },
          { $sort: { _id: 1 } },
        ],
        countries: [
          { $group: { _id: '$_country' } },
          { $sort: { _id: 1 } },
        ],
        devices: [
          { $group: { _id: '$_device' } },
          { $sort: { _id: 1 } },
        ],
        pages: [
          { $group: { _id: '$_page' } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];
}

function eventHistoryPagePipeline(match, { skip, limit, clientMatch }) {
  return [
    { $match: match },
    ...historyNormalizeStages(),
    historyFilterStage(clientMatch),
    { $sort: { _t: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];
}

function eventHistoryCountPipeline(match, clientMatch) {
  return [
    { $match: match },
    ...historyNormalizeStages(),
    historyFilterStage(clientMatch),
    { $count: 'n' },
  ];
}

function historyClientMatch(query) {
  const countries = String(query.countries || '').split(',').map((s) => s.trim()).filter(Boolean);
  const devices = String(query.devices || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const pages = String(query.pages || '').split(',').map((s) => s.trim()).filter(Boolean);
  const cats = String(query.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
  const categoryNames = cats.flatMap((cat) => EVENT_CATEGORIES[cat] || []);
  const eventType = String(query.eventType || '').trim();
  const search = String(query.search || '').trim().toLowerCase();
  const clauses = [];
  if (eventType) clauses.push({ event_name: eventType });
  if (categoryNames.length) clauses.push({ event_name: { $in: categoryNames } });
  if (countries.length) clauses.push({ _country: { $in: countries } });
  if (devices.length) clauses.push({ _deviceLower: { $in: devices } });
  if (pages.length) clauses.push({ _page: { $in: pages } });
  if (search) clauses.push({ _hay: { $regex: escapeRegex(search), $options: 'i' } });
  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function vitalNumberExpr(name) {
  const lower = String(name || '').toLowerCase();
  // Older trackers sent CLS as data.value = round(cls * 1000) with the raw score in
  // custom_parameters.value; newer ones send the raw score in both places.
  if (name === 'CLS') {
    return {
      $ifNull: [
        numericOrNull('$data.custom_parameters.value'),
        { $ifNull: [numericOrNull('$data.metric_value'), numericOrNull('$data.value')] },
      ],
    };
  }
  return {
    $ifNull: [
      numericOrNull('$data.value'),
      { $ifNull: [
        numericOrNull('$data.metric_value'),
        { $ifNull: [numericOrNull(`$data.${name}`), numericOrNull(`$data.${lower}`)] },
      ] },
    ],
  };
}

function vitalBase(match, name) {
  return [
    { $match: match },
    { $addFields: { _v: vitalNumberExpr(name) } },
    { $match: { _v: { $ne: null } } },
  ];
}

async function loadVital(col, match, name) {
  const base = vitalBase(match, name);
  const summary = await aggregate(col, [
    ...base,
    { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: '$_v' } } },
  ]);
  const n = summary[0] ? summary[0].n : 0;
  if (!n) return { avg: null, p75: null, count: 0, rating: 'no-data' };
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((75 / 100) * n) - 1));
  const picked = await aggregate(col, [
    ...base,
    { $sort: { _v: 1 } },
    { $skip: idx },
    { $limit: 1 },
  ]);
  const p75 = picked[0] ? picked[0]._v : null;
  const mean = summary[0].sum / n;
  return {
    avg: Math.round(mean * 1000) / 1000,
    p75: p75 == null ? null : Math.round(p75 * 1000) / 1000,
    count: n,
    rating: vitalRating(name, p75),
  };
}

function pageVitalsPipeline(match) {
  const valueFor = (eventName, metric) => ({
    $cond: [{ $eq: ['$event_name', eventName] }, vitalNumberExpr(metric), null],
  });
  return [
    { $match: match },
    { $addFields: { _page: pageExpr() } },
    {
      $addFields: {
        _lcp: valueFor('web_vital_lcp', 'LCP'),
        _fid: valueFor('web_vital_fid', 'FID'),
        _cls: valueFor('web_vital_cls', 'CLS'),
        _inp: valueFor('web_vital_inp', 'INP'),
      },
    },
    {
      $group: {
        _id: '$_page',
        lcpSum: { $sum: { $cond: [{ $ne: ['$_lcp', null] }, '$_lcp', 0] } },
        lcpN: { $sum: { $cond: [{ $ne: ['$_lcp', null] }, 1, 0] } },
        fidSum: { $sum: { $cond: [{ $ne: ['$_fid', null] }, '$_fid', 0] } },
        fidN: { $sum: { $cond: [{ $ne: ['$_fid', null] }, 1, 0] } },
        clsSum: { $sum: { $cond: [{ $ne: ['$_cls', null] }, '$_cls', 0] } },
        clsN: { $sum: { $cond: [{ $ne: ['$_cls', null] }, 1, 0] } },
        inpSum: { $sum: { $cond: [{ $ne: ['$_inp', null] }, '$_inp', 0] } },
        inpN: { $sum: { $cond: [{ $ne: ['$_inp', null] }, 1, 0] } },
      },
    },
  ];
}

function shapePageVitals(rows, limit) {
  const pages = (rows || []).map((row) => {
    const avgLCP = row.lcpN ? row.lcpSum / row.lcpN : null;
    const avgFID = row.fidN ? row.fidSum / row.fidN : null;
    const avgCLS = row.clsN ? row.clsSum / row.clsN : null;
    const avgINP = row.inpN ? row.inpSum / row.inpN : null;
    const round3 = (value) => (value == null ? null : Math.round(value * 1000) / 1000);
    return {
      page: row._id,
      count: (row.lcpN || 0) + (row.fidN || 0) + (row.clsN || 0) + (row.inpN || 0),
      avgLCP: round3(avgLCP),
      avgFID: round3(avgFID),
      avgCLS: round3(avgCLS),
      avgINP: round3(avgINP),
      lcpRating: vitalRating('LCP', avgLCP),
      fidRating: vitalRating('FID', avgFID),
      clsRating: vitalRating('CLS', avgCLS),
      inpRating: vitalRating('INP', avgINP),
    };
  }).filter((row) => row.count > 0).sort((a, b) => b.count - a.count || String(a.page).localeCompare(String(b.page)));
  return { pages: pages.slice(0, limit), total: pages.length };
}

// Tracker emits form_field_interaction/form_start; older builds and docs used form_focus.
const FORM_FIELD_EVENTS = ['form_focus', 'form_field_interaction'];
const FORM_EVENTS = ['form_submit', 'form_abandon', 'form_start', ...FORM_FIELD_EVENTS];

function formPipeline(match) {
  return [
    { $match: match },
    { $addFields: { _form: firstStringOr(['$data.formId', '$data.form_id', '$data.formName'], 'unknown') } },
    {
      $group: {
        _id: '$_form',
        submissions: { $sum: { $cond: [{ $eq: ['$event_name', 'form_submit'] }, 1, 0] } },
        abandons: { $sum: { $cond: [{ $eq: ['$event_name', 'form_abandon'] }, 1, 0] } },
        fieldInteractions: { $sum: { $cond: [{ $in: ['$event_name', FORM_FIELD_EVENTS] }, 1, 0] } },
        timeSum: {
          $sum: {
            $cond: [
              { $eq: ['$event_name', 'form_submit'] },
              { $ifNull: [{ $ifNull: [numericOrNull('$data.time_to_complete'), numericOrNull('$data.timeToComplete')] }, { $ifNull: [numericOrNull('$data.time_on_page'), 0] }] },
              0,
            ],
          },
        },
        timeN: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$event_name', 'form_submit'] },
                  { $ne: [{ $ifNull: [{ $ifNull: [numericOrNull('$data.time_to_complete'), numericOrNull('$data.timeToComplete')] }, numericOrNull('$data.time_on_page')] }, null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { submissions: -1, _id: 1 } },
  ];
}

function shapeForms(rows, page, limit) {
  const all = (rows || []).map((row) => ({
    formId: row._id,
    submissions: row.submissions || 0,
    abandons: row.abandons || 0,
    avgTimeToComplete: Math.round(row.timeN ? row.timeSum / row.timeN : 0),
    conversionRate: percent(row.submissions || 0, ((row.submissions || 0) + (row.abandons || 0)) || 1, 1),
    fieldInteractions: row.fieldInteractions || 0,
  }));
  const start = (page - 1) * limit;
  return {
    forms: all.slice(start, start + limit),
    total: all.length,
    page,
    limit,
    pages: Math.max(1, Math.ceil(all.length / limit)),
  };
}

function tooltipPipeline(match) {
  return [
    { $match: match },
    { $addFields: { _t: eventTimeExpr(), _page: pageExpr() } },
    { $sort: { _t: 1 } },
    {
      $group: {
        _id: firstStringOr(['$data.tooltip_id', '$data.tooltipId', '$data.event_label'], 'unknown'),
        text: { $first: firstStringOr(['$data.tooltip_text', '$data.label'], '') },
        section: { $first: asString('$data.section') },
        page: { $first: '$_page' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1, _id: 1 } },
  ];
}

function shapeTooltips(rows, page, limit) {
  const tooltips = (rows || []).map((row) => ({
    id: row._id,
    text: row.text || row._id,
    section: row.section || '',
    page: row.page,
    count: row.count,
  }));
  const start = (page - 1) * limit;
  return { tooltips: tooltips.slice(start, start + limit), total: tooltips.length };
}

const ERROR_EVENTS = ['error', 'javascript_error', 'promise_rejection'];

function errorPipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _t: eventTimeExpr(),
        _page: pageExpr(),
        _uid: userIdExpr(),
        _type: firstStringOr(['$data.error_type', '$data.type', '$event_name'], 'error'),
        _message: firstStringOr([
          '$data.message',
          '$data.error',
          '$data.error_message',
          '$data.custom_parameters.error_message',
          '$data.custom_parameters.reason',
          '$data.event_label',
          '$data.label',
        ], 'Unknown error'),
      },
    },
    {
      $group: {
        _id: { type: '$_type', message: '$_message' },
        count: { $sum: 1 },
        users: { $addToSet: '$_uid' },
        pages: { $addToSet: '$_page' },
        lastSeen: { $max: '$_t' },
      },
    },
    { $sort: { count: -1, '_id.message': 1 } },
  ];
}

function shapeErrors(rows, limit) {
  const errors = (rows || []).slice(0, limit).map((row) => ({
    type: row._id.type,
    message: row._id.message,
    count: row.count,
    affectedUsers: (row.users || []).filter(Boolean).length,
    lastSeen: isoOrNull(row.lastSeen),
    pageCount: (row.pages || []).length,
  }));
  return { errors, total: (rows || []).length };
}

function rageValueExpr() {
  return {
    $cond: [
      { $gt: [numericOrNull('$data.click_count'), 0] },
      numericOrNull('$data.click_count'),
      numericOrNull('$data.value'),
    ],
  };
}

function ragePipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _t: eventTimeExpr(),
        _page: pageExpr(),
        _element: firstStringOr(['$data.element', '$data.target'], 'unknown'),
        _clicks: rageValueExpr(),
        _label: firstStringOr(['$data.event_label', '$data.label', '$data.element', '$data.target'], 'unknown'),
      },
    },
    { $project: { event_name: 1, _t: 1, _page: 1, _element: 1, _clicks: 1, _label: 1 } },
    { $sort: { _t: 1 } },
    {
      $facet: {
        rage: rageGroup('rage_click'),
        dead: rageGroup('dead_click'),
      },
    },
  ];
}

function rageGroup(eventName) {
  return [
    { $match: { event_name: eventName } },
    {
      $group: {
        _id: { element: '$_element', page: '$_page' },
        label: { $first: '$_label' },
        count: { $sum: 1 },
        clickSum: { $sum: { $cond: [{ $ne: ['$_clicks', null] }, '$_clicks', 0] } },
        clickN: { $sum: { $cond: [{ $ne: ['$_clicks', null] }, 1, 0] } },
        lastSeen: { $max: '$_t' },
      },
    },
    { $sort: { count: -1, '_id.element': 1 } },
  ];
}

function shapeRageRows(rows) {
  return (rows || []).map((row) => {
    const shaped = {
      element: row._id.element,
      label: row.label,
      page: row._id.page,
      count: row.count,
      lastSeen: isoOrNull(row.lastSeen),
    };
    if (row.clickN) shaped.avgClicks = Math.round(((row.clickSum / row.clickN) || 0) * 10) / 10;
    return shaped;
  });
}

// ---------------------------------------------------------------------------
// Source / UTM inputs, projected server-side.
// classifySource / extractUtm / referrerIdentity stay the single source of
// truth (JS); Mongo only ships the handful of fields they read. URL-ish
// fields are only kept when they contain "utm_" (utmFromUrlString ignores
// anything else), which collapses page paths and keeps groups small.
// ---------------------------------------------------------------------------
const SRC_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const SRC_URL_KEYS = ['page', 'url', 'href', 'location', 'route', 'previousUrl', 'previous_url',
  'document_url', 'documentUrl', 'landing_page'];

function utmUrlOnly(path) {
  return {
    $cond: [
      { $eq: [{ $type: path }, 'string'] },
      { $cond: [{ $regexMatch: { input: path, regex: 'utm_' } }, path, null] },
      null,
    ],
  };
}

function objectSubset(path, keys, urlKeys = []) {
  const out = {};
  for (const key of keys) out[key] = `${path}.${key}`;
  for (const key of urlKeys) out[key] = utmUrlOnly(`${path}.${key}`);
  return { $cond: [{ $eq: [{ $type: path }, 'object'] }, out, null] };
}

/** A pseudo-event with exactly the fields the source/UTM classifiers read. */
function sourceInputsDoc({ withSession = false, withTime = false } = {}) {
  const data = {
    attribution: objectSubset('$data.attribution', [...SRC_UTM_KEYS, 'referrer', 'referrer_domain'], SRC_URL_KEYS),
    utm_attribution: objectSubset('$data.utm_attribution', SRC_UTM_KEYS, ['landing_page']),
    custom_parameters: objectSubset('$data.custom_parameters', SRC_UTM_KEYS),
    custom: objectSubset('$data.custom', SRC_UTM_KEYS),
    referrer: '$data.referrer',
  };
  for (const key of SRC_UTM_KEYS) data[key] = `$data.${key}`;
  for (const key of SRC_URL_KEYS) data[key] = utmUrlOnly(`$data.${key}`);
  if (withSession) data.session_id = '$data.session_id';
  const doc = {
    page: utmUrlOnly('$page'),
    url: utmUrlOnly('$url'),
    href: utmUrlOnly('$href'),
    data: { $cond: [{ $eq: [{ $type: '$data' }, 'object'] }, data, null] },
  };
  for (const key of SRC_UTM_KEYS) doc[key] = `$${key}`;
  if (withSession) doc.session_id = '$session_id';
  if (withTime) {
    doc.timestamp = '$timestamp';
    doc.createdAt = '$createdAt';
    doc.receivedAt = '$receivedAt';
  }
  return doc;
}

/** Superset filter: any event that could yield UTM values. */
function utmCandidateMatch() {
  const or = [];
  const rx = { $regex: 'utm_' };
  for (const f of ['page', 'url', 'href']) or.push({ [f]: rx });
  for (const f of SRC_URL_KEYS) {
    or.push({ [`data.${f}`]: rx });
    or.push({ [`data.attribution.${f}`]: rx });
  }
  or.push({ 'data.utm_attribution.landing_page': rx });
  for (const key of SRC_UTM_KEYS) {
    for (const base of ['', 'data.', 'data.attribution.', 'data.utm_attribution.', 'data.custom_parameters.', 'data.custom.']) {
      or.push({ [`${base}${key}`]: { $exists: true } });
    }
  }
  return { $or: or };
}

/** Distinct source inputs with visit counts (first-seen time breaks ties). */
function sourceGroupsPipeline(match, { withSession = false } = {}) {
  return [
    { $match: match },
    { $project: { _id: 0, k: sourceInputsDoc({ withSession }), _t: eventTimeExpr() } },
    { $group: { _id: '$k', n: { $sum: 1 }, t: { $min: '$_t' } } },
    { $sort: { t: 1 } },
  ];
}

/** Compact per-event rows for session attribution, in scan order. */
function attributionInputsPipeline(match) {
  return [
    { $match: match },
    { $project: { _id: 0, ...sourceInputsDoc({ withSession: true, withTime: true }) } },
  ];
}

function attributionPipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _t: eventTimeExpr(),
        _sid: sessionIdExpr(),
        _source: sourceExpr(),
      },
    },
    { $match: { _sid: { $nin: [null, ''] } } },
    { $sort: { _t: 1 } },
    {
      $group: {
        _id: '$_sid',
        firstSource: { $first: '$_source' },
        lastSource: { $last: '$_source' },
        sources: { $addToSet: '$_source' },
        attrKey: {
          $min: {
            $cond: [
              { $eq: [{ $type: '$data.attribution' }, 'object'] },
              { t: '$_t', a: '$data.attribution' },
              null,
            ],
          },
        },
      },
    },
  ];
}

function shapeAttribution(rows) {
  const sessions = rows || [];
  const firstCounts = new Map();
  const lastCounts = new Map();
  const linear = new Map();
  for (const session of sessions) {
    const first = session.firstSource || 'Direct';
    firstCounts.set(first, (firstCounts.get(first) || 0) + 1);
    const last = session.attrKey && session.attrKey.a
      ? classifySource(session.attrKey.a)
      : (session.lastSource || 'Direct');
    lastCounts.set(last, (lastCounts.get(last) || 0) + 1);
    const sources = session.sources && session.sources.length ? session.sources : ['Direct'];
    const share = 1 / sources.length;
    for (const source of sources) linear.set(source, (linear.get(source) || 0) + share);
  }
  const toEntries = (map, total) => [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([source, value]) => ({
      source,
      value: Math.round(value * 10) / 10,
      percentage: percent(value, total || 1),
    }));
  return {
    totalSessions: sessions.length,
    firstTouch: toEntries(firstCounts, sessions.length),
    lastTouch: toEntries(lastCounts, sessions.length),
    linear: toEntries(linear, sessions.length),
  };
}

function cohortPipeline(match) {
  return [
    { $match: match },
    { $addFields: { _t: eventTimeExpr(), _uid: userIdExpr() } },
    { $match: { _uid: { $nin: [null, ''] }, _t: { $type: 'date' } } },
    { $group: { _id: '$_uid', first: { $min: '$_t' }, times: { $push: '$_t' } } },
  ];
}

function userPathsPipeline(match) {
  return [
    { $match: match },
    { $addFields: { _t: eventTimeExpr(), _sid: sessionIdExpr(), _page: pageExpr() } },
    { $match: { _sid: { $nin: [null, ''] }, _t: { $type: 'date' } } },
    { $sort: { _sid: 1, _t: 1 } },
    { $group: { _id: '$_sid', pages: { $push: '$_page' } } },
  ];
}

function shapeUserPaths(rows, limit) {
  const pairs = new Map();
  for (const session of rows || []) {
    const pages = session.pages || [];
    for (let i = 0; i < pages.length - 1; i += 1) {
      if (pages[i] === pages[i + 1]) continue;
      const key = `${pages[i]} => ${pages[i + 1]}`;
      const prev = pairs.get(key) || { from: pages[i], to: pages[i + 1], count: 0 };
      prev.count += 1;
      pairs.set(key, prev);
    }
  }
  const paths = [...pairs.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)).slice(0, limit);
  return { paths, totalSessions: (rows || []).length };
}

// ── Insights: outbound, downloads, 404s, site search, language, screen, goals, revenue ──
const INSIGHT_EVENTS = ['outbound_click', 'file_download', 'not_found', 'site_search', 'goal', 'revenue'];

function insightTop(eventName, keyExpr, limit = 10) {
  return [
    { $match: { event_name: eventName } },
    { $group: { _id: keyExpr, count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ];
}

/** Visitors (distinct sessions) per key, from page views. */
function insightSessions(keyExpr, limit = 10) {
  return [
    { $match: { event_name: { $in: PAGE_VIEW_EVENTS } } },
    { $group: { _id: { k: keyExpr, s: { $ifNull: ['$data.session_id', '$session_id'] } } } },
    { $group: { _id: '$_id.k', count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ];
}

const screenWidthExpr = {
  $convert: {
    input: { $arrayElemAt: [{ $split: [{ $ifNull: ['$data.screenResolution', ''] }, 'x'] }, 0] },
    to: 'double', onError: null, onNull: null,
  },
};

function insightsPipeline(match) {
  const str = (path) => ({ $ifNull: [path, null] });
  return [
    { $match: match },
    {
      $facet: {
        outbound: insightTop('outbound_click', str('$data.domain')),
        downloads: insightTop('file_download', str('$data.url')),
        notFound: insightTop('not_found', { $ifNull: ['$data.page', '$page'] }),
        searches: insightTop('site_search', { $toLower: { $ifNull: ['$data.term', ''] } }),
        goals: insightTop('goal', str('$data.goal'), 20),
        revenue: [
          { $match: { event_name: 'revenue' } },
          { $addFields: { _v: { $convert: { input: '$data.value', to: 'double', onError: 0, onNull: 0 } } } },
          {
            $group: {
              _id: { $toUpper: { $ifNull: ['$data.currency', 'USD'] } },
              total: { $sum: '$_v' },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ],
        languages: insightSessions({
          $toLower: { $arrayElemAt: [{ $split: [{ $ifNull: ['$data.language', ''] }, '-'] }, 0] },
        }),
        screens: insightSessions({
          $switch: {
            branches: [
              { case: { $eq: [screenWidthExpr, null] }, then: null },
              { case: { $lt: [screenWidthExpr, 768] }, then: 'Mobile (<768px)' },
              { case: { $lt: [screenWidthExpr, 1280] }, then: 'Tablet / small laptop (768-1279px)' },
              { case: { $lt: [screenWidthExpr, 1920] }, then: 'Laptop / desktop (1280-1919px)' },
            ],
            default: 'Large desktop (1920px+)',
          },
        }),
      },
    },
  ];
}

function shapeInsights(row = {}) {
  const list = (rows, key) => (rows || [])
    .filter((r) => r._id !== '' && r._id != null)
    .map((r) => ({ [key]: r._id, count: r.count }));
  return {
    outbound: list(row.outbound, 'domain'),
    downloads: list(row.downloads, 'url'),
    notFound: list(row.notFound, 'page'),
    searches: list(row.searches, 'term'),
    goals: list(row.goals, 'goal'),
    languages: list(row.languages, 'language'),
    screens: list(row.screens, 'screen'),
    revenue: (row.revenue || []).map((r) => ({
      currency: r._id,
      total: Math.round(r.total * 100) / 100,
      count: r.count,
    })),
  };
}

module.exports = {
  sourceInputsDoc,
  utmCandidateMatch,
  sourceGroupsPipeline,
  attributionInputsPipeline,
  INSIGHT_EVENTS,
  insightsPipeline,
  shapeInsights,
  ENGAGEMENT_EVENTS,
  FORM_EVENTS,
  ERROR_EVENTS,
  aggregate,
  coreMetricsPipeline,
  shapeCoreMetrics,
  liveVisitorsPipeline,
  sessionStatsPipeline,
  shapeSessionStats,
  entryPagesPipeline,
  exitPagesPipeline,
  shapeRankedPages,
  funnelPipeline,
  shapeFunnel,
  pageViewsPipeline,
  shapePageViews,
  topPagesPipeline,
  shapeTopPages,
  countRowsPipeline,
  shapeGeographic,
  shapeNamedCounts,
  countryExpr,
  deviceExpr,
  browserPipeline,
  trafficPipeline,
  shapeTraffic,
  eventsBreakdownPipeline,
  eventsTrendPipeline,
  shapeEventsTrend,
  changePct,
  shapeEventsBreakdown,
  eventHistoryOptionsPipeline,
  eventHistoryPagePipeline,
  eventHistoryCountPipeline,
  historyClientMatch,
  loadVital,
  pageVitalsPipeline,
  shapePageVitals,
  formPipeline,
  shapeForms,
  tooltipPipeline,
  shapeTooltips,
  errorPipeline,
  shapeErrors,
  ragePipeline,
  shapeRageRows,
  attributionPipeline,
  shapeAttribution,
  cohortPipeline,
  userPathsPipeline,
  shapeUserPaths,
  sourceExpr,
  pageExpr,
};
