import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { accountApi, isMissingEndpoint } from '../../growth/endpoint';
import { PublicSummary, chartPoints, parsePublicSummary } from '../../growth/share.logic';

/** Read-only overview for /share/:token. noindex is set on the route. */
@Component({
  selector: 'app-share-dashboard',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="share-page">
      <header>
        <strong>Pulzivo</strong>
        <span>Read-only</span>
      </header>

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

      <footer>
        <a routerLink="/signup" [queryParams]="{ ref: 'share' }">Powered by Pulzivo, get your free dashboard</a>
      </footer>
    </div>
  `,
  styles: [`
    .share-page { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 3rem; color: #0f172a; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    header strong { color: #4f46e5; font-size: 1.15rem; }
    header span { color: #64748b; font-size: .85rem; }
    h1 { margin: 0 0 .75rem; font-size: 1.6rem; }
    .ranges { display: flex; gap: .4rem; margin-bottom: 1rem; }
    .ranges button { border: 1px solid #e2e8f0; background: #fff; border-radius: 999px; padding: .35rem .75rem; cursor: pointer; font: inherit; color: #475569; }
    .ranges button.on { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; font-weight: 650; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .stats article, .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1rem; }
    .stats span, .muted { color: #64748b; }
    .stats strong { display: block; font-size: 1.6rem; margin-top: .2rem; }
    .card h2 { margin: 0 0 .6rem; font-size: 1rem; }
    svg { width: 100%; height: 120px; }
    .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; margin-top: 1rem; }
    .row { display: flex; justify-content: space-between; gap: .75rem; padding: .35rem 0; border-top: 1px solid #f1f5f9; }
    .empty { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.5rem; }
    footer { margin-top: 2rem; text-align: center; }
    footer a { color: #4338ca; font-weight: 650; }
  `],
})
export class ShareDashboard implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

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
