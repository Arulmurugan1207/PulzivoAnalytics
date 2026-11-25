import { AfterViewInit, Component, ElementRef, signal, OnInit, OnDestroy, HostListener, NgZone, ViewChild } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { trackConversion } from '../../analytics/conversion';
import { AuthService } from '../../services/auth.service';
import blogPosts from '../blog/published-posts.json';
import { latestPosts } from '../blog/schedule';
import { AnalyticsAPIService } from '../../services/analytics-api.service';
import { environment } from '../../../environments/environment';
import { adoptLcpHero, prerenderedLcpHeroExists } from './preserve-lcp-hero';
import {
  LaunchOfferState,
  applyLaunchOfferResponse,
  defaultLaunchOffer,
  discountedAmount,
  formatPlanAmount,
  launchOfferLine,
  launchOfferUrl,
} from '../../growth/launch-offer';

declare const PulzivoAnalytics: ((cmd: string, ...args: any[]) => void) | undefined;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, AfterViewInit, OnDestroy {
  readonly latestArticles = latestPosts(blogPosts, 3);
  @ViewChild('heroShot') heroShot?: ElementRef<HTMLElement>;
  /** False when the prerendered hero image was kept across bootstrap (see preserve-lcp-hero). */
  readonly useInlineShot = !prerenderedLcpHeroExists();
  private offerSub: Subscription | null = null;
  /** Defaults on. GET /billing/launch-offer can set active=false. Failures keep this. */
  launchOffer: LaunchOfferState = defaultLaunchOffer();
  formatPlanAmount = formatPlanAmount;
  discountedAmount = discountedAmount;
  launchOfferLine = launchOfferLine;
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

  constructor(private meta: Meta, private titleService: Title, private authService: AuthService, private analyticsApi: AnalyticsAPIService, private ngZone: NgZone, private router: Router, private http: HttpClient) {
    this.meta.updateTag({ name: 'description', content: 'The Pulse of Modern Web & Product Analytics. Track page views, clicks, custom events, and user journeys — privacy-first, no cookies, no personal data collected by default.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'og:title', content: 'Pulzivo Analytics — The Pulse of Modern Product Analytics' });
    this.meta.updateTag({ property: 'og:description', content: 'The Pulse of Modern Web & Product Analytics. Privacy-first, cookieless analytics for websites and applications.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/' });
    this.meta.updateTag({ property: 'twitter:title', content: 'Pulzivo Analytics — The Pulse of Modern Product Analytics' });
    this.meta.updateTag({ property: 'twitter:description', content: 'The Pulse of Modern Web & Product Analytics. Privacy-first, cookieless analytics for websites and applications.' });
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
    { name: 'Free',       plan: 'free',       monthly: 0,  price: '$0',  per: false, desc: '10K events/month', featured: false },
    { name: 'Starter',    plan: 'starter',    monthly: 9,  price: '$9',  per: true,  desc: 'Sessions, scroll depth, UTM attribution', featured: true },
    { name: 'Pro',        plan: 'pro',        monthly: 29, price: '$29', per: true,  desc: 'Opt-in user identification and performance', featured: false },
    { name: 'Enterprise', plan: 'enterprise', monthly: 99, price: '$99', per: true,  desc: 'Errors, rage clicks, Web Vitals', featured: false },
  ];

  faqs = [
    { q: 'Do I need a cookie banner?', a: 'Pulzivo sets no cookies and collects no personal data by default, but it does store anonymous visitor and session IDs in the browser\'s local storage. Depending on your region (for example the EU under the ePrivacy rules) that may still require consent. You can respect visitor choices with PulzivoAnalytics.optOut() / optIn(), and Do Not Track and Global Privacy Control are honored by default. Check with your legal advisor for your situation.' },
    { q: 'How do I install it?', a: 'Paste one script tag into your <head>. It works with plain HTML, WordPress, Shopify, Webflow and single-page apps like React, Next.js, Vue and Angular.' },
    { q: 'Is there really a free plan?', a: 'Yes. The Free plan includes 10K events per month with page views, clicks, custom events, goals and revenue. No credit card required.' },
    { q: 'Can I exclude my own visits?', a: 'Yes. Turn on owner mode once in your browser (or open any page with ?pulz_owner=1 on mobile) and your visits are ignored.' },
  ];

  ngAfterViewInit() {
    adoptLcpHero(this.heroShot?.nativeElement);
  }

  ngOnInit() {
    // GET {apiUrl}/billing/launch-offer — path must match node-server-api.
    // The section already shows the config default, so a miss does not hide it.
    this.offerSub = this.http.get(launchOfferUrl(environment.apiUrl)).pipe(timeout(4000)).subscribe({
      next: (body) => {
        this.ngZone.run(() => {
          this.launchOffer = applyLaunchOfferResponse(this.launchOffer, body);
        });
      },
      error: () => {},
    });

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
    this.offerSub?.unsubscribe();
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
    this.router.navigate(['/signup']);
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

  trackCta(location: string, plan?: string) {
    trackConversion('cta_click', plan ? { location, plan } : { location });
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
