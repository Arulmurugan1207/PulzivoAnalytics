/**
 * SimpleTrack Analytics SDK
 * Standalone analytics library for any HTML/JavaScript application
 *
 * Usage:
 * <script
 *   src="https://simpletrack.dev/stk-analytics.min.js"
 *   data-api-key="YOUR_API_KEY"
 *   data-api-url="https://your-api-endpoint.com/analytics/log"
 *   data-batch-interval="5000"
 *   data-debug="false">
 * </script>
 */

(function(window) {
  'use strict';

  // Configuration
  let config = {
    apiUrl: 'https://analytics-dot-node-server-apis.ue.r.appspot.com/analytics/log',
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
    free: ['page_views', 'clicks'],
    pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events'],
    enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'client_hints', 'form_tracking', 'error_tracking', 'rage_clicks', 'web_vitals']
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

  // Owner exclusion flag — set via init({ excludeOwner: true }), STKAnalytics.setOwner(true),
  // or by setting localStorage key 'stk_is_owner' = 'true' in the browser.
  let isOwner = (function() {
    try { return localStorage.getItem('stk_is_owner') === 'true'; } catch(e) { return false; }
  })();

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
    // Check if plan includes this feature
    const planAllows = planFeatures.includes(feature);
    
    // If plan doesn't allow it, user can't enable it
    if (!planAllows) {
      if (config.debug) {
        console.log(`[Analytics] Feature '${feature}' blocked by plan (${currentPlan})`);
      }
      return false;
    }
    
    // If user has preferences set, check if they've disabled this feature
    if (userPreferences && userPreferences.hasOwnProperty(feature)) {
      const userChoice = userPreferences[feature] === true;
      if (config.debug) {
        console.log(`[Analytics] Feature '${feature}' user preference: ${userChoice}`);
      }
      return userChoice;
    }
    
    // Default: if plan allows it and user hasn't set preference, it's enabled
    if (config.debug) {
      console.log(`[Analytics] Feature '${feature}' enabled by default (plan allows, no user preference)`);
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

  function getAttributionData() {
    if (typeof window === 'undefined' || !window.location) return {};

    const urlParams = new URLSearchParams(window.location.search);

    return {
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_term: urlParams.get('utm_term'),
      utm_content: urlParams.get('utm_content'),
      landing_page: window.location.pathname + window.location.search,
      landing_domain: window.location.hostname,
      referrer: document.referrer || null,
      referrer_domain: document.referrer ? new URL(document.referrer).hostname : null,
    };
  }

  function getBrowserInfo() {
    if (typeof navigator === 'undefined') return {};

    const info = {
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookieEnabled: navigator.cookieEnabled,
      online: navigator.onLine,
    };

    // Prefer User-Agent Client Hints API when available (enterprise only)
    if (navigator.userAgentData && hasFeature('client_hints')) {
      info.platform = navigator.userAgentData.platform;
      info.mobile = navigator.userAgentData.mobile;
      info.brands = navigator.userAgentData.brands.map(b => `${b.brand}/${b.version}`).join(', ');
    } else {
      info.userAgent = navigator.userAgent;
      info.platform = navigator.platform;
    }

    return info;
  }

  function isLocalStorageAvailable() {
    try {
      const test = '__analytics_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  function isSessionStorageAvailable() {
    try {
      const test = '__analytics_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
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

  // Initialize session and user data
  function initializeSession() {
    if (isSessionStorageAvailable()) {
      sessionId = getStorageItem('analytics_session_id', sessionStorage) || generateUUID();
      setStorageItem('analytics_session_id', sessionId, sessionStorage);
    } else {
      sessionId = generateUUID();
    }

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
    const currentSessionId = getStorageItem('analytics_session_id', sessionStorage);

    // Track per session (more granular)
    if (isSessionStorageAvailable()) {
      const lastTrackedSession = getStorageItem('analytics_unique_visitor_session', sessionStorage);
      if (lastTrackedSession !== currentSessionId) {
        queueEvent('unique_visitor_session', {
          category: 'visitor',
          custom: {
            first_visit_session: true,
            visitor_type: 'unique',
            tracking_type: 'per_session'
          }
        });
        setStorageItem('analytics_unique_visitor_session', currentSessionId, sessionStorage);
      }
    }

    // Track per day (traditional daily uniques)
    if (isLocalStorageAvailable()) {
      const today = new Date().toDateString();
      const lastTrackedDay = getStorageItem('analytics_unique_visitor_day');
      if (lastTrackedDay !== today) {
        queueEvent('unique_visitor_daily', {
          category: 'visitor',
          custom: {
            first_visit_day: true,
            visitor_type: 'unique',
            tracking_type: 'per_day'
          }
        });
        setStorageItem('analytics_unique_visitor_day', today);
      }
    }
  }

  // Queue event
  function queueEvent(eventName, data = {}) {
    // Suppress all tracking for the site owner
    if (isOwner) {
      if (config.debug) console.log('[Analytics] Owner mode active - event suppressed:', eventName);
      return;
    }

    // Stop logging if no API key is configured or API key is invalid
    if (!config.apiKey || config.apiKey.trim() === '' || config.apiKey === 'unknown' || isApiKeyInvalid) {
      if (config.debug) {
        console.log('[Analytics] No valid API key configured - stopping log for event:', eventName);
      }
      return;
    }

    // Use pre-captured attribution if provided, otherwise capture now
    const attribution = data.attribution || (hasFeature('utm_attribution') ? getAttributionData() : {});
    const browserInfo = getBrowserInfo();

    const eventData = {
      event_category: data.category || 'engagement',
      event_label: data.label || null,
      value: data.value || null,
      custom_parameters: data.custom || {},
      user_id: userId,
      user_email: userEmail,
      session_id: sessionId,
      user_type: userEmail ? 'authenticated' : 'anonymous',
      first_visit: getStorageItem('analytics_first_visit') || new Date().toISOString(),
      visit_count: parseInt(getStorageItem('analytics_visit_count') || '0'),
      page: window.location ? window.location.pathname : '',
      page_title: document.title || '',
      page_load_time: pageLoadTime,
      scroll_depth: maxScroll,
      time_on_page: 0,
      attribution: attribution,
      ...browserInfo,
      ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'attribution'))  // Spread data but exclude attribution (already handled above)
    };

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

  // Send batch
  async function sendBatch() {
    // Only log batch check if there are events to send or if debug is enabled
    if (eventQueue.length > 0 || config.debug) {
      console.log('[Analytics] Batch timer check - Events in queue:', eventQueue.length);
    }
    
    if (eventQueue.length === 0 || !config.apiUrl || !config.apiKey || isApiKeyInvalid) {
      if (!config.apiKey) {
        console.log('[Analytics] No API key configured - not sending logs');
      }
      if (!config.apiUrl) {
        console.log('[Analytics] No API URL configured - not sending logs');
      }
      if (isApiKeyInvalid) {
        console.log('[Analytics] API key is invalid - not sending logs');
      }
      return;
    }

    // Check if we're in rate limit backoff period
    const now = Date.now();
    if (rateLimitBackoff > 0 && (now - lastRateLimitTime) < rateLimitBackoff) {
      console.log('[Analytics] Rate limit backoff active, skipping batch. Retry in', Math.round((rateLimitBackoff - (now - lastRateLimitTime)) / 1000), 'seconds');
      return;
    }

    // In debug mode, don't send to backend - only log to console
    if (config.debug) {
      console.log('[Analytics] Debug mode: Not sending batch to backend. Events in queue:', eventQueue.length);
      eventQueue = [];
      return;
    }

    const eventsToSend = [...eventQueue];
    eventQueue = [];

    console.log('[Analytics] Sending batch of', eventsToSend.length, 'events to', config.apiUrl);

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventsToSend)
      });

      if (response.ok) {
        console.log('[Analytics] Batch sent successfully!');
        retryCount = 0; // Reset retry count on success
        rateLimitBackoff = 0; // Reset rate limit backoff on success
        lastRateLimitTime = 0;
      } else {
        // Handle 401 Unauthorized - API key is invalid
        if (response.status === 401) {
          isApiKeyInvalid = true;
          console.error('[Analytics] API key is invalid (401 Unauthorized) - stopping all logging');
          // Clear the batch timer to stop sending requests
          if (batchTimer) {
            clearInterval(batchTimer);
            batchTimer = null;
          }
          // Clear any queued events since API key is invalid
          eventQueue = [];
          return;
        }
        
        // Handle 429 Rate Limiting with exponential backoff
        if (response.status === 429) {
          lastRateLimitTime = Date.now();
          rateLimitBackoff = Math.min(rateLimitBackoff === 0 ? 30000 : rateLimitBackoff * 2, 300000); // Start at 30s, double up to max 5 minutes
          console.warn(`[Analytics] Rate limited (429). Backing off for ${rateLimitBackoff / 1000} seconds`);
          
          // Re-queue events for later retry
          eventQueue.unshift(...eventsToSend);
          return;
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Analytics] Batch send failed:', error);
      // Re-queue events on failure with retry limit
      if (!isApiKeyInvalid && retryCount < MAX_RETRY_COUNT) {
        retryCount++;
        eventQueue.unshift(...eventsToSend);
      } else if (retryCount >= MAX_RETRY_COUNT) {
        console.warn('[Analytics] Max retries reached, dropping', eventsToSend.length, 'events');
        retryCount = 0;
      }
    }
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
        isApiKeyInvalid = true;
        console.error('[Analytics] API key is invalid (401) - stopping all logging');
        if (batchTimer) { clearInterval(batchTimer); batchTimer = null; }
        eventQueue = [];
      }
    } catch (error) {
      if (config.debug) {
        console.warn('[Analytics] Could not fetch plan from API, defaulting to free:', error);
      }
      // Default to free plan on failure (most restrictive)
    }
  }

  // Setup automatic tracking
  function setupAutomaticTracking() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Track page load time
    if (hasFeature('performance')) {
      window.addEventListener('load', () => {
        pageLoadTime = performance.now();
        queueEvent('page_load_complete', {
          category: 'performance',
          custom: {
            load_time: pageLoadTime,
            dom_ready: performance.getEntriesByType &&
              performance.getEntriesByType('navigation')[0] &&
              performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd || 0,
            fully_loaded: true
          }
        });
      });
    }

    // Track scroll depth (throttled to avoid performance issues)
    if (config.autoTrackScroll && hasFeature('scroll_depth')) {
      window.addEventListener('scroll', () => {
        if (scrollThrottleTimer) return;
        scrollThrottleTimer = setTimeout(() => {
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const docHeight = document.body.offsetHeight || document.documentElement.offsetHeight;
          const winHeight = window.innerHeight;
          const scrollPercent = Math.round((scrollTop / (docHeight - winHeight)) * 100);
          maxScroll = Math.max(maxScroll, scrollPercent);
          scrollThrottleTimer = null;
        }, 200);
      }, { passive: true });
    }

    // Track page exit - use sendBeacon for reliability
    if (hasFeature('page_exit')) {
      window.addEventListener('pagehide', () => {
      const timeOnPage = Date.now() - startTime;
      queueEvent('page_exit', {
        time_on_page: timeOnPage,
        scroll_depth: maxScroll,
        page: window.location ? window.location.pathname : ''
      });
      // Use sendBeacon for reliable delivery during page unload
      if (eventQueue.length > 0 && config.apiUrl && !isApiKeyInvalid && !config.debug) {
        const payload = JSON.stringify(eventQueue);
        const sent = navigator.sendBeacon(config.apiUrl, new Blob([payload], { type: 'application/json' }));
        if (sent) {
          eventQueue = [];
        }
      }
      });
    }

    // Track visibility changes
    if (hasFeature('visibility')) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        const timeOnPage = Date.now() - startTime;
        queueEvent('page_hidden', {
          time_on_page: timeOnPage,
          scroll_depth: maxScroll,
          page: window.location ? window.location.pathname : ''
        });
      } else {
        startTime = Date.now(); // Reset timer
      }
    });
    }

    // Track clicks on elements with data-click attribute
    if (config.autoTrackClicks) {
      document.addEventListener('click', (event) => {
        const target = event.target.closest('[data-click]');
        
        // Always track elements with data-click attribute (all plans)
        if (target) {
          const clickType = target.getAttribute('data-click') || 'click';
          
          queueEvent('click', {
            category: 'interaction',
            label: (target.textContent || target.innerText || '').trim().substring(0, 100),
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
            const label = (clickableTarget.textContent || clickableTarget.innerText || '').trim().substring(0, 100);
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
            label: (clickTarget.textContent || clickTarget.innerText || '').trim().substring(0, 100),
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
      
      document.addEventListener('focus', (event) => {
        if (event.target.matches('input, textarea, select')) {
          const formId = event.target.form?.id || 'unknown-form';
          const fieldName = event.target.name || event.target.id || event.target.type;
          
          if (!formInteractions.has(formId)) {
            formInteractions.set(formId, { startTime: Date.now(), fields: new Set() });
          }
          formInteractions.get(formId).fields.add(fieldName);
        }
      }, true);

      document.addEventListener('submit', (event) => {
        if (event.target.matches('form')) {
          const formId = event.target.id || 'unknown-form';
          const interaction = formInteractions.get(formId);
          const timeToComplete = interaction ? Date.now() - interaction.startTime : 0;
          
          queueEvent('form_submit', {
            category: 'form',
            label: formId,
            custom: {
              form_id: formId,
              fields_interacted: interaction ? Array.from(interaction.fields) : [],
              time_to_complete: timeToComplete,
              form_action: event.target.action || window.location.href
            }
          });
          formInteractions.delete(formId);
        }
      }, true);

      // Track form abandonment on page exit
      window.addEventListener('pagehide', () => {
        formInteractions.forEach((interaction, formId) => {
          queueEvent('form_abandon', {
            category: 'form',
            label: formId,
            custom: {
              form_id: formId,
              fields_interacted: Array.from(interaction.fields),
              time_spent: Date.now() - interaction.startTime
            }
          });
        });
      });
    }

    // Track JavaScript errors (Enterprise only)
    if (hasFeature('error_tracking')) {
      window.addEventListener('error', (event) => {
        queueEvent('javascript_error', {
          category: 'error',
          label: event.message,
          custom: {
            error_message: event.message,
            error_stack: event.error?.stack || 'N/A',
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            page: window.location.pathname
          }
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        queueEvent('promise_rejection', {
          category: 'error',
          label: event.reason?.message || 'Promise rejected',
          custom: {
            reason: event.reason?.message || String(event.reason),
            stack: event.reason?.stack || 'N/A',
            page: window.location.pathname
          }
        });
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
              label: target.textContent?.trim().substring(0, 50) || 'Unknown element',
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
                label: target.textContent?.trim().substring(0, 50) || 'Unknown element',
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

    // Track Web Vitals (Enterprise only)
    if (hasFeature('web_vitals') && 'PerformanceObserver' in window) {
      // Largest Contentful Paint (LCP)
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          queueEvent('web_vital_lcp', {
            category: 'performance',
            value: Math.round(lastEntry.renderTime || lastEntry.loadTime),
            custom: {
              metric: 'LCP',
              value: Math.round(lastEntry.renderTime || lastEntry.loadTime),
              element: lastEntry.element?.tagName || 'unknown',
              page: window.location.pathname
            }
          });
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}

      // First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            queueEvent('web_vital_fid', {
              category: 'performance',
              value: Math.round(entry.processingStart - entry.startTime),
              custom: {
                metric: 'FID',
                value: Math.round(entry.processingStart - entry.startTime),
                event_type: entry.name,
                page: window.location.pathname
              }
            });
          });
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
      } catch (e) {}

      // Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        
        // Report CLS on page hide
        window.addEventListener('pagehide', () => {
          queueEvent('web_vital_cls', {
            category: 'performance',
            value: Math.round(clsValue * 1000),
            custom: {
              metric: 'CLS',
              value: clsValue,
              page: window.location.pathname
            }
          });
        });
      } catch (e) {}
    }

    // Track resource timing (Enterprise only)
    if (hasFeature('resource_timing') && 'PerformanceObserver' in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            // Only track significant resources (> 100ms)
            if (entry.duration > 100) {
              queueEvent('resource_timing', {
                category: 'performance',
                label: entry.name,
                value: Math.round(entry.duration),
                custom: {
                  resource_name: entry.name,
                  resource_type: entry.initiatorType,
                  duration: Math.round(entry.duration),
                  size: entry.transferSize || 0,
                  page: window.location.pathname
                }
              });
            }
          });
        });
        resourceObserver.observe({ type: 'resource', buffered: true });
      } catch (e) {}
    }

    // Track initial page view
    if (config.autoTrackPageViews) {
      queueEvent('page_view');

      // Track unique visitor
      if (hasFeature('unique_visitors')) {
        trackUniqueVisitor();
      }

      // Track session start
      if (hasFeature('sessions')) {
        setTimeout(() => {
          queueEvent('session_start', {
            category: 'session',
            custom: {
              session_type: 'new'
            }
          });
        }, 100);
      }

      // Track SPA route changes (Angular, React, Vue, etc.)
      let lastPath = window.location.pathname;
      
      // Listen for popstate (browser back/forward)
      window.addEventListener('popstate', () => {
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          startTime = Date.now(); // Reset time on page
          maxScroll = 0; // Reset scroll tracking
          // Capture UTMs immediately before router strips query params,
          // then delay so TitleStrategy can update document.title first
          const capturedAttribution = hasFeature('utm_attribution') ? getAttributionData() : {};
          setTimeout(() => queueEvent('page_view', { attribution: capturedAttribution }), 50);
          if (config.debug) console.log('[Analytics] Page view tracked (popstate):', lastPath);
        }
      });

      // Override pushState to catch Angular Router navigation
      const originalPushState = history.pushState;
      history.pushState = function(...args) {
        originalPushState.apply(this, args);
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          startTime = Date.now();
          maxScroll = 0;
          const capturedAttribution = hasFeature('utm_attribution') ? getAttributionData() : {};
          setTimeout(() => queueEvent('page_view', { attribution: capturedAttribution }), 50);
          if (config.debug) console.log('[Analytics] Page view tracked (pushState):', lastPath);
        }
      };

      // Override replaceState as well
      const originalReplaceState = history.replaceState;
      history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          startTime = Date.now();
          maxScroll = 0;
          const capturedAttribution = hasFeature('utm_attribution') ? getAttributionData() : {};
          setTimeout(() => queueEvent('page_view', { attribution: capturedAttribution }), 50);
          if (config.debug) console.log('[Analytics] Page view tracked (replaceState):', lastPath);
        }
      };
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

      // Apply owner exclusion from init options
      if (config.excludeOwner) isOwner = true;

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

      // Increment visit count once per init
      if (isLocalStorageAvailable()) {
        const count = parseInt(getStorageItem('analytics_visit_count') || '0') + 1;
        setStorageItem('analytics_visit_count', count.toString());
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
        setupAutomaticTracking();
      });
    },

    // Mark the current user as the site owner — all tracking is suppressed.
    // Call after login: STKAnalytics.setOwner(user.role === 'owner')
    // Or pass init({ excludeOwner: true }) to suppress immediately.
    // Pass persist=true to save to localStorage so it survives page refreshes.
    setOwner: function(flag, persist = false) {
      isOwner = !!flag;
      if (persist) {
        try {
          if (isOwner) localStorage.setItem('stk_is_owner', 'true');
          else localStorage.removeItem('stk_is_owner');
        } catch(e) {}
      }
      if (config.debug) console.log('[Analytics] Owner mode:', isOwner ? 'ON (tracking suppressed)' : 'OFF (tracking active)');
    },

    // Permanently disable tracking for this browser (survives page refreshes).
    // Useful for devs/admins: run STKAnalytics.disableTracking() once in the console.
    disableTracking: function() {
      try { localStorage.setItem('stk_is_owner', 'true'); } catch(e) {}
      isOwner = true;
      if (config.debug) console.log('[Analytics] Tracking permanently disabled for this browser. Call enableTracking() to undo.');
    },

    // Re-enable tracking for this browser after disableTracking() was called.
    enableTracking: function() {
      try { localStorage.removeItem('stk_is_owner'); } catch(e) {}
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
          console.warn('[Analytics] Custom event tracking requires Pro or Enterprise plan. Upgrade at simpletrack.io/pricing');
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
      queueEvent('page_view', {
        page: path || (window.location ? window.location.pathname : ''),
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
      } else {
        console.warn('[Analytics] Unknown plan:', plan);
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
  window.STKAnalytics = Analytics;
  
  // Make STKAnalytics callable as a function for easier API
  // STKAnalytics('event', 'name', data) or STKAnalytics.trackEvent('name', data)
  const originalAnalytics = window.STKAnalytics;
  window.STKAnalytics = function(command, ...args) {
    if (typeof command === 'string') {
      switch (command) {
        case 'event':
          // STKAnalytics('event', 'button_clicked', { button_id: 'signup' })
          const [eventName, eventData] = args;
          return originalAnalytics.trackEvent(eventName, eventData || {});
        case 'identify':
          // STKAnalytics('identify', 'user@example.com')
          return originalAnalytics.setUserEmail(args[0]);
        case 'page_view':
          // STKAnalytics('page_view', 'Page Title', '/path')
          return originalAnalytics.trackPageView(args[0], args[1]);
        case 'page':
          // STKAnalytics('page', '/custom-page')
          return originalAnalytics.trackNavigation(args[0], args[1] || {});
        default:
          console.warn('[STKAnalytics] Unknown command:', command);
      }
    } else if (typeof command === 'function') {
      // STKAnalytics(() => { ... }) - Execute when ready
      if (isInitialized) {
        command();
      } else {
        setTimeout(() => window.STKAnalytics(command), 100);
      }
    }
  };
  
  // Copy all methods to the function so it works as both function and object
  Object.keys(originalAnalytics).forEach(key => {
    window.STKAnalytics[key] = originalAnalytics[key];
  });

  // Get configuration from script tag data attributes
  function getConfigFromScriptTag() {
    // Find the script tag that loaded this file
    const scripts = document.getElementsByTagName('script');
    let analyticsScript = null;

    for (let script of scripts) {
      if (script.src && script.src.includes('stk-analytics') && script.getAttribute('data-api-key')) {
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
      console.error('STK Analytics: data-api-key attribute is required and cannot be empty');
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

  // Auto-initialize from script tag data attributes or window config
  const scriptConfig = getConfigFromScriptTag();
  if (scriptConfig) {
    Analytics.init(scriptConfig);
  } else if (window.AnalyticsConfig) {
    Analytics.init(window.AnalyticsConfig);
  }

})(typeof window !== 'undefined' ? window : {});
