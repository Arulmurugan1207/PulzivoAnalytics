import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AnalyticsAPIService } from '../../services/analytics-api.service';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — matches server cache TTL

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer implements OnInit, OnDestroy {
  totalPageViews = signal<number | null>(null);
  scriptCopied = signal<number | null>(null);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private analyticsApi: AnalyticsAPIService) {}

  ngOnInit() {
    this.fetchStats();
    this.pollTimer = setInterval(() => this.fetchStats(), POLL_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private fetchStats() {
    this.analyticsApi.getPublicStats().subscribe(stats => {
      this.totalPageViews.set(stats.totalPageViews ?? 0);
      this.scriptCopied.set(stats.scriptCopied ?? 0);
    });
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  trackXClick() {
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'social_click', { platform: 'x_twitter', source: 'footer' });
    }
  }
}
