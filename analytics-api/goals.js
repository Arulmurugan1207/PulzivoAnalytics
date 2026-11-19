'use strict';

/**
 * Customer-selected conversion goals.
 *
 * A goal is an event name (including trackGoal names stored as event "goal")
 * or a page path. The denominator is distinct page-view visitors in the range.
 * Someone who fires the goal but never views a page is not counted.
 * A visitor id is the user id, or the session id when no user id was stored.
 *
 * Source, campaign, and landing page come only from fields the tracker stored.
 * Missing attribution is "Unavailable", not Direct. Direct is used only when
 * attribution was recorded and it has no source.
 */

const { canonicalSourceName } = require('./sources');
const { eventPage, eventTime, userIdOf, sessionIdOf, isPageView, attributionHasSignal } = require('./query');

const MAX_EVENTS = 20000;

function visitorKey(doc) {
  const uid = userIdOf(doc);
  if (uid) return `u:${uid}`;
  const sid = sessionIdOf(doc);
  if (sid) return `s:${sid}`;
  return null;
}

function pathOnly(page) {
  const raw = String(page || '').trim();
  if (!raw) return '';
  const path = raw.split('?')[0].split('#')[0];
  return path || '/';
}

function goalMatches(doc, spec) {
  const want = String(spec.value || '').trim();
  if (!want) return false;
  if (spec.type === 'page') {
    return isPageView(doc.event_name) && pathOnly(eventPage(doc)) === pathOnly(want);
  }
  if (doc.event_name === want) return true;
  if ((doc.event_name === 'goal' || doc.event_name === 'revenue') && String(doc.data?.goal || '') === want) return true;
  return false;
}

function attrOf(doc) {
  const data = doc?.data && typeof doc.data === 'object' ? doc.data : {};
  return data.attribution && typeof data.attribution === 'object' ? data.attribution : {};
}

function sessionAttribution(events) {
  const sorted = [...events].sort((a, b) => (eventTime(a)?.getTime() || 0) - (eventTime(b)?.getTime() || 0));
  let recorded = false;
  let source = null;
  let campaign = null;
  let landing = null;
  for (const doc of sorted) {
    const data = doc?.data && typeof doc.data === 'object' ? doc.data : {};
    const attr = attrOf(doc);
    if (attributionHasSignal(attr) || attributionHasSignal(data) || data.landing_page || attr.landing_page) recorded = true;
    const utmSource = attr.utm_source || data.utm_source;
    const referrer = attr.referrer_domain || data.referrer_domain;
    if (source == null && (utmSource || referrer)) {
      source = canonicalSourceName(utmSource || referrer) || String(utmSource || referrer);
    }
    const camp = attr.utm_campaign || data.utm_campaign;
    if (campaign == null && camp) campaign = String(camp);
    const land = attr.landing_page || data.landing_page;
    if (landing == null && land) landing = pathOnly(land);
  }
  if (!recorded) return { source: null, campaign: null, landing: null, recorded: false };
  return { source: source || 'Direct', campaign, landing, recorded: true };
}

function rate(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function bucket(cohort, pick) {
  const map = new Map();
  for (const visitor of cohort) {
    const chosen = pick(sessionAttribution(visitor.events));
    const row = map.get(chosen.key) || { key: chosen.key, label: chosen.label, available: chosen.available, visitors: 0, conversions: 0 };
    row.visitors += 1;
    if (visitor.converted) row.conversions += 1;
    map.set(chosen.key, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, rate: rate(row.conversions, row.visitors) }))
    .sort((a, b) => b.conversions - a.conversions || String(a.label).localeCompare(String(b.label)));
}

function computeGoalReport(events, spec) {
  const visitors = new Map();
  for (const doc of Array.isArray(events) ? events : []) {
    const key = visitorKey(doc);
    if (!key) continue;
    let visitor = visitors.get(key);
    if (!visitor) {
      visitor = { pageView: false, converted: false, events: [] };
      visitors.set(key, visitor);
    }
    visitor.events.push(doc);
    if (isPageView(doc.event_name)) visitor.pageView = true;
    if (goalMatches(doc, spec)) visitor.converted = true;
  }
  const cohort = [...visitors.values()].filter((visitor) => visitor.pageView);
  const conversions = cohort.filter((visitor) => visitor.converted).length;
  const visitorsN = cohort.length;
  const unavailable = { key: 'unavailable', label: 'Unavailable', available: false };
  return {
    status: visitorsN === 0 ? 'insufficient_data' : 'ok',
    goal: { type: spec.type, value: spec.value },
    denominator: 'page_view_visitors',
    denominatorNote: 'Distinct visitors with a page view in this range. The id is the user id, or the session id when no user id was stored. A goal without a page view is not a conversion.',
    visitors: visitorsN,
    conversions,
    rate: rate(conversions, visitorsN),
    bySource: bucket(cohort, (attr) => (attr.recorded
      ? { key: attr.source, label: attr.source, available: true }
      : unavailable)),
    byCampaign: bucket(cohort, (attr) => (attr.campaign
      ? { key: attr.campaign, label: attr.campaign, available: true }
      : unavailable)),
    byLanding: bucket(cohort, (attr) => (attr.landing
      ? { key: attr.landing, label: attr.landing, available: true }
      : unavailable)),
  };
}

function changePct(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function incompleteReport(spec, reason) {
  return {
    status: 'incomplete',
    reason,
    goal: { type: spec.type, value: spec.value },
    denominator: 'page_view_visitors',
    visitors: null,
    conversions: null,
    rate: null,
    bySource: [],
    byCampaign: [],
    byLanding: [],
    previous: null,
    changePct: null,
  };
}

function registerGoalRoutes(app, { guarded, findEvents, composeMatch, previousRange, reqWithRange }) {
  app.get('/analytics/goal-conversion', guarded(async (req, res, apiKey, col) => {
    const type = String(req.query.goalType || '');
    const value = String(req.query.goalValue || '').trim();
    if (type !== 'event' && type !== 'page') {
      return res.status(400).json({ error: 'goalType must be event or page' });
    }
    if (!value || value.length > 120) {
      return res.status(400).json({ error: 'goalValue is required' });
    }
    const spec = { type, value };
    const current = await findEvents(col, composeMatch(apiKey, req), { limit: MAX_EVENTS + 1 });
    if (current.length > MAX_EVENTS) {
      return res.json(incompleteReport(spec, `This range has more than ${MAX_EVENTS} events, so a conversion rate would drop some. Narrow the dates.`));
    }
    const report = computeGoalReport(current, spec);
    const prev = previousRange(req);
    if (!prev) {
      report.previous = null;
      report.changePct = null;
      return res.json(report);
    }
    const prevEvents = await findEvents(col, composeMatch(apiKey, reqWithRange(prev.start, prev.end)), { limit: MAX_EVENTS + 1 });
    if (prevEvents.length > MAX_EVENTS) {
      report.previous = { status: 'incomplete', visitors: null, conversions: null, rate: null };
      report.changePct = null;
      return res.json(report);
    }
    const previous = computeGoalReport(prevEvents, spec);
    report.previous = {
      status: previous.status,
      visitors: previous.visitors,
      conversions: previous.conversions,
      rate: previous.rate,
    };
    report.changePct = changePct(report.rate, previous.rate);
    return res.json(report);
  }));
}

module.exports = { computeGoalReport, changePct, registerGoalRoutes, MAX_EVENTS };
