'use strict';

/**
 * "Improve your site" report: rules only, no AI.
 *
 * One MongoDB aggregation per period (current + the previous equal-length period)
 * groups the relevant events per page in a $facet. Node only sees small grouped rows,
 * then applies fixed thresholds, compares each page to the site's own average and to
 * the previous period, and fills plain-English templates.
 *
 * Reads use the existing { apiKey, event_name, timestamp } / { apiKey, timestamp }
 * indexes (equality on apiKey + event_name $in + timestamp range). No new index.
 */

const { PAGE_VIEW_EVENTS, CLICK_EVENTS, composeMatch, reqWithRange, previousRange } = require('./query');
const {
  ERROR_EVENTS,
  aggregate,
  pageExpr,
  eventTimeExpr,
  sessionIdExpr,
  userIdExpr,
  firstStringOr,
  numericOrNull,
  vitalNumberExpr,
  viewKeyExpr,
} = require('./aggregate');

const RAGE = 'rage_click';
const DEAD = 'dead_click';
const FORM_START = 'form_start';
const FORM_SUBMIT = 'form_submit';
const FORM_ABANDON = 'form_abandon';
const NOT_FOUND = 'not_found';
const EXIT = 'page_exit';
const VITALS = { web_vital_lcp: 'LCP', web_vital_inp: 'INP', web_vital_cls: 'CLS' };

/** Poor thresholds (Google "good" upper bounds). p75 above these = poor page. */
const VITAL_LIMITS = { LCP: 2500, INP: 200, CLS: 0.1 };

/** Minimum sample sizes so small sites and quiet pages don't produce noise. */
const MIN = {
  sitePageViews: 200,
  siteVisitors: 50,
  pageViews: 50, // per-page share/rate rules
  rageEvents: 5,
  rageVisitors: 3,
  deadEvents: 10,
  deadVisitors: 5,
  formStarters: 20,
  formDropOff: 0.5,
  vitalSamples: 20,
  vitalPoorShare: 0.25, // >25% of samples over the limit == p75 over the limit
  notFoundHits: 5,
  notFoundVisitors: 3,
  errorEvents: 5,
  errorVisitors: 3,
  scrollSamples: 30,
  lowScrollShare: 0.5,
  lowScrollVsSite: 1.2,
  deadEndViews: 100,
  deadEndExitRate: 0.6,
  deadEndVsSite: 1.25,
  deadEndClicksPerView: 0.1,
  improvedDrop: 0.3,
};

/** Signal weight per finding type (how much one affected visitor hurts). */
const WEIGHT = {
  rage_clicks: 3,
  js_error: 2.5,
  form_abandon: 2.5,
  not_found: 2,
  slow_page: 1.5,
  dead_clicks: 1.5,
  low_scroll: 1,
  dead_end: 1,
};

const LOW_SCROLL_PCT = 25;
const TOP_N = 5;
const TOP_IMPROVED = 3;

const RELEVANT_EVENTS = [
  ...PAGE_VIEW_EVENTS, ...CLICK_EVENTS, EXIT, RAGE, DEAD, FORM_START, FORM_SUBMIT, FORM_ABANDON,
  NOT_FOUND, ...ERROR_EVENTS, ...Object.keys(VITALS),
];

function keyExpr() {
  return {
    $switch: {
      branches: [
        {
          case: { $in: ['$event_name', [RAGE, DEAD]] },
          then: firstStringOr(['$data.text', '$data.label', '$data.event_label', '$data.element', '$data.target'], 'an element'),
        },
        {
          case: { $in: ['$event_name', [FORM_START, FORM_SUBMIT, FORM_ABANDON]] },
          then: firstStringOr(['$data.formId', '$data.form_id', '$data.formName'], 'form'),
        },
        {
          case: { $in: ['$event_name', ERROR_EVENTS] },
          then: firstStringOr(['$data.message', '$data.error', '$data.error_message', '$data.custom_parameters.error_message', '$data.event_label', '$data.label'], 'Unknown error'),
        },
      ],
      default: null,
    },
  };
}

function vitalValueExpr() {
  const branches = Object.entries(VITALS).map(([ev, name]) => ({ case: { $eq: ['$event_name', ev] }, then: vitalNumberExpr(name) }));
  return { $switch: { branches, default: null } };
}

function vitalPoorExpr() {
  const branches = Object.entries(VITALS).map(([ev, name]) => ({
    case: { $eq: ['$event_name', ev] },
    then: { $cond: [{ $gt: ['$_v', VITAL_LIMITS[name]] }, 1, 0] },
  }));
  return { $cond: [{ $eq: ['$_v', null] }, 0, { $switch: { branches, default: 0 } }] };
}

/** Two-step distinct-visitor count: group by key+visitor, then by key. */
function perVisitor(matchStage, keyFields, extraFirst = {}, extraSecond = {}) {
  const firstId = { ...keyFields, w: '$_who' };
  const secondId = {};
  for (const k of Object.keys(keyFields)) secondId[k] = `$_id.${k}`;
  return [
    { $match: matchStage },
    { $group: { _id: firstId, n: { $sum: 1 }, ...extraFirst } },
    { $group: { _id: secondId, events: { $sum: '$n' }, visitors: { $sum: 1 }, ...extraSecond } },
  ];
}

function improvePipeline(match) {
  return [
    { $match: match },
    {
      $addFields: {
        _page: pageExpr(),
        _sid: sessionIdExpr(),
        _uid: userIdExpr(),
        _t: eventTimeExpr(),
        _key: keyExpr(),
        _v: vitalValueExpr(),
        _scroll: { $cond: [{ $eq: ['$event_name', EXIT] }, numericOrNull('$data.scroll_depth'), null] },
        _view: viewKeyExpr(),
      },
    },
    { $addFields: { _who: { $ifNull: ['$_uid', { $ifNull: ['$_sid', 'anon'] }] }, _poor: vitalPoorExpr() } },
    // Slim before $facet ($facet is capped at 100MB and cannot spill).
    { $project: { event_name: 1, _page: 1, _sid: 1, _who: 1, _t: 1, _key: 1, _v: 1, _poor: 1, _scroll: 1, _view: 1 } },
    {
      $facet: {
        pages: perVisitor({ event_name: { $in: PAGE_VIEW_EVENTS } }, { p: '$_page' }),
        clicks: [
          { $match: { event_name: { $in: CLICK_EVENTS } } },
          { $group: { _id: '$_page', n: { $sum: 1 } } },
        ],
        exits: [
          { $match: { event_name: { $in: PAGE_VIEW_EVENTS }, _sid: { $nin: [null, ''] } } },
          { $group: { _id: '$_sid', last: { $max: { t: '$_t', p: '$_page' } } } },
          { $group: { _id: '$last.p', exits: { $sum: 1 } } },
        ],
        scroll: [
          { $match: { event_name: EXIT, _scroll: { $ne: null } } },
          { $group: { _id: { p: '$_page', v: '$_view', w: '$_who' }, s: { $max: '$_scroll' } } },
          {
            $group: {
              _id: { p: '$_id.p', w: '$_id.w' },
              views: { $sum: 1 },
              low: { $sum: { $cond: [{ $lt: ['$s', LOW_SCROLL_PCT] }, 1, 0] } },
            },
          },
          {
            $group: {
              _id: { p: '$_id.p' },
              views: { $sum: '$views' },
              low: { $sum: '$low' },
              lowVisitors: { $sum: { $cond: [{ $gt: ['$low', 0] }, 1, 0] } },
            },
          },
        ],
        rage: perVisitor({ event_name: RAGE }, { p: '$_page', k: '$_key' }),
        dead: perVisitor({ event_name: DEAD }, { p: '$_page', k: '$_key' }),
        forms: [
          { $match: { event_name: { $in: [FORM_START, FORM_SUBMIT, FORM_ABANDON] } } },
          {
            $group: {
              _id: { p: '$_page', k: '$_key', w: '$_who' },
              started: { $max: { $cond: [{ $in: ['$event_name', [FORM_START, FORM_ABANDON]] }, 1, 0] } },
              submitted: { $max: { $cond: [{ $eq: ['$event_name', FORM_SUBMIT] }, 1, 0] } },
            },
          },
          {
            $group: {
              _id: { p: '$_id.p', k: '$_id.k' },
              starters: { $sum: { $cond: [{ $or: [{ $eq: ['$started', 1] }, { $eq: ['$submitted', 1] }] }, 1, 0] } },
              submitters: { $sum: '$submitted' },
            },
          },
        ],
        vitals: [
          { $match: { event_name: { $in: Object.keys(VITALS) }, _v: { $ne: null } } },
          { $group: { _id: { p: '$_page', m: '$event_name', w: '$_who' }, n: { $sum: 1 }, poor: { $sum: '$_poor' } } },
          {
            $group: {
              _id: { p: '$_id.p', m: '$_id.m' },
              samples: { $sum: '$n' },
              poorSamples: { $sum: '$poor' },
              poorVisitors: { $sum: { $cond: [{ $gt: ['$poor', 0] }, 1, 0] } },
            },
          },
        ],
        notFound: perVisitor({ event_name: NOT_FOUND }, { p: '$_page' }),
        errors: perVisitor({ event_name: { $in: ERROR_EVENTS } }, { p: '$_page', k: '$_key' }),
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const pct = (x) => Math.round(x * 100);
const round1 = (x) => Math.round(x * 10) / 10;
const clip = (s, n = 60) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function indexFacet(facet = {}) {
  const pages = new Map();
  let sitePageViews = 0;
  let siteVisitors = 0;
  for (const r of facet.pages || []) {
    pages.set(r._id.p, { views: r.events, visitors: r.visitors });
    sitePageViews += r.events;
  }
  // Distinct visitors across the site cannot be summed per page; use the max of
  // per-page visitors and the session count as a conservative floor.
  const sessionCount = (facet.exits || []).reduce((s, r) => s + r.exits, 0);
  siteVisitors = Math.max(sessionCount, ...[...pages.values()].map((p) => p.visitors), 0);
  const clicks = new Map((facet.clicks || []).map((r) => [r._id, r.n]));
  const exits = new Map((facet.exits || []).map((r) => [r._id, r.exits]));
  return { facet, pages, clicks, exits, sitePageViews, siteVisitors, sessionCount };
}

function page(ix, p) {
  return ix.pages.get(p) || { views: 0, visitors: 0 };
}

function severity(type, affected, rate) {
  const factor = 0.5 + Math.min(1, Math.max(0, rate) * 5);
  return Math.round(affected * WEIGHT[type] * factor * 10) / 10;
}

const per1k = (n, ix) => (ix.sitePageViews ? (n / ix.sitePageViews) * 1000 : 0);

/**
 * Every candidate signal, keyed so the same issue can be matched across periods.
 * `metric` is the comparable number used for improved / previous comparisons.
 * `qualifies` says whether it passes the thresholds for this period.
 */
function candidates(ix) {
  const out = [];
  const f = ix.facet;

  // Site averages for "vs your site" comparisons.
  let scrollViews = 0;
  let scrollLow = 0;
  for (const r of f.scroll || []) { scrollViews += r.views; scrollLow += r.low; }
  const siteLowShare = scrollViews ? scrollLow / scrollViews : 0;
  const siteExitRate = ix.sitePageViews ? ix.sessionCount / ix.sitePageViews : 0;
  let rageTotal = 0;
  for (const r of f.rage || []) rageTotal += r.events;
  const siteRagePer100 = ix.sitePageViews ? (rageTotal / ix.sitePageViews) * 100 : 0;

  for (const r of f.rage || []) {
    const pg = page(ix, r._id.p);
    const rate = pg.visitors ? r.visitors / pg.visitors : 0;
    const per100 = pg.views ? (r.events / pg.views) * 100 : 0;
    out.push({
      type: 'rage_clicks', key: `rage|${r._id.p}|${r._id.k}`, page: r._id.p, element: clip(r._id.k, 50),
      affected: r.visitors, rate, metric: per1k(r.events, ix),
      qualifies: r.events >= MIN.rageEvents && r.visitors >= MIN.rageVisitors,
      evidence: {
        rageClicks: r.events, visitors: r.visitors, pageVisitors: pg.visitors,
        per100Views: round1(per100), siteAvgPer100Views: round1(siteRagePer100),
      },
      evidenceText: `${r.events} rage clicks · ${r.visitors} visitors`,
    });
  }

  for (const r of f.dead || []) {
    const pg = page(ix, r._id.p);
    out.push({
      type: 'dead_clicks', key: `dead|${r._id.p}|${r._id.k}`, page: r._id.p, element: clip(r._id.k, 50),
      affected: r.visitors, rate: pg.visitors ? r.visitors / pg.visitors : 0, metric: per1k(r.events, ix),
      qualifies: r.events >= MIN.deadEvents && r.visitors >= MIN.deadVisitors,
      evidence: { deadClicks: r.events, visitors: r.visitors, pageVisitors: pg.visitors },
      evidenceText: `${r.events} dead clicks · ${r.visitors} visitors`,
    });
  }

  for (const r of f.forms || []) {
    const starters = r.starters || 0;
    const dropOff = starters ? Math.max(0, 1 - (r.submitters || 0) / starters) : 0;
    out.push({
      type: 'form_abandon', key: `form|${r._id.p}|${r._id.k}`, page: r._id.p, element: clip(r._id.k, 40),
      affected: Math.max(0, starters - (r.submitters || 0)), rate: dropOff, metric: dropOff,
      qualifies: starters >= MIN.formStarters && dropOff >= MIN.formDropOff,
      evidence: { started: starters, submitted: r.submitters || 0, dropOffPct: pct(dropOff) },
      evidenceText: `${starters} started · ${r.submitters || 0} submitted`,
    });
  }

  // Web Vitals: keep the worst metric per page.
  const worstVital = new Map();
  for (const r of f.vitals || []) {
    const metricName = VITALS[r._id.m];
    const poorShare = r.samples ? r.poorSamples / r.samples : 0;
    const qualifies = r.samples >= MIN.vitalSamples && poorShare > MIN.vitalPoorShare;
    const cand = {
      type: 'slow_page', key: `vital|${r._id.p}|${metricName}`, page: r._id.p, metricName,
      affected: r.poorVisitors, rate: poorShare, metric: poorShare, qualifies,
      evidence: { metric: metricName, samples: r.samples, poorSharePct: pct(poorShare), limit: VITAL_LIMITS[metricName], p75OverLimit: poorShare > 0.25 },
      evidenceText: `${pct(poorShare)}% of visits over ${({ LCP: '2.5s', INP: '200ms', CLS: '0.1' })[metricName]} ${metricName}`,
    };
    out.push({ ...cand, vitalOnly: true });
    const prev = worstVital.get(r._id.p);
    if (qualifies && (!prev || cand.affected * cand.rate > prev.affected * prev.rate)) worstVital.set(r._id.p, cand);
  }

  for (const r of f.notFound || []) {
    out.push({
      type: 'not_found', key: `404|${r._id.p}`, page: r._id.p,
      affected: r.visitors, rate: 1, metric: per1k(r.events, ix),
      qualifies: r.events >= MIN.notFoundHits && r.visitors >= MIN.notFoundVisitors,
      evidence: { hits: r.events, visitors: r.visitors },
      evidenceText: `${r.events} hits · ${r.visitors} visitors`,
    });
  }

  for (const r of f.errors || []) {
    const pg = page(ix, r._id.p);
    out.push({
      type: 'js_error', key: `err|${r._id.p}|${clip(r._id.k, 120)}`, page: r._id.p, element: clip(r._id.k, 80),
      affected: r.visitors, rate: pg.visitors ? r.visitors / pg.visitors : 0.2, metric: per1k(r.events, ix),
      qualifies: r.events >= MIN.errorEvents && r.visitors >= MIN.errorVisitors,
      evidence: { errors: r.events, visitors: r.visitors },
      evidenceText: `${r.events} errors · ${r.visitors} visitors`,
    });
  }

  for (const r of f.scroll || []) {
    const share = r.views ? r.low / r.views : 0;
    out.push({
      type: 'low_scroll', key: `scroll|${r._id.p}`, page: r._id.p,
      affected: r.lowVisitors, rate: share, metric: share,
      qualifies: r.views >= MIN.scrollSamples && share >= MIN.lowScrollShare && share >= siteLowShare * MIN.lowScrollVsSite,
      evidence: { views: r.views, lowScrollPct: pct(share), siteAvgPct: pct(siteLowShare) },
      evidenceText: `${pct(share)}% stop above 25% · site avg ${pct(siteLowShare)}%`,
    });
  }

  for (const [p, pg] of ix.pages) {
    const exits = ix.exits.get(p) || 0;
    const exitRate = pg.views ? exits / pg.views : 0;
    const clicksPerView = pg.views ? (ix.clicks.get(p) || 0) / pg.views : 0;
    out.push({
      type: 'dead_end', key: `deadend|${p}`, page: p,
      affected: exits, rate: exitRate, metric: exitRate,
      qualifies: pg.views >= MIN.deadEndViews
        && exitRate >= Math.max(MIN.deadEndExitRate, siteExitRate * MIN.deadEndVsSite)
        && clicksPerView < MIN.deadEndClicksPerView,
      evidence: { views: pg.views, exitRatePct: pct(exitRate), siteAvgExitPct: pct(siteExitRate), clicksPerView: Math.round(clicksPerView * 100) / 100 },
      evidenceText: `${pct(exitRate)}% exit · site avg ${pct(siteExitRate)}%`,
    });
  }

  // Only the worst vital per page may qualify as a finding; others stay for comparisons.
  for (const c of out) {
    if (c.vitalOnly) {
      const w = worstVital.get(c.page);
      c.qualifies = !!(w && w.key === c.key);
      delete c.vitalOnly;
    }
  }
  return out;
}

const VITAL_COPY = {
  LCP: { title: (p) => `${p} loads slowly`, fix: 'Compress and resize the main image, preload it, and cut render-blocking scripts.' },
  INP: { title: (p) => `${p} feels slow when visitors tap or click`, fix: 'Break up long JavaScript tasks and defer non-essential scripts so taps respond within 200ms.' },
  CLS: { title: (p) => `Content jumps around while ${p} loads`, fix: 'Give images, ads and embeds fixed width/height so the layout doesn\'t shift.' },
};

function describe(c) {
  switch (c.type) {
    case 'rage_clicks':
      return { title: `Visitors rage-click "${c.element}" on ${c.page}`, fix: 'Make it respond instantly: check it is clickable, add a loading state, and make sure nothing covers it.' };
    case 'dead_clicks':
      return { title: `Clicks on "${c.element}" on ${c.page} do nothing`, fix: 'Make it a real link or button, or restyle it so it no longer looks clickable.' };
    case 'form_abandon':
      return { title: `${c.evidence.dropOffPct}% of visitors abandon the "${c.element}" form on ${c.page}`, fix: 'Remove optional fields, show inline error messages, and make the submit button obvious.' };
    case 'slow_page':
      return { title: VITAL_COPY[c.metricName].title(c.page), fix: VITAL_COPY[c.metricName].fix };
    case 'not_found':
      return { title: `Visitors hit a missing page: ${c.page}`, fix: 'Add a 301 redirect to the right page, or fix the link that points here.' };
    case 'js_error':
      return { title: `JavaScript error on ${c.page}: "${c.element}"`, fix: 'Fix this error first. It can break buttons, forms or checkout for the visitors who see it.' };
    case 'low_scroll':
      return { title: `Most visitors never scroll down ${c.page}`, fix: 'Move the key message and call to action higher, and shorten the intro.' };
    case 'dead_end':
      return { title: `${c.page} is a dead end: visitors leave without clicking`, fix: 'Add a clear next step: a call to action, related links, or a contact button.' };
    default:
      return { title: c.page, fix: '' };
  }
}

const IMPROVED_LABEL = {
  rage_clicks: (c) => `Rage clicks on ${c.page}`,
  dead_clicks: (c) => `Dead clicks on ${c.page}`,
  form_abandon: (c) => `Form drop-off on ${c.page}`,
  slow_page: (c) => `Slow ${c.metricName} on ${c.page}`,
  not_found: (c) => `404 hits on ${c.page}`,
  js_error: (c) => `JavaScript errors on ${c.page}`,
  low_scroll: (c) => `Low scroll on ${c.page}`,
  dead_end: (c) => `Exits on ${c.page}`,
};

function changePct(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function buildReport(curFacet, prevFacet, { start, end, prevStart, prevEnd } = {}) {
  const cur = indexFacet(curFacet);
  const base = {
    range: { start: start ? start.toISOString() : null, end: end ? end.toISOString() : null },
    previousRange: { start: prevStart ? prevStart.toISOString() : null, end: prevEnd ? prevEnd.toISOString() : null },
    sample: { pageViews: cur.sitePageViews, visitors: cur.siteVisitors },
    minimums: { pageViews: MIN.sitePageViews, visitors: MIN.siteVisitors },
    findings: [],
    improved: [],
  };
  if (cur.sitePageViews < MIN.sitePageViews || cur.siteVisitors < MIN.siteVisitors) {
    return {
      ...base,
      status: 'insufficient_data',
      reason: `Not enough traffic yet: we need at least ${MIN.sitePageViews} page views and ${MIN.siteVisitors} visitors in this period to suggest fixes reliably (you have ${cur.sitePageViews} and ${cur.siteVisitors}).`,
    };
  }
  const prev = prevFacet ? indexFacet(prevFacet) : null;
  const curC = candidates(cur);
  const prevC = prev ? candidates(prev) : [];
  const prevByKey = new Map(prevC.map((c) => [c.key, c]));
  const curByKey = new Map(curC.map((c) => [c.key, c]));

  const findings = curC
    .filter((c) => c.qualifies && c.affected > 0)
    .map((c) => {
      const p = prevByKey.get(c.key);
      const { title, fix } = describe(c);
      return {
        type: c.type,
        page: c.page,
        ...(c.element ? { element: c.element } : {}),
        ...(c.metricName ? { metric: c.metricName } : {}),
        title,
        fix,
        evidence: c.evidence,
        evidenceText: c.evidenceText,
        visitorsAffected: c.affected,
        severity: severity(c.type, c.affected, c.rate),
        vsPrevious: p && p.metric ? { changePct: changePct(c.metric, p.metric) } : null,
      };
    })
    .sort((a, b) => b.severity - a.severity || b.visitorsAffected - a.visitorsAffected || a.page.localeCompare(b.page))
    .slice(0, TOP_N);

  const improved = [];
  if (prev && prev.sitePageViews >= MIN.sitePageViews) {
    for (const p of prevC) {
      if (!p.qualifies || !p.metric) continue;
      // A page that lost its traffic didn't "improve".
      if (!['not_found', 'js_error', 'form_abandon'].includes(p.type) && page(cur, p.page).views < MIN.pageViews) continue;
      const c = curByKey.get(p.key);
      const curMetric = c ? c.metric : 0;
      if (curMetric <= p.metric * (1 - MIN.improvedDrop)) {
        const drop = Math.round((1 - curMetric / p.metric) * 100);
        improved.push({
          type: p.type,
          page: p.page,
          ...(p.element ? { element: p.element } : {}),
          title: `${IMPROVED_LABEL[p.type](p)} down ${drop}% vs last period`,
          changePct: -drop,
          weight: p.affected * WEIGHT[p.type],
        });
      }
    }
  }
  improved.sort((a, b) => b.weight - a.weight || a.page.localeCompare(b.page));

  return {
    ...base,
    status: 'ok',
    reason: findings.length ? null : 'No clear problems found for this period. Nice work!',
    findings,
    improved: improved.slice(0, TOP_IMPROVED).map(({ weight, ...rest }) => rest),
  };
}

function resolveRange(req) {
  const now = new Date();
  const q = (req && req.query) || {};
  const end = q.endDate ? new Date(q.endDate) : now;
  const start = q.startDate ? new Date(q.startDate) : new Date(end.getTime() - 30 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  return { start, end };
}

async function loadImprovements(col, apiKey, req) {
  const range = resolveRange(req);
  if (!range) return { error: 'invalid date range' };
  const curReq = reqWithRange(range.start, range.end);
  const prev = previousRange(curReq);
  const extra = { event_name: { $in: RELEVANT_EVENTS } };
  const [curRows, prevRows] = await Promise.all([
    aggregate(col, improvePipeline(composeMatch(apiKey, curReq, extra))),
    prev ? aggregate(col, improvePipeline(composeMatch(apiKey, reqWithRange(prev.start, prev.end), extra))) : [],
  ]);
  return buildReport(curRows[0] || {}, prev ? (prevRows[0] || {}) : null, {
    start: range.start, end: range.end, prevStart: prev && prev.start, prevEnd: prev && prev.end,
  });
}

module.exports = { candidatesForTest: (facet) => candidates(indexFacet(facet)), MIN, WEIGHT, VITAL_LIMITS, RELEVANT_EVENTS, improvePipeline, buildReport, loadImprovements, severity };
