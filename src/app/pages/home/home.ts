import { Component, signal, AfterViewChecked } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import javascript from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('javascript', javascript);

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, TagModule, DividerModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements AfterViewChecked {
  script = `<script src="https://pulzivo.com/pulzivo-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`;

  jsSnippet = `// Track a custom event
PulzioAnalytics('event', 'button_click', { label: 'signup-cta' });

// Identify a user
PulzioAnalytics('identify', 'user@example.com');

// Track a page view manually
PulzioAnalytics('page', '/checkout');

// Exclude yourself (owner) from stats
PulzioAnalytics.setOwner(true);

// Send queued events immediately
PulzioAnalytics.sendBatch();`;

  copied = signal(false);
  activeTab = signal<'html' | 'js'>('html');
  private highlighted = false;

  constructor(private meta: Meta, private titleService: Title) {
    this.meta.updateTag({ name: 'description', content: 'Pulzivo provides powerful, lightweight analytics tracking for websites and applications. Monitor user behavior, page views, clicks, and more with easy integration.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'og:title', content: 'Pulzivo – Analytics for Everyone' });
    this.meta.updateTag({ property: 'og:description', content: 'Powerful, lightweight analytics tracking for websites and applications. Monitor user behavior with easy integration.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'twitter:title', content: 'Pulzivo – Analytics for Everyone' });
    this.meta.updateTag({ property: 'twitter:description', content: 'Powerful, lightweight analytics tracking for websites and applications. Monitor user behavior with easy integration.' });
  }

  features = [
    { icon: 'pi-bolt',       title: 'Zero Config',        desc: '5KB script. Auto-initialises the moment it loads.',                  link: '/docs',     campaign: 'feature-zero-config' },
    { icon: 'pi-chart-line', title: 'Auto Tracking',       desc: 'Page views, clicks, and sessions captured automatically.',           link: '/docs',     campaign: 'feature-auto-tracking' },
    { icon: 'pi-sliders-h',  title: 'Custom Events',       desc: 'Track signups, purchases, and any custom action.',                  link: '/docs',     campaign: 'feature-custom-events' },
    { icon: 'pi-shield',     title: 'Privacy First',       desc: 'GDPR & CCPA compliant. No cookies. No PII.',                       link: '/features', campaign: 'feature-privacy' },
    { icon: 'pi-th-large',   title: 'Dashboard',           desc: 'Real-time insights with actionable analytics.',                     link: '/features', campaign: 'feature-dashboard' },
    { icon: 'pi-heart',      title: 'Free Forever Tier',   desc: 'Start free. No credit card required. Upgrade when ready.',          link: '/features', campaign: 'feature-free-tier' },
  ];

  stats = [
    { value: '5KB',    label: 'Bundle size' },
    { value: '< 60s',  label: 'Setup time' },
    { value: '0',      label: 'Cookies used' },
    { value: '100%',   label: 'Open source' },
  ];

  setTab(tab: 'html' | 'js') {
    this.activeTab.set(tab);
    this.highlighted = false; // re-highlight on tab change
  }

  ngAfterViewChecked() {
    if (!this.highlighted) {
      const block = document.querySelector('.install-card pre code:not(.hljs)');
      if (block) {
        hljs.highlightElement(block as HTMLElement);
        this.highlighted = true;
      }
    }
  }

  async copyActive() {
    const text = this.activeTab() === 'html' ? this.script : this.jsSnippet;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }
}
