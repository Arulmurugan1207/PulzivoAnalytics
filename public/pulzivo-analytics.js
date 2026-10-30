/**
 * Pulzivo Analytics SDK
 * Standalone analytics library for any HTML/JavaScript application
 *
 * Usage:
 * <script
 *   src="https://cdn.pulzivo.com/pulzivo-analytics.min.js"
 *   data-api-key="YOUR_API_KEY"
 *   data-api-url="https://your-api-endpoint.com/analytics/log"
 *   data-batch-interval="5000"
 *   data-debug="false">
 * </script>
 *
 * Owner exclusion (no tracking for site owner):
 *   Desktop: PulzivoAnalytics.setOwner(true, true) or localStorage pulz_is_owner=true
 *   Mobile:  open any page with ?pulz_owner=1  (persists). Clear with ?pulz_owner=0
 */

(function(window) {
  'use strict';
  // Loaded twice (e.g. two script tags)? Keep the first copy so listeners never double up.
  if (window.PulzivoAnalytics && window.PulzivoAnalytics.__pz) return;

  // Configuration
  let config = {
    apiUrl: 'https://pulzivo-analytics-api-167308220305.us-east1.run.app/analytics/log',
    apiKey: 'unknown', // Changed from serviceName to apiKey
    batchIntervalMs: 5000, // unload/hidden flushes go out immediately via sendBeacon
    debug: false,
    autoTrackPageViews: true,
    autoTrackClicks: true,
    autoTrackScroll: true,
    autoTrackPerformance: true,
    excludeOwner: false  // When true, tracking is silently suppressed for the site owner
  };

  // Plan-based feature gating
  // Web Vitals and scroll depth (reported on page_exit) are on every plan. KEEP IN SYNC
  // with analytics-api/plans.js (plans.spec.js fails on drift).
  const PLAN_FEATURES = {
    free: ['page_views', 'clicks', 'custom_events', 'scroll_depth', 'page_exit', 'web_vitals'],
    starter: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'utm_attribution', 'custom_events', 'web_vitals'],
    pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'web_vitals', 'error_tracking'],
    enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'client_hints', 'form_tracking', 'tooltip_tracking', 'error_tracking', 'rage_clicks', 'dead_clicks', 'web_vitals']
  };

  let currentPlan = 'free';
  let planFeatures = PLAN_FEATURES.free;

  // Internal state
  let eventQueue = [];
  let batchTimer = null;
  let pageLoadTime = 0;
  let maxScroll = 0;
  let startTime = Date.now();
  let sessionId = '';
  let userId = '';
  let userEmail = null;
  let isInitialized = false;
  let isApiKeyInvalid = false;
  let scrollThrottleTimer = null;
  const MAX_QUEUE_SIZE = 500;
  const MAX_RETRY_COUNT = 3;
  let retryCount = 0;
  let rateLimitBackoff = 0;
  let lastRateLimitTime = 0;
  // Per page view: engaged (visible) time, a view id shared by its page_exit events,
  // and what the last page_exit reported so a hidden-then-closed tab is not double counted.
  let viewId = '';
  let engagedMs = 0;
  let visibleSince = Date.now();
  let lastExitKey = '';
  let currentPage = '';
  let newSessionPending = false;
  let planLoaded = false;
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const BEACON_MAX_BYTES = 60000;

  // Owner exclusion flag — set via:
  // - init({ excludeOwner: true })
  // - PulzivoAnalytics.setOwner(true)
  // - localStorage key 'pulz_is_owner' = 'true'
  // - URL query param (mobile-friendly): ?pulz_owner=1  (aliases: exclude_owner, pulz_exclude_owner)
  //   Use ?pulz_owner=0 to clear owner mode. Value is persisted to localStorage.
  let isOwner = (function() {
    try { return localStorage.getItem('pulz_is_owner') === 'true'; } catch(e) { return false; }
  })();
  let ownerOverride = null;

  function readOwnerFlagFromStorage() {
    try {
      return localStorage.getItem('pulz_is_owner') === 'true';
    } catch (e) {
      return false;
    }
  }

  function persistOwnerFlag(flag) {
    try {
      if (flag) localStorage.setItem('pulz_is_owner', 'true');
      else localStorage.removeItem('pulz_is_owner');
    } catch (e) {}
  }

  /**
   * Read owner exclusion from the page URL (works on mobile where console/localStorage
   * setup is awkward). Supported params (first match wins):
   *   pulz_owner, exclude_owner, pulz_exclude_owner
   * Truthy: 1, true, yes, on
   * Falsy:  0, false, no, off
   * Returns null when param is absent.
   */
  function readOwnerFlagFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const key = ['pulz_owner', 'exclude_owner', 'pulz_exclude_owner'].find((k) => params.has(k));
      if (!key) return null;
      // Empty or any value other than 0/false/no/off enables owner mode (e.g. ?pulz_owner=me).
      return !/^(0|false|no|off)$/.test(String(params.get(key)).trim().toLowerCase());
    } catch (e) {
      return null;
    }
  }

  /** Apply URL owner flag early and persist so later visits stay excluded. */
  function applyOwnerFlagFromUrl() {
    const fromUrl = readOwnerFlagFromUrl();
    if (fromUrl === null) return false;
    ownerOverride = fromUrl;
    isOwner = fromUrl;
    persistOwnerFlag(fromUrl);
    if (fromUrl) {
      clearQueuedEvents('owner mode enabled via URL');
    }
    if (config.debug) {
      console.log('[Analytics] Owner mode (URL):', fromUrl);
    }
    return true;
  }

  function clearQueuedEvents(reason) {
    if (eventQueue.length > 0 && config.debug) {
      console.log('[Analytics] Clearing queue:', reason);
    }
    eventQueue = [];
  }

  function syncOwnerMode() {
    const ownerFromStorage = readOwnerFlagFromStorage();
    const nextOwnerState = ownerOverride === null ? ownerFromStorage : ownerOverride;
    if (nextOwnerState !== isOwner) {
      isOwner = nextOwnerState;
      if (isOwner) {
        clearQueuedEvents('owner mode enabled');
      }
      if (config.debug) {
        console.log('[Analytics] Owner mode:', isOwner);
      }
    }
    return isOwner;
  }

  // User preferences for analytics features
  let userPreferences = {};

  // Load user preferences from localStorage
  function loadUserPreferences() {
    if (isLocalStorageAvailable()) {
      try {
        const stored = getStorageItem('analytics_preferences');
        if (stored) {
          userPreferences = JSON.parse(stored);
          if (config.debug) {
            console.log('[Analytics] Loaded user preferences:', userPreferences);
          }
        }
      } catch (e) {
        if (config.debug) {
          console.warn('[Analytics] Could not load user preferences:', e);
        }
      }
    }
  }

  // Check if a feature is allowed by current plan AND user preferences
  function hasFeature(feature) {
    if (!planFeatures.includes(feature)) return false;
    if (userPreferences && Object.prototype.hasOwnProperty.call(userPreferences, feature)) {
      return userPreferences[feature] === true;
    }
    return true;
  }

  // Utility functions
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Privacy: emails never leave the page, and URLs are sent without query string or
  // fragment (password-reset tokens, session ids, signed links live there).
  const EMAIL_RE = /[^\s\/?#&=:@]+@[^\s\/?#&=:@]+\.[a-z]{2,}/gi;
  function redact(v) {
    return v == null ? v : String(v).replace(EMAIL_RE, '[email]');
  }
  function cleanUrl(u) {
    if (!u) return null;
    try {
      const x = new URL(u, window.location.href);
      return redact(/^https?:$/.test(x.protocol) ? x.origin + x.pathname : x.protocol);
    } catch (e) {
      return null;
    }
  }
  // Path used for reports. Hash routers (#/route or #!/route) count as distinct pages.
  function pagePath() {
    const l = window.location;
    if (!l) return '';
    const h = l.hash || '';
    return l.pathname + (/^#!?\//.test(h) ? h.replace(/\?.*$/, '') : '');
  }

  // Human-readable element name for click reports: aria-label, visible text, title, or image alt.
  function elLabel(el, max) {
    if (!el || !el.getAttribute) return '';
    const img = el.querySelector && el.querySelector('img[alt]');
    const raw = el.getAttribute('aria-label') || el.innerText || el.textContent ||
      el.getAttribute('title') || (img && img.getAttribute('alt')) ||
      (/^(submit|button|reset)$/.test(el.type) ? el.value : '') || '';
    return String(raw).replace(/\s+/g, ' ').trim().substring(0, max);
  }
  // Element text sent with clicks: max 60 chars, never what someone typed into a field,
  // and nothing that looks like an email or a bare number (order ids, phone numbers, totals).
  function clickText(el) {
    if (!el || (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(submit|button|reset)$/.test(el.type)) ||
        (el.isContentEditable)) return '';
    const t = elLabel(el, 60);
    return !t || t.search(EMAIL_RE) !== -1 || /^[\d\s.,:;+\-\/()$€£¥%#*]+$/.test(t) ? '' : t;
  }

  // Known crawlers / headless agents never count in stats. KEEP IN SYNC with
  // analytics-api/bots.js (bots.spec.js fails on drift). In-app browsers such as
  // FBAN/FBAV, Instagram, Twitter or LinkedInApp are real people and do not match.
  const CRAWLER_UA_PATTERN =
    'bot\\b|crawl|spider|slurp|mediapartners-google|adsbot|googlebot|google-inspectiontool|' +
    'storebot-google|feedfetcher|google-read-aloud|apis-google|bingpreview|facebookexternalhit|' +
    'facebookcatalog|meta-externalagent|headlesschrome|phantomjs|lighthouse|pagespeed|ptst\\/|' +
    'gtmetrix|pingdom|uptimerobot|' +
    'scrapy|bytespider|petalbot|baiduspider|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|' +
    'ccbot|amazonbot|applebot|duckduckbot|jsdom|cypress\\/';
  const CRAWLER_UA = new RegExp(CRAWLER_UA_PATTERN, 'i');
  let crawlerCache = null;

  function isKnownCrawler() {
    if (crawlerCache !== null) return crawlerCache;
    const n = typeof navigator !== 'undefined' ? navigator : {};
    const ua = n.userAgent ? String(n.userAgent) : '';
    // Automation: WebDriver (Selenium, Puppeteer, Playwright), PhantomJS, Nightmare,
    // and headless browsers that report no languages at all.
    crawlerCache = n.webdriver === true || !!(window.callPhantom || window._phantom || window.__nightmare) ||
      (Array.isArray(n.languages) && n.languages.length === 0) ||
      (Boolean(ua) && CRAWLER_UA.test(ua.replace(/cubot/gi, '')));
    return crawlerCache;
  }

  const UTM_PARAM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  // Captured as soon as the script runs, before an SPA can strip ?utm_* during boot.
  let landingUtm = {};
  let landingUtmApplied = false;

  function readUtmSearch(search) {
    const out = {};
    if (!search || typeof search !== 'string' || search.indexOf('utm_') === -1) return out;
    try {
      const raw = search.charAt(0) === '?' ? search.slice(1) : search;
      const params = new URLSearchParams(raw);
      UTM_PARAM_KEYS.forEach((key) => {
        const value = params.get(key);
        if (value && String(value).trim()) out[key] = String(value).trim();
      });
    } catch (e) {}
    return out;
  }

  function utmFromUrlLike(value) {
    if (!value || typeof value !== 'string' || value.indexOf('utm_') === -1) return {};
    const q = value.indexOf('?');
    if (q === -1) return {};
    let query = value.slice(q + 1);
    const hash = query.indexOf('#');
    if (hash !== -1) query = query.slice(0, hash);
    return readUtmSearch(query);
  }

  function utmFromLocation() {
    if (typeof window === 'undefined' || !window.location) return {};
    const fromSearch = readUtmSearch(window.location.search || '');
    let fromHash = {};
    const hash = window.location.hash || '';
    const q = hash.indexOf('?');
    if (q !== -1) fromHash = readUtmSearch(hash.slice(q + 1));
    return { ...fromHash, ...fromSearch };
  }

  function captureLandingUtm() {
    const found = utmFromLocation();
    UTM_PARAM_KEYS.forEach((key) => {
      if (!landingUtm[key] && found[key]) landingUtm[key] = found[key];
    });
  }

  function mergeAttribution(existing, extras) {
    const out = existing && typeof existing === 'object' ? { ...existing } : {};
    const sources = Array.isArray(extras) ? extras : [extras];
    sources.forEach((src) => {
      if (!src || typeof src !== 'object') return;
      UTM_PARAM_KEYS.forEach((key) => {
        const current = out[key];
        const hasCurrent = current != null && String(current).trim() !== '';
        if (!hasCurrent && src[key] != null && String(src[key]).trim() !== '') {
          out[key] = String(src[key]).trim();
        }
      });
      ['landing_page', 'landing_domain', 'referrer', 'referrer_domain'].forEach((key) => {
        if ((out[key] == null || out[key] === '') && src[key]) out[key] = src[key];
      });
    });
    return out;
  }

  function getAttributionData() {
    if (typeof window === 'undefined' || !window.location) return {};

    const urlParams = new URLSearchParams(window.location.search);
    // Landing page keeps only utm_* from the query; anything else may be a token.
    const utmQuery = new URLSearchParams();
    UTM_PARAM_KEYS.forEach((key) => { if (urlParams.get(key)) utmQuery.set(key, urlParams.get(key)); });
    const q = utmQuery.toString();
    const attribution = {
      landing_page: redact(window.location.pathname) + (q ? '?' + q : ''),
      landing_domain: window.location.hostname,
      referrer: cleanUrl(document.referrer),
      referrer_domain: null,
    };
    if (document.referrer) {
      try {
        attribution.referrer_domain = new URL(document.referrer).hostname;
      } catch (e) {
        attribution.referrer_domain = null;
      }
    }
    UTM_PARAM_KEYS.forEach((key) => {
      const value = urlParams.get(key);
      if (value && String(value).trim()) attribution[key] = String(value).trim();
    });
    return mergeAttribution(attribution, utmFromLocation());
  }

  // Referrer + landing fields and UTMs are recorded on every plan ("how they got
  // here" is basic analytics). Only an explicit site opt-out via
  // setPreferences({ utm_attribution: false }) turns them off.
  function referrerAttributionEnabled() {
    return !(userPreferences && userPreferences.utm_attribution === false);
  }

  function captureAttributionNow() {
    const base = referrerAttributionEnabled() ? getAttributionData() : {};
    return mergeAttribution(base, utmFromLocation());
  }

  function getBrowserInfo() {
    if (typeof navigator === 'undefined') return {};

    const info = {
      language: navigator.language,
      screenResolution: window.screen ? `${screen.width}x${screen.height}` : null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookieEnabled: navigator.cookieEnabled,
      online: navigator.onLine,
    };

    // Prefer User-Agent Client Hints API when available (enterprise only)
    if (navigator.userAgentData && hasFeature('client_hints')) {
      info.platform = navigator.userAgentData.platform;
      info.mobile = navigator.userAgentData.mobile;
      info.brands = (navigator.userAgentData.brands || []).map(b => `${b.brand}/${b.version}`).join(', ');
    } else {
      info.userAgent = navigator.userAgent;
      info.platform = navigator.platform;
    }

    return info;
  }

  // Storage probes are cached: they run on every event.
  let lsOk = null;
  let ssOk = null;
  function probe(store) {
    try {
      const test = '__analytics_test__';
      store.setItem(test, test);
      store.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }
  function isLocalStorageAvailable() {
    if (lsOk === null) lsOk = probe(window.localStorage);
    return lsOk;
  }
  function isSessionStorageAvailable() {
    if (ssOk === null) ssOk = probe(window.sessionStorage);
    return ssOk;
  }

  // Storage helpers
  function getStorageItem(key, storage = localStorage) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function setStorageItem(key, value, storage = localStorage) {
    try {
      storage.setItem(key, value);
    } catch (e) {
      if (config.debug) console.warn('[Analytics] Storage error:', e);
    }
  }

  // Sessions end after 30 minutes without activity (GA4 / Plausible style) and are shared
  // across tabs. visit_count goes up once per new session, which drives new vs returning.
  let memSessionTs = 0;
  function touchSession() {
    const now = Date.now();
    const ls = isLocalStorageAvailable();
    let sid = ls ? getStorageItem('analytics_session_id') : sessionId;
    const last = ls ? parseInt(getStorageItem('analytics_session_ts') || '0', 10) : memSessionTs;
    if (!sid || !last || now - last > SESSION_TIMEOUT_MS) {
      sid = generateUUID();
      newSessionPending = true;
      if (ls) {
        setStorageItem('analytics_session_id', sid);
        setStorageItem('analytics_visit_count', String(parseInt(getStorageItem('analytics_visit_count') || '0', 10) + 1));
      }
    }
    if (ls) setStorageItem('analytics_session_ts', String(now));
    memSessionTs = now;
    sessionId = sid;
  }

  // Visitor ID. By default an anonymous random ID that rotates every calendar day
  // (Plausible-style): nothing links today's visit to yesterday's. Only a site that calls
  // identify(id) gets a stable, persisted ID ('pz_uid'). Emails set via identify /
  // setUserEmail live in memory + sessionStorage (this tab only), never localStorage.
  let idDay = '';
  function visitorId() {
    const known = getStorageItem('pz_uid');
    if (known) return known;
    const day = new Date().toDateString();
    if (day === idDay && userId) return userId;
    const raw = getStorageItem('pz_vid') || '';
    const i = raw.indexOf('|');
    idDay = day;
    if (i > 0 && raw.slice(0, i) === day) return raw.slice(i + 1);
    const id = 'a-' + generateUUID();
    setStorageItem('pz_vid', day + '|' + id);
    return id;
  }
  function initializeSession() {
    touchSession();
    // Older versions kept a permanent ID and the email in localStorage; drop both.
    try { localStorage.removeItem('analytics_user_id'); localStorage.removeItem('userEmail'); } catch (e) {}
    userEmail = getStorageItem('pz_email', window.sessionStorage) || null;
    userId = visitorId();
  }

  // Track unique visitor (both per session and per day)
  function trackUniqueVisitor() {
    if (isLocalStorageAvailable()) {
      if (getStorageItem('analytics_unique_visitor_session') !== sessionId) {
        queueEvent('unique_visitor_session', {
          category: 'visitor',
          custom: { first_visit_session: true, visitor_type: 'unique', tracking_type: 'per_session' }
        });
        setStorageItem('analytics_unique_visitor_session', sessionId);
      }
      const today = new Date().toDateString();
      if (getStorageItem('analytics_unique_visitor_day') !== today) {
        queueEvent('unique_visitor_daily', {
          category: 'visitor',
          custom: { first_visit_day: true, visitor_type: 'unique', tracking_type: 'per_day' }
        });
        setStorageItem('analytics_unique_visitor_day', today);
      }
    }
  }

  // Visitor privacy choices: PulzivoAnalytics.optOut(), Do Not Track and Global Privacy
  // Control all stop tracking. Sites can set data-ignore-dnt="true" to ignore DNT/GPC.
  function isOptedOut() {
    if (getStorageItem('pulz_opt_out') === '1') return true;
    if (config.ignoreDnt) return false;
    const n = window.navigator || {};
    return n.doNotTrack === '1' || window.doNotTrack === '1' || n.globalPrivacyControl === true;
  }

  // Queue event
  function queueEvent(eventName, data = {}) {
    syncOwnerMode();
    // Opted out / DNT, site owner, known crawler, or no valid API key: send nothing.
    if (isOptedOut() || isOwner || isKnownCrawler() ||
        !config.apiKey || config.apiKey.trim() === '' || config.apiKey === 'unknown' || isApiKeyInvalid) {
      if (config.debug) console.log('[Analytics] Event suppressed:', eventName);
      return;
    }

    // Explicit attribution wins. Fill gaps from the live URL and from page/route
    // strings (SPA navigations pass router.url with ?utm_*). The landing snapshot
    // is applied once, on the first page view, in case the router already removed
    // the query before that event was queued.
    let attribution = mergeAttribution(
      data.attribution && typeof data.attribution === 'object' ? data.attribution : {},
      [
        referrerAttributionEnabled() ? getAttributionData() : {},
        utmFromLocation(),
        utmFromUrlLike(data.page),
        utmFromUrlLike(data.route),
        utmFromUrlLike(data.url),
        utmFromUrlLike(data.href),
        utmFromUrlLike(data.previousUrl),
      ]
    );
    if (eventName === 'page_view' && !landingUtmApplied) {
      attribution = mergeAttribution(attribution, landingUtm);
      landingUtmApplied = true;
    }
    touchSession();
    userId = visitorId();
    if (newSessionPending && planLoaded) {
      newSessionPending = false;
      if (hasFeature('sessions')) queueEvent('session_start', { category: 'session', custom: { session_type: 'new' } });
    }
    const browserInfo = getBrowserInfo();

    const eventData = {
      event_category: data.category || 'engagement',
      event_label: data.label || null,
      value: data.value || null,
      custom_parameters: data.custom || {},
      user_id: userId,
      session_id: sessionId,
      view_id: viewId,
      user_type: userEmail || getStorageItem('pz_uid') ? 'authenticated' : 'anonymous',
      first_visit: getStorageItem('analytics_first_visit') || new Date().toISOString(),
      visit_count: parseInt(getStorageItem('analytics_visit_count') || '0'),
      page: pagePath(),
      page_title: document.title || '',
      page_load_time: pageLoadTime,
      scroll_depth: maxScroll,
      attribution: attribution,
      ...browserInfo,
      ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'attribution'))  // Spread data but exclude attribution (already handled above)
    };

    // Sanitize page path — strip whitespace/encoded newlines/trailing slash that create duplicate Top Pages rows
    if (eventData.page && typeof eventData.page === 'string') {
      let page = eventData.page.replace(/%0[ad9]|[\r\n\t]/gi, '').trim();
      if (page.length > 1) page = page.replace(/\/+$/, '');
      eventData.page = redact(page) || '/';
    }
    // Redact incidental emails from every string field (and custom params); only the
    // email set via setUserEmail()/identify() is sent, as user_email.
    [eventData, eventData.custom_parameters].forEach((obj) => {
      if (obj) Object.keys(obj).forEach((k) => {
        if (typeof obj[k] === 'string' && obj[k].indexOf('@') !== -1) obj[k] = redact(obj[k]);
      });
    });
    ['href', 'url', 'form_action'].forEach((k) => {
      if (eventData[k]) eventData[k] = cleanUrl(eventData[k]);
    });
    // An email the site set via setUserEmail()/identify() is sent as-is (dashboard "Who").
    if (userEmail) eventData.user_email = userEmail;

    // Store first visit
    if (isLocalStorageAvailable()) {
      if (!getStorageItem('analytics_first_visit')) {
        setStorageItem('analytics_first_visit', eventData.first_visit);
      }
    }

    const event = {
      event_name: eventName,
      user_id: userId,
      user_email: userEmail || undefined,
      data: eventData,
      service: config.apiKey
    };

    // Cap queue size to prevent memory issues
    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      eventQueue.shift(); // Drop oldest event
    }
    eventQueue.push(event);

    if (config.debug) {
      console.log(`[Analytics] Event "${eventName}":`, data);
    }
  }

  function postEvents(events, keepalive) {
    const body = JSON.stringify(events);
    return fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // keepalive lets the request outlive the page; browsers cap it at 64KB.
      keepalive: keepalive && body.length < BEACON_MAX_BYTES
    });
  }

  // Send batch
  async function sendBatch() {
    syncOwnerMode();
    if (eventQueue.length === 0 || !config.apiUrl || !config.apiKey || isApiKeyInvalid) return;
    const now = Date.now();
    if (rateLimitBackoff > 0 && (now - lastRateLimitTime) < rateLimitBackoff) return;
    if (config.debug) {
      console.log('[Analytics] Debug mode: not sending', eventQueue.length, 'events');
      eventQueue = [];
      return;
    }

    const eventsToSend = eventQueue;
    eventQueue = [];

    try {
      const response = await postEvents(eventsToSend, true);
      if (response.ok) {
        retryCount = 0;
        rateLimitBackoff = 0;
        lastRateLimitTime = 0;
        return;
      }
      if (response.status === 401) {
        stopInvalidKey();
        return;
      }
      if (response.status === 429) {
        lastRateLimitTime = Date.now();
        rateLimitBackoff = Math.min(rateLimitBackoff === 0 ? 30000 : rateLimitBackoff * 2, 300000);
        eventQueue.unshift(...eventsToSend);
        return;
      }
      throw new Error('HTTP ' + response.status);
    } catch (error) {
      // Network errors are normal (offline, ad blockers); stay quiet unless debugging.
      if (config.debug) console.warn('[Analytics] Batch send failed:', error);
      if (!isApiKeyInvalid && retryCount < MAX_RETRY_COUNT) {
        retryCount++;
        eventQueue.unshift(...eventsToSend);
      } else {
        retryCount = 0;
      }
    }
  }

  function stopInvalidKey() {
    isApiKeyInvalid = true;
    console.error('[Analytics] API key is invalid (401) - tracking stopped');
    if (batchTimer) { clearInterval(batchTimer); batchTimer = null; }
    eventQueue = [];
  }

  // Unload-safe flush (tab hidden / closed): sendBeacon in chunks under the 64KB limit,
  // as text/plain so no CORS preflight is needed; fetch keepalive if the beacon is refused.
  function flushNow() {
    syncOwnerMode();
    if (isOwner) { eventQueue = []; return; }
    if (!eventQueue.length || !config.apiUrl || isApiKeyInvalid || config.debug) return;
    const events = eventQueue;
    eventQueue = [];
    let chunk = [];
    let size = 2;
    const send = () => {
      if (!chunk.length) return;
      const body = JSON.stringify(chunk);
      let ok = false;
      try {
        ok = !!(navigator.sendBeacon && navigator.sendBeacon(config.apiUrl, new Blob([body], { type: 'text/plain' })));
      } catch (e) {}
      if (!ok) {
        try { postEvents(chunk, true).catch(() => {}); } catch (e) {}
      }
      chunk = [];
      size = 2;
    };
    events.forEach((ev) => {
      const n = JSON.stringify(ev).length + 1;
      if (n > BEACON_MAX_BYTES) return;
      if (size + n > BEACON_MAX_BYTES) send();
      chunk.push(ev);
      size += n;
    });
    send();
  }

  // Start batch timer
  function startBatchTimer() {
    if (batchTimer) clearInterval(batchTimer);
    batchTimer = setInterval(() => {
      sendBatch().catch(error => {
        if (config.debug) console.error('[Analytics] Batch timer error:', error);
      });
    }, config.batchIntervalMs);
  }

  // Fetch plan from API based on API key
  async function fetchPlanFromApi() {
    try {
      // Derive the validate endpoint from the API URL
      // e.g. https://api.example.com/analytics/log -> https://api.example.com/api-keys/STK-XXXXX/validate
      const baseUrl = config.apiUrl.split('?')[0];
      const origin = new URL(baseUrl).origin;
      const validateUrl = `${origin}/api-keys/${encodeURIComponent(config.apiKey)}/validate`;

      const response = await fetch(validateUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.plan && PLAN_FEATURES[data.plan]) {
          currentPlan = data.plan;
          planFeatures = PLAN_FEATURES[currentPlan];
          if (config.debug) {
            console.log('[Analytics] Plan loaded from API:', currentPlan, '- Features:', planFeatures);
          }
        }
      } else if (response.status === 401) {
        stopInvalidKey();
      }
    } catch (error) {
      if (config.debug) {
        console.warn('[Analytics] Could not fetch plan from API, defaulting to free:', error);
      }
      // Default to free plan on failure (most restrictive)
    }
  }

  function scrollPercent() {
    const el = document.documentElement;
    const max = Math.max(document.body ? document.body.scrollHeight : 0, el.scrollHeight) - window.innerHeight;
    if (max <= 0) return 100;
    return Math.min(100, Math.round(((window.pageYOffset || el.scrollTop) / max) * 100));
  }

  function engagedTime() {
    return engagedMs + (document.visibilityState === 'hidden' ? 0 : Date.now() - visibleSince);
  }

  // page_exit carries time on page (visible time only, ms) and scroll depth for the current
  // view. Repeats with unchanged values (hidden, then closed) are skipped.
  function emitExit() {
    if (!viewId || !hasFeature('page_exit')) return;
    const t = engagedTime();
    const key = viewId + ':' + Math.round(t / 1000) + ':' + maxScroll;
    if (key === lastExitKey) return;
    lastExitKey = key;
    queueEvent('page_exit', { page: currentPage, time_on_page: t, scroll_depth: maxScroll });
  }

  function newView() {
    viewId = generateUUID();
    engagedMs = 0;
    visibleSince = Date.now();
    lastExitKey = '';
    maxScroll = 0;
    currentPage = pagePath();
  }

  // Unload hooks (form abandon, final web vitals) run before the flush.
  const hideHooks = [];
  function runHide(unloading) {
    emitExit();
    hideHooks.forEach((fn) => {
      try { fn(unloading); } catch (e) {}
    });
    flushNow();
  }

  let navKey = '';
  const SEARCH_PARAMS = ['q', 's', 'query', 'search'];
  // Site search term from the URL (?q=, ?s=, ?query=, ?search= or data-search-params).
  function searchTerm() {
    try {
      const params = new URLSearchParams(window.location.search);
      const keys = config.searchParams ? String(config.searchParams).split(',') : SEARCH_PARAMS;
      for (const k of keys) {
        const v = params.get(k.trim());
        if (v && v.trim()) return [redact(v.trim().substring(0, 100)), k.trim()];
      }
    } catch (e) {}
    return null;
  }
  function navKeyNow() {
    const t = searchTerm();
    return pagePath() + (t ? '?' + t[0] : '');
  }
  // After each page view: site search, and 404 pages (<meta name="pulzivo:404">, or a
  // title such as "404", "Not Found", "Page not found"). SPAs can call trackNotFound().
  const NOT_FOUND_TITLE = /(^|[^\w.])404([^\w.]|$)|\bnot found\b/i;
  function afterView() {
    const t = searchTerm();
    if (t) queueEvent('site_search', { category: 'search', label: t[0], term: t[0], search_param: t[1] });
    if ((document.querySelector && document.querySelector('meta[name="pulzivo:404"]')) ||
        NOT_FOUND_TITLE.test(document.title || '')) trackNotFound();
    if (planLoaded && hasImpressions()) loadExtras();
  }
  let notFoundView = '';
  function trackNotFound(path) {
    if (notFoundView === viewId && !path) return; // once per page view
    notFoundView = viewId;
    queueEvent('not_found', {
      category: 'error',
      label: 'Not found',
      page: path || pagePath(),
      referrer_url: cleanUrl(document.referrer)
    });
  }
  // Called for history pushState/replaceState, popstate, hashchange and bfcache restores.
  function onNav() {
    const k = navKeyNow();
    if (k === navKey) return;
    navKey = k;
    // Capture UTMs before the router strips them; wait a tick for document.title.
    const attribution = captureAttributionNow();
    emitExit();
    newView();
    setTimeout(() => {
      queueEvent('page_view', { attribution: attribution });
      afterView();
    }, 50);
  }

  // Optional modules (public/pulzivo-analytics-extras.js), loaded on demand. Errors thrown
  // before it arrives are buffered (max 20) so early errors are not lost.
  const EXTRA_FEATURES = ['form_tracking', 'tooltip_tracking', 'error_tracking', 'rage_clicks', 'dead_clicks'];
  const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
  const errBuf = [];
  let onErr = null;
  function bufferError(args) {
    if (onErr) onErr.apply(null, args);
    else if (errBuf.length < 20) errBuf.push(args);
  }
  function listenErrors() {
    window.addEventListener('error', (e) => {
      // Resource load errors have no message.
      if (e && e.message) bufferError(['javascript_error', e.message, e.error && e.error.stack, { filename: cleanUrl(e.filename), line: e.lineno, column: e.colno }]);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      bufferError(['promise_rejection', (r && r.message) || String(r || 'Promise rejected'), r && r.stack, {}]);
    });
  }
  let extrasRequested = false;
  function hasImpressions() {
    return hasFeature('custom_events') && !!(document.querySelector && document.querySelector('[data-track-impression]'));
  }
  function loadExtras() {
    if (extrasRequested) return;
    extrasRequested = true;
    const src = config.extrasUrl ||
      (/pulzivo-analytics(\.min)?\.js/.test(SELF_SRC) ? SELF_SRC.replace(/pulzivo-analytics(\.min)?\.js/, 'pulzivo-analytics-extras$1.js')
        : 'https://cdn.pulzivo.com/pulzivo-analytics-extras.min.js');
    try {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      (document.head || document.documentElement).appendChild(el);
    } catch (e) {}
  }
  // Internals shared with the extras module only (not a public API).
  const internals = {
    q: queueEvent, label: elLabel, text: clickText, page: pagePath, redact: redact, has: hasFeature, hide: hideHooks,
    errors: function(fn) { onErr = fn; errBuf.splice(0).forEach((a) => fn.apply(null, a)); }
  };

  // Setup automatic tracking
  function setupAutomaticTracking() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Track page load time
    if (hasFeature('performance')) {
      const onLoad = () => {
        pageLoadTime = performance.now();
        const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        queueEvent('page_load_complete', {
          category: 'performance',
          custom: { load_time: pageLoadTime, dom_ready: (nav && nav.domContentLoadedEventEnd) || 0, fully_loaded: true }
        });
      };
      if (document.readyState === 'complete') onLoad();
      else window.addEventListener('load', onLoad);
    }

    // Track scroll depth (throttled to avoid performance issues)
    if (config.autoTrackScroll && hasFeature('scroll_depth')) {
      window.addEventListener('scroll', () => {
        if (scrollThrottleTimer) return;
        scrollThrottleTimer = setTimeout(() => {
          scrollThrottleTimer = null;
          maxScroll = Math.max(maxScroll, scrollPercent());
        }, 200);
      }, { passive: true });
    }

    // Tab hidden: record engagement so far and flush (mobile browsers often never fire
    // pagehide). Tab closed / navigated away: same, plus unload-only hooks.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        engagedMs += Date.now() - visibleSince;
        runHide(false);
      } else {
        visibleSince = Date.now();
      }
    });
    window.addEventListener('pagehide', () => runHide(true));
    // bfcache restore: the page comes back without reloading the script.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        visibleSince = Date.now();
        navKey = '';
        onNav();
      }
    });

    // Outbound links and file downloads (all plans). auxclick covers middle-click.
    const onLink = (event) => {
      const a = event.target && event.target.closest && event.target.closest('a[href]');
      if (!a) return;
      let u;
      try { u = new URL(a.href, window.location.href); } catch (e) { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      const ext = (u.pathname.match(/\.(pdf|zip|rar|7z|gz|tgz|dmg|exe|msi|pkg|apk|csv|xlsx?|docx?|pptx?|txt|mp3|mp4|mov|wav)$/i) || [])[1];
      const label = elLabel(a, 100);
      if (ext || a.hasAttribute('download')) {
        queueEvent('file_download', { category: 'download', url: u.href, file_type: (ext || 'file').toLowerCase(), label: label });
      } else if (u.hostname !== window.location.hostname) {
        queueEvent('outbound_click', { category: 'outbound', url: u.href, domain: u.hostname, label: label });
      }
    };
    document.addEventListener('click', onLink, true);
    document.addEventListener('auxclick', onLink, true);

    if (config.autoTrackClicks) {
      document.addEventListener('click', (event) => {
        if (!event.target || !event.target.closest) return;
        const target = event.target.closest('[data-click]');
        
        // Always track elements with data-click attribute (all plans)
        if (target) {
          const clickType = target.getAttribute('data-click') || 'click';
          
          queueEvent('click', {
            category: 'interaction',
            label: elLabel(target, 100),
            text: clickText(target),
            element: target.tagName,
            href: target.href || null,
            click_type: clickType,
            custom: { x: event.clientX, y: event.clientY }
          });
          return; // Don't process further if data-click is present
        }
        
        // Auto-track all buttons and links (Pro/Enterprise plans only)
        if (hasFeature('auto_clicks')) {
          const clickableTarget = event.target.closest('button, a, [role="button"]');
          if (clickableTarget) {
            const label = elLabel(clickableTarget, 100);
            const href = clickableTarget.href || null;
            
            // Skip if no meaningful content and no href
            if (!label && !href) return;
            
            queueEvent('click', {
              category: 'interaction',
              label: label || href,
              text: clickText(clickableTarget),
              element: clickableTarget.tagName,
              href: href,
              click_type: 'auto',
              custom: { x: event.clientX, y: event.clientY }
            });
          }
        }
      });
    }

    // Forms, tooltips, JS errors, rage/dead clicks live in a separate small file that is
    // only fetched when the plan enables one of them (keeps the core script small).
    // Impressions (data-track-impression) also live there; afterView() loads it when such
    // elements appear.
    if (EXTRA_FEATURES.some(hasFeature) || hasImpressions()) loadExtras();

    // Core Web Vitals (all plans): LCP, INP, CLS (largest 5s session window, as
    // Google defines it), FCP and TTFB. Reported when the tab is hidden, and again only if
    // a value changed afterwards.
    if (hasFeature('web_vitals') && 'PerformanceObserver' in window) {
      const vitals = {};
      const sent = {};
      const observe = (type, cb, opts) => {
        try {
          new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe(Object.assign({ type: type, buffered: true }, opts));
        } catch (e) {}
      };
      observe('largest-contentful-paint', (e) => { vitals.LCP = Math.round(e.renderTime || e.loadTime || e.startTime); });
      observe('paint', (e) => { if (e.name === 'first-contentful-paint') vitals.FCP = Math.round(e.startTime); });
      // INP: slowest interaction (an approximation of the 98th percentile for typical pages).
      observe('event', (e) => {
        if (e.interactionId) vitals.INP = Math.max(vitals.INP || 0, Math.round(e.duration));
      }, { durationThreshold: 40 });
      observe('first-input', (e) => { vitals.INP = Math.max(vitals.INP || 0, Math.round(e.duration)); });
      let clsWin = 0;
      let clsFirst = 0;
      let clsLast = 0;
      observe('layout-shift', (e) => {
        if (e.hadRecentInput) return;
        if (clsWin && e.startTime - clsLast < 1000 && e.startTime - clsFirst < 5000) {
          clsWin += e.value;
        } else {
          clsWin = e.value;
          clsFirst = e.startTime;
        }
        clsLast = e.startTime;
        vitals.CLS = Math.max(vitals.CLS || 0, Math.round(clsWin * 10000) / 10000);
      });
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav && nav.responseStart > 0) vitals.TTFB = Math.round(nav.responseStart);
      } catch (e) {}
      hideHooks.push(() => {
        Object.keys(vitals).forEach((name) => {
          if (sent[name] === vitals[name]) return;
          sent[name] = vitals[name];
          queueEvent('web_vital_' + name.toLowerCase(), {
            category: 'performance',
            value: vitals[name],
            custom: { metric: name, value: vitals[name], page: pagePath() }
          });
        });
      });
    }

    // Track initial page view, then SPA route changes (Angular, React, Vue, ...),
    // hash routes, back/forward and bfcache restores.
    if (config.autoTrackPageViews) {
      onNav();
      if (hasFeature('unique_visitors')) trackUniqueVisitor();
      window.addEventListener('popstate', onNav);
      window.addEventListener('hashchange', onNav);
      ['pushState', 'replaceState'].forEach((method) => {
        const original = history[method];
        history[method] = function() {
          const result = original.apply(this, arguments);
          try { onNav(); } catch (e) {}
          return result;
        };
      });
    } else {
      newView();
    }
  }

  // Public API
  const Analytics = {
    // Initialize the analytics
    init: function(options = {}) {
      if (isInitialized) {
        if (config.debug) console.warn('[Analytics] Already initialized');
        return;
      }

      // Merge configuration
      config = { ...config, ...options };

      // URL query param owner exclusion (mobile-friendly) — checked first so a
      // shared link like ?pulz_owner=1 works without console access.
      applyOwnerFlagFromUrl();

      // Apply owner exclusion from init options
      if (config.excludeOwner) {
        ownerOverride = true;
        isOwner = true;
        persistOwnerFlag(true);
      }

      // Check if API key is provided
      if (!config.apiKey || config.apiKey.trim() === '') {
        console.error('[Analytics] API key is required and cannot be empty - not initializing');
        return;
      }

      // Check if API URL is provided
      if (!config.apiUrl || config.apiUrl.trim() === '') {
        console.error('[Analytics] API URL is required and cannot be empty - not initializing');
        return;
      }

      // Append API key as query parameter (sent via URL, not header, for script-tag simplicity)
      try {
        const url = new URL(config.apiUrl);
        if (!url.searchParams.has('apiKey')) {
          url.searchParams.set('apiKey', config.apiKey);
          config.apiUrl = url.toString();
        }
      } catch (e) {
        console.error('[Analytics] Invalid API URL:', config.apiUrl);
        return;
      }

      // Skip known crawlers and automated / headless browsers.
      if (isKnownCrawler()) {
        if (config.debug) console.log('[Analytics] Crawler or automated browser — tracking suppressed.');
        return;
      }

      // Initialize session
      initializeSession();
      listenErrors();

      // Load user preferences from localStorage
      loadUserPreferences();

      // Start batch timer
      startBatchTimer();

      isInitialized = true;

      if (config.debug) {
        console.log('[Analytics] Initialized with config:', config);
      }

      // Fetch plan from API, then setup auto-tracking based on plan
      fetchPlanFromApi().then(() => {
        planLoaded = true;
        setupAutomaticTracking();
      });
    },

    // Mark the current user as the site owner — all tracking is suppressed.
    // Call after login: PulzivoAnalytics.setOwner(user.role === 'owner')
    // Or pass init({ excludeOwner: true }) to suppress immediately.
    // Pass persist=true to save to localStorage so it survives page refreshes.
    setOwner: function(flag, persist = false) {
      ownerOverride = !!flag;
      isOwner = ownerOverride;
      if (persist) {
        persistOwnerFlag(isOwner);
      }
      if (isOwner) {
        clearQueuedEvents('setOwner(true)');
      }
      if (config.debug) console.log('[Analytics] Owner mode:', isOwner ? 'ON (tracking suppressed)' : 'OFF (tracking active)');
    },

    // Permanently disable tracking for this browser (survives page refreshes).
    // Useful for devs/admins: run PulzivoAnalytics.disableTracking() once in the console.
    disableTracking: function() {
      persistOwnerFlag(true);
      ownerOverride = true;
      isOwner = true;
      clearQueuedEvents('disableTracking()');
      if (config.debug) console.log('[Analytics] Tracking permanently disabled for this browser. Call enableTracking() to undo.');
    },

    // Re-enable tracking for this browser after disableTracking() was called.
    enableTracking: function() {
      persistOwnerFlag(false);
      ownerOverride = false;
      isOwner = false;
      if (config.debug) console.log('[Analytics] Tracking re-enabled for this browser.');
    },

    // Track custom event
    trackEvent: function(eventName, data = {}) {
      if (!isInitialized) {
        if (config.debug) console.warn('[Analytics] Not initialized. Call Analytics.init() first.');
        return;
      }
      
      // Check if this is a custom event (not a system event)
      const systemEvents = ['page_view', 'click', 'scroll', 'page_exit', 'visibility', 'performance', 'error', 'interaction', 'navigation', 'promo_impression', 'promo_click', 'form_focus', 'form_submit', 'form_abandon', 'rage_click', 'dead_click', 'web_vital_lcp', 'web_vital_fid', 'web_vital_cls', 'resource_timing'];
      const isCustomEvent = !systemEvents.includes(eventName);
      
      // For custom events, check if plan allows it
      if (isCustomEvent && !hasFeature('custom_events')) {
        if (config.debug) {
          console.warn('[Analytics] Custom event tracking is not available on your current plan. Upgrade at pulzivo.com/pricing');
        }
        return;
      }
      
      queueEvent(eventName, data);
    },

    // Goals and revenue (all plans). Both count as conversions in the dashboard.
    //   PulzivoAnalytics.trackGoal('signup')
    //   PulzivoAnalytics.trackRevenue(49.99, 'USD', { goal: 'purchase', order_id: 'A-1' })
    trackGoal: function(name, data = {}) {
      if (!name) return;
      queueEvent('goal', Object.assign({}, data, { category: 'goal', goal: String(name), label: String(name) }));
    },
    trackRevenue: function(amount, currency, data = {}) {
      const value = Number(amount);
      if (!isFinite(value)) return;
      const goal = data.goal ? String(data.goal) : null;
      queueEvent('revenue', Object.assign({}, data, {
        category: 'revenue',
        value: value,
        revenue: value,
        currency: String(currency || 'USD').toUpperCase().substring(0, 3),
        goal: goal,
        label: goal || 'revenue'
      }));
    },
    // Mark the current view as a 404 (SPAs call this from their not-found route).
    trackNotFound: function(path) {
      trackNotFound(path);
    },
    // Visitor opt-out (persists in this browser).
    optOut: function() {
      setStorageItem('pulz_opt_out', '1');
      eventQueue = [];
    },
    optIn: function() {
      try { localStorage.removeItem('pulz_opt_out'); } catch (e) {}
    },
    isOptedOut: function() {
      return isOptedOut();
    },

    // Track user interaction
    trackInteraction: function(action, label, data = {}) {
      this.trackEvent('interaction', {
        category: 'interaction',
        action,
        label,
        ...data
      });
    },

    // Track page view manually (use when autoTrackPageViews is disabled)
    trackPageView: function(title, path) {
      emitExit();
      newView();
      if (path) currentPage = path;
      queueEvent('page_view', {
        page: path || pagePath(),
        page_title: (title || '').replace(/\s*\|.*$/, '').trim()
      });
      afterView();
    },

    // Track navigation
    trackNavigation: function(page, data = {}) {
      this.trackEvent('navigation', {
        category: 'navigation',
        page,
        ...data
      });
    },

    // Track error
    trackError: function(error, data = {}) {
      this.trackEvent('error', {
        category: 'error',
        error_message: error,
        ...data
      });
    },

    // Track performance
    trackPerformance: function(metric, value, data = {}) {
      this.trackEvent('performance', {
        category: 'performance',
        metric,
        value,
        ...data
      });
    },

    // Opt-in identity (signed-in users). identify('user-123') keeps that ID in this
    // browser (localStorage 'pz_uid') so the same person is recognised across days.
    // identify('user-123', { email }) or setUserEmail(email) also attach an email, held in
    // memory and sessionStorage (this tab) only. reset() on sign-out forgets both.
    identify: function(id, traits) {
      if (id == null || id === '') return;
      id = String(id).trim().substring(0, 128);
      if (id.indexOf('@') > 0) {
        Analytics.setUserEmail(id);
      } else {
        setStorageItem('pz_uid', id);
        userId = id;
      }
      if (traits && traits.email) Analytics.setUserEmail(traits.email);
    },
    reset: function() {
      try { localStorage.removeItem('pz_uid'); } catch (e) {}
      Analytics.clearUserEmail();
      idDay = '';
      userId = visitorId();
    },
    setUserEmail: function(email) {
      if (!email) return Analytics.clearUserEmail();
      userEmail = String(email).trim();
      setStorageItem('pz_email', userEmail, window.sessionStorage);
    },

    clearUserEmail: function() {
      userEmail = null;
      try { window.sessionStorage.removeItem('pz_email'); } catch (e) {}
    },

    // Send batch immediately
    sendBatch: function() {
      return sendBatch();
    },

    // Track unique visitor manually
    trackUniqueVisitor: function() {
      trackUniqueVisitor();
    },

    // Get current config (for debugging)
    getConfig: function() {
      return { ...config };
    },

    // Get current plan info
    getPlan: function() {
      return { plan: currentPlan, features: [...planFeatures] };
    },

    // Update plan (called when plan changes, e.g. after upgrade)
    setPlan: function(plan) {
      if (PLAN_FEATURES[plan]) {
        currentPlan = plan;
        planFeatures = PLAN_FEATURES[plan];
        if (config.debug) {
          console.log('[Analytics] Plan updated to:', plan, '- Features:', planFeatures);
        }
      }
    },

    // Update config
    updateConfig: function(newConfig) {
      config = { ...config, ...newConfig };
      if (config.debug) {
        console.log('[Analytics] Config updated:', config);
      }
    },

    // Update user preferences for analytics features
    updatePreferences: function(preferences) {
      if (!preferences || typeof preferences !== 'object') {
        console.warn('[Analytics] Invalid preferences provided');
        return;
      }

      userPreferences = { ...userPreferences, ...preferences };
      
      // Save to localStorage
      if (isLocalStorageAvailable()) {
        try {
          setStorageItem('analytics_preferences', JSON.stringify(userPreferences));
          if (config.debug) {
            console.log('[Analytics] User preferences updated and saved:', userPreferences);
          }
        } catch (e) {
          console.warn('[Analytics] Could not save user preferences:', e);
        }
      }
    }
  };

  // Make it available globally as object
  window.PulzivoAnalytics = Analytics;
  
  // Make PulzivoAnalytics callable as a function for easier API
  // PulzivoAnalytics('event', 'name', data) or PulzivoAnalytics.trackEvent('name', data)
  const originalAnalytics = window.PulzivoAnalytics;
  window.PulzivoAnalytics = function(command, ...args) {
    if (typeof command === 'string') {
      switch (command) {
        case 'event':
          // PulzivoAnalytics('event', 'button_clicked', { button_id: 'signup' })
          const [eventName, eventData] = args;
          return originalAnalytics.trackEvent(eventName, eventData || {});
        case 'identify':
          // PulzivoAnalytics('identify', 'user-123', { email }) or ('identify', 'user@example.com')
          return originalAnalytics.identify(args[0], args[1]);
        case 'reset':
          return originalAnalytics.reset();
        case 'page_view':
          // PulzivoAnalytics('page_view', 'Page Title', '/path')
          return originalAnalytics.trackPageView(args[0], args[1]);
        case 'page':
          // PulzivoAnalytics('page', '/custom-page')
          return originalAnalytics.trackNavigation(args[0], args[1] || {});
        case 'goal':
          return originalAnalytics.trackGoal(args[0], args[1] || {});
        case 'revenue':
          // PulzivoAnalytics('revenue', 49.99, 'USD', { goal: 'purchase' })
          return originalAnalytics.trackRevenue(args[0], args[1], args[2] || {});
        case '404':
          return originalAnalytics.trackNotFound(args[0]);
        default:
          console.warn('[PulzivoAnalytics] Unknown command:', command);
      }
    } else if (typeof command === 'function') {
      // PulzivoAnalytics(() => { ... }) - Execute when ready
      if (isInitialized) {
        command();
      } else {
        setTimeout(() => window.PulzivoAnalytics(command), 100);
      }
    }
  };
  
  // Copy all methods to the function so it works as both function and object
  Object.keys(originalAnalytics).forEach(key => {
    window.PulzivoAnalytics[key] = originalAnalytics[key];
  });
  window.PulzivoAnalytics.__pz = 1;
  window.PulzivoAnalytics.__x = internals;
  if (!window.pulzivo) window.pulzivo = window.PulzivoAnalytics;

  // Get configuration from script tag data attributes
  function getConfigFromScriptTag() {
    // Find the script tag that loaded this file
    const scripts = document.getElementsByTagName('script');
    let analyticsScript = null;

    for (let script of scripts) {
      if (script.src && script.src.includes('pulzivo-analytics') && script.getAttribute('data-api-key')) {
        analyticsScript = script;
        break;
      }
    }

    if (!analyticsScript) return null;

    // Read data attributes and convert to config
    const config = {};

    // data-api-key -> apiKey (required - stop if not provided or empty)
    const apiKey = analyticsScript.getAttribute('data-api-key');
    if (!apiKey || apiKey.trim() === '') {
      console.error('Pulzivo Analytics: data-api-key attribute is required and cannot be empty');
      return null; // Stop all initialization if API key not provided or empty
    }
    config.apiKey = apiKey;

    // data-api-url -> apiUrl
    const apiUrl = analyticsScript.getAttribute('data-api-url');
    if (apiUrl) {
      config.apiUrl = apiUrl;
    }

    // data-batch-interval -> batchIntervalMs
    if (analyticsScript.getAttribute('data-batch-interval')) {
      config.batchIntervalMs = parseInt(analyticsScript.getAttribute('data-batch-interval'));
    }

    // data-debug -> debug
    if (analyticsScript.getAttribute('data-debug')) {
      config.debug = analyticsScript.getAttribute('data-debug').toLowerCase() === 'true';
    }

    // data-plan -> plan (free, pro, enterprise)
    if (analyticsScript.getAttribute('data-plan')) {
      const plan = analyticsScript.getAttribute('data-plan');
      if (PLAN_FEATURES[plan]) {
        currentPlan = plan;
        planFeatures = PLAN_FEATURES[plan];
      }
    }

    // data-disable-page-views -> autoTrackPageViews
    if (analyticsScript.getAttribute('data-disable-page-views')) {
      config.autoTrackPageViews = false;
    }

    // data-disable-clicks -> autoTrackClicks
    if (analyticsScript.getAttribute('data-disable-clicks')) {
      config.autoTrackClicks = false;
    }

    // data-disable-scroll -> autoTrackScroll
    if (analyticsScript.getAttribute('data-disable-scroll')) {
      config.autoTrackScroll = false;
    }

    // data-ignore-dnt="true": track even when Do Not Track / GPC is on (site's own choice).
    if (analyticsScript.getAttribute('data-ignore-dnt') === 'true') config.ignoreDnt = true;
    // data-search-params="term,k": custom site-search query parameters.
    if (analyticsScript.getAttribute('data-search-params')) config.searchParams = analyticsScript.getAttribute('data-search-params');

    return Object.keys(config).length > 0 ? config : null;
  }

  // Apply ?pulz_owner= as early as possible (before any auto-init tracking).
  applyOwnerFlagFromUrl();
  captureLandingUtm();

  // Auto-initialize from script tag data attributes or window config
  const scriptConfig = getConfigFromScriptTag();
  if (scriptConfig) {
    Analytics.init(scriptConfig);
  } else if (window.AnalyticsConfig) {
    Analytics.init(window.AnalyticsConfig);
  }

})(typeof window !== 'undefined' ? window : {});
