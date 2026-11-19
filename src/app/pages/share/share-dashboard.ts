import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { accountApi, isMissingEndpoint } from '../../growth/endpoint';
import {
  PublicSummary, SHARE_BADGE_HREF, SHARE_CTA_HREF, SHARE_CTA_LINE, chartPoints, parsePublicSummary,
} from '../../growth/share.logic';

/** Read-only overview for /share/:token. noindex is set on the route. */
@Component({
  selector: 'app-share-dashboard',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="share-page">
      <header>
        <strong>Pulzivo</strong>
        <span>Read-only</span>
      </header>

      <div class="acquire">
        <p>{{ ctaLine }}</p>
        <a class="start" [href]="ctaHref" target="_blank" rel="noopener">Start free</a>
      </div>

      <div class="share-body">
        @if (loading()) {
          <p class="muted">Loading this dashboard…</p>
        } @else if (missing()) {
          <section class="empty">
            <h1>This link is no longer available</h1>
            <p>The owner may have revoked it. You can still start your own dashboard.</p>
          </section>
        } @else if (summary(); as data) {
          <h1>{{ data.siteName }}</h1>
          <div class="ranges" role="tablist">
            <button type="button" [class.on]="range() === '7d'" (click)="setRange('7d')">Last 7 days</button>
            <button type="button" [class.on]="range() === '30d'" (click)="setRange('30d')">Last 30 days</button>
          </div>
          <div class="stats">
            <article><span>Visitors</span><strong>{{ data.visitors | number }}</strong></article>
            <article><span>Page views</span><strong>{{ data.pageviews | number }}</strong></article>
          </div>
          @if (points()) {
            <section class="card">
              <h2>Page views</h2>
              <svg viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label="Page views over time">
                <polyline fill="none" stroke="#4f46e5" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" [attr.points]="points()"></polyline>
              </svg>
            </section>
          }
          <div class="lists">
            <section class="card">
              <h2>Top pages</h2>
              @for (row of data.topPages; track row.label) { <div class="row"><span>{{ row.label }}</span><strong>{{ row.value | number }}</strong></div> }
              @empty { <p class="muted">No pages in this range.</p> }
            </section>
            <section class="card">
              <h2>Sources</h2>
              @for (row of data.sources; track row.label) { <div class="row"><span>{{ row.label }}</span><strong>{{ row.value | number }}</strong></div> }
              @empty { <p class="muted">No sources in this range.</p> }
            </section>
            <section class="card">
              <h2>Countries</h2>
              @for (row of data.countries; track row.label) { <div class="row"><span>{{ row.label }}</span><strong>{{ row.value | number }}</strong></div> }
              @empty { <p class="muted">No countries in this range.</p> }
            </section>
          </div>
        }
      </div>

      <footer>
        <a class="powered" [href]="badgeHref" target="_blank" rel="noopener">
          <span class="mark" aria-hidden="true">P</span>
          Powered by Pulzivo
        </a>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f4f6f8; color: #0f172a; }
    .share-page {
      max-width: 960px; margin: 0 auto; min-height: 100vh; padding: 1.5rem 1rem 1.25rem;
      display: flex; flex-direction: column; box-sizing: border-box;
    }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
    header strong { color: #4f46e5; font-size: 1.15rem; letter-spacing: -0.01em; }
    header span {
      color: #64748b; font-size: .75rem; font-weight: 650; letter-spacing: .04em; text-transform: uppercase;
      background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; padding: .2rem .6rem;
    }
    .acquire {
      display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap;
      margin-bottom: 1.15rem; padding: .7rem .9rem; border-radius: 12px;
      background: #eef2ff; border: 1px solid #c7d2fe; color: #312e81;
    }
    .acquire p { margin: 0; flex: 1 1 16rem; font-size: .9rem; line-height: 1.45; }
    .start {
      display: inline-flex; align-items: center; background: #4f46e5; color: #fff; text-decoration: none;
      font-weight: 650; font-size: .875rem; border-radius: 8px; padding: .45rem .9rem; white-space: nowrap;
    }
    .start:hover { background: #4338ca; }
    .start:focus-visible, .powered:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
    .share-body { flex: 1; }
    h1 { margin: 0 0 .75rem; font-size: 1.6rem; color: #1e293b; }
    .ranges { display: flex; gap: .4rem; margin-bottom: 1rem; }
    .ranges button { border: 1px solid #e2e8f0; background: #fff; border-radius: 999px; padding: .35rem .75rem; cursor: pointer; font: inherit; color: #475569; }
    .ranges button.on { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; font-weight: 650; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .stats article, .card, .empty {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
    }
    .stats span, .muted { color: #64748b; }
    .stats strong { display: block; font-size: 1.6rem; margin-top: .2rem; color: #1e293b; }
    .card h2 { margin: 0 0 .6rem; font-size: .9375rem; font-weight: 700; color: #1e293b; }
    svg { width: 100%; height: 120px; }
    .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; margin-top: 1rem; }
    .row { display: flex; justify-content: space-between; gap: .75rem; padding: .35rem 0; border-top: 1px solid #f1f5f9; }
    .empty p { margin: .4rem 0 0; color: #64748b; }
    footer { display: flex; justify-content: flex-end; margin-top: 1.5rem; padding-top: .25rem; }
    .powered {
      display: inline-flex; align-items: center; gap: .4rem;
      padding: .3rem .7rem .3rem .3rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 999px;
      color: #475569; font-size: .78rem; font-weight: 600; text-decoration: none;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .powered:hover { color: #312e81; border-color: #c7d2fe; }
    .mark {
      width: 1.2rem; height: 1.2rem; border-radius: 999px;
      background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
      font-size: .68rem; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
    }
  `],
})
export class ShareDashboard implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  readonly badgeHref = SHARE_BADGE_HREF;
  readonly ctaHref = SHARE_CTA_HREF;
  readonly ctaLine = SHARE_CTA_LINE;
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly summary = signal<PublicSummary | null>(null);
  readonly points = signal('');
  readonly range = signal<'7d' | '30d'>('7d');
  private token = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.load();
  }

  setRange(range: '7d' | '30d'): void {
    if (range === this.range()) return;
    this.range.set(range);
    this.load();
  }

  private load(): void {
    if (!this.token) { this.loading.set(false); this.missing.set(true); return; }
    this.loading.set(true);
    const url = accountApi(`/analytics/public/${encodeURIComponent(this.token)}/summary?range=${this.range()}`);
    this.http.get(url).subscribe({
      next: (body) => {
        const parsed = parsePublicSummary(body);
        this.loading.set(false);
        if (!parsed) { this.missing.set(true); this.summary.set(null); return; }
        this.missing.set(false);
        this.summary.set(parsed);
        this.points.set(chartPoints(parsed.chart));
      },
      error: (err) => {
        this.loading.set(false);
        this.summary.set(null);
        this.missing.set(true);
        if (!isMissingEndpoint(err?.status) && err?.status !== 410) {
          console.warn('Shared dashboard unavailable', err?.status || err);
        }
      },
    });
  }
}
