import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, ChangeDetectionStrategy, ChangeDetectorRef, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { DEFAULT_POLL, FirstEventState, firstEventSummary, hasFirstEvent, nextState, trackingSnippet } from './first-event.logic';
import { trackConversion } from '../../analytics/conversion';
import { readIntentPlan } from '../../analytics/intent-plan';
import { InstallStatusService } from '../../growth/install-status.service';
import { InstallSnippetsComponent } from '../../growth/install-snippets.component';

/**
 * Get-started flow: name the site if there is no key yet, then the real
 * snippet with a copy button and a verify-installation check.
 */
@Component({
  selector: 'app-first-event-onboarding',
  standalone: true,
  imports: [CommonModule, RouterLink, InstallSnippetsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="no-data-setup-card get-started">
    @if (install.phase() === 'received') {
      <div class="no-data-setup-icon success"><i class="pi pi-check-circle"></i></div>
      <h2>First visit received ✓</h2>
      <p>Your site just sent its first visit. The dashboard fills in as more people arrive.</p>
      <button type="button" class="setup-cta-btn" (click)="done.emit()">Go to dashboard</button>
    } @else if (state === 'found') {
      <div class="no-data-setup-icon success"><i class="pi pi-check-circle"></i></div>
      <h2>You’re live. First event received for {{ siteName }}</h2>
      <p>{{ summary ? 'We just saw ' + summary + '.' : 'Tracking is working.' }} Your dashboard will fill in as visitors arrive.</p>
      <button type="button" class="setup-cta-btn" (click)="done.emit()"><i class="pi pi-chart-line"></i> Open my dashboard</button>
    } @else if (!apiKey) {
      <div class="no-data-setup-icon"><i class="pi pi-code"></i></div>
      <h2>Add your script</h2>
      <p>Name the site you want to track. We’ll create a key and show the one-line install.</p>
      @if (paidPlan) {
        <p class="plan-note">You chose <strong>{{ paidPlan }}</strong>. Install the script first, then upgrade from <a routerLink="/dashboard/plans" [queryParams]="{ plan: paidPlan }">Plans</a>. Yearly billing is 20% off.</p>
      }
      <label class="site-label" for="setup-site-name">Site name</label>
      <input id="setup-site-name" class="site-name" #siteNameInput value="My website" autocomplete="organization" />
      <button type="button" class="setup-cta-btn" (click)="createSite.emit(siteNameInput.value)" [disabled]="creating">
        {{ creating ? 'Creating…' : 'Create site and show script' }}
      </button>
      @if (createError) { <p class="check-msg error" role="alert">{{ createError }}</p> }
    } @else {
      <div class="no-data-setup-icon"><i class="pi pi-code"></i></div>
      <h2>Add your script</h2>
      <p>Paste this into the <code>&lt;head&gt;</code> of {{ siteName }}. It already contains your key.</p>
      @if (paidPlan) {
        <p class="plan-note">You chose <strong>{{ paidPlan }}</strong>. Install the script first, then upgrade from <a routerLink="/dashboard/plans" [queryParams]="{ plan: paidPlan }">Plans</a>. Yearly billing is 20% off.</p>
      }
      <div class="no-data-setup-steps">
        <div class="setup-step">
          <span class="step-num">1</span>
          <div>
            <strong>Copy the script for your platform</strong>
            <app-install-snippets [apiKey]="apiKey"></app-install-snippets>
          </div>
        </div>
        <div class="setup-step">
          <span class="step-num">2</span>
          <div>
            <strong>Open your site</strong>
            <p>Visit any page in a normal browser window. Owner mode and ad blockers can hide your own visit.</p>
          </div>
        </div>
        <div class="setup-step">
          <span class="step-num">3</span>
          <div>
            <strong>Verify installation</strong>
            <p>We’ll check every few seconds for up to two minutes.</p>
            <button type="button" class="setup-cta-btn" (click)="start()" [disabled]="state === 'checking' || state === 'waiting'">
              <i class="pi" [class.pi-spin]="state === 'checking' || state === 'waiting'" [class.pi-spinner]="state === 'checking' || state === 'waiting'" [class.pi-search]="state !== 'checking' && state !== 'waiting'"></i>
              {{ state === 'waiting' || state === 'checking' ? 'Checking… (' + attempt + '/' + plan.maxAttempts + ')' : 'Verify installation' }}
            </button>
            @if (message) { <p class="check-msg" role="status">{{ message }}</p> }
          </div>
        </div>
      </div>
      @if (install.phase() === 'waiting' || install.phase() === 'paused') {
        <div class="install-wait" role="status">
          @if (install.phase() === 'waiting') {
            <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
            <span>Waiting for your first visit…</span>
          } @else {
            <i class="pi pi-clock" aria-hidden="true"></i>
            <span>Waiting for your first visit… Automatic checks paused after 10 minutes. Refresh after you open the site.</span>
          }
        </div>
      }
      <a routerLink="/docs" class="docs-link">Using React, Next.js or a tag manager? See the docs.</a>
    }
  </div>
  `,
  styles: [`
    .no-data-setup-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 2rem 1.75rem; max-width: 760px; }
    .no-data-setup-card h2 { margin: 0 0 .4rem; font-size: 1.35rem; color: #0f172a; }
    .no-data-setup-card p { color: #475569; line-height: 1.55; }
    .no-data-setup-icon { width: 48px; height: 48px; border-radius: 12px; background: #eef2ff; color: #4f46e5; display: flex; align-items: center; justify-content: center; margin-bottom: .75rem; font-size: 1.25rem; }
    .no-data-setup-icon.success { background: #ecfdf5; color: #16a34a; }
    .setup-code { background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: .75rem 1rem; overflow-x: auto; margin: .5rem 0 0; }
    .setup-code code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .8rem; }
    .copy-btn, .setup-cta-btn { margin-top: .75rem; padding: .6rem 1rem; border-radius: 8px; border: 0; cursor: pointer; font-weight: 650; }
    .copy-btn { background: #eef2ff; color: #3730a3; }
    .setup-cta-btn { display: inline-flex; align-items: center; gap: .4rem; background: #4f46e5; color: #fff; }
    .setup-cta-btn:disabled { opacity: .6; cursor: progress; }
    .check-msg { margin-top: .5rem; font-size: .9rem; }
    .check-msg.error { color: #b91c1c; }
    .docs-link { display: inline-block; margin-top: .75rem; font-size: .85rem; }
    .site-label { display: block; margin: .75rem 0 .35rem; font-weight: 600; color: #0f172a; }
    .site-name { width: min(100%, 360px); padding: .55rem .7rem; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
    .plan-note { font-size: .9rem; }
    .no-data-setup-steps { display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem; }
    .setup-step { display: flex; gap: .75rem; }
    .step-num { width: 1.6rem; height: 1.6rem; border-radius: 999px; background: #eef2ff; color: #3730a3; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
    .install-wait { display: flex; align-items: center; gap: .6rem; margin-top: 1rem; padding: .8rem 1rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; color: #334155; }
  `],
})
export class FirstEventOnboardingComponent implements OnChanges, OnDestroy {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  readonly install = inject(InstallStatusService);

  constructor() {
    effect(() => {
      this.install.phase();
      this.cdr.markForCheck();
    });
  }

  @Input({ required: true }) apiKey = '';
  @Input() siteName = 'your site';
  @Input() creating = false;
  @Input() createError = '';
  @Output() done = new EventEmitter<void>();
  @Output() createSite = new EventEmitter<string>();

  plan = DEFAULT_POLL;
  state: FirstEventState = 'idle';
  attempt = 0;
  message = '';
  summary = '';
  copied = false;
  snippet = trackingSnippet('');
  paidPlan: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reportedInstall = false;

  ngOnChanges(): void {
    this.stop();
    this.snippet = trackingSnippet(this.apiKey);
    this.state = 'idle';
    this.message = '';
    this.paidPlan = this.readPaidPlan();
    this.install.watch(this.apiKey);
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
      if (!this.reportedInstall) {
        this.reportedInstall = true;
        trackConversion('script_installed', { location: 'onboarding' });
      }
    } else if (this.state === 'waiting') {
      this.message = msg || 'Nothing yet. Open your site in another tab. We’re still checking.';
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

  private readPaidPlan(): string | null {
    const plan = readIntentPlan();
    return plan && plan !== 'free' ? plan : null;
  }

  copySnippet(): void {
    navigator.clipboard?.writeText(this.snippet).then(() => {
      this.copied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000);
    });
  }
}
