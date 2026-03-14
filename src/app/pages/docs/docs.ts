import { Component, signal, OnInit, OnDestroy, AfterViewChecked } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { AccordionModule } from 'primeng/accordion';
import { RouterModule, ActivatedRoute } from '@angular/router';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('bash', bash);

declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

interface NavItem {
  id: string;
  label: string;
  icon: string;
  plan?: 'free' | 'pro' | 'enterprise';
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, MessageModule, TableModule, TagModule, DividerModule, AccordionModule, RouterModule],
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
})
export class Docs implements OnInit, OnDestroy, AfterViewChecked {
  script = `<script src="https://pulzivo.com/pulzivo-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`;
  copied = signal(false);
  activeSection = signal('getting-started');
  private observer?: IntersectionObserver;
  private highlighted = false;
  private readonly startTime = Date.now();
  private viewedSections = new Set<string>();

  constructor(private meta: Meta, private titleService: Title, private route: ActivatedRoute) {
    this.meta.updateTag({ name: 'description', content: 'Complete documentation for Pulzivo Analytics. Zero-config setup, automatic tracking, custom events, and more — the pulse of modern product analytics.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/docs' });
      this.meta.updateTag({ property: 'og:title', content: 'Documentation | Pulzivo Analytics' });
    this.meta.updateTag({ property: 'og:description', content: 'Complete documentation for Pulzivo Analytics. Zero-config setup, automatic tracking, custom events, and more.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/docs' });
      this.meta.updateTag({ property: 'twitter:title', content: 'Documentation | Pulzivo Analytics' });
    this.meta.updateTag({ property: 'twitter:description', content: 'Complete documentation for Pulzivo Analytics. Zero-config setup, automatic tracking, custom events, and more.' });

    // Developers reading docs = high activation intent
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'docs_visited', {});
    }
  }

  configOptions = [
    { 
      attribute: 'data-api-key', 
      type: 'String', 
      required: true, 
      description: 'Your unique API key for authentication' 
    },
    { 
      attribute: 'data-api-url', 
      type: 'String', 
      required: false, 
      description: 'Override the default API endpoint URL' 
    },
    { 
      attribute: 'data-batch-interval', 
      type: 'Number', 
      required: false, 
      description: 'Milliseconds between batch sends (default: 15000)' 
    },
    { 
      attribute: 'data-debug', 
      type: 'Boolean', 
      required: false, 
      description: 'Enable debug logging to console — events are logged but NOT sent to the server (default: false)' 
    },
    { 
      attribute: 'data-disable-page-views', 
      type: 'Flag', 
      required: false, 
      description: 'Add this attribute to disable automatic page view tracking' 
    },
    { 
      attribute: 'data-disable-clicks', 
      type: 'Flag', 
      required: false, 
      description: 'Add this attribute to disable automatic click tracking' 
    },
    { 
      attribute: 'data-disable-scroll', 
      type: 'Flag', 
      required: false, 
      description: 'Add this attribute to disable automatic scroll depth tracking' 
    }
  ];

  faqItems = [
    {
      question: 'How small is Pulzivo?',
      answer: 'Just 5KB gzipped - smaller than a typical image. Zero dependencies, zero bloat.'
    },
    {
      question: 'Does it work with SPAs?',
      answer: 'Yes! Automatically detects route changes in React, Vue, Angular, and other frameworks. No manual Router setup required - just include the script and it works.'
    },
    {
      question: 'What data is collected automatically?',
      answer: 'Page views, referrers, user agent, screen size, and click events. All privacy-focused and GDPR compliant.'
    },
    {
      question: 'Can I track custom events?',
      answer: 'Yes! Custom event tracking is available on all plans including Free. Use PulzivoAnalytics(\'event\', \'name\', data) to track any action in your app.'
    },
    {
      question: 'How do I view my data?',
      answer: 'Access your real-time dashboard at Pulzivo/dashboard with beautiful charts and insights.'
    }
  ];

  navItems: NavItem[] = [
    { id: 'getting-started', label: 'Getting Started', icon: 'pi-play', plan: 'free' },
    { id: 'configuration', label: 'Configuration', icon: 'pi-cog', plan: 'free' },
    { id: 'automatic-tracking', label: 'Automatic Tracking', icon: 'pi-chart-line', plan: 'pro' },
    { id: 'custom-events', label: 'Custom Events', icon: 'pi-bolt', plan: 'free' },
    { id: 'user-management', label: 'User Management', icon: 'pi-user', plan: 'pro' },
    { id: 'promo-tracking', label: 'Campaign Tracking', icon: 'pi-megaphone', plan: 'pro' },
    { id: 'owner-exclusion', label: 'Owner Exclusion', icon: 'pi-eye-slash', plan: 'free' },
    { id: 'debugging', label: 'Debugging', icon: 'pi-code', plan: 'free' },
    { id: 'faq', label: 'FAQ', icon: 'pi-question-circle' },
    { id: 'dashboard', label: 'Dashboard', icon: 'pi-chart-bar' },
  ];
  
  getPlanBadgeClass(plan?: string): string {
    switch(plan) {
      case 'free': return 'plan-badge-free';
      case 'pro': return 'plan-badge-pro';
      case 'enterprise': return 'plan-badge-enterprise';
      default: return '';
    }
  }
  
  getPlanLabel(plan?: string): string {
    switch(plan) {
      case 'free': return 'FREE';
      case 'pro': return 'PRO';
      case 'enterprise': return 'ENTERPRISE';
      default: return '';
    }
  }

  codeBlocks: { [key: string]: string } = {
    'script-tag': `<script src="https://pulzivo.com/pulzivo-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`,
    'dynamic-key-setup': `<script>
  // Auto-selects dev or production key based on hostname
  (function () {
    var isDev = location.hostname === 'localhost'
             || location.hostname === '127.0.0.1'
             || location.hostname.includes('staging');

    var s = document.createElement('script');
    s.src = 'https://pulzivo.com/pulzivo-analytics.min.js';

    s.setAttribute('data-api-key', isDev
      ? 'PULZ-DEV-YOUR_DEV_KEY'        // ← paste your dev key here
      : 'PULZ-YOUR_PROD_KEY');         // ← paste your prod key here

    if (isDev) s.setAttribute('data-debug', 'true');
    // ↑ Debug mode: events logged to console, NOT sent to server.
    // Once you've verified tracking works, remove this line
    // so live events appear in your Pulzivo dashboard.

    document.head.appendChild(s);
  })();
</script>`,
    'debug-mode': `<!-- Enable debug mode — events visible in console, NOT sent to server -->
<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="PULZ-DEV-YOUR_DEV_KEY"
        data-debug="true"></script>`,
    'complete-html': `<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
  <script src="https://pulzivo.com/pulzivo-analytics.min.js" 
          data-api-key="my-website"></script>
</head>
<body>
  <h1>Welcome to my site</h1>
</body>
</html>`,
    'component-integration': `// Angular/React/Vue component
handleButtonClick() {
  window.PulzivoAnalytics.trackEvent('button_click', {
    button: 'signup',
    page: 'home'
  });
}`,
    'vanilla-js-events': `// Vanilla JavaScript
document.querySelector('#myButton').addEventListener('click', () => {
  window.PulzivoAnalytics.trackEvent('button_click', {
    button: 'signup'
  });
});`,
    'config-options-example': `<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"
        data-api-url="https://your-api-endpoint.com/analytics/log"
        data-batch-interval="15000"
        data-debug="true"
        data-disable-scroll
        data-disable-clicks></script>`,
    'config-options-note': 'Flag attributes (data-disable-*) disable a feature when present. Omit them to keep tracking enabled.',
    'data-click-attributes': `<button data-click="signup-button">Sign Up</button>
<a href="/pricing" data-click="pricing-link">View Pricing</a>
<div data-click="hero-banner" class="banner">...</div>`,
    'custom-event-example': `window.PulzivoAnalytics.trackEvent('video_play', {
  video_id: 'intro-tutorial',
  duration: 120
})`,
    'pulz-api-simple': `// Simple PulzivoAnalytics() API (recommended)
PulzivoAnalytics('event', 'button_clicked', { button_id: 'signup' });
PulzivoAnalytics('event', 'video_play', { video_id: 'intro' });
PulzivoAnalytics('event', 'download', { file: 'whitepaper.pdf' });`,
    'pulz-api-identify': `// User identification
PulzivoAnalytics('identify', 'user@example.com');

// Track page view
PulzivoAnalytics('page', '/custom-page');

// Execute when ready
PulzivoAnalytics(() => {
  console.log('Analytics ready!');
});`,
    'ecommerce-tracking': `// Product view
window.PulzivoAnalytics.trackEvent('product_view', {
  product_id: 'SKU-123',
  name: 'Widget Pro',
  price: 49.99
});

// Add to cart
window.PulzivoAnalytics.trackEvent('add_to_cart', {
  product_id: 'SKU-123',
  quantity: 2,
  value: 99.98
});`,
    'immediate-send': `async function handleFormSubmit(e) {
  e.preventDefault();
  window.PulzivoAnalytics.trackEvent('form_submit', { form: 'contact' });
  await window.PulzivoAnalytics.sendBatch();
  // Now safe to navigate away
}`,
    'owner-console': `// Run once in your browser console to permanently
// disable tracking for yourself on this device:
PulzivoAnalytics.disableTracking();

// Undo it anytime:
PulzivoAnalytics.enableTracking();`,
    'owner-login': `// Call after your own login resolves:
const user = await getCurrentUser();
PulzivoAnalytics.setOwner(user.role === 'owner' || user.role === 'admin');

// With persistence across page refreshes (saves to localStorage):
PulzivoAnalytics.setOwner(true, true); // second arg = persist`,
    'owner-init': `// Suppress tracking from the very first event:
PulzivoAnalytics.init({
  apiKey: 'your-key',
  excludeOwner: true
});`,
    'owner-localstorage': `// Set the flag manually in your browser console once:
localStorage.setItem('pulz_is_owner', 'true');
// Reload — the SDK reads this automatically on every page load.

// Remove to re-enable tracking:
localStorage.removeItem('pulz_is_owner');`,
    'owner-env': `// Automatically suppress tracking on localhost / staging:
const isLocalDev = location.hostname === 'localhost'
               || location.hostname === '127.0.0.1'
               || location.hostname.endsWith('.staging.example.com');

PulzivoAnalytics.init({
  apiKey: 'your-key',
  excludeOwner: isLocalDev
});`,
    'user-email-basic': `// On login
window.PulzivoAnalytics.setUserEmail('user@example.com');

// On logout
window.PulzivoAnalytics.clearUserEmail();`,
    'react-login-integration': `function LoginForm() {
  const handleLogin = async (email) => {
    await loginUser(email);
    window.PulzivoAnalytics.setUserEmail(email);
  };
  
  const handleLogout = () => {
    window.PulzivoAnalytics.clearUserEmail();
    logoutUser();
  };
}`,
    'promo-custom-events': `<!-- Add data-track-impression to any element (Pro plan) -->
<div data-track-impression="summer-sale-banner"
     data-impression-name="Summer Sale 2024"
     data-impression-category="promo"
     class="banner">
  <h2>50% Off Summer Sale!</h2>
  <button>Shop Now</button>
</div>

<!-- That's it! Both impression AND clicks tracked automatically -->
<!-- Impression: tracked when banner becomes visible -->
<!-- Click: tracked when user clicks anywhere inside banner -->`,
    'promo-manual-events': `// Manual tracking (if needed)
// Track impression
PulzivoAnalytics('event', 'impression', {
  impression_id: 'custom-banner',
  impression_name: 'Custom Banner',
  category: 'promo',
  location: window.location.pathname
});

// Track click
PulzivoAnalytics('event', 'impression_click', {
  impression_id: 'custom-banner',
  impression_name: 'Custom Banner',
  category: 'promo'
});`,
    'intersection-observer': `// Automatic impression tracking with data attributes
<!-- Just add to your HTML - no JavaScript needed! -->
<div data-track-impression="homepage-hero"
     data-impression-name="Homepage Hero Banner"
     data-impression-category="banner">
  Hero Content
</div>

<div data-track-impression="footer-cta"
     data-impression-name="Footer CTA"
     data-impression-category="conversion">
  Footer CTA
</div>

<!-- SDK automatically tracks when 50% visible -->`,
    'email-utm-tracking': `// URL: https://yoursite.com?utm_source=email&utm_campaign=summer-sale
// Attribution is automatically captured on page load`,
    'debug-configuration': `<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="my-website"
        data-debug="true"></script>`,
  };

  async copyScript() {
    try {
      await navigator.clipboard.writeText(this.script);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
      this.trackCodeCopy('script-tag');
    } catch (e) {
      console.error('Copy failed', e);
    }
  }

  async copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      const section = Object.entries(this.codeBlocks).find(([, v]) => v === code)?.[0] ?? 'unknown';
      this.trackCodeCopy(section);
      return true;
    } catch (e) {
      console.error('Copy failed', e);
      return false;
    }
  }

  private trackCodeCopy(section: string) {
    try {
      if (typeof PulzivoAnalytics !== 'undefined') {
        if (section === 'script-tag') {
          PulzivoAnalytics('event', 'script_copied', { page: 'docs', section: 'script-tag' });
        } else {
          PulzivoAnalytics('event', 'code_copy', { page: 'docs', section });
        }
      }
    } catch (_) {}
  }

  scrollToSection(sectionId: string) {
    this.activeSection.set(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 72; // fixed header height + breathing room
      const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  trackNavClick(sectionId: string) {
    this.scrollToSection(sectionId);
    try {
      if (typeof PulzivoAnalytics !== 'undefined') {
        PulzivoAnalytics('event', 'docs_nav_clicked', { section: sectionId });
      }
    } catch (_) {}
  }

  trackFaqOpen(question: string) {
    try {
      if (typeof PulzivoAnalytics !== 'undefined') {
        PulzivoAnalytics('event', 'docs_faq_opened', { question });
      }
    } catch (_) {}
  }

  trackDebugGuideClick() {
    this.scrollToSection('debugging');
    try {
      if (typeof PulzivoAnalytics !== 'undefined') {
        PulzivoAnalytics('event', 'docs_debug_guide_clicked', {});
      }
    } catch (_) {}
  }

  ngOnInit() {
    this.setupScrollObserver();
    // Scroll to fragment from URL (e.g. /docs?utm_...#custom-events)
    const fragment = this.route.snapshot.fragment;
    if (fragment) {
      // Wait for DOM + highlight.js to finish before scrolling
      setTimeout(() => this.scrollToSection(fragment), 300);
    }
  }

  ngAfterViewChecked() {
    if (!this.highlighted) {
      const blocks = document.querySelectorAll('pre code:not(.hljs)');
      if (blocks.length > 0) {
        blocks.forEach(block => hljs.highlightElement(block as HTMLElement));
        this.highlighted = true;
      }
    }
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    try {
      if (typeof PulzivoAnalytics !== 'undefined') {
        const seconds = Math.round((Date.now() - this.startTime) / 1000);
        PulzivoAnalytics('event', 'docs_time_spent', { seconds, last_section: this.activeSection() });
      }
    } catch (_) {}
  }

  private setupScrollObserver() {
    const options = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id;
          if (sectionId) {
            this.activeSection.set(sectionId);
            if (!this.viewedSections.has(sectionId)) {
              this.viewedSections.add(sectionId);
              try {
                if (typeof PulzivoAnalytics !== 'undefined') {
                  PulzivoAnalytics('event', 'docs_section_viewed', { section: sectionId });
                }
              } catch (_) {}
            }
          }
        }
      });
    }, options);

    // Observe all sections
    setTimeout(() => {
      this.navItems.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
          this.observer?.observe(element);
        }
      });
    }, 100);
  }
}
