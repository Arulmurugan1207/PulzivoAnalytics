/**
 * Pulzivo Analytics: optional modules (forms, tooltips, JS errors, rage/dead clicks).
 * Loaded on demand by pulzivo-analytics(.min).js only when the site's plan enables one
 * of these features. Not meant to be included on its own.
 */
(function(window) {
  'use strict';
  const P = window.PulzivoAnalytics;
  const X = P && P.__x;
  if (!X || X.loaded) return;
  X.loaded = true;
  const q = X.q;
  const has = X.has;
  const page = X.page;
  const document = window.document;
  const navigator = window.navigator;

    // Track impressions with Intersection Observer (all plans)
    if (has('custom_events') && 'IntersectionObserver' in window) {
      const impressionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const impressionId = element.getAttribute('data-track-impression');
            const impressionName = element.getAttribute('data-impression-name') || impressionId;
            const impressionCategory = element.getAttribute('data-impression-category') || 'general';
            
            if (impressionId) {
              q('impression', {
                category: impressionCategory,
                impression_id: impressionId,
                impression_name: impressionName,
                location: page(),
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

      // Track clicks on impression-tracked elements (all plans)
      document.addEventListener('click', (event) => {
        if (!event.target || !event.target.closest) return;
        const impressionElement = event.target.closest('[data-track-impression]');
        if (impressionElement) {
          const impressionId = impressionElement.getAttribute('data-track-impression');
          const impressionName = impressionElement.getAttribute('data-impression-name') || impressionId;
          const impressionCategory = impressionElement.getAttribute('data-impression-category') || 'general';
          const clickTarget = event.target;
          
          q('impression_click', {
            category: impressionCategory,
            impression_id: impressionId,
            impression_name: impressionName,
            location: page(),
            element: impressionElement.tagName.toLowerCase(),
            clicked_element: clickTarget.tagName.toLowerCase(),
            label: X.label(clickTarget, 100),
            custom: {
              x: event.clientX,
              y: event.clientY
            }
          });
        }
      });
    }

    // Track form interactions (Enterprise)
    if (has('form_tracking')) {
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
            q('form_start', {
              formId: formId,
              page: page()
            });
            formInteractions.get(formId).started = true;
          }
          
          // Track form_field_interaction
          q('form_field_interaction', {
            formId: formId,
            fieldName: fieldName,
            action: 'focus',
            page: page()
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
          
          q('form_submit', {
            formId: formId,
            success: true,
            timeToComplete: timeToComplete,
            page: page(),
            fields_interacted: interaction ? Array.from(interaction.fields) : [],
            form_action: event.target.action || window.location.href
          });
          formInteractions.delete(formId);
        }
      }, true);

      // Track form abandonment on page exit
      X.hide.push((unloading) => {
        if (unloading) formInteractions.forEach((interaction, formId) => {
          if (interaction.started && interaction.fields.size > 0) {
            q('form_abandon', {
              formId: formId,
              fieldsCompleted: interaction.fields.size,
              totalFields: interaction.fields.size, // Approximation
              time_spent: Date.now() - interaction.startTime,
              page: page()
            });
          }
        });
      });
    }

    // Track tooltip/help interactions (Enterprise)
    if (has('tooltip_tracking')) {
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
          
          q('tooltip_view', {
            tooltip_id: tooltipId,
            tooltip_text: tooltipText.substring(0, 100),
            section: section,
            page: page(),
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
        
        q('help_icon_click', {
          section: section,
          tooltip_text: tooltipText.substring(0, 100),
          page: page(),
          icon_class: target.className || null
        });
      }, true);
    }

    // JavaScript errors (window 'error' / onerror) and unhandled promise rejections (Pro+).
    // The core script captures them from load; capped at 20 per page, URLs lose queries.
    if (has('error_tracking')) {
      let errorCount = 0;
      const scrub = (v, max) => X.redact(String(v || '').replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')).substring(0, max);
      X.errors((name, message, stack, extra) => {
        if (++errorCount > 20) return;
        const msg = scrub(message, 300);
        q(name, {
          category: 'error',
          label: msg,
          message: msg,
          custom: Object.assign({ error_message: msg, error_stack: scrub(stack, 1000), page: page() }, extra)
        });
      });
    }

    // Track rage clicks and dead clicks (Enterprise)
    if (has('rage_clicks') || has('dead_clicks')) {
      const clickTracking = new Map();
      const RAGE_THRESHOLD = 3; // 3 clicks in 1 second
      const RAGE_WINDOW = 1000; // 1 second

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || !target.tagName) return;
        const elementKey = target.tagName + (target.id || '') + (target.className || '');
        
        // Track rage clicks
        if (has('rage_clicks')) {
          const now = Date.now();
          const clicks = clickTracking.get(elementKey) || [];
          
          // Remove old clicks outside the window
          const recentClicks = clicks.filter(time => now - time < RAGE_WINDOW);
          recentClicks.push(now);
          clickTracking.set(elementKey, recentClicks);
          
          if (recentClicks.length >= RAGE_THRESHOLD) {
            q('rage_click', {
              category: 'frustration',
              label: X.label(target, 50) || 'Unknown element',
              text: X.text(target),
              element: target.tagName,
              page: page(),
              click_count: recentClicks.length,
              custom: {
                element: target.tagName,
                element_id: target.id || null,
                element_class: target.className || null,
                clicks_count: recentClicks.length,
                page: page()
              }
            });
            clickTracking.delete(elementKey); // Reset after reporting
          }
        }

        // Track dead clicks (clicks that don't navigate or trigger visible changes)
        if (has('dead_clicks')) {
          const beforeUrl = window.location.href;
          const beforeScroll = window.pageYOffset;
          
          setTimeout(() => {
            const afterUrl = window.location.href;
            const afterScroll = window.pageYOffset;
            
            // If nothing changed, it might be a dead click
            if (beforeUrl === afterUrl && beforeScroll === afterScroll && 
                !(target.matches && target.matches('input, textarea, select, label'))) {
              q('dead_click', {
                category: 'frustration',
                label: X.label(target, 50) || 'Unknown element',
                text: X.text(target),
                element: target.tagName,
                page: page(),
                custom: {
                  element: target.tagName,
                  element_id: target.id || null,
                  element_class: target.className || null,
                  href: target.href || null,
                  page: page()
                }
              });
            }
          }, 500); // Wait 500ms to see if anything changes
        }
      }, true);
    }

})(typeof window !== 'undefined' ? window : this);
