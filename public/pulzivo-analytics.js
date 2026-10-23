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
    batchIntervalMs: 15000, // Increased from 5s to 15s to reduce rate limiting
    debug: false,
    autoTrackPageViews: true,
    autoTrackClicks: true,
    autoTrackScroll: true,
    autoTrackPerformance: true,
    excludeOwner: false  // When true, tracking is silently suppressed for the site owner
  };

  // Plan-based feature gating
  const PLAN_FEATURES = {
    free: ['page_views', 'clicks', 'custom_events'],
    starter: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'utm_attribution', 'custom_events'],
    pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events'],
    enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'client_hints', 'form_tracking', 'tooltip_tracking', 'error_tracking', 'rage_clicks', 'web_vitals']
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
      if (typeof window === 'undefined' || !window.location) return null;
      const params = new URLSearchParams(window.location.search || '');
      const keys = ['pulz_owner', 'exclude_owner', 'pulz_exclude_owner'];
      let raw = null;
      for (const key of keys) {
        if (params.has(key)) {
          raw = params.get(key);
          break;
        }
      }
      if (raw === null) return null;
      const normalized = String(raw).trim().toLowerCase();
      if (normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
        return true;
      }
      if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
        return false;
      }
      // Any other non-empty value still enables owner mode (e.g. ?pulz_owner=me)
      return true;
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
      console.log('[Analytics] Owner mode from URL query param:', fromUrl ? 'ON' : 'OFF');
    }
    return true;
  }

  function clearQueuedEvents(reason) {
    if (eventQueue.length > 0 && config.debug) {
      console.log('[Analytics] Clearing queued events:', eventQueue.length, reason ? `(${reason})` : '');
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
        console.log('[Analytics] Owner mode synced from storage:', isOwner ? 'ON' : 'OFF');
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

  // Known crawlers / headless agents never count in stats. KEEP IN SYNC with
  // analytics-api/bots.js (bots.spec.js fails on drift). In-app browsers such as
  // FBAN/FBAV, Instagram, Twitter or LinkedInApp are real people and do not match.
  const CRAWLER_UA_PATTERN =
    'bot\\b|crawl|spider|slurp|mediapartners-google|adsbot|googlebot|google-inspectiontool|' +
    'storebot-google|feedfetcher|google-read-aloud|apis-google|bingpreview|facebookexternalhit|' +
    'facebookcatalog|meta-externalagent|headlesschrome|phantomjs|lighthouse|pagespeed|ptst\\/|' +
    'gtmetrix|pingdom|uptimerobot|' +
    'scrapy|bytespider|petalbot|baiduspider|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|' +
    'ccbot|amazonbot|applebot|duckduckbot';
  const CRAWLER_UA = new RegExp(CRAWLER_UA_PATTERN, 'i');
  let crawlerCache = null;

  function isKnownCrawler() {
    if (crawlerCache !== null) return crawlerCache;
    const ua = typeof navigator !== 'undefined' && navigator.userAgent ? String(navigator.userAgent) : '';
    crawlerCache = Boolean(ua) && CRAWLER_UA.test(ua.replace(/cubot/gi, ''));
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

  function initializeSession() {
    touchSession();
    if (isLocalStorageAvailable()) {
      userId = getStorageItem('analytics_user_id') || generateUUID();
      setStorageItem('analytics_user_id', userId);
      userEmail = getStorageItem('userEmail');
    } else {
      userId = generateUUID();
    }
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

  // Queue event
  function queueEvent(eventName, data = {}) {
    syncOwnerMode();

    // Suppress all tracking for the site owner
    if (isOwner) {
      if (config.debug) console.log('[Analytics] Owner mode active - event suppressed:', eventName);
      return;
    }

    // Never send events for known crawlers (e.g. Mediapartners-Google, Googlebot)
    if (isKnownCrawler()) {
      if (config.debug) console.log('[Analytics] Crawler user agent - event suppressed:', eventName);
      return;
    }

    // Stop logging if no API key is configured or API key is invalid
    if (!config.apiKey || config.apiKey.trim() === '' || config.apiKey === 'unknown' || isApiKeyInvalid) {
      if (config.debug) {
        console.log('[Analytics] No valid API key configured - stopping log for event:', eventName);
      }
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
      user_type: userEmail ? 'authenticated' : 'anonymous',
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
      let page = eventData.page;
      for (let i = 0; i < 3; i++) {
        page = page
          .replace(/%0A/gi, '')
          .replace(/%0D/gi, '')
          .replace(/%09/gi, '')
          .replace(/\r/g, '')
          .replace(/\n/g, '')
          .replace(/\t/g, '');
      }
      page = page.trim();
      if (page.length > 1) page = page.replace(/\/+$/, '');
      eventData.page = redact(page) || '/';
    }
    // Redact emails from every string field (and custom params); identify() is the only
    // way to attach an email, and that travels as user_email.
    [eventData, eventData.custom_parameters].forEach((obj) => {
      if (obj) Object.keys(obj).forEach((k) => {
        if (typeof obj[k] === 'string' && obj[k].indexOf('@') !== -1) obj[k] = redact(obj[k]);
      });
    });
    ['href', 'url', 'form_action'].forEach((k) => {
      if (eventData[k]) eventData[k] = cleanUrl(eventData[k]);
    });

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
    console.warn('[Analytics] API key is invalid (401) - tracking stopped');
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
  function navKeyNow() {
    return pagePath();
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
    setTimeout(() => queueEvent('page_view', { attribution: attribution }), 50);
  }

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

    // Track clicks on elements with data-click attribute
  // Human-readable element name for click reports: aria-label, visible text, title, or image alt.
  function elLabel(el, max) {
    if (!el || !el.getAttribute) return '';
    const img = el.querySelector && el.querySelector('img[alt]');
    const raw = el.getAttribute('aria-label') || el.innerText || el.textContent ||
      el.getAttribute('title') || (img && img.getAttribute('alt')) ||
      (/^(submit|button|reset)$/.test(el.type) ? el.value : '') || '';
    return String(raw).replace(/\s+/g, ' ').trim().substring(0, max);
  }

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
              element: clickableTarget.tagName,
              href: href,
              click_type: 'auto',
              custom: { x: event.clientX, y: event.clientY }
            });
          }
        }
      });
    }

    // Track impressions with Intersection Observer (Pro+ only)
    if (hasFeature('custom_events') && 'IntersectionObserver' in window) {
      const impressionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const impressionId = element.getAttribute('data-track-impression');
            const impressionName = element.getAttribute('data-impression-name') || impressionId;
            const impressionCategory = element.getAttribute('data-impression-category') || 'general';
            
            if (impressionId) {
              queueEvent('impression', {
                category: impressionCategory,
                impression_id: impressionId,
                impression_name: impressionName,
                location: window.location.pathname,
                element: element.tagName.toLowerCase(),
                custom: {
                  visible_ratio: Math.round(entry.intersectionRatio * 100)
                }
              });
              
              // Stop observing after first impression
              impressionObserver.unobserve(element);
            }
          }
        });
      }, {
        threshold: 0.5 // Element must be 50% visible
      });

      // Observe all elements with data-track-impression
      const observeImpressions = () => {
        document.querySelectorAll('[data-track-impression]').forEach(el => {
          impressionObserver.observe(el);
        });
      };

      // Initial observation
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeImpressions);
      } else {
        observeImpressions();
      }

      // Re-observe when new elements are added (for SPAs)
      if ('MutationObserver' in window) {
        const mutationObserver = new MutationObserver(() => {
          observeImpressions();
        });
        mutationObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }

      // Track clicks on impression-tracked elements (Pro+ only)
      document.addEventListener('click', (event) => {
        if (!event.target || !event.target.closest) return;
        const impressionElement = event.target.closest('[data-track-impression]');
        if (impressionElement) {
          const impressionId = impressionElement.getAttribute('data-track-impression');
          const impressionName = impressionElement.getAttribute('data-impression-name') || impressionId;
          const impressionCategory = impressionElement.getAttribute('data-impression-category') || 'general';
          const clickTarget = event.target;
          
          queueEvent('impression_click', {
            category: impressionCategory,
            impression_id: impressionId,
            impression_name: impressionName,
            location: window.location.pathname,
            element: impressionElement.tagName.toLowerCase(),
            clicked_element: clickTarget.tagName.toLowerCase(),
            label: elLabel(clickTarget, 100),
            custom: {
              x: event.clientX,
              y: event.clientY
            }
          });
        }
      });
    }

    // Track form interactions (Enterprise only)
    if (hasFeature('form_tracking')) {
      const formInteractions = new Map();
      
      // Track form start and field interactions
      document.addEventListener('focus', (event) => {
        if (event.target && event.target.matches && event.target.matches('input, textarea, select')) {
          const form = event.target.form;
          const formId = form?.id || form?.name || 'unknown-form';
          const fieldName = event.target.name || event.target.id || event.target.type;
          
          // Track form_start on first field interaction
          if (!formInteractions.has(formId)) {
            formInteractions.set(formId, { 
              startTime: Date.now(), 
              fields: new Set(),
              started: false 
            });
            
            // Track form_start event
            queueEvent('form_start', {
              formId: formId,
              page: window.location.pathname
            });
            formInteractions.get(formId).started = true;
          }
          
          // Track form_field_interaction
          queueEvent('form_field_interaction', {
            formId: formId,
            fieldName: fieldName,
            action: 'focus',
            page: window.location.pathname
          });
          
          formInteractions.get(formId).fields.add(fieldName);
        }
      }, true);

      // Track form submission
      document.addEventListener('submit', (event) => {
        if (event.target && event.target.matches && event.target.matches('form')) {
          const formId = event.target.id || event.target.name || 'unknown-form';
          const interaction = formInteractions.get(formId);
          const timeToComplete = interaction ? Date.now() - interaction.startTime : 0;
          
          queueEvent('form_submit', {
            formId: formId,
            success: true,
            timeToComplete: timeToComplete,
            page: window.location.pathname,
            fields_interacted: interaction ? Array.from(interaction.fields) : [],
            form_action: event.target.action || window.location.href
          });
          formInteractions.delete(formId);
        }
      }, true);

      // Track form abandonment on page exit
      hideHooks.push((unloading) => {
        if (unloading) formInteractions.forEach((interaction, formId) => {
          if (interaction.started && interaction.fields.size > 0) {
            queueEvent('form_abandon', {
              formId: formId,
              fieldsCompleted: interaction.fields.size,
              totalFields: interaction.fields.size, // Approximation
              time_spent: Date.now() - interaction.startTime,
              page: window.location.pathname
            });
          }
        });
      });
    }

    // Track tooltip/help interactions (Enterprise only)
    if (hasFeature('tooltip_tracking')) {
      const tooltipViews = new Map(); // Track unique views per session
      const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent);
      
      // Helper to track tooltip view
      const trackTooltipView = (target, interactionType) => {
        const tooltipText = target.getAttribute('data-tooltip') || 
                           target.getAttribute('ptooltip') || 
                           target.getAttribute('title') || 
                           'unknown';
        const tooltipId = target.getAttribute('data-tooltip-id') || 
                         target.id || 
                         tooltipText.substring(0, 50);
        const section = target.getAttribute('data-tooltip-section') || 
                       target.closest('[data-section]')?.getAttribute('data-section') || 
                       'unknown';
        
        // Track only once per session per tooltip to avoid spam
        const viewKey = `${section}:${tooltipId}`;
        if (!tooltipViews.has(viewKey)) {
          tooltipViews.set(viewKey, true);
          
          queueEvent('tooltip_view', {
            tooltip_id: tooltipId,
            tooltip_text: tooltipText.substring(0, 100),
            section: section,
            page: window.location.pathname,
            element_type: target.tagName.toLowerCase(),
            element_class: target.className || null,
            interaction_type: interactionType, // 'hover' or 'click'
            device_type: isMobile ? 'mobile' : 'desktop'
          });
        }
      };
      
      // Desktop: Track on hover (mouseenter)
      document.addEventListener('mouseenter', (event) => {
        if (isMobile) return; // Skip on mobile to avoid duplicate tracking
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest('[data-tooltip], [ptooltip], [title]');
        if (!target) return;
        
        // Don't track if it's an info icon (those are tracked via click)
        if (target.classList.contains('info-icon') || 
            target.classList.contains('section-info-icon') ||
            target.hasAttribute('data-info-icon')) {
          return;
        }
        
        trackTooltipView(target, 'hover');
      }, true);
      
      // Mobile & Desktop: Track clicks on tooltip elements (but not info icons)
      document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        
        // Check if it's an info icon first (different tracking)
        const isInfoIcon = event.target.closest('.info-icon, .section-info-icon, [data-info-icon]');
        if (isInfoIcon) return; // Let the help_icon_click handler deal with it
        
        // Track tooltip click (mainly for mobile)
        const target = event.target.closest('[data-tooltip], [ptooltip], [title]');
        if (!target) return;
        
        trackTooltipView(target, 'click');
      }, true);
      
      // Track clicks on info icons specifically
      document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest('.info-icon, .section-info-icon, [data-info-icon]');
        if (!target) return;
        
        const section = target.closest('[data-section]')?.getAttribute('data-section') || 
                       target.getAttribute('data-section') ||
                       'unknown';
        const tooltipText = target.getAttribute('ptooltip') || 
                           target.getAttribute('title') || 
                           'unknown';
        
        queueEvent('help_icon_click', {
          section: section,
          tooltip_text: tooltipText.substring(0, 100),
          page: window.location.pathname,
          icon_class: target.className || null
        });
      }, true);
    }

    // Track JavaScript errors (Enterprise only). Capped per page load so a looping error
    // cannot flood the queue; URLs in messages/stacks lose their query strings.
    if (hasFeature('error_tracking')) {
      let errorCount = 0;
      const scrub = (v, max) => redact(String(v || '').replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')).substring(0, max);
      const reportError = (name, message, stack, extra) => {
        if (++errorCount > 20) return;
        const msg = scrub(message, 300);
        queueEvent(name, {
          category: 'error',
          label: msg,
          message: msg,
          custom: Object.assign({ error_message: msg, error_stack: scrub(stack, 1000), page: pagePath() }, extra)
        });
      };
      window.addEventListener('error', (event) => {
        if (!event || !event.message) return; // resource load errors have no message
        reportError('javascript_error', event.message, event.error && event.error.stack, {
          filename: cleanUrl(event.filename),
          line: event.lineno,
          column: event.colno
        });
      });
      window.addEventListener('unhandledrejection', (event) => {
        const r = event && event.reason;
        reportError('promise_rejection', (r && r.message) || String(r || 'Promise rejected'), r && r.stack, {});
      });
    }

    // Track rage clicks and dead clicks (Enterprise only)
    if (hasFeature('rage_clicks') || hasFeature('dead_clicks')) {
      const clickTracking = new Map();
      const RAGE_THRESHOLD = 3; // 3 clicks in 1 second
      const RAGE_WINDOW = 1000; // 1 second

      document.addEventListener('click', (event) => {
        const target = event.target;
        const elementKey = target.tagName + (target.id || '') + (target.className || '');
        
        // Track rage clicks
        if (hasFeature('rage_clicks')) {
          const now = Date.now();
          const clicks = clickTracking.get(elementKey) || [];
          
          // Remove old clicks outside the window
          const recentClicks = clicks.filter(time => now - time < RAGE_WINDOW);
          recentClicks.push(now);
          clickTracking.set(elementKey, recentClicks);
          
          if (recentClicks.length >= RAGE_THRESHOLD) {
            queueEvent('rage_click', {
              category: 'frustration',
              label: elLabel(target, 50) || 'Unknown element',
              custom: {
                element: target.tagName,
                element_id: target.id || null,
                element_class: target.className || null,
                clicks_count: recentClicks.length,
                page: window.location.pathname
              }
            });
            clickTracking.delete(elementKey); // Reset after reporting
          }
        }

        // Track dead clicks (clicks that don't navigate or trigger visible changes)
        if (hasFeature('dead_clicks')) {
          const beforeUrl = window.location.href;
          const beforeScroll = window.pageYOffset;
          
          setTimeout(() => {
            const afterUrl = window.location.href;
            const afterScroll = window.pageYOffset;
            
            // If nothing changed, it might be a dead click
            if (beforeUrl === afterUrl && beforeScroll === afterScroll && 
                !target.matches('input, textarea, select, label')) {
              queueEvent('dead_click', {
                category: 'frustration',
                label: elLabel(target, 50) || 'Unknown element',
                custom: {
                  element: target.tagName,
                  element_id: target.id || null,
                  element_class: target.className || null,
                  href: target.href || null,
                  page: window.location.pathname
                }
              });
            }
          }, 500); // Wait 500ms to see if anything changes
        }
      }, true);
    }

    // Core Web Vitals (Enterprise only): LCP, INP, CLS (largest 5s session window, as
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

      // Skip tracking for headless browsers / automated tools
      if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
        if (config.debug) console.log('[Analytics] Headless browser detected — tracking suppressed.');
        return;
      }

      // Skip tracking for known crawlers (AdSense Mediapartners-Google, Googlebot, bingbot, ...)
      if (isKnownCrawler()) {
        if (config.debug) console.log('[Analytics] Crawler user agent detected — tracking suppressed.');
        return;
      }

      // Initialize session
      initializeSession();

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

    // User management
    setUserEmail: function(email) {
      userEmail = email;
      if (isLocalStorageAvailable()) {
        setStorageItem('userEmail', email);
      }
      if (config.debug) {
        console.log(`[Analytics] User email set: ${email}`);
      }
    },

    clearUserEmail: function() {
      userEmail = null;
      if (isLocalStorageAvailable()) {
        localStorage.removeItem('userEmail');
      }
      if (config.debug) {
        console.log('[Analytics] User email cleared');
      }
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

      // Log which features are now enabled/disabled
      if (config.debug) {
        console.log('[Analytics] Feature status after preference update:');
        Object.keys(preferences).forEach(feature => {
          console.log(`  ${feature}: ${hasFeature(feature) ? 'ENABLED' : 'DISABLED'}`);
        });
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
          // PulzivoAnalytics('identify', 'user@example.com')
          return originalAnalytics.setUserEmail(args[0]);
        case 'page_view':
          // PulzivoAnalytics('page_view', 'Page Title', '/path')
          return originalAnalytics.trackPageView(args[0], args[1]);
        case 'page':
          // PulzivoAnalytics('page', '/custom-page')
          return originalAnalytics.trackNavigation(args[0], args[1] || {});
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
