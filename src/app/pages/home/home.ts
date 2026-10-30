import { Component, signal, OnInit, OnDestroy, HostListener, NgZone } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { AuthService } from '../../services/auth.service';
import { BreakdownCard } from '../../components/breakdown-card/breakdown-card';
import { AnalyticsAPIService } from '../../services/analytics-api.service';

declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, TagModule, DividerModule, BreakdownCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, OnDestroy {
  script = `<script src="https://cdn.pulzivo.com/pulzivo-analytics.min.js" data-api-key="YOUR_API_KEY"></script>`;


  copied = signal(false);
  scriptCopyCount = signal(0);
  livePageViews = signal<number | null>(null);
  showNudgeBar = signal(false);
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
    this.meta.updateTag({ name: 'description', content: 'The Pulse of Modern Web & Product Analytics. Track page views, clicks, custom events, and user journeys — privacy-first, no cookies, no personal data collected by default.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'og:title', content: 'Pulzivo Analytics — The Pulse of Modern Product Analytics' });
    this.meta.updateTag({ property: 'og:description', content: 'The Pulse of Modern Web & Product Analytics. Privacy-first, cookieless analytics for websites and applications.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'twitter:title', content: 'Pulzivo Analytics — The Pulse of Modern Product Analytics' });
    this.meta.updateTag({ property: 'twitter:description', content: 'The Pulse of Modern Web & Product Analytics. Privacy-first, cookieless analytics for websites and applications.' });
    const c = Home.buildChart(this.chartData);
    this.chartLine = c.line;
    this.chartArea = c.area;
    this.chartEnd = c.end;
  }

  features = [
    { icon: 'pi-bolt',       title: 'Automatic tracking', desc: 'Page views, clicks, SPA routes, outbound links and downloads. No setup.', link: '/docs', fragment: 'automatic-tracking', campaign: 'feature-auto-tracking' },
    { icon: 'pi-flag',       title: 'Goals & revenue',    desc: 'trackGoal() and trackRevenue() on every plan, including Free.',         link: '/docs', fragment: 'goals-revenue',      campaign: 'feature-goals' },
    { icon: 'pi-sliders-h',  title: 'Custom events',      desc: 'Track sign-ups, purchases or any action with one line of code.',        link: '/docs', fragment: 'custom-events',      campaign: 'feature-custom-events' },
    { icon: 'pi-filter',     title: 'Funnels & journeys', desc: 'See where visitors drop off between landing and conversion.',           link: '/features', fragment: undefined,        campaign: 'feature-funnels' },
    { icon: 'pi-search',     title: '404s & site search', desc: 'Find broken links and what people search for on your site.',            link: '/docs', fragment: 'not-found-search',   campaign: 'feature-404-search' },
    { icon: 'pi-shield',     title: 'Privacy built in',   desc: 'No cookies, no personal data collected by default. Do Not Track and GPC respected. Visitor opt-out in one call.', link: '/docs', fragment: 'privacy-opt-out', campaign: 'feature-privacy' },
  ];

  values = [
    { icon: 'pi-shield',     title: 'No cookies, no personal data collected by default', desc: 'Anonymous by default; identify signed-in users only if you opt in' },
    { icon: 'pi-bolt',       title: '~9KB gzip',           desc: 'One async script tag' },
    { icon: 'pi-th-large',   title: 'One-screen dashboard', desc: 'Answers without a report builder' },
    { icon: 'pi-comment',    title: 'Plain-language insights', desc: 'Know what changed and why' },
  ];

  plans = [
    { name: 'Free',       price: '$0',  per: false, desc: '10K events/month', featured: false },
    { name: 'Starter',    price: '$9',  per: true,  desc: 'Sessions, scroll depth, UTM attribution', featured: true },
    { name: 'Pro',        price: '$29', per: true,  desc: 'Opt-in user identification and performance', featured: false },
    { name: 'Enterprise', price: '$99', per: true,  desc: 'Errors, rage clicks, Web Vitals', featured: false },
  ];

  faqs = [
    { q: 'Do I need a cookie banner?', a: 'Pulzivo sets no cookies and collects no personal data by default, but it does store anonymous visitor and session IDs in the browser\'s local storage. Depending on your region (for example the EU under the ePrivacy rules) that may still require consent. You can respect visitor choices with PulzivoAnalytics.optOut() / optIn(), and Do Not Track and Global Privacy Control are honored by default. Check with your legal advisor for your situation.' },
    { q: 'How do I install it?', a: 'Paste one script tag into your <head>. It works with plain HTML, WordPress, Shopify, Webflow and single-page apps like React, Next.js, Vue and Angular.' },
    { q: 'Is there really a free plan?', a: 'Yes. The Free plan includes 10K events per month with page views, clicks, custom events, goals and revenue. No credit card required.' },
    { q: 'Can I exclude my own visits?', a: 'Yes. Turn on owner mode once in your browser (or open any page with ?pulz_owner=1 on mobile) and your visits are ignored.' },
  ];

  // ── Sample dashboard (clearly labelled demo data) ──
  kpis = [
    { label: 'Visitors',          value: '12.4K', delta: '18%',  up: true,  good: true },
    { label: 'Pageviews',         value: '38.9K', delta: '12%',  up: true,  good: true },
    { label: 'Bounce rate',       value: '41%',   delta: '3%',   up: false, good: true },
    { label: 'Avg. time on page', value: '1m 52s', delta: '9%',  up: true,  good: true },
  ];
  topPages = [
    { label: '/', value: '5,210', pct: 100 },
    { label: '/pricing', value: '2,480', pct: 48 },
    { label: '/blog/cold-brew-guide', value: '1,930', pct: 37 },
    { label: '/shop', value: '1,120', pct: 22 },
  ];
  topSources = [
    { label: 'Google', value: '6,140', pct: 100 },
    { label: 'Direct', value: '3,020', pct: 49 },
    { label: 'Newsletter', value: '1,480', pct: 24 },
    { label: 'x.com', value: '910', pct: 15 },
  ];
  countries = [
    { label: 'United States', flagClass: 'flag-us', value: '4,820', pct: 100 },
    { label: 'Germany', flagClass: 'flag-de', value: '1,960', pct: 41 },
    { label: 'India', flagClass: 'flag-in', value: '1,540', pct: 32 },
    { label: 'France', flagClass: 'flag-fr', value: '1,010', pct: 21 },
  ];
  private readonly chartData = [210, 230, 220, 260, 250, 240, 290, 300, 280, 320, 310, 300, 340, 360, 330, 350, 380, 370, 360, 400, 420, 390, 430, 450, 440, 470, 500, 480, 520, 540];
  readonly chartLine: string;
  readonly chartArea: string;
  readonly chartEnd: [number, number];

  private static buildChart(data: number[], w = 600, h = 160, pad = 12) {
    const max = Math.max(...data) * 1.08, min = Math.min(...data) * 0.7;
    const pts = data.map((v, i) => [i * (w / (data.length - 1)), h - pad - ((v - min) / (max - min)) * (h - pad * 2)] as [number, number]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return { line: d, area: `${d} L${w},${h} L0,${h} Z`, end: pts[pts.length - 1] };
  }

  ngOnInit() {
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

  trackCta(source: string) {
    if (typeof PulzivoAnalytics !== 'undefined') {
      PulzivoAnalytics('event', 'signup_cta_clicked', { page: 'home', source });
    }
  }

  async copyScript() {
    try {
      await navigator.clipboard.writeText(this.script);
      this.copied.set(true);
      this.scriptCopyCount.update(c => c + 1);
      if (typeof PulzivoAnalytics !== 'undefined') {
        PulzivoAnalytics('event', 'script_copied', { page: 'home', section: 'hero-snippet', copy_number: this.scriptCopyCount() });
      }
      setTimeout(() => this.copied.set(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }
}
