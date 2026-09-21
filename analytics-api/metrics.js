'use strict';

const {
  PAGE_VIEW_EVENTS,
  CLICK_EVENTS,
  CONVERSION_EVENTS,
  SYSTEM_EVENTS,
  EVENT_CATEGORIES,
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

async function loadScopedEvents(col, apiKey, req, extra) {
  return findEvents(col, composeMatch(apiKey, req, extra));
}

async function liveVisitorCount(col, apiKey) {
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const docs = await findEvents(col, composeMatch(apiKey, reqWithRange(since, new Date()), {
    $or: [{ session_id: { $nin: [null, ''] } }, { 'data.session_id': { $nin: [null, ''] } }],
  }));
  return new Set(docs.map(sessionIdOf).filter(Boolean)).size;
}

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
    const [docs, liveCount] = await Promise.all([
      loadScopedEvents(col, apiKey, req),
      liveVisitorCount(col, apiKey),
    ]);
    return res.json(computeCoreMetrics(docs, { liveCount }));
  }));

  app.get('/analytics/metrics-comparison', guarded(async (req, res, apiKey, col) => {
    const currentDocs = await loadScopedEvents(col, apiKey, req);
    const current = computeCoreMetrics(currentDocs);
    const prev = previousRange(req);
    let previous = {};
    if (prev) {
      const prevDocs = await loadScopedEvents(col, apiKey, reqWithRange(prev.start, prev.end));
      previous = computeCoreMetrics(prevDocs);
    }
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
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const period = String(req.query.period || req.query.range || 'daily').replace(/^\d+/, '') || 'daily';
    const normalized = period === 'hourly' || period === 'weekly' ? period : 'daily';
    return res.json({ trend: pageViewsTrend(docs, normalized), period: normalized });
  }));

  app.get('/analytics/top-pages', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const grouped = new Map();
    for (const doc of docs) {
      const path = eventPage(doc);
      let row = grouped.get(path);
      if (!row) {
        row = { path, views: 0, times: [], scrolls: [] };
        grouped.set(path, row);
      }
      row.views += 1;
      const timeOnPage = Number(doc.data?.time_on_page);
      if (Number.isFinite(timeOnPage)) row.times.push(timeOnPage);
      const scroll = Number(doc.data?.scroll_depth);
      if (Number.isFinite(scroll)) row.scrolls.push(scroll);
    }
    const totalPageViews = docs.length;
    const ranked = [...grouped.values()]
      .sort((a, b) => b.views - a.views)
      .map((row) => ({
        path: row.path,
        views: row.views,
        percentage: percent(row.views, totalPageViews || 1),
        avgTimeOnPage: row.times.length ? Math.round(avg(row.times)) : null,
        avgScrollDepth: row.scrolls.length ? Math.round((avg(row.scrolls) || 0) * 10) / 10 : null,
      }));
    const start = (page - 1) * limit;
    return res.json({
      pages: ranked.slice(start, start + limit),
      total: ranked.length,
      totalPageViews,
    });
  }));

  app.get('/analytics/geographic', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const ranked = topCounts(docs, countryOf);
    const total = docs.length;
    return res.json({
      geographic: ranked.map(([country, visitors]) => ({
        country,
        visitors,
        views: visitors,
        percentage: percent(visitors, total || 1),
        flag: countryFlag(country),
      })),
    });
  }));

  app.get('/analytics/device-breakdown', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const ranked = topCounts(docs, (d) => deviceLabel(d.data || {}));
    return res.json({ devices: withPercentage(ranked, docs.length, 'device') });
  }));

  app.get('/analytics/browser-breakdown', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const browsers = withPercentage(topCounts(docs, (d) => browserName(d.data || {})), docs.length, 'name');
    const operatingSystems = withPercentage(topCounts(docs, (d) => osName(d.data || {})), docs.length, 'name');
    return res.json({ browsers, operatingSystems });
  }));

  app.get('/analytics/traffic-sources', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const sources = withPercentage(topCounts(docs, (d) => classifySource(d.data || {})), docs.length, 'source')
      .map((row) => ({ source: row.source, visits: row.count, percentage: row.percentage }));
    const utmMap = new Map();
    for (const doc of docs) {
      const attr = doc.data?.attribution || {};
      const source = attr.utm_source || doc.data?.utm_source;
      const medium = attr.utm_medium || doc.data?.utm_medium;
      const campaign = attr.utm_campaign || doc.data?.utm_campaign;
      if (!source || !medium || !campaign) continue;
      const key = `${source}|${medium}|${campaign}`;
      const prev = utmMap.get(key) || { source, medium, campaign, visits: 0 };
      prev.visits += 1;
      utmMap.set(key, prev);
    }
    return res.json({
      sources,
      utmSources: [...utmMap.values()].sort((a, b) => b.visits - a.visits),
      totalVisits: docs.length,
    });
  }));

  app.get('/analytics/web-vitals', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, {
      event_name: { $in: ['web_vital_lcp', 'web_vital_fid', 'web_vital_cls'] },
    });
    return res.json({ vitals: vitalsFromDocs(docs) });
  }));

  app.get('/analytics/page-vitals', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, {
      event_name: { $in: ['web_vital_lcp', 'web_vital_fid', 'web_vital_cls'] },
    });
    const limit = clampInt(req.query.limit, 15, 1, 100);
    const byPage = new Map();
    for (const doc of docs) {
      const page = eventPage(doc);
      let row = byPage.get(page);
      if (!row) {
        row = { page, lcp: [], fid: [], cls: [] };
        byPage.set(page, row);
      }
      const value = Number(doc.data?.value ?? doc.data?.metric_value);
      if (!Number.isFinite(value)) continue;
      if (doc.event_name === 'web_vital_lcp') row.lcp.push(value);
      if (doc.event_name === 'web_vital_fid') row.fid.push(value);
      if (doc.event_name === 'web_vital_cls') row.cls.push(value);
    }
    const pages = [...byPage.values()]
      .map((row) => {
        const avgLCP = avg(row.lcp);
        const avgFID = avg(row.fid);
        const avgCLS = avg(row.cls);
        return {
          page: row.page,
          count: row.lcp.length + row.fid.length + row.cls.length,
          avgLCP: avgLCP == null ? null : Math.round(avgLCP * 1000) / 1000,
          avgFID: avgFID == null ? null : Math.round(avgFID * 1000) / 1000,
          avgCLS: avgCLS == null ? null : Math.round(avgCLS * 1000) / 1000,
          lcpRating: vitalRating('LCP', avgLCP),
          fidRating: vitalRating('FID', avgFID),
          clsRating: vitalRating('CLS', avgCLS),
        };
      })
      .sort((a, b) => b.count - a.count);
    return res.json({ pages: pages.slice(0, limit), total: pages.length });
  }));

  app.get('/analytics/session-stats', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req);
    const sessions = [...groupSessions(docs).values()];
    const entry = topCounts(sessions, (s) => s.entryPage);
    const exit = topCounts(sessions, (s) => s.exitPage);
    const mapPages = (ranked) => ranked.slice(0, 10).map(([page, count]) => ({
      page,
      count,
      percentage: percent(count, sessions.length || 1),
    }));
    const durations = sessions.map(durationSec).filter((n) => n > 0);
    return res.json({
      totalSessions: sessions.length,
      avgPagesPerSession: Math.round(((avg(sessions.map((s) => s.pageViews)) || 0) * 10)) / 10,
      avgSessionDuration: Math.round(avg(durations) || 0),
      topEntryPages: mapPages(entry),
      topExitPages: mapPages(exit),
    });
  }));

  app.get('/analytics/entry-pages', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const sessions = [...groupSessions(docs).values()];
    const ranked = topCounts(sessions, (s) => s.entryPage);
    return res.json({
      pages: ranked.slice(0, limit).map(([path, entrances]) => ({
        path,
        views: entrances,
        entrances,
        percentage: percent(entrances, sessions.length || 1),
        isEntry: true,
      })),
      total: ranked.length,
    });
  }));

  app.get('/analytics/exit-pages', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const sessions = [...groupSessions(docs).values()];
    const ranked = topCounts(sessions, (s) => s.exitPage);
    return res.json({
      pages: ranked.slice(0, limit).map(([path, exits]) => ({
        path,
        views: exits,
        exits,
        percentage: percent(exits, sessions.length || 1),
        isExit: true,
      })),
      total: ranked.length,
    });
  }));

  app.get('/analytics/events-breakdown', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req);
    const clicksPage = clampInt(req.query.clicksPage, 1, 1, 10000);
    const clicksLimit = clampInt(req.query.clicksLimit, 10, 1, 100);
    const customPage = clampInt(req.query.customEventsPage, 1, 1, 10000);
    const customLimit = clampInt(req.query.customEventsLimit, 10, 1, 100);
    const totalEvents = docs.length;
    const eventCounts = topCounts(docs, (d) => d.event_name || 'unknown');
    const events = eventCounts.map(([name, count]) => ({
      name,
      count,
      percentage: percent(count, totalEvents || 1, 1),
    }));
    const customAll = docs.filter((d) => !SYSTEM_EVENTS.has(d.event_name));
    const customGrouped = new Map();
    for (const doc of customAll) {
      const name = doc.event_name || 'unknown';
      const prev = customGrouped.get(name) || { name, count: 0, lastSeen: null };
      prev.count += 1;
      const t = eventTime(doc);
      if (t && (!prev.lastSeen || t > prev.lastSeen)) prev.lastSeen = t;
      customGrouped.set(name, prev);
    }
    const customSorted = [...customGrouped.values()].sort((a, b) => b.count - a.count);
    const clicks = docs.filter((d) => CLICK_EVENTS.includes(d.event_name));
    const clickGrouped = new Map();
    for (const doc of clicks) {
      const element = doc.data?.element || doc.data?.target || doc.data?.selector || 'unknown';
      const label = doc.data?.event_label || doc.data?.label || '';
      const page = eventPage(doc);
      const key = `${element}|${label}|${page}`;
      const prev = clickGrouped.get(key) || { element, label, page, count: 0 };
      prev.count += 1;
      clickGrouped.set(key, prev);
    }
    const clickSorted = [...clickGrouped.values()].sort((a, b) => b.count - a.count);
    const categoryCounts = {};
    for (const [name, list] of Object.entries(EVENT_CATEGORIES)) {
      categoryCounts[name] = docs.filter((d) => list.includes(d.event_name)).length;
    }
    categoryCounts.custom = customAll.length;
    const clickStart = (clicksPage - 1) * clicksLimit;
    const customStart = (customPage - 1) * customLimit;
    return res.json({
      events,
      customEvents: customSorted.slice(customStart, customStart + customLimit).map((row) => ({
        name: row.name,
        count: row.count,
        last_seen: row.lastSeen ? row.lastSeen.toISOString() : null,
        lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
        percentage: percent(row.count, customAll.length || 1),
      })),
      customEventsTotal: customSorted.length,
      topClicks: clickSorted.slice(clickStart, clickStart + clicksLimit),
      topClicksTotal: clickSorted.length,
      summary: {
        rageClicks: docs.filter((d) => d.event_name === 'rage_click').length,
        deadClicks: docs.filter((d) => d.event_name === 'dead_click').length,
        formSubmits: docs.filter((d) => d.event_name === 'form_submit').length,
        formAbandons: docs.filter((d) => d.event_name === 'form_abandon').length,
        formFocuses: docs.filter((d) => d.event_name === 'form_focus').length,
      },
      categoryCounts,
      totalEvents,
    });
  }));

  app.get('/analytics/event-history', guarded(async (req, res, apiKey, col) => {
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 50, 1, 200);
    const all = sortByTime(await loadScopedEvents(col, apiKey, req)).reverse();
    const countriesFilter = String(req.query.countries || '').split(',').map((s) => s.trim()).filter(Boolean);
    const devicesFilter = String(req.query.devices || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const pagesFilter = String(req.query.pages || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cats = String(req.query.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
    const categoryNames = new Set(cats.flatMap((c) => EVENT_CATEGORIES[c] || []));
    const eventType = String(req.query.eventType || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const filtered = all.filter((doc) => {
      if (eventType && doc.event_name !== eventType) return false;
      if (categoryNames.size && !categoryNames.has(doc.event_name)) return false;
      if (countriesFilter.length && !countriesFilter.includes(countryOf(doc))) return false;
      if (devicesFilter.length && !devicesFilter.includes(deviceLabel(doc.data || {}).toLowerCase())) return false;
      if (pagesFilter.length && !pagesFilter.includes(eventPage(doc))) return false;
      if (search) {
        const hay = [
          doc.event_name,
          eventPage(doc),
          userIdOf(doc),
          countryOf(doc),
          sessionIdOf(doc),
        ].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
    const start = (page - 1) * limit;
    return res.json({
      events: filtered.slice(start, start + limit).map(formatHistoryEvent),
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit) || 1),
      eventTypes: [...new Set(all.map((d) => d.event_name).filter(Boolean))].sort(),
      filterOptions: {
        countries: [...new Set(all.map(countryOf))].sort(),
        devices: [...new Set(all.map((d) => deviceLabel(d.data || {})))].sort(),
        pages: [...new Set(all.map(eventPage))].sort(),
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
    const docs = await loadScopedEvents(col, apiKey, req);
    const steps = [
      { label: 'Page views', event: 'page_view' },
      { label: 'Clicks', event: 'click' },
      { label: 'Form submit', event: 'form_submit' },
    ];
    const first = docs.filter((d) => isPageView(d.event_name)).length;
    const payload = steps.map((step) => {
      const count = step.event === 'page_view'
        ? first
        : docs.filter((d) => d.event_name === step.event).length;
      return { label: step.label, count, percentage: percent(count, first || 1, 1) };
    });
    return res.json({ steps: payload });
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
    const docs = await loadScopedEvents(col, apiKey, req, {
      event_name: { $in: ['form_submit', 'form_abandon', 'form_focus'] },
    });
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const forms = new Map();
    for (const doc of docs) {
      const formId = doc.data?.formId || doc.data?.form_id || doc.data?.formName || 'unknown';
      const row = forms.get(formId) || {
        formId,
        submissions: 0,
        abandons: 0,
        fieldInteractions: 0,
        times: [],
      };
      if (doc.event_name === 'form_submit') {
        row.submissions += 1;
        const t = Number(doc.data?.time_to_complete || doc.data?.time_on_page);
        if (Number.isFinite(t)) row.times.push(t);
      } else if (doc.event_name === 'form_abandon') {
        row.abandons += 1;
      } else {
        row.fieldInteractions += 1;
      }
      forms.set(formId, row);
    }
    const all = [...forms.values()].map((row) => ({
      formId: row.formId,
      submissions: row.submissions,
      abandons: row.abandons,
      avgTimeToComplete: Math.round(avg(row.times) || 0),
      conversionRate: percent(row.submissions, (row.submissions + row.abandons) || 1, 1),
      fieldInteractions: row.fieldInteractions,
    })).sort((a, b) => b.submissions - a.submissions);
    const start = (page - 1) * limit;
    return res.json({
      forms: all.slice(start, start + limit),
      total: all.length,
      page,
      limit,
      pages: Math.max(1, Math.ceil(all.length / limit)),
    });
  }));

  app.get('/analytics/tooltip-insights', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: 'tooltip_view' });
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 10, 1, 100);
    const grouped = new Map();
    for (const doc of docs) {
      const id = doc.data?.tooltip_id || doc.data?.tooltipId || doc.data?.event_label || 'unknown';
      const prev = grouped.get(id) || {
        id,
        text: doc.data?.tooltip_text || doc.data?.label || id,
        section: doc.data?.section || '',
        page: eventPage(doc),
        count: 0,
      };
      prev.count += 1;
      grouped.set(id, prev);
    }
    const tooltips = [...grouped.values()].sort((a, b) => b.count - a.count);
    const start = (page - 1) * limit;
    return res.json({ tooltips: tooltips.slice(start, start + limit), total: tooltips.length });
  }));

  app.get('/analytics/attribution', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req);
    const sessions = [...groupSessions(docs).values()];
    const firstTouch = topCounts(sessions, (s) => {
      const first = s.events[0];
      return classifySource(first?.data || s.attribution || {});
    });
    const lastTouch = topCounts(sessions, (s) => classifySource(s.attribution || s.events.at(-1)?.data || {}));
    const linearMap = new Map();
    for (const session of sessions) {
      const sources = [...new Set(session.events.map((e) => classifySource(e.data || {})))];
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
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const firstByUser = new Map();
    const activity = new Map();
    for (const doc of docs) {
      const uid = userIdOf(doc);
      const t = eventTime(doc);
      if (!uid || !t) continue;
      if (!firstByUser.has(uid) || t < firstByUser.get(uid)) firstByUser.set(uid, t);
      if (!activity.has(uid)) activity.set(uid, []);
      activity.get(uid).push(t);
    }
    const cohorts = new Map();
    for (const [uid, first] of firstByUser.entries()) {
      const meta = isoWeek(first);
      let row = cohorts.get(meta.week);
      if (!row) row = { week: meta.week, label: meta.label, users: [], start: meta.start };
      row.users.push(uid);
      cohorts.set(meta.week, row);
    }
    const result = [...cohorts.values()]
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((row) => {
        const retained = [100, 0, 0, 0, 0];
        for (const uid of row.users) {
          const times = activity.get(uid) || [];
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
    return res.json({ cohorts: result });
  }));

  app.get('/analytics/user-paths', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, { event_name: { $in: PAGE_VIEW_EVENTS } });
    const limit = clampInt(req.query.limit, 15, 1, 100);
    const sessions = groupSessions(docs);
    const pairs = new Map();
    for (const session of sessions.values()) {
      const pages = session.events.filter((e) => isPageView(e.event_name)).map(eventPage);
      for (let i = 0; i < pages.length - 1; i += 1) {
        if (pages[i] === pages[i + 1]) continue;
        const key = `${pages[i]} => ${pages[i + 1]}`;
        const prev = pairs.get(key) || { from: pages[i], to: pages[i + 1], count: 0 };
        prev.count += 1;
        pairs.set(key, prev);
      }
    }
    const paths = [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, limit);
    return res.json({ paths, totalSessions: sessions.size });
  }));

  app.get('/analytics/error-tracking', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, {
      event_name: { $in: ['error', 'javascript_error'] },
    });
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const grouped = new Map();
    for (const doc of docs) {
      const type = doc.data?.error_type || doc.data?.type || doc.event_name;
      const message = doc.data?.message || doc.data?.error || 'Unknown error';
      const key = `${type}|${message}`;
      const prev = grouped.get(key) || {
        type,
        message,
        count: 0,
        users: new Set(),
        pages: new Set(),
        lastSeen: null,
      };
      prev.count += 1;
      const uid = userIdOf(doc);
      if (uid) prev.users.add(uid);
      prev.pages.add(eventPage(doc));
      const t = eventTime(doc);
      if (t && (!prev.lastSeen || t > prev.lastSeen)) prev.lastSeen = t;
      grouped.set(key, prev);
    }
    const errors = [...grouped.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((row) => ({
        type: row.type,
        message: row.message,
        count: row.count,
        affectedUsers: row.users.size,
        lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
        pageCount: row.pages.size,
      }));
    return res.json({ errors, total: grouped.size });
  }));

  app.get('/analytics/rage-dead-clicks', guarded(async (req, res, apiKey, col) => {
    const docs = await loadScopedEvents(col, apiKey, req, {
      event_name: { $in: ['rage_click', 'dead_click'] },
    });
    const group = (name) => {
      const map = new Map();
      for (const doc of docs.filter((d) => d.event_name === name)) {
        const element = doc.data?.element || doc.data?.target || 'unknown';
        const label = doc.data?.event_label || doc.data?.label || element;
        const page = eventPage(doc);
        const key = `${element}|${page}`;
        const prev = map.get(key) || {
          element,
          label,
          page,
          count: 0,
          clicks: [],
          lastSeen: null,
        };
        prev.count += 1;
        const clicks = Number(doc.data?.click_count || doc.data?.value);
        if (Number.isFinite(clicks)) prev.clicks.push(clicks);
        const t = eventTime(doc);
        if (t && (!prev.lastSeen || t > prev.lastSeen)) prev.lastSeen = t;
        map.set(key, prev);
      }
      return [...map.values()]
        .sort((a, b) => b.count - a.count)
        .map((row) => ({
          element: row.element,
          label: row.label,
          page: row.page,
          count: row.count,
          avgClicks: row.clicks.length ? Math.round((avg(row.clicks) || 0) * 10) / 10 : undefined,
          lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
        }));
    };
    return res.json({ rageClicks: group('rage_click'), deadClicks: group('dead_click') });
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
