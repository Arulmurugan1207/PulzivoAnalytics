'use strict';

const {
  PAGE_VIEW_EVENTS,
  CONVERSION_EVENTS,
  composeMatch,
  requireApiKey,
  eventTime,
  eventPage,
  percent,
  trendPct,
  vitalRating,
  percentile,
  avg,
  extractUtm,
  attributionHasSignal,
  classifySource,
  referrerIdentity,
  formatHistoryEvent,
  sessionIdOf,
  userIdOf,
  isPageView,
  clampInt,
  previousRange,
  reqWithRange,
} = require('./query');
const { loadExclusionRules, exclusionMatch } = require('./owner-exclusion');

/** Report-time filter: hide owner-excluded rows without deleting them. */
function withExclusion(col, exclusion) {
  if (!exclusion || !Object.keys(exclusion).length) return col;
  const scope = (filter) => (filter && Object.keys(filter).length ? { $and: [filter, exclusion] } : exclusion);
  return {
    find: (filter, ...rest) => col.find(scope(filter), ...rest),
    countDocuments: (filter, ...rest) => col.countDocuments(scope(filter), ...rest),
    // Aggregations: hide excluded rows before any other stage runs.
    aggregate: (pipeline = [], ...rest) => col.aggregate([{ $match: exclusion }, ...pipeline], ...rest),
  };
}

/**
 * Events without an email but with a user_id get the user's last known email from
 * earlier events for the same apiKey (flagged email_inferred). One read-only aggregate
 * per request, served by the partial events_apiKey_user_email_ts index.
 */
async function attachKnownEmails(col, apiKey, events) {
  const ids = [...new Set(events.filter((e) => !e.user_email && e.user_id).map((e) => e.user_id))];
  if (!ids.length) return events;
  try {
    const rows = await aggregate(col, [
      { $match: { apiKey, user_id: { $in: ids.slice(0, 500) }, user_email: { $type: 'string' } } },
      { $sort: { user_id: 1, timestamp: -1 } },
      { $group: { _id: '$user_id', email: { $first: '$user_email' } } },
    ]);
    const byId = new Map(rows.filter((r) => r.email).map((r) => [r._id, r.email]));
    for (const e of events) {
      if (!e.user_email && byId.has(e.user_id)) {
        e.user_email = byId.get(e.user_id);
        e.email_inferred = true;
      }
    }
  } catch (err) {
    // Best effort: the event list still renders without inferred emails.
  }
  return events;
}

async function findEvents(col, filter, options = {}) {
  let cursor = col.find(filter);
  if (options.sort) cursor = cursor.sort(options.sort);
  if (options.skip) cursor = cursor.skip(options.skip);
  if (options.limit) cursor = cursor.limit(options.limit);
  return cursor.toArray();
}

function sortByTime(docs) {
  return [...docs].sort((a, b) => {
    const ta = eventTime(a)?.getTime() || 0;
    const tb = eventTime(b)?.getTime() || 0;
    return ta - tb;
  });
}

function groupSessions(docs) {
  const sessions = new Map();
  for (const doc of docs) {
    const sid = sessionIdOf(doc);
    if (!sid) continue;
    let session = sessions.get(sid);
    if (!session) {
      session = {
        id: sid,
        events: [],
        pageViews: 0,
        start: null,
        end: null,
        visitCount: 0,
        userId: userIdOf(doc),
        entryPage: null,
        exitPage: null,
        source: 'Direct',
        attribution: null,
      };
      sessions.set(sid, session);
    }
    session.events.push(doc);
    const t = eventTime(doc);
    if (t && (!session.start || t < session.start)) session.start = t;
    if (t && (!session.end || t > session.end)) session.end = t;
    if (isPageView(doc.event_name)) {
      session.pageViews += 1;
      const page = eventPage(doc);
      if (!session.entryPage) session.entryPage = page;
      session.exitPage = page;
    }
    const visit = Number(doc.data?.visit_count);
    if (Number.isFinite(visit)) session.visitCount = Math.max(session.visitCount, visit);
    const rawAttr = doc.data?.attribution && typeof doc.data.attribution === 'object' ? doc.data.attribution : {};
    const extracted = extractUtm(doc.data || {}, doc);
    const mergedAttr = { ...rawAttr };
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      if (!mergedAttr[key] && extracted[key]) mergedAttr[key] = extracted[key];
    }
    // Skip empty attribution objects so a later event that actually carries
    // UTMs (often only on the page query) can still become the session source.
    if (!attributionHasSignal(session.attribution) && attributionHasSignal(mergedAttr)) {
      session.attribution = mergedAttr;
    }
    session.source = classifySource(doc.data || {}, doc);
    if (!session.userId) session.userId = userIdOf(doc);
  }
  for (const session of sessions.values()) {
    session.events = sortByTime(session.events);
    if (!session.entryPage) {
      const firstPage = session.events.find((e) => eventPage(e));
      session.entryPage = firstPage ? eventPage(firstPage) : '/';
    }
    if (!session.exitPage) {
      const lastPage = [...session.events].reverse().find((e) => eventPage(e));
      session.exitPage = lastPage ? eventPage(lastPage) : session.entryPage;
    }
  }
  return sessions;
}

function durationSec(session) {
  if (!session.start || !session.end) return 0;
  return Math.max(0, (session.end.getTime() - session.start.getTime()) / 1000);
}

function computeCoreMetrics(docs, { liveCount = 0 } = {}) {
  const pageViews = docs.filter((d) => isPageView(d.event_name));
  const unique = new Set(pageViews.map((d) => userIdOf(d)).filter(Boolean));
  const sessions = groupSessions(docs);
  const sessionList = [...sessions.values()];
  const bounced = sessionList.filter((s) => s.pageViews <= 1).length;
  const durations = sessionList.map(durationSec).filter((n) => n > 0);
  const pagesPer = sessionList.map((s) => s.pageViews);
  // Engagement lives on page_exit; repeated exits for one view (hidden, then closed) share data.view_id.
  const views = new Map();
  for (const d of docs) {
    if (d.event_name !== 'page_exit') continue;
    const key = d.data?.view_id != null ? d.data.view_id : d._id || Symbol('view');
    const row = views.get(key) || { scroll: null, time: null };
    const sc = Number(d.data?.scroll_depth);
    const tm = Number(d.data?.time_on_page);
    if (d.data?.scroll_depth != null && Number.isFinite(sc) && sc >= 0) row.scroll = Math.max(row.scroll ?? -1, Math.min(sc, 100));
    if (Number.isFinite(tm) && tm > 0) row.time = Math.max(row.time ?? 0, tm / 1000);
    views.set(key, row);
  }
  const scrolls = [...views.values()].map((r) => r.scroll).filter((n) => n != null);
  const times = [...views.values()].map((r) => r.time).filter((n) => n != null);
  const conversions = new Set(
    docs.filter((d) => CONVERSION_EVENTS.includes(d.event_name)).map((d) => userIdOf(d) || sessionIdOf(d)).filter(Boolean),
  );
  let newUsers = 0;
  let returningUsers = 0;
  for (const session of sessionList) {
    if (session.visitCount > 1) returningUsers += 1;
    else newUsers += 1;
  }
  const visitorTotal = newUsers + returningUsers;
  return {
    liveVisitors: liveCount,
    totalPageViews: pageViews.length,
    uniqueVisitors: unique.size,
    conversionRate: percent(conversions.size, unique.size || sessionList.length || 1, 1),
    bounceRate: percent(bounced, sessionList.length || 1, 1),
    avgSessionDuration: Math.round(avg(durations) || 0),
    avgPagesPerSession: Math.round(((avg(pagesPer) || 0) * 10)) / 10,
    avgScrollDepth: Math.round((avg(scrolls) || 0) * 10) / 10,
    avgTimeOnPage: Math.round(avg(times) || 0),
    newVsReturning: {
      new: percent(newUsers, visitorTotal || 1, 0),
      returning: percent(returningUsers, visitorTotal || 1, 0),
    },
    totalSessions: sessionList.length,
  };
}

function topCounts(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function loadScopedEvents(col, apiKey, req, extra) {
  return findEvents(col, composeMatch(apiKey, req, extra));
}

function withPercentage(entries, total, nameKey) {
  return entries.map(([key, count]) => ({
    [nameKey]: key,
    count,
    percentage: percent(count, total || 1),
  }));
}

const {
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
  eventsTrendPipeline,
  shapeEventsTrend,
  shapeRageRows,
  attributionPipeline,
  shapeAttribution,
  sourceGroupsPipeline,
  utmCandidateMatch,
  attributionInputsPipeline,
  cohortPipeline,
  userPathsPipeline,
  shapeUserPaths,
  ENGAGEMENT_EVENTS,
  FORM_EVENTS,
  ERROR_EVENTS,
  insightsPipeline,
  shapeInsights,
} = require('./aggregate');

function pageViewsTrend(docs, period = 'daily') {
  const buckets = new Map();
  for (const doc of docs.filter((d) => isPageView(d.event_name))) {
    const t = eventTime(doc);
    if (!t) continue;
    let key;
    if (period === 'hourly') {
      key = `${t.toISOString().slice(0, 13)}:00`;
    } else if (period === 'weekly') {
      const tmp = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      const day = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() - day + 1);
      key = tmp.toISOString().slice(0, 10);
    } else {
      key = t.toISOString().slice(0, 10);
    }
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, pageViews]) => ({ date, pageViews }));
}

function emptyVital() {
  return { avg: null, p75: null, count: 0, rating: 'no-data' };
}

function vitalsFromDocs(docs) {
  const pick = (name) => {
    const values = docs
      .filter((d) => d.event_name === `web_vital_${name.toLowerCase()}`)
      .map((d) => Number(d.data?.value ?? d.data?.metric_value ?? d.data?.[name] ?? d.data?.[name.toLowerCase()]))
      .filter((n) => Number.isFinite(n));
    if (!values.length) return emptyVital();
    const sorted = [...values].sort((a, b) => a - b);
    const p75 = percentile(sorted, 75);
    const mean = avg(values);
    return {
      avg: mean == null ? null : Math.round(mean * 1000) / 1000,
      p75: p75 == null ? null : Math.round(p75 * 1000) / 1000,
      count: values.length,
      rating: vitalRating(name, p75),
    };
  };
  return { LCP: pick('LCP'), FID: pick('FID'), CLS: pick('CLS') };
}

function isoWeek(date) {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  const year = t.getUTCFullYear();
  const label = `${year}-W${String(week).padStart(2, '0')}`;
  return { week: label, label: `${year} W${week}`, year, weekNum: week, start: t };
}

function buildCohortRows(userRows) {
  const cohorts = new Map();
  for (const row of userRows || []) {
    const uid = row._id;
    const first = row.first instanceof Date ? row.first : new Date(row.first);
    if (!uid || Number.isNaN(first.getTime())) continue;
    const meta = isoWeek(first);
    let bucket = cohorts.get(meta.week);
    if (!bucket) {
      bucket = { week: meta.week, label: meta.label, users: [], start: meta.start, times: new Map() };
      cohorts.set(meta.week, bucket);
    }
    bucket.users.push(uid);
    bucket.times.set(uid, (row.times || []).map((value) => (value instanceof Date ? value : new Date(value))));
  }
  return [...cohorts.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((row) => {
      const retained = [0, 0, 0, 0, 0];
      for (const uid of row.users) {
        const times = row.times.get(uid) || [];
        for (let w = 1; w <= 4; w += 1) {
          const start = new Date(row.start.getTime() + w * 7 * 86400000);
          const end = new Date(start.getTime() + 7 * 86400000);
          if (times.some((t) => t >= start && t < end)) retained[w] += 1;
        }
      }
      const total = row.users.length;
      return {
        week: row.week,
        label: row.label,
        total,
        w0: 100,
        w1: percent(retained[1], total || 1, 0),
        w2: percent(retained[2], total || 1, 0),
        w3: percent(retained[3], total || 1, 0),
        w4: percent(retained[4], total || 1, 0),
      };
    });
}

// Short in-memory cache for aggregate report endpoints (keyed by path + full
// query string, which includes apiKey and date range). Dashboards fire many
// requests per load and on every tab switch; 60s staleness is invisible there.
// Not used for /analytics/metrics (live visitor count), drill-downs, or the
// realtime SSE stream. REPORT_CACHE_TTL_MS=0 disables it.
const CACHED_REPORTS = new Set([
  '/analytics/metrics-comparison', '/analytics/page-views', '/analytics/top-pages', '/analytics/geographic',
  '/analytics/device-breakdown', '/analytics/browser-breakdown', '/analytics/traffic-sources',
  '/analytics/web-vitals', '/analytics/page-vitals', '/analytics/insights', '/analytics/session-stats',
  '/analytics/entry-pages', '/analytics/exit-pages', '/analytics/events-trend', '/analytics/events-breakdown',
  '/analytics/conversion-funnel', '/analytics/form-interactions', '/analytics/tooltip-insights',
  '/analytics/attribution', '/analytics/cohort-retention', '/analytics/user-paths', '/analytics/error-tracking',
  '/analytics/rage-dead-clicks',
]);

function createReportCache({ ttlMs, maxEntries = 300 } = {}) {
  const store = new Map();
  return {
    ttlMs,
    key(req) {
      const q = Object.keys(req.query || {}).sort().map((k) => `${k}=${JSON.stringify(req.query[k])}`).join('&');
      return `${req.path}?${q}`;
    },
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.expires <= Date.now()) { store.delete(key); return null; }
      return hit.body;
    },
    set(key, body) {
      if (store.size >= maxEntries) store.delete(store.keys().next().value);
      store.set(key, { body, expires: Date.now() + ttlMs });
    },
  };
}

function registerMetricRoutes(app, { db, reportCacheTtlMs }) {
  const envTtl = Number.parseInt(process.env.REPORT_CACHE_TTL_MS, 10);
  const ttlMs = reportCacheTtlMs != null ? reportCacheTtlMs : (Number.isFinite(envTtl) ? envTtl : 60000);
  const cache = createReportCache({ ttlMs });
  const guarded = (handler) => async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: 'stats unavailable' });
      const apiKey = requireApiKey(req, res);
      if (!apiKey) return;
      const route = req.route && req.route.path;
      if (cache.ttlMs > 0 && req.method === 'GET' && CACHED_REPORTS.has(route)) {
        const key = cache.key(req);
        const hit = cache.get(key);
        res.set('Cache-Control', `private, max-age=${Math.floor(cache.ttlMs / 1000)}`);
        if (hit) {
          res.set('X-Report-Cache', 'hit');
          return res.json(hit);
        }
        res.set('X-Report-Cache', 'miss');
        const json = res.json.bind(res);
        res.json = (body) => {
          if (res.statusCode === 200) cache.set(key, body);
          return json(body);
        };
      }
      const rawCol = db.collection(process.env.EVENTS_COLLECTION || 'events');
      const rules = await loadExclusionRules(db, apiKey, { keysCollection: process.env.API_KEYS_COLLECTION || 'api_keys' });
      const col = withExclusion(rawCol, exclusionMatch(rules));
      await handler(req, res, apiKey, col);
    } catch (err) {
      console.error('[analytics-api] metrics failed', req.method, req.path, err);
      return res.status(500).json({ error: err.message || 'metrics failed' });
    }
  };

  app.get('/analytics/metrics', guarded(async (req, res, apiKey, col) => {
    const [core, live] = await Promise.all([
      aggregate(col, coreMetricsPipeline(composeMatch(apiKey, req))),
      aggregate(col, liveVisitorsPipeline(apiKey)),
    ]);
    const liveCount = live[0] ? live[0].n : 0;
    return res.json(shapeCoreMetrics(core[0], liveCount));
  }));

  app.get('/analytics/metrics-comparison', guarded(async (req, res, apiKey, col) => {
    const prev = previousRange(req);
    const [currentRows, prevRows] = await Promise.all([
      aggregate(col, coreMetricsPipeline(composeMatch(apiKey, req))),
      prev
        ? aggregate(col, coreMetricsPipeline(composeMatch(apiKey, reqWithRange(prev.start, prev.end))))
        : Promise.resolve(null),
    ]);
    const current = shapeCoreMetrics(currentRows[0], 0);
    const previous = prevRows ? shapeCoreMetrics(prevRows[0], 0) : {};
    return res.json({
      current,
      previous,
      trends: {
        totalPageViews: trendPct(current.totalPageViews, previous.totalPageViews),
        uniqueVisitors: trendPct(current.uniqueVisitors, previous.uniqueVisitors),
        bounceRate: trendPct(current.bounceRate, previous.bounceRate),
        avgSessionDuration: trendPct(current.avgSessionDuration, previous.avgSessionDuration),
      },
    });
  }));

  app.get('/analytics/page-views', guarded(async (req, res, apiKey, col) => {
    const period = String(req.query.period || req.query.range || 'daily').replace(/^\d+/, '') || 'daily';
    const normalized = period === 'hourly' || period === 'weekly' ? period : 'daily';
    const rows = await aggregate(col, pageViewsPipeline(
      composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } }),
      normalized,
    ));
    return res.json(shapePageViews(rows, normalized));
  }));

  app.get('/analytics/top-pages', guarded(async (req, res, apiKey, col) => {
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const rows = await aggregate(col, topPagesPipeline(
      composeMatch(apiKey, req, { event_name: { $in: [...PAGE_VIEW_EVENTS, ...ENGAGEMENT_EVENTS] } }),
    ));
    return res.json(shapeTopPages(rows, page, limit));
  }));

  app.get('/analytics/geographic', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, countRowsPipeline(
      composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } }),
      countryExpr(),
      'visitors',
    ));
    return res.json(shapeGeographic(rows));
  }));

  app.get('/analytics/device-breakdown', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, countRowsPipeline(
      composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } }),
      deviceExpr(),
    ));
    return res.json({ devices: shapeNamedCounts(rows, 'device') });
  }));

  app.get('/analytics/browser-breakdown', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, browserPipeline(
      composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } }),
    ));
    const facet = rows[0] || {};
    return res.json({
      browsers: shapeNamedCounts(facet.browsers, 'name'),
      operatingSystems: shapeNamedCounts(facet.operatingSystems, 'name'),
    });
  }));

  app.get('/analytics/traffic-sources', guarded(async (req, res, apiKey, col) => {
    // Grouped server-side by the few fields the classifiers read; classification
    // itself stays in JS (classifySource / referrerIdentity / extractUtm) so the
    // numbers are identical to the old per-event loop.
    const pvMatch = composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const navMatch = composeMatch(apiKey, req, { event_name: { $in: ['navigation', 'route_change'] } });
    const [groups, pvUtmGroups, navGroups] = await Promise.all([
      aggregate(col, sourceGroupsPipeline(pvMatch)),
      aggregate(col, sourceGroupsPipeline({ $and: [pvMatch, utmCandidateMatch()] }, { withSession: true })),
      aggregate(col, sourceGroupsPipeline({ $and: [navMatch, utmCandidateMatch()] }, { withSession: true })),
    ]);
    const asDoc = (g) => g._id || {};
    const totalVisits = groups.reduce((n, g) => n + (g.n || 0), 0);
    const srcMap = new Map();
    const refMap = new Map();
    for (const g of groups) {
      const doc = asDoc(g);
      const source = classifySource(doc.data || {}, doc);
      srcMap.set(source, (srcMap.get(source) || 0) + g.n);
      const id = referrerIdentity(doc.data || {}, doc);
      const prev = refMap.get(id.name) || { name: id.name, channel: id.channel, host: id.host, visits: 0 };
      prev.visits += g.n;
      if (!prev.host && id.host) prev.host = id.host;
      refMap.set(id.name, prev);
    }
    const sources = withPercentage([...srcMap.entries()].sort((a, b) => b[1] - a[1]), totalVisits, 'source')
      .map((row) => ({ source: row.source, visits: row.count, percentage: row.percentage }));
    const referrers = [...refMap.values()]
      .sort((a, b) => b.visits - a.visits)
      .map((row) => ({ ...row, percentage: percent(row.visits, totalVisits || 1) }));
    const utmKeyOf = (doc) => {
      const utm = extractUtm(doc.data || {}, doc);
      if (!utm.utm_source || !utm.utm_medium || !utm.utm_campaign) return null;
      return { source: utm.utm_source, medium: utm.utm_medium, campaign: utm.utm_campaign,
        key: `${utm.utm_source}|${utm.utm_medium}|${utm.utm_campaign}` };
    };
    const utmMap = new Map();
    const addVisits = (u, n) => {
      const prev = utmMap.get(u.key) || { source: u.source, medium: u.medium, campaign: u.campaign, visits: 0 };
      prev.visits += n;
      utmMap.set(u.key, prev);
    };
    for (const g of groups) {
      const u = utmKeyOf(asDoc(g));
      if (u) addVisits(u, g.n);
    }
    const pageViewCampaigns = new Set();
    for (const g of pvUtmGroups) {
      const doc = asDoc(g);
      const u = utmKeyOf(doc);
      const sid = sessionIdOf(doc);
      if (u && sid) pageViewCampaigns.add(`${sid}|${u.key}`);
    }
    // Share links often land as navigation/route events whose page path still
    // contains ?utm_* while the paired page_view stored only the pathname.
    for (const g of navGroups) {
      const doc = asDoc(g);
      const u = utmKeyOf(doc);
      if (!u) continue;
      const sid = sessionIdOf(doc);
      if (sid && pageViewCampaigns.has(`${sid}|${u.key}`)) continue;
      addVisits(u, g.n);
    }
    return res.json({
      sources,
      referrers,
      utmSources: [...utmMap.values()].sort((a, b) => b.visits - a.visits),
      totalVisits,
    });
  }));

  app.get('/analytics/web-vitals', guarded(async (req, res, apiKey, col) => {
    const names = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'FID'];
    const vitals = {};
    await Promise.all(names.map(async (name) => {
      vitals[name] = await loadVital(
        col,
        composeMatch(apiKey, req, { event_name: `web_vital_${name.toLowerCase()}` }),
        name,
      );
    }));
    return res.json({ vitals });
  }));

  app.get('/analytics/page-vitals', guarded(async (req, res, apiKey, col) => {
    const limit = clampInt(req.query.limit, 15, 1, 100);
    const rows = await aggregate(col, pageVitalsPipeline(composeMatch(apiKey, req, {
      event_name: { $in: ['web_vital_lcp', 'web_vital_inp', 'web_vital_fid', 'web_vital_cls'] },
    })));
    return res.json(shapePageVitals(rows, limit));
  }));

  // Outbound clicks, downloads, 404s, site search, goals, revenue, languages, screen sizes.
  app.get('/analytics/insights', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, insightsPipeline(composeMatch(apiKey, req)));
    return res.json(shapeInsights(rows[0] || {}));
  }));

  app.get('/analytics/session-stats', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, sessionStatsPipeline(composeMatch(apiKey, req)));
    return res.json(shapeSessionStats(rows[0] || {}));
  }));

  app.get('/analytics/entry-pages', guarded(async (req, res, apiKey, col) => {
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const rows = await aggregate(col, entryPagesPipeline(composeMatch(apiKey, req)));
    return res.json(shapeRankedPages(rows, limit, 'entrances'));
  }));

  app.get('/analytics/exit-pages', guarded(async (req, res, apiKey, col) => {
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const rows = await aggregate(col, exitPagesPipeline(composeMatch(apiKey, req)));
    return res.json(shapeRankedPages(rows, limit, 'exits'));
  }));

  app.get('/analytics/events-trend', guarded(async (req, res, apiKey, col) => {
    // Default to the last 7 days; previous period is the same length immediately before.
    const end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const start = req.query.startDate ? new Date(req.query.startDate) : new Date(end.getTime() - 7 * 86400000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ error: 'invalid date range' });
    }
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const rows = await aggregate(col, eventsTrendPipeline(composeMatch(apiKey, reqWithRange(prevStart, end)), start));
    return res.json(shapeEventsTrend(rows[0] || {}, { start, end }));
  }));

  app.get('/analytics/events-breakdown', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, eventsBreakdownPipeline(composeMatch(apiKey, req)));
    return res.json(shapeEventsBreakdown(rows[0] || {}, {
      clicksPage: clampInt(req.query.clicksPage, 1, 1, 10000),
      clicksLimit: clampInt(req.query.clicksLimit, 10, 1, 100),
      customPage: clampInt(req.query.customEventsPage, 1, 1, 10000),
      customLimit: clampInt(req.query.customEventsLimit, 10, 1, 100),
    }));
  }));

  app.get('/analytics/event-history', guarded(async (req, res, apiKey, col) => {
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 50, 1, 200);
    const match = composeMatch(apiKey, req);
    const clientMatch = historyClientMatch(req.query || {});
    const [optionRows, pageRows, countRows] = await Promise.all([
      aggregate(col, eventHistoryOptionsPipeline(match)),
      aggregate(col, eventHistoryPagePipeline(match, { skip: (page - 1) * limit, limit, clientMatch })),
      aggregate(col, eventHistoryCountPipeline(match, clientMatch)),
    ]);
    const facet = optionRows[0] || {};
    const total = countRows[0] ? countRows[0].n : 0;
    const ids = (list) => (list || []).map((row) => row._id).filter((value) => value != null && value !== '');
    return res.json({
      events: await attachKnownEmails(col, apiKey, pageRows.map(formatHistoryEvent)),
      total,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
      eventTypes: ids(facet.eventTypes).sort(),
      filterOptions: {
        countries: ids(facet.countries).sort(),
        devices: ids(facet.devices).sort(),
        pages: ids(facet.pages).sort(),
      },
    });
  }));

  app.get('/analytics/session-events', guarded(async (req, res, apiKey, col) => {
    const sessionId = String(req.query.sessionId || '').trim();
    if (!sessionId) return res.json({ events: [] });
    const docs = await findEvents(col, composeMatch(apiKey, req, {
      $or: [{ session_id: sessionId }, { 'data.session_id': sessionId }],
    }), { sort: { timestamp: 1, createdAt: 1 }, limit: 500 });
    return res.json({ events: await attachKnownEmails(col, apiKey, docs.map(formatHistoryEvent)) });
  }));

  app.get('/analytics/users/:userId/events', guarded(async (req, res, apiKey, col) => {
    const userId = String(req.params.userId || '').trim();
    const docs = await findEvents(col, composeMatch(apiKey, req, {
      $or: [{ user_id: userId }, { 'data.user_id': userId }],
    }), { sort: { timestamp: -1 }, limit: 200 });
    return res.json(await attachKnownEmails(col, apiKey, docs.map(formatHistoryEvent)));
  }));

  app.get('/analytics/conversion-funnel', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, funnelPipeline(composeMatch(apiKey, req)));
    return res.json(shapeFunnel(rows));
  }));

  app.get('/analytics/funnel-events/:stepEvent', guarded(async (req, res, apiKey, col) => {
    const stepEvent = String(req.params.stepEvent || '').trim();
    const limit = clampInt(req.query.limit, 20, 1, 1000);
    const names = isPageView(stepEvent) ? PAGE_VIEW_EVENTS : [stepEvent];
    const filter = composeMatch(apiKey, req, { event_name: { $in: names } });
    const [total, docs] = await Promise.all([
      col.countDocuments(filter),
      findEvents(col, filter, { sort: { timestamp: -1 }, limit }),
    ]);
    const uniqueVisitors = new Set(docs.map(userIdOf).filter(Boolean)).size;
    return res.json({
      step: stepEvent,
      eventName: stepEvent,
      count: uniqueVisitors || total,
      uniqueVisitors: uniqueVisitors || total,
      events: docs.map(formatHistoryEvent),
      pagination: { page: 1, limit, total },
    });
  }));

  app.get('/analytics/form-interactions', guarded(async (req, res, apiKey, col) => {
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const rows = await aggregate(col, formPipeline(composeMatch(apiKey, req, {
      event_name: { $in: FORM_EVENTS },
    })));
    return res.json(shapeForms(rows, page, limit));
  }));

  app.get('/analytics/tooltip-insights', guarded(async (req, res, apiKey, col) => {
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const rows = await aggregate(col, tooltipPipeline(composeMatch(apiKey, req, { event_name: 'tooltip_view' })));
    return res.json(shapeTooltips(rows, page, limit));
  }));

  app.get('/analytics/attribution', guarded(async (req, res, apiKey, col) => {
    // Compact projection (source/UTM inputs + session + time) instead of full
    // documents; the session logic below is unchanged.
    const docs = await aggregate(col, attributionInputsPipeline(composeMatch(apiKey, req)));
    const sessions = [...groupSessions(docs).values()];
    const firstTouch = topCounts(sessions, (s) => {
      const first = s.events[0];
      const fromFirst = classifySource(first?.data || {}, first);
      if (fromFirst !== 'Direct') return fromFirst;
      return classifySource(s.attribution || {});
    });
    const lastTouch = topCounts(sessions, (s) => {
      const last = s.events.at(-1);
      const fromLast = classifySource(last?.data || {}, last);
      if (fromLast !== 'Direct') return fromLast;
      return classifySource(s.attribution || {});
    });
    const linearMap = new Map();
    for (const session of sessions) {
      const sources = [...new Set(session.events.map((e) => classifySource(e.data || {}, e)))];
      const share = sources.length ? 1 / sources.length : 0;
      for (const source of sources) {
        linearMap.set(source, (linearMap.get(source) || 0) + share);
      }
    }
    const toEntries = (ranked, total) => ranked.map(([source, value]) => ({
      source,
      value: Math.round(value * 10) / 10,
      percentage: percent(value, total || 1),
    }));
    return res.json({
      totalSessions: sessions.length,
      firstTouch: toEntries(firstTouch, sessions.length),
      lastTouch: toEntries(lastTouch, sessions.length),
      linear: [...linearMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([source, value]) => ({
          source,
          value: Math.round(value * 10) / 10,
          percentage: percent(value, sessions.length || 1),
        })),
    });
  }));

  app.get('/analytics/cohort-retention', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, cohortPipeline(composeMatch(apiKey, req, {
      event_name: { $in: PAGE_VIEW_EVENTS },
    })));
    return res.json({ cohorts: buildCohortRows(rows) });
  }));

  app.get('/analytics/user-paths', guarded(async (req, res, apiKey, col) => {
    const limit = clampInt(req.query.limit, 15, 1, 100);
    const rows = await aggregate(col, userPathsPipeline(composeMatch(apiKey, req, {
      event_name: { $in: PAGE_VIEW_EVENTS },
    })));
    return res.json(shapeUserPaths(rows, limit));
  }));

  app.get('/analytics/error-tracking', guarded(async (req, res, apiKey, col) => {
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const rows = await aggregate(col, errorPipeline(composeMatch(apiKey, req, {
      event_name: { $in: ERROR_EVENTS },
    })));
    return res.json(shapeErrors(rows, limit));
  }));

  app.get('/analytics/rage-dead-clicks', guarded(async (req, res, apiKey, col) => {
    const rows = await aggregate(col, ragePipeline(composeMatch(apiKey, req, {
      event_name: { $in: ['rage_click', 'dead_click'] },
    })));
    const facet = rows[0] || {};
    return res.json({
      rageClicks: shapeRageRows(facet.rage),
      deadClicks: shapeRageRows(facet.dead),
    });
  }));

  app.get('/analytics/realtime-events', guarded(async (req, res, apiKey, col) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const recent = await findEvents(col, composeMatch(apiKey, { query: {} }), {
      sort: { timestamp: -1, createdAt: -1 },
      limit: 15,
    });
    for (const doc of recent.slice().reverse()) {
      res.write(`data: ${JSON.stringify(formatHistoryEvent(doc))}\n\n`);
    }
    const timer = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);
    req.on('close', () => {
      clearInterval(timer);
      res.end();
    });
  }));
}

module.exports = {
  registerMetricRoutes,
  computeCoreMetrics,
  pageViewsTrend,
  groupSessions,
};
