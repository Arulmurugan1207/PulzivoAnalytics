import { Component, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, CardModule, TagModule, DividerModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  script = `<script src="https://simpletrack.dev/stk-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`;
  copied = signal(false);

  constructor(private meta: Meta, private titleService: Title) {
    this.titleService.setTitle('SimpleTrack – Analytics for Everyone');
    this.meta.updateTag({ name: 'description', content: 'SimpleTrack provides powerful, lightweight analytics tracking for websites and applications. Monitor user behavior, page views, clicks, and more with easy integration.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://simpletrack.dev/' });
    this.meta.updateTag({ property: 'og:title', content: 'SimpleTrack – Analytics for Everyone' });
    this.meta.updateTag({ property: 'og:description', content: 'Powerful, lightweight analytics tracking for websites and applications. Monitor user behavior with easy integration.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://simpletrack.dev/' });
    this.meta.updateTag({ property: 'twitter:title', content: 'SimpleTrack – Analytics for Everyone' });
    this.meta.updateTag({ property: 'twitter:description', content: 'Powerful, lightweight analytics tracking for websites and applications. Monitor user behavior with easy integration.' });
  }

  features = [
    { icon: '⚡', title: 'Zero Config', desc: '5KB of JavaScript - auto-initializes immediately' },
    { icon: '📊', title: 'Auto Tracking', desc: 'Page views, clicks, and user behavior tracked automatically' },
    { icon: '🎯', title: 'Custom Events', desc: 'Track conversions, form submissions, and custom actions' },
    { icon: '🔒', title: 'Privacy First', desc: 'GDPR & CCPA compliant - no PII collected' },
    { icon: '📈', title: 'Real-time Dashboard', desc: 'Beautiful analytics dashboard with actionable insights' },
    { icon: '💰', title: 'Free & Open Source', desc: 'Free tier available - no credit card required' }
  ];

  stats = [
    { value: '10,000+', label: 'Active Developers' },
    { value: '5KB', label: 'Tiny Bundle Size' },
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '<1ms', label: 'Avg Response Time' }
  ];

  async copyScript() {
    try {
      await navigator.clipboard.writeText(this.script);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }
}
