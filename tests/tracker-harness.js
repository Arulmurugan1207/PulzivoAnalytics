'use strict';

// Minimal browser stand-in for running public/pulzivo-analytics.js under node:test.
// No dependencies, so it runs in CI without installing the Angular toolchain.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MIN = process.env.PZ_TRACKER_MIN ? '.min' : ''; // PZ_TRACKER_MIN=1 runs the suite on the built files
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'pulzivo-analytics' + MIN + '.js'), 'utf8');
const EXTRAS = fs.readFileSync(path.join(__dirname, '..', 'public', 'pulzivo-analytics-extras' + MIN + '.js'), 'utf8');

function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

function emitter() {
  const handlers = {};
  return {
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener(type, fn) { handlers[type] = (handlers[type] || []).filter((f) => f !== fn); },
    dispatch(type, ev = {}) { (handlers[type] || []).slice().forEach((fn) => fn({ type, ...ev })); },
    count(type) { return (handlers[type] || []).length; },
  };
}

function createBrowser({ url = 'https://site.test/', plan = 'enterprise', ua, dnt, gpc, meta = {}, local, session, languages, webdriver } = {}) {
  const sent = []; // every event delivered, in order
  const beacons = [];
  const fetches = [];
  let loc = new URL(url);
  const location = {};
  for (const key of ['href', 'pathname', 'search', 'hash', 'hostname', 'host', 'origin', 'protocol']) {
    Object.defineProperty(location, key, { get: () => loc[key], enumerable: true });
  }
  const win = emitter();
  const doc = emitter();
  doc.visibilityState = 'visible';
  Object.defineProperty(doc, 'hidden', { get: () => doc.visibilityState === 'hidden' });
  doc.title = 'Test';
  doc.referrer = '';
  doc.readyState = 'complete';
  doc.documentElement = { scrollHeight: 2000, scrollTop: 0 };
  doc.body = { scrollHeight: 2000 };
  doc.getElementsByTagName = () => [];
  doc.querySelector = (sel) => (meta[sel] ? { getAttribute: () => meta[sel] } : null);
  doc.querySelectorAll = () => [];
  // Injected <script> tags: the extras module runs in the same context.
  const scripts = [];
  doc.createElement = (tag) => ({ tagName: String(tag).toUpperCase() });
  doc.head = { appendChild(el) { scripts.push(el.src); if (/extras/.test(el.src)) vm.runInContext(EXTRAS, context); } };

  const history = {
    pushState(_s, _t, u) { loc = new URL(u, loc.href); },
    replaceState(_s, _t, u) { loc = new URL(u, loc.href); },
  };
  const navigator = {
    userAgent: ua || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
    language: 'en-CA',
    platform: 'MacIntel',
    cookieEnabled: true,
    onLine: true,
    doNotTrack: dnt ? '1' : null,
    globalPrivacyControl: !!gpc,
    languages: languages || ['en-CA', 'en'],
    webdriver: !!webdriver,
    sendBeacon(u, blob) {
      beacons.push({ url: u, size: blob.size });
      for (const ev of JSON.parse(blob._text)) sent.push(ev);
      return true;
    },
  };
  class Blob {
    constructor(parts, opts) { this._text = parts.join(''); this.size = Buffer.byteLength(this._text); this.type = opts && opts.type; }
  }
  async function fetchMock(u, opts = {}) {
    fetches.push({ url: String(u), opts });
    if (String(u).includes('/validate')) {
      return { ok: true, status: 200, json: async () => ({ plan }) };
    }
    if (opts.body) for (const ev of JSON.parse(opts.body)) sent.push(ev);
    return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
  }

  const timers = [];
  const observers = {};
  class PerformanceObserver {
    constructor(cb) { this.cb = cb; }
    observe(opts) { (observers[opts.type] = observers[opts.type] || []).push(this.cb); }
  }
  const window = Object.assign(win, {
    location,
    history,
    navigator,
    document: doc,
    localStorage: local || storage(),
    sessionStorage: session || storage(),
    screen: { width: 1440, height: 900 },
    innerWidth: 1200,
    innerHeight: 800,
    pageYOffset: 0,
    performance: { now: () => 100, getEntriesByType: () => [] },
    PerformanceObserver,
    AnalyticsConfig: { apiKey: 'PULZ-TEST', apiUrl: 'https://api.test/analytics/log', batchIntervalMs: 1e9 },
  });
  const context = {
    window, document: doc, navigator, history, location,
    localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    screen: window.screen, performance: window.performance,
    fetch: fetchMock, Blob, URL, URLSearchParams, Intl, Date, Math, JSON, Promise, Object, Array, String, Number, Map, Set, Symbol, RegExp, Error,
    console: { log() {}, warn() {}, error() {}, groupCollapsed() {}, groupEnd() {} },
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    Element: class {},
    PerformanceObserver,
  };
  context.globalThis = context;
  vm.createContext(context);

  async function settle() {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setImmediate(r));
      while (timers.length) timers.shift()();
    }
  }
  return {
    window, document: doc, history, sent, beacons, fetches, scripts,
    load() { vm.runInContext(SRC, context); return settle(); },
    settle,
    perf(type, entries) { (observers[type] || []).forEach((cb) => cb({ getEntries: () => entries })); },
    api: () => window.PulzivoAnalytics,
    names: () => sent.map((e) => e.event_name),
    async flush() { await window.PulzivoAnalytics.sendBatch(); await settle(); },
    hide() { doc.visibilityState = 'hidden'; doc.dispatch('visibilitychange'); },
    show() { doc.visibilityState = 'visible'; doc.dispatch('visibilitychange'); },
    goto(u) { loc = new URL(u, loc.href); },
  };
}

module.exports = { createBrowser, storage };
