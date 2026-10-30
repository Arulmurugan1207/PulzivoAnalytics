'use strict';

/**
 * Frozen copy of the pre-aggregation /analytics/traffic-sources and
 * /analytics/attribution handlers (find().toArray() + JS loops), used only by
 * report-equivalence.spec.js to prove the aggregation versions return the
 * same JSON for the same events.
 */
const {
  percent, classifySource, referrerIdentity, extractUtm, attributionHasSignal,
  sessionIdOf, eventTime,
} = require('../query');

function sortByTime(docs) {
  return [...docs].sort((a, b) => (eventTime(a)?.getTime() || 0) - (eventTime(b)?.getTime() || 0));
}

function groupSessions(docs) {
  const sessions = new Map();
  for (const doc of docs) {
    const sid = sessionIdOf(doc);
    if (!sid) continue;
    let session = sessions.get(sid);
    if (!session) {
      session = { id: sid, events: [], attribution: null };
      sessions.set(sid, session);
    }
    session.events.push(doc);
    const rawAttr = doc.data?.attribution && typeof doc.data.attribution === 'object' ? doc.data.attribution : {};
    const extracted = extractUtm(doc.data || {}, doc);
    const mergedAttr = { ...rawAttr };
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      if (!mergedAttr[key] && extracted[key]) mergedAttr[key] = extracted[key];
    }
    if (!attributionHasSignal(session.attribution) && attributionHasSignal(mergedAttr)) {
      session.attribution = mergedAttr;
    }
  }
  for (const session of sessions.values()) session.events = sortByTime(session.events);
  return sessions;
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

function trafficSources(docs, utmCarrierDocs) {
  const sources = topCounts(docs, (d) => classifySource(d.data || {}, d))
    .map(([source, count]) => ({ source, visits: count, percentage: percent(count, docs.length || 1) }));
  const refMap = new Map();
  for (const doc of docs) {
    const id = referrerIdentity(doc.data || {}, doc);
    const prev = refMap.get(id.name) || { name: id.name, channel: id.channel, host: '', hosts: {}, visits: 0 };
    prev.visits += 1;
    // Grey hint = busiest host for the merged name (first seen wins ties).
    if (id.host) prev.hosts[id.host] = (prev.hosts[id.host] || 0) + 1;
    prev.host = Object.entries(prev.hosts).reduce((best, e) => (e[1] > best[1] ? e : best), ['', 0])[0];
    refMap.set(id.name, prev);
  }
  const referrers = [...refMap.values()]
    .sort((a, b) => b.visits - a.visits)
    .map(({ hosts, ...row }) => ({ ...row, percentage: percent(row.visits, docs.length || 1) }));
  const utmMap = new Map();
  const pageViewCampaigns = new Set();
  const addUtmVisit = (doc, { skipIfPageViewCounted = false, recordPageView = false } = {}) => {
    const utm = extractUtm(doc.data || {}, doc);
    const source = utm.utm_source;
    const medium = utm.utm_medium;
    const campaign = utm.utm_campaign;
    if (!source || !medium || !campaign) return;
    const key = `${source}|${medium}|${campaign}`;
    const sid = sessionIdOf(doc);
    const dedupeKey = sid ? `${sid}|${key}` : '';
    if (skipIfPageViewCounted && dedupeKey && pageViewCampaigns.has(dedupeKey)) return;
    const prev = utmMap.get(key) || { source, medium, campaign, visits: 0 };
    prev.visits += 1;
    utmMap.set(key, prev);
    if (recordPageView && dedupeKey) pageViewCampaigns.add(dedupeKey);
  };
  for (const doc of docs) addUtmVisit(doc, { recordPageView: true });
  for (const doc of utmCarrierDocs) addUtmVisit(doc, { skipIfPageViewCounted: true });
  return { sources, referrers, utmSources: [...utmMap.values()].sort((a, b) => b.visits - a.visits), totalVisits: docs.length };
}

function attribution(docs) {
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
    for (const source of sources) linearMap.set(source, (linearMap.get(source) || 0) + share);
  }
  const toEntries = (ranked, total) => ranked.map(([source, value]) => ({
    source, value: Math.round(value * 10) / 10, percentage: percent(value, total || 1),
  }));
  return {
    totalSessions: sessions.length,
    firstTouch: toEntries(firstTouch, sessions.length),
    lastTouch: toEntries(lastTouch, sessions.length),
    linear: [...linearMap.entries()].sort((a, b) => b[1] - a[1]).map(([source, value]) => ({
      source, value: Math.round(value * 10) / 10, percentage: percent(value, sessions.length || 1),
    })),
  };
}

module.exports = { trafficSources, attribution };
