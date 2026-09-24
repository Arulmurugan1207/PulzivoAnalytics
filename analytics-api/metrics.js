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
  classifySource,
  formatHistoryEvent,
  sessionIdOf,
  userIdOf,
  isPageView,
  clampInt,
  previousRange,
  reqWithRange,
} = require('./query');

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
    if (doc.data?.attribution && !session.attribution) session.attribution = doc.data.attribution;
    session.source = classifySource(doc.data || {});
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
  const scrolls = pageViews.map((d) => Number(d.data?.scroll_depth)).filter((n) => Number.isFinite(n));
  const times = pageViews.map((d) => Number(d.data?.time_on_page)).filter((n) => Number.isFinite(n) && n > 0);
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
  shapeRageRows,
  attributionPipeline,
  shapeAttribution,
  cohortPipeline,
  userPathsPipeline,
  shapeUserPaths,
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

function registerMetricRoutes(app, { db }) {
  const guarded = (handler) => async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: 'stats unavailable' });
      const apiKey = requireApiKey(req, res);
      if (!apiKey) return;
      const col = db.collection(process.env.EVENTS_COLLECTION || 'events');
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
      composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } }),
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
    const rows = await aggregate(col, trafficPipeline(
      composeMatch(apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } }),
    ));
    return res.json(shapeTraffic(rows[0] || {}));
  }));

  app.get('/analytics/web-vitals', guarded(async (req, res, apiKey, col) => {
    const names = ['LCP', 'FID', 'CLS'];
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
      event_name: { $in: ['web_vital_lcp', 'web_vital_fid', 'web_vital_cls'] },
    })));
    return res.json(shapePageVitals(rows, limit));
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
      events: pageRows.map(formatHistoryEvent),
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
    return res.json({ events: docs.map(formatHistoryEvent) });
  }));

  app.get('/analytics/users/:userId/events', guarded(async (req, res, apiKey, col) => {
    const userId = String(req.params.userId || '').trim();
    const docs = await findEvents(col, composeMatch(apiKey, req, {
      $or: [{ user_id: userId }, { 'data.user_id': userId }],
    }), { sort: { timestamp: -1 }, limit: 200 });
    return res.json(docs.map(formatHistoryEvent));
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
      event_name: { $in: ['form_submit', 'form_abandon', 'form_focus'] },
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
    const rows = await aggregate(col, attributionPipeline(composeMatch(apiKey, req)));
    return res.json(shapeAttribution(rows));
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
      event_name: { $in: ['error', 'javascript_error'] },
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
