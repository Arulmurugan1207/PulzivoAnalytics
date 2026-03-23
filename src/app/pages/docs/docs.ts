import { Component, signal, computed, OnInit, OnDestroy, AfterViewChecked, HostListener, ElementRef } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { AccordionModule } from 'primeng/accordion';
import { InputTextModule } from 'primeng/inputtext';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
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
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  keywords?: string[];
}

interface SearchResult {
  type: 'section' | 'action';
  label: string;
  description: string;
  icon: string;
  sectionId?: string;
  action?: () => void;
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CardModule, MessageModule, TableModule, TagModule, DividerModule, AccordionModule, InputTextModule, RouterModule],
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
})
export class Docs implements OnInit, OnDestroy, AfterViewChecked {
  script = `<script src="https://pulzivo.com/pulzivo-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`;
  copied = signal(false);
  activeSection = signal('getting-started');
  anchorCopied = signal<string | null>(null);
  faqSearch = '';

  // Sidebar search
  sidebarSearch = '';
  sidebarSearchFocused = false;
  selectedResultIndex = -1;

  private observer?: IntersectionObserver;
  private highlighted = false;
  private readonly startTime = Date.now();
  private viewedSections = new Set<string>();

  constructor(private meta: Meta, private titleService: Title, private route: ActivatedRoute, private router: Router, private el: ElementRef) {
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
    },
    {
      attribute: 'data-disable-rage-clicks',
      type: 'Flag',
      required: false,
      description: 'Add this attribute to disable automatic rage click detection'
    },
    {
      attribute: 'data-disable-web-vitals',
      type: 'Flag',
      required: false,
      description: 'Add this attribute to disable automatic Web Vitals (LCP, CLS, FID) reporting'
    }
  ];

  faqItems = [
    {
      question: 'How small is Pulzivo?',
      answer: 'Just 5KB gzipped — smaller than a typical image. Zero dependencies, zero bloat. It loads asynchronously so it never blocks your page render.'
    },
    {
      question: 'Does it work with React, Vue, Angular, Next.js?',
      answer: 'Yes. The SDK automatically detects route changes via pushState/popstate, so navigation in any SPA framework is tracked with zero configuration. See the Framework Guides section for copy-paste examples.'
    },
    {
      question: 'What data is collected automatically?',
      answer: 'Page views, referrer, UTM parameters, scroll depth, click events, session duration, and performance metrics. No cookies, no PII, no fingerprinting. GDPR and CCPA compliant.'
    },
    {
      question: 'Can I track custom events on the free plan?',
      answer: 'Yes — custom event tracking is available on all plans including Free. Use PulzivoAnalytics(\'event\', \'name\', data) to track any user action.'
    },
    {
      question: 'How long is data retained?',
      answer: 'Free plan: 30 days. Starter: 90 days. Pro: 1 year. Enterprise: unlimited. You can export your data at any time from the dashboard.'
    },
    {
      question: 'Is there a rate limit?',
      answer: 'The SDK batches events and sends them every 15 seconds, so normal usage never hits rate limits. Free plan allows up to 10,000 events/month. Upgrade for higher limits.'
    },
    {
      question: 'What happens when I hit my monthly event limit?',
      answer: 'When you reach your plan\'s monthly event limit, the SDK automatically stops sending new events for the rest of that billing month — no data is lost on the client side, it just won\'t be recorded server-side until your limit resets. You\'ll receive an email warning at 80% and 100% of your limit. Upgrade your plan at any time from the dashboard to restore tracking immediately.'
    },
    {
      question: 'Will it affect my page speed / Core Web Vitals?',
      answer: 'No. The script loads asynchronously, adds ~5KB to your page, and has no render-blocking behaviour. It scores 100 on Lighthouse performance in our internal tests.'
    },
    {
      question: 'How do I migrate from Google Analytics?',
      answer: 'Just add the Pulzivo script tag alongside (or instead of) your GA snippet. Your existing GA setup is not affected. Custom events use PulzivoAnalytics(\'event\', ...) instead of gtag(\'event\', ...) — the shape is similar.'
    },
    {
      question: 'Does it use cookies?',
      answer: 'No cookies at all. Sessions are tracked using a combination of tab-scoped memory and localStorage, which does not require cookie consent banners under GDPR.'
    },
    {
      question: 'Can I self-host the SDK?',
      answer: 'Yes — download pulzivo-analytics.js from pulzivo.com/pulzivo-analytics.min.js and host it yourself. Update the src attribute to point to your own URL. The SDK is open source.'
    },
    {
      question: 'What are rage clicks and does Pulzivo detect them?',
      answer: 'Rage clicks happen when a user clicks the same element 3+ times in quick succession — usually a sign of frustration (broken button, slow response). Pulzivo automatically detects rage clicks and fires a rage_click event with the element details. You can find them in your Events dashboard by searching for "rage_click".'
    },
    {
      question: 'What Web Vitals does Pulzivo report?',
      answer: 'Pulzivo automatically measures LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift), and FID/INP (First Input Delay / Interaction to Next Paint). These appear as web_vital events in your dashboard and help you spot performance regressions before they impact conversions.'
    },
    {
      question: 'How does error tracking work?',
      answer: 'Pulzivo automatically captures unhandled JavaScript errors (window.onerror) and unhandled promise rejections. Each error event includes the message, stack trace, file, and line number. You can also manually track errors with PulzivoAnalytics(\'error\', \'payment_failed\', { reason: \'card_declined\' }).'
    },
    {
      question: 'How do I exclude my own visits from analytics?',
      answer: 'Run PulzivoAnalytics.disableTracking() once in your browser console — it persists via localStorage so all your future visits on that device are excluded. You can also use role-based exclusion (setOwner(true)) after login. See the Owner Exclusion section for all 5 methods.'
    },
    {
      question: 'Can I share a link to a specific section of the docs?',
      answer: 'Yes! Every section has a permanent anchor URL. Click the # link next to any section heading to copy the direct URL (e.g. pulzivo.com/docs#error-tracking). You can share these with your team or bookmark them.'
    }
  ];

  get filteredFaqItems() {
    if (!this.faqSearch.trim()) return this.faqItems;
    const q = this.faqSearch.toLowerCase();
    return this.faqItems.filter(f =>
      f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    );
  }

  navItems: NavItem[] = [
    {
      id: 'getting-started', label: 'Getting Started', icon: 'pi-play', plan: 'free',
      keywords: ['install', 'setup', 'script', 'tag', 'html', 'start', 'begin', 'quick', 'add', 'include', 'copy', 'first', 'verify', 'check', 'api key']
    },
    {
      id: 'no-code-platforms', label: 'No-Code Platforms', icon: 'pi-globe', plan: 'free',
      keywords: ['wordpress', 'shopify', 'webflow', 'wix', 'gtm', 'google tag manager', 'no code', 'nocode', 'plugin', 'theme', 'liquid', 'non-developer', 'store', 'ecommerce']
    },
    {
      id: 'configuration', label: 'Configuration', icon: 'pi-cog', plan: 'free',
      keywords: ['data-api-key', 'batch', 'debug', 'disable', 'options', 'attributes', 'batch-interval', 'page-views', 'clicks', 'scroll', 'configure', 'settings']
    },
    {
      id: 'automatic-tracking', label: 'Automatic Tracking', icon: 'pi-chart-line', plan: 'free',
      keywords: ['auto', 'automatic', 'page view', 'click', 'scroll', 'session', 'spa', 'route', 'navigation', 'pushstate', 'popstate', 'zero config']
    },
    {
      id: 'custom-events', label: 'Custom Events', icon: 'pi-bolt', plan: 'free',
      keywords: ['track', 'event', 'custom', 'click', 'ecommerce', 'purchase', 'cart', 'identify', 'send', 'batch', 'trackevent', 'pulzivoanalytics', 'button', 'form']
    },
    {
      id: 'user-management', label: 'User Management', icon: 'pi-user', plan: 'free',
      keywords: ['user', 'email', 'identify', 'login', 'logout', 'authenticated', 'privacy', 'gdpr', 'setusemail', 'clearuseremail', 'pii']
    },
    {
      id: 'promo-tracking', label: 'Campaign Tracking', icon: 'pi-megaphone', plan: 'starter',
      keywords: ['campaign', 'utm', 'promo', 'impression', 'banner', 'ad', 'marketing', 'source', 'medium', 'referrer', 'attribution', 'data-track-impression']
    },
    {
      id: 'error-tracking', label: 'Error Tracking', icon: 'pi-exclamation-circle', plan: 'pro',
      keywords: ['error', 'crash', 'exception', 'onerror', 'promise', 'rejection', 'bug', 'unhandled', 'stack trace', 'react error boundary', 'js error']
    },
    {
      id: 'rage-clicks-vitals', label: 'Rage Clicks & Web Vitals', icon: 'pi-bolt', plan: 'pro',
      keywords: ['rage', 'click', 'frustrated', 'web vitals', 'lcp', 'cls', 'inp', 'fid', 'performance', 'core web vitals', 'lighthouse', 'seo', 'layout shift', 'paint']
    },
    {
      id: 'frameworks', label: 'Framework Guides', icon: 'pi-th-large', plan: 'free',
      keywords: ['react', 'next', 'nextjs', 'next.js', 'vue', 'nuxt', 'angular', 'framework', 'integration', 'component', 'hook', 'composable', 'service', 'spa']
    },
    {
      id: 'advanced', label: 'Advanced (TypeScript / CSP)', icon: 'pi-shield', plan: 'free',
      keywords: ['typescript', 'csp', 'ssr', 'server side', 'nextjs', 'angular', 'types', 'declare', 'race condition', 'queue', 'app_initializer', 'network', 'content security policy', 'globals.d.ts', 'safe wrapper', 'cors', 'payload', '429', 'limit']
    },
    {
      id: 'owner-exclusion', label: 'Owner Exclusion', icon: 'pi-eye-slash', plan: 'free',
      keywords: ['owner', 'exclude', 'self', 'my visits', 'filter', 'localstorage', 'disable tracking', 'setowner', 'disabletracking', 'admin', 'developer', 'localhost', 'staging']
    },
    {
      id: 'debugging', label: 'Debugging', icon: 'pi-code', plan: 'free',
      keywords: ['debug', 'console', 'log', 'devtools', 'network', 'troubleshoot', 'not working', 'test', 'verify', 'data-debug', 'checklist', 'cors', '404']
    },
    {
      id: 'faq', label: 'FAQ', icon: 'pi-question-circle',
      keywords: ['faq', 'question', 'help', 'how', 'what', 'why', 'cookie', 'gdpr', 'ccpa', 'size', '5kb', 'rate limit', 'migrate', 'google analytics', 'ga4', 'self host', 'data retention']
    },
    {
      id: 'dashboard', label: 'Dashboard', icon: 'pi-chart-bar',
      keywords: ['dashboard', 'overview', 'live', 'realtime', 'visitors', 'funnel', 'api key', 'report', 'users', 'traffic']
    },
  ];
  
  getPlanBadgeClass(plan?: string): string {
    switch(plan) {
      case 'free': return 'plan-badge-free';
      case 'starter': return 'plan-badge-starter';
      case 'pro': return 'plan-badge-pro';
      case 'enterprise': return 'plan-badge-enterprise';
      default: return '';
    }
  }
  
  getPlanLabel(plan?: string): string {
    switch(plan) {
      case 'free': return 'FREE';
      case 'starter': return 'STARTER';
      case 'pro': return 'PRO';
      case 'enterprise': return 'ENTERPRISE';
      default: return '';
    }
  }

  // ── Sidebar search ────────────────────────────────────────

  private actionItems: SearchResult[] = [
    {
      type: 'action', label: 'Copy script tag', description: 'Copy the Pulzivo <script> tag to clipboard',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['script-tag'])
    },
    {
      type: 'action', label: 'Copy React example', description: 'Copy the React analytics helper',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['framework-react'])
    },
    {
      type: 'action', label: 'Copy Next.js example', description: 'Copy the Next.js App Router integration',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['framework-nextjs'])
    },
    {
      type: 'action', label: 'Copy Vue example', description: 'Copy the Vue 3 composable',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['framework-vue'])
    },
    {
      type: 'action', label: 'Copy Angular example', description: 'Copy the Angular analytics service',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['framework-angular'])
    },
    {
      type: 'action', label: 'Copy TypeScript types', description: 'Copy the globals.d.ts type declarations',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['ts-global-declare'])
    },
    {
      type: 'action', label: 'Copy CSP headers', description: 'Copy Content-Security-Policy configuration',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['csp-headers'])
    },
    {
      type: 'action', label: 'Copy WordPress guide', description: 'Copy WordPress plugin installation steps',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['nocode-wordpress'])
    },
    {
      type: 'action', label: 'Copy Shopify guide', description: 'Copy Shopify theme.liquid steps',
      icon: 'pi-copy', action: () => this.copyCode(this.codeBlocks['nocode-shopify'])
    },
    {
      type: 'action', label: 'Open Dashboard', description: 'Go to your analytics dashboard',
      icon: 'pi-chart-bar', action: () => this.router.navigate(['/dashboard/overview'])
    },
    {
      type: 'action', label: 'View Live Demo', description: 'Open the Pulzivo demo dashboard',
      icon: 'pi-play', action: () => this.router.navigate(['/demo/overview'])
    },
    {
      type: 'action', label: 'Disable my tracking', description: 'Scroll to owner exclusion — exclude yourself',
      icon: 'pi-eye-slash', action: () => this.trackNavClick('owner-exclusion')
    },
  ];

  get searchResults(): SearchResult[] {
    const q = this.sidebarSearch.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];

    // Section matches
    for (const item of this.navItems) {
      const labelMatch = item.label.toLowerCase().includes(q);
      const keywordMatch = item.keywords?.some(k => k.includes(q) || q.includes(k.split(' ')[0])) ?? false;
      if (labelMatch || keywordMatch) {
        results.push({
          type: 'section',
          label: item.label,
          description: this.getSectionDescription(item.id),
          icon: item.icon,
          sectionId: item.id
        });
      }
    }

    // FAQ matches
    const faqMatches = this.faqItems.filter(f =>
      f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    );
    for (const faq of faqMatches.slice(0, 2)) {
      results.push({
        type: 'section',
        label: faq.question,
        description: 'FAQ answer',
        icon: 'pi-question-circle',
        sectionId: 'faq'
      });
    }

    // Action matches
    for (const action of this.actionItems) {
      if (action.label.toLowerCase().includes(q) || action.description.toLowerCase().includes(q)) {
        results.push(action);
      }
    }

    return results.slice(0, 8);
  }

  get filteredNavItems(): NavItem[] {
    const q = this.sidebarSearch.trim().toLowerCase();
    if (!q) return this.navItems;
    return this.navItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      (item.keywords?.some(k => k.includes(q)) ?? false)
    );
  }

  private getSectionDescription(id: string): string {
    const map: Record<string, string> = {
      'getting-started':    'Install the script tag and verify setup',
      'no-code-platforms':  'WordPress, Shopify, Webflow, GTM guides',
      'configuration':      'data-* attributes and options',
      'automatic-tracking': 'Page views, clicks, SPA routing',
      'custom-events':      'PulzivoAnalytics() event API',
      'user-management':    'User identity, login/logout tracking',
      'promo-tracking':     'UTM parameters, impression tracking',
      'error-tracking':     'JS errors, promise rejections',
      'rage-clicks-vitals': 'LCP, CLS, INP and frustration signals',
      'frameworks':         'React, Next.js, Vue, Angular',
      'advanced':           'TypeScript types, CSP, SSR patterns',
      'owner-exclusion':    'Exclude your own visits from data',
      'debugging':          'Debug mode, console, troubleshooting',
      'faq':                'Common questions and answers',
      'dashboard':          'Live visitors, events, funnels',
    };
    return map[id] ?? '';
  }

  selectSearchResult(result: SearchResult) {
    if (result.type === 'section' && result.sectionId) {
      this.trackNavClick(result.sectionId);
    } else if (result.type === 'action' && result.action) {
      result.action();
    }
    this.clearSidebarSearch();
  }

  clearSidebarSearch() {
    this.sidebarSearch = '';
    this.selectedResultIndex = -1;
  }

  onSearchKeydown(event: KeyboardEvent) {
    const results = this.searchResults;
    if (event.key === 'Escape') {
      this.clearSidebarSearch();
      (event.target as HTMLElement).blur();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedResultIndex = Math.min(this.selectedResultIndex + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedResultIndex = Math.max(this.selectedResultIndex - 1, -1);
    } else if (event.key === 'Enter' && this.selectedResultIndex >= 0) {
      event.preventDefault();
      this.selectSearchResult(results[this.selectedResultIndex]);
    } else {
      this.selectedResultIndex = -1;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent) {
    const sidebar = this.el.nativeElement.querySelector('.docs-sidebar');
    if (sidebar && !sidebar.contains(event.target as Node)) {
      this.sidebarSearchFocused = false;
      this.selectedResultIndex = -1;
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
    'framework-react': `// src/analytics.ts — add once at the top level of your app
declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

export function track(event: string, data?: Record<string, unknown>) {
  if (typeof PulzivoAnalytics !== 'undefined') {
    PulzivoAnalytics('event', event, data ?? {});
  }
}

// Usage in any component:
import { track } from './analytics';

function SignupButton() {
  return (
    <button onClick={() => track('signup_clicked', { source: 'hero' })}>
      Get Started
    </button>
  );
}`,
    'framework-nextjs': `// app/layout.tsx (Next.js App Router)
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <Script
          src="https://pulzivo.com/pulzivo-analytics.min.js"
          data-api-key={process.env.NEXT_PUBLIC_PULZIVO_KEY}
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`,
    'framework-vue': `// composables/useAnalytics.ts
declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

export function useAnalytics() {
  function track(event: string, data?: Record<string, unknown>) {
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', event, data ?? {});
    }
  }
  return { track };
}

// Usage in a component:
import { useAnalytics } from '@/composables/useAnalytics';

const { track } = useAnalytics();
track('button_clicked', { button: 'cta' });`,
    'framework-angular': `// src/app/services/analytics.service.ts
import { Injectable } from '@angular/core';

declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  track(event: string, data: Record<string, unknown> = {}) {
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', event, data);
    }
  }
}

// Usage in any component:
constructor(private analytics: AnalyticsService) {}

onButtonClick() {
  this.analytics.track('cta_clicked', { source: 'hero' });
}`,
    // ── Error Tracking ────────────────────────────────────────
    'error-auto': `<!-- Automatic JS error capture is ON by default -->
<!-- window.onerror + unhandledrejection → recorded as 'js_error' events -->
<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"></script>`,
    'error-manual': `// Track a handled error manually
try {
  await processPayment(card);
} catch (err) {
  PulzivoAnalytics('error', 'payment_failed', {
    reason: err.message,
    code:   err.code,
    plan:   selectedPlan
  });
}`,
    'error-custom-boundary': `// React Error Boundary
class ErrorBoundary extends React.Component {
  componentDidCatch(error, info) {
    PulzivoAnalytics('error', 'react_render_error', {
      message:    error.message,
      component:  info.componentStack?.split('\\n')[1]?.trim()
    });
  }
}`,
    'error-disable': `<!-- Opt-out of automatic JS error capture -->
<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"
        data-disable-errors></script>`,
    // ── Rage Clicks & Web Vitals ──────────────────────────────
    'rage-click-auto': `<!-- Rage click detection is ON by default (3 clicks in 500 ms) -->
<!-- Fires a 'rage_click' event with element info automatically -->

// Find rage clicks in your dashboard → Events → search "rage_click"
// Event data shape:
{
  element:   'button#checkout',   // CSS selector of frustrating element
  clicks:    5,                   // how many times they clicked
  interval:  320                  // ms between first and last click
}`,
    'rage-click-disable': `<!-- Opt-out of rage click detection -->
<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"
        data-disable-rage-clicks></script>`,
    'web-vitals-auto': `<!-- Web Vitals are captured automatically via PerformanceObserver -->
<!-- No extra code needed — data flows into your Events dashboard -->

// Metrics recorded as 'web_vital' events:
{
  metric: 'LCP',    // Largest Contentful Paint (ms) — target < 2500
  value:  1840,
  rating: 'good'    // 'good' | 'needs-improvement' | 'poor'
}

// All three metrics captured:
// LCP  — Largest Contentful Paint   (< 2.5s = good)
// CLS  — Cumulative Layout Shift    (< 0.1  = good)
// INP  — Interaction to Next Paint  (< 200ms = good)`,
    'web-vitals-disable': `<!-- Opt-out of Web Vitals collection -->
<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"
        data-disable-web-vitals></script>`,

    // ── No-Code Platforms ─────────────────────────────────────
    'nocode-wordpress': `<!-- Option A: Use a plugin (no code at all) -->
1. Install the free plugin "Insert Headers and Footers"
   (Plugins → Add New → search "Insert Headers and Footers")
2. Go to Settings → Insert Headers and Footers
3. Paste your Pulzivo script tag into the "Scripts in Header" box:

<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"></script>

4. Click Save. Done — tracking starts on every page.

<!-- Option B: Edit your theme directly (ask your developer) -->
1. Go to Appearance → Theme Editor → header.php
2. Paste the script tag just before the closing </head> tag
3. Click Update File`,

    'nocode-shopify': `<!-- Shopify — paste once, tracks every page automatically -->
1. Go to your Shopify Admin
2. Online Store → Themes → Actions → Edit Code
3. Open layout/theme.liquid
4. Find the closing </head> tag
5. Paste your script tag just before it:

<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"></script>

6. Click Save. Your entire store is now tracked.`,

    'nocode-webflow': `<!-- Webflow — project-level (all pages at once) -->
1. Open your Webflow project
2. Go to Project Settings → Custom Code tab
3. Paste your script tag into the "Head Code" box:

<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"></script>

4. Click Save Changes, then Publish your site.
   That's it — every page is tracked automatically.`,

    'nocode-gtm': `<!-- Google Tag Manager — if you already use GTM -->
1. Open your GTM workspace
2. Tags → New → Tag Configuration → Custom HTML
3. Paste:

<script src="https://pulzivo.com/pulzivo-analytics.min.js"
        data-api-key="YOUR_API_KEY"></script>

4. Triggering → All Pages
5. Save and Publish. Done.`,

    // ── Advanced / TypeScript / CSP ───────────────────────────
    'ts-global-declare': `// globals.d.ts  (create this file once at your project root)
// No npm install needed — Pulzivo is a script-tag SDK.

type PulzivoCmd =
  | ['event', string, Record<string, unknown>]
  | ['identify', string]
  | ['page', string]
  | ['error', string, Record<string, unknown>]
  | [() => void];

declare function PulzivoAnalytics(...args: PulzivoCmd[0]): void;
declare namespace PulzivoAnalytics {
  function trackEvent(name: string, data?: Record<string, unknown>): void;
  function setUserEmail(email: string): void;
  function clearUserEmail(): void;
  function disableTracking(): void;
  function enableTracking(): void;
  function setOwner(isOwner: boolean, persist?: boolean): void;
  function sendBatch(): Promise<void>;
}`,

    'ts-safe-call': `// Safe wrapper — use this in every component instead of calling directly
// Handles: SDK not yet loaded, SSR (Next.js), TypeScript types

export function track(event: string, data: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;          // SSR guard
  if (typeof PulzivoAnalytics === 'undefined') return; // not yet loaded
  PulzivoAnalytics('event', event, data);
}

// Usage — clean, typed, zero boilerplate:
track('signup_clicked', { plan: 'pro', source: 'hero' });`,

    'ts-ready-queue': `// The SDK uses a command queue — calls made before load are
// automatically replayed once the script finishes loading.
// This means you never need to wait or check for readiness:

PulzivoAnalytics('event', 'page_loaded', { route: '/dashboard' });
// ↑ Safe to call immediately — queued if SDK hasn't loaded yet.

// If you need to run code exactly when SDK is ready:
PulzivoAnalytics(() => {
  console.log('SDK ready, version:', (window as any).__PULZIVO_VERSION__);
});`,

    'csp-headers': `# Content-Security-Policy headers to add to your server / CDN

# The two domains Pulzivo needs:
script-src  'self' https://pulzivo.com;
connect-src 'self' https://analytics-dot-node-server-apis.ue.r.appspot.com;

# Full example header:
Content-Security-Policy:
  default-src 'self';
  script-src  'self' https://pulzivo.com;
  connect-src 'self' https://analytics-dot-node-server-apis.ue.r.appspot.com;`,

    'csp-nextjs': `// next.config.js — add CSP headers for Pulzivo
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' https://pulzivo.com",
      "connect-src 'self' https://analytics-dot-node-server-apis.ue.r.appspot.com",
    ].join('; ')
  }
];

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  }
};`,

    'advanced-network': `// What a successful Pulzivo batch request looks like in DevTools:

POST https://analytics-dot-node-server-apis.ue.r.appspot.com/analytics/log
Content-Type: application/json

// Request body (array of events):
{
  "apiKey": "YOUR_API_KEY",
  "events": [
    {
      "event_name": "page_view",
      "page": "/dashboard",
      "referrer": "https://google.com",
      "session_id": "sess_abc123",
      "timestamp": 1711234567890
    }
  ]
}

// Success response:
HTTP 200 OK
{ "received": 1 }

// Limit reached response:
HTTP 429 Too Many Requests
{ "error": "monthly_limit_reached", "limit": 10000, "used": 10001 }`,

    'advanced-nextjs-ssr': `// app/layout.tsx — correct Next.js App Router integration
// SSR guard + typeof window check built in automatically.
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <Script
          src="https://pulzivo.com/pulzivo-analytics.min.js"
          data-api-key={process.env.NEXT_PUBLIC_PULZIVO_KEY}
          strategy="afterInteractive"   // ← never blocks SSR render
          id="pulzivo-analytics"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

// In any Server Component or Client Component:
'use client';
import { track } from '@/lib/analytics'; // your safe wrapper

export function SignupButton() {
  return <button onClick={() => track('signup_clicked', { source: 'hero' })}>
    Get Started
  </button>;
}`,

    'advanced-angular-init': `// src/app/app.config.ts — guaranteed load order with APP_INITIALIZER
import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { AnalyticsService } from './services/analytics.service';

function initAnalytics(analytics: AnalyticsService) {
  return () => analytics.waitForSDK();
}

export const appConfig: ApplicationConfig = {
  providers: [
    // ... your other providers
    {
      provide: APP_INITIALIZER,
      useFactory: initAnalytics,
      deps: [AnalyticsService],
      multi: true
    }
  ]
};

// analytics.service.ts — waitForSDK with timeout
waitForSDK(timeoutMs = 3000): Promise<void> {
  return new Promise(resolve => {
    if (typeof PulzivoAnalytics !== 'undefined') { resolve(); return; }
    const t = setTimeout(resolve, timeoutMs); // don't block app forever
    PulzivoAnalytics(() => { clearTimeout(t); resolve(); });
  });
}`,
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

  async copyAnchorLink(sectionId: string) {
    try {
      const url = `${window.location.origin}/docs#${sectionId}`;
      await navigator.clipboard.writeText(url);
      this.anchorCopied.set(sectionId);
      setTimeout(() => this.anchorCopied.set(null), 2000);
    } catch (e) {
      console.error('Copy anchor failed', e);
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
