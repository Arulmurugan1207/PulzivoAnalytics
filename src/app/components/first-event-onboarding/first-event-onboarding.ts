import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { DEFAULT_POLL, FirstEventState, firstEventSummary, hasFirstEvent, nextState, trackingSnippet } from './first-event.logic';

/**
 * Get-started flow for a site with no events: snippet with the real key,
 * a "Check for first event" button that polls Cloud Run, and a success state.
 */
@Component({
  selector: 'app-first-event-onboarding',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="no-data-setup-card get-started">
    @if (state === 'found') {
      <div class="no-data-setup-icon success"><i class="pi pi-check-circle"></i></div>
      <h2>You’re live! First event received for {{ siteName }}</h2>
      <p>{{ summary ? 'We just saw ' + summary + '.' : 'Tracking is working.' }} Your dashboard will fill in as visitors arrive.</p>
      <button type="button" class="setup-cta-btn" (click)="done.emit()"><i class="pi pi-chart-line"></i> Open my dashboard</button>
    } @else {
      <div class="no-data-setup-icon"><i class="pi pi-flag"></i></div>
      <h2>Get started with {{ siteName }}</h2>
      <p>No events yet. Three steps and you’ll see your first visit here.</p>
      <div class="no-data-setup-steps">
        <div class="setup-step">
          <span class="step-num">1</span>
          <div>
            <strong>Add the tracking script</strong>
            <p>Paste this into the <code>&lt;head&gt;</code> of every page. It already contains your key.</p>
            <pre class="setup-code"><code>{{ snippet }}</code></pre>
            <button type="button" class="copy-btn" (click)="copySnippet()">{{ copied ? 'Copied' : 'Copy snippet' }}</button>
          </div>
        </div>
        <div class="setup-step">
          <span class="step-num">2</span>
          <div>
            <strong>Open your site</strong>
            <p>Visit any page in a normal browser window (owner mode and ad blockers can hide your own visit).</p>
          </div>
        </div>
        <div class="setup-step">
          <span class="step-num">3</span>
          <div>
            <strong>Check for your first event</strong>
            <p>We’ll check every few seconds for up to two minutes.</p>
            <button type="button" class="setup-cta-btn" (click)="start()" [disabled]="state === 'checking' || state === 'waiting'">
              <i class="pi" [class.pi-spin]="state === 'checking' || state === 'waiting'" [class.pi-spinner]="state === 'checking' || state === 'waiting'" [class.pi-search]="state !== 'checking' && state !== 'waiting'"></i>
              {{ state === 'waiting' || state === 'checking' ? 'Checking… (' + attempt + '/' + plan.maxAttempts + ')' : 'Check for first event' }}
            </button>
            @if (message) { <p class="check-msg" role="status">{{ message }}</p> }
          </div>
        </div>
      </div>
      <a routerLink="/docs" class="docs-link">Using React, Next.js or a tag manager? See the docs.</a>
    }
  </div>
  `,
  styles: [`
    .copy-btn { margin-top: .4rem; padding: .3rem .8rem; border-radius: 6px; border: 1px solid #c7d2fe; background: #eef2ff; cursor: pointer; }
    .check-msg { margin-top: .5rem; font-size: .9rem; }
    .success { color: #16a34a; }
    .docs-link { display: inline-block; margin-top: .75rem; font-size: .85rem; }
  `],
})
export class FirstEventOnboardingComponent implements OnChanges, OnDestroy {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) apiKey = '';
  @Input() siteName = 'your site';
  @Output() done = new EventEmitter<void>();

  plan = DEFAULT_POLL;
  state: FirstEventState = 'idle';
  attempt = 0;
  message = '';
  summary = '';
  copied = false;
  snippet = trackingSnippet('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(): void {
    this.stop();
    this.snippet = trackingSnippet(this.apiKey);
    this.state = 'idle';
    this.message = '';
  }

  ngOnDestroy(): void { this.stop(); }

  start(): void {
    this.stop();
    this.attempt = 0;
    this.message = '';
    this.state = 'checking';
    this.poll();
  }

  private poll(): void {
    this.attempt += 1;
    // Small window (last 24h, limit 1) so each check is cheap.
    const params = new URLSearchParams({
      apiKey: this.apiKey, page: '1', limit: '1',
      startDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      endDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    this.http.get(`${environment.analyticsApiUrl}/analytics/event-history?${params}`).subscribe({
      next: (resp) => this.handle(hasFirstEvent(resp), resp),
      error: () => this.handle(false, null, 'Couldn’t reach the analytics API. Retrying…'),
    });
  }

  private handle(found: boolean, resp: any, msg = ''): void {
    this.state = nextState(found, this.attempt, this.plan);
    if (this.state === 'found') {
      this.summary = firstEventSummary(resp);
    } else if (this.state === 'waiting') {
      this.message = msg || 'Nothing yet. Open your site in another tab, we’re still checking…';
      this.timer = setTimeout(() => this.poll(), this.plan.intervalMs);
    } else {
      this.message = 'No events after two minutes. Check the script is in <head>, the key matches, and the site domain is allowed on the API key. Then try again.';
    }
    this.cdr.markForCheck();
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  copySnippet(): void {
    navigator.clipboard?.writeText(this.snippet).then(() => {
      this.copied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000);
    });
  }
}
