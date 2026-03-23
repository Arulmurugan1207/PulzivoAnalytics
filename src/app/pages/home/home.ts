import { Component, signal, AfterViewChecked, OnInit, OnDestroy, HostListener, NgZone } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { AuthService } from '../../services/auth.service';
import { AnalyticsAPIService } from '../../services/analytics-api.service';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import javascript from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('javascript', javascript);

declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, TagModule, DividerModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements AfterViewChecked, OnInit, OnDestroy {
  script = `<script src="https://pulzivo.com/pulzivo-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`;

  jsSnippet = `// Track a custom event
PulzivoAnalytics('event', 'button_click', { label: 'signup-cta' });

// Identify a user
PulzivoAnalytics('identify', 'user@example.com');

// Track a page view manually
PulzivoAnalytics('page', '/checkout');

// Exclude yourself (owner) from stats
PulzivoAnalytics.setOwner(true);

// Send queued events immediately
PulzivoAnalytics.sendBatch();`;

  copied = signal(false);
  activeTab = signal<'html' | 'js'>('html');
  scriptCopyCount = signal(0);
  livePageViews = signal<number | null>(null);
  showNudgeBar = signal(false);
  private highlighted = false;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private nudgeAutoHide: ReturnType<typeof setTimeout> | null = null;
  private exitIntentFired = false;
  private exitIntentReady = false;
  private scrollMilestonesHit = new Set<number>();

  private hasShownExitIntentToday(): boolean {
    const last = localStorage.getItem('pulz_exit_intent_date');
    if (!last) return false;
    return last === new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  private markExitIntentShownToday(): void {
    localStorage.setItem('pulz_exit_intent_date', new Date().toISOString().slice(0, 10));
  }

  constructor(private meta: Meta, private titleService: Title, private authService: AuthService, private analyticsApi: AnalyticsAPIService, private ngZone: NgZone) {
    this.meta.updateTag({ name: 'description', content: 'The Pulse of Modern Web & Product Analytics. Track page views, clicks, custom events, and user journeys — privacy-first, cookieless, no banners required.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'og:title', content: 'Pulzivo Analytics — The Pulse of Modern Product Analytics' });
    this.meta.updateTag({ property: 'og:description', content: 'The Pulse of Modern Web & Product Analytics. Privacy-first, cookieless analytics for websites and applications.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'twitter:title', content: 'Pulzivo Analytics — The Pulse of Modern Product Analytics' });
    this.meta.updateTag({ property: 'twitter:description', content: 'The Pulse of Modern Web & Product Analytics. Privacy-first, cookieless analytics for websites and applications.' });
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

  ngOnInit() {
    this.fetchLiveStats();
    this.statsTimer = setInterval(() => this.fetchLiveStats(), 5 * 60 * 1000);
    // Grace period: don't fire exit intent until 3s after page load.
    // Prevents the modal popping up immediately when navigating here after logout.
    setTimeout(() => { this.exitIntentReady = true; }, 3000);

    // Return visit tracking
    const visitKey = 'pulzivo_home_visits';
    const visitCount = parseInt(localStorage.getItem(visitKey) || '0', 10) + 1;
    localStorage.setItem(visitKey, String(visitCount));
    if (visitCount > 1 && typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'return_visit', { page: 'home', visit_count: visitCount });
    }
    this.authService.signUpDismissed$.subscribe(() => {
      this.nudgeTimer = setTimeout(() => {
        this.showNudgeBar.set(true);
        this.nudgeAutoHide = setTimeout(() => this.showNudgeBar.set(false), 45_000);
        if (typeof PulzivoAnalytics !== 'undefined') {
          PulzivoAnalytics('event', 'nudge_bar_shown', { page: 'home' });
        }
      }, 3_000);
    });
  }

  ngOnDestroy() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    if (this.nudgeAutoHide) clearTimeout(this.nudgeAutoHide);
  }

  dismissNudge() {
    this.showNudgeBar.set(false);
    if (this.nudgeAutoHide) clearTimeout(this.nudgeAutoHide);
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'nudge_bar_dismissed', { page: 'home' });
    }
  }

  @HostListener('window:scroll')
  onScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const pct = Math.round((scrolled / total) * 100);
    for (const milestone of [25, 50, 75, 100]) {
      if (pct >= milestone && !this.scrollMilestonesHit.has(milestone)) {
        this.scrollMilestonesHit.add(milestone);
        this.ngZone.runOutsideAngular(() => {
          if (typeof PulzivoAnalytics !== 'undefined') {
            PulzivoAnalytics('event', 'scroll_depth', { page: 'home', depth: milestone });
          }
        });
      }
    }
  }

  @HostListener('document:mouseleave', ['$event'])
  onExitIntent(e: MouseEvent) {
    if (!this.exitIntentReady || this.exitIntentFired || e.clientY > 30) return;
    if (this.authService.isAuthenticated()) return;
    if (localStorage.getItem('pulz_has_account') === '1') return; // existing user, has/had an account
    if (this.hasShownExitIntentToday()) return; // already shown today
    this.exitIntentFired = true;
    this.markExitIntentShownToday();
    this.dismissNudge();
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'exit_intent', { page: 'home' });
    }
    this.authService.requestOpenSignUp();
  }

  private fetchLiveStats() {
    this.analyticsApi.getPublicStats().subscribe(s => {
      this.livePageViews.set(s.totalPageViews ?? 0);
    });
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  openSignUp(source: string = 'unknown') {
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'signup_cta_clicked', { page: 'home', source });
    }
    this.authService.requestOpenSignUp();
  }

  trackDemoClick() {
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'demo_clicked', { page: 'home', source: 'hero' });
    }
  }

  setTab(tab: 'html' | 'js') {
    this.activeTab.set(tab);
    this.highlighted = false; // re-highlight on tab change
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'code_tab_switched', { page: 'home', tab });
    }
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
      this.scriptCopyCount.update(c => c + 1);
      if (typeof PulzivoAnalytics !== 'undefined') {
        if (this.activeTab() === 'html') {
          PulzivoAnalytics('event', 'script_copied', {
            page: 'home',
            section: 'script-tag',
            copy_number: this.scriptCopyCount(),
          });
        } else {
          PulzivoAnalytics('event', 'code_copy', {
            page: 'home',
            section: 'js-api',
          });
        }
      }
      setTimeout(() => this.copied.set(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }
}
