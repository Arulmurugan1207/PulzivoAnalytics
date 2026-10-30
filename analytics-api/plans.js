'use strict';

/**
 * Canonical plan → tracker feature map. The tracker (public/pulzivo-analytics.js)
 * and the dashboard copies (overview.ts, settings.ts) must match; plans.spec.js
 * fails on drift. Web Vitals and scroll depth are on every plan; error tracking
 * starts at Pro.
 */
const PLAN_FEATURES = {
  free: ['page_views', 'clicks', 'custom_events', 'scroll_depth', 'page_exit', 'web_vitals'],
  starter: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'utm_attribution', 'custom_events', 'web_vitals'],
  pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'web_vitals', 'error_tracking'],
  enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'client_hints', 'form_tracking', 'tooltip_tracking', 'error_tracking', 'rage_clicks', 'dead_clicks', 'web_vitals'],
};

module.exports = { PLAN_FEATURES };
