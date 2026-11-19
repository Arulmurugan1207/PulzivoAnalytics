import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  InsightLine, insightDestination, insightIcon, insightsRange, parseInsights,
} from './insights.logic';
import { accountApi, isMissingEndpoint } from './endpoint';

/**
 * Up to five plain-English lines from GET /analytics/insights.
 * Hidden when the endpoint is missing or the body is not the new array contract
 * (the older insights object stays on the metrics host and is left alone).
 */
@Component({
  selector: 'app-insights-card',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (lines().length) {
      <section class="insights" aria-labelledby="insights-title">
        <header>
          <h2 id="insights-title">Insights</h2>
          <span>Last {{ rangeLabel() === '7d' ? '7 days' : '30 days' }}</span>
        </header>
        <ul>
          @for (line of lines(); track line.id) {
            <li [class]="'sev-' + line.severity">
              <i class="pi" [class]="'pi ' + icon(line.severity)" aria-hidden="true"></i>
              <div>
                @if (target(line.link); as dest) {
                  @if (dest.external) {
                    <a [href]="dest.path" target="_blank" rel="noopener noreferrer">{{ line.title }}</a>
                  } @else {
                    <a [routerLink]="dest.path" [queryParams]="dest.query">{{ line.title }}</a>
                  }
                }
                @if (line.detail) { <p>{{ line.detail }}</p> }
              </div>
              @if (line.change) { <em>{{ line.change }}</em> }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [`
    .insights { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1rem 1.1rem 0.4rem; margin-bottom: 1rem; }
    header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: .35rem; }
    h2 { margin: 0; font-size: 1.05rem; color: #0f172a; }
    header span { color: #64748b; font-size: .85rem; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; gap: .75rem; align-items: flex-start; padding: .7rem 0; border-top: 1px solid #f1f5f9; }
    li i { width: 1.7rem; height: 1.7rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    li a { color: #0f172a; font-weight: 650; text-decoration: none; }
    li a:hover { text-decoration: underline; }
    li p { margin: .15rem 0 0; color: #475569; font-size: .92rem; }
    li em { margin-left: auto; font-style: normal; font-weight: 700; white-space: nowrap; }
    .sev-up i { background: #ecfdf5; color: #047857; } .sev-up em { color: #047857; }
    .sev-down i { background: #fff1f2; color: #be123c; } .sev-down em { color: #be123c; }
    .sev-warn i { background: #fffbeb; color: #b45309; } .sev-warn em { color: #b45309; }
    .sev-info i { background: #eef2ff; color: #4338ca; } .sev-info em { color: #4338ca; }
  `],
})
export class InsightsCard implements OnChanges {
  private http = inject(HttpClient);

  @Input() apiKey = '';
  @Input() preset = '';
  @Input() start: Date | null = null;
  @Input() end: Date | null = null;

  readonly lines = signal<InsightLine[]>([]);
  readonly rangeLabel = signal<'7d' | '30d'>('30d');
  readonly icon = insightIcon;
  readonly target = insightDestination;

  private requestKey = '';

  ngOnChanges(): void {
    const range = insightsRange(this.preset, this.start, this.end);
    this.rangeLabel.set(range);
    const key = String(this.apiKey || '').trim();
    if (!key || key === 'DEMO-KEY') {
      this.lines.set([]);
      this.requestKey = '';
      return;
    }
    const signature = `${key}|${range}`;
    if (signature === this.requestKey) return;
    this.requestKey = signature;
    this.http.get(accountApi(`/analytics/insights?apiKey=${encodeURIComponent(key)}&range=${range}`)).subscribe({
      next: (body) => {
        if (this.requestKey !== signature) return;
        const parsed = parseInsights(body);
        this.lines.set(parsed && parsed.length ? parsed : []);
      },
      error: (err) => {
        if (this.requestKey !== signature) return;
        if (!isMissingEndpoint(err?.status)) console.warn('Insights unavailable', err?.status || err);
        this.lines.set([]);
      },
    });
  }
}
