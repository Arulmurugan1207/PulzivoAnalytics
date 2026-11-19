import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiKeysService, ApiKey } from '../../services/api-keys.service';
import {
  ExclusionSettings, addEmail, removeEmail, ownerModeLink,
  BrowserExclusion, browserExclusionLabel, canOpenOwnerLink,
  readBrowserExclusion, writeBrowserExclusion,
} from './owner-exclusion.logic';

/**
 * Settings → Analytics: "Exclude my visits" for the selected site.
 * Saves api_keys.ownerEmail / excludedEmails via App Engine
 * PUT /api-keys/:apiKey/exclusion; Cloud Run drops matching events at ingest
 * and hides older rows in reports (no data is deleted).
 */
@Component({
  selector: 'app-owner-exclusion-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <section class="owner-exclusion" aria-labelledby="owner-exclusion-title">
    <h3 id="owner-exclusion-title"><i class="pi pi-eye-slash"></i> Exclude my own visits</h3>
    @if (!apiKey()) {
      <p class="muted">Select a site (API key) to manage exclusions.</p>
    } @else {
      <p class="muted">For <strong>{{ siteName() }}</strong>. Excluded visits are dropped when they arrive and hidden from reports. Nothing is deleted.</p>

      <div class="browser-toggle">
        <div>
          <strong>Exclude my visits on this browser</strong>
          <p class="state">{{ browserLabel() }}</p>
        </div>
        <button type="button" class="switch" [class.on]="browserState() === 'on'"
          [attr.aria-pressed]="browserState() === 'on'"
          (click)="toggleBrowser()"
          [attr.aria-label]="browserState() === 'on' ? 'Stop excluding this browser' : 'Exclude my visits on this browser'">
          <span class="knob"></span>
        </button>
      </div>
      <p class="muted">Turning this on opens {{ siteName() }} in a new tab with <code>?pulz_owner=1</code> so the tracker remembers this browser. <code>exclude_owner</code> and <code>pulz_exclude_owner</code> do the same thing.</p>
      <div class="browser-actions">
        @if (canOpen()) {
          <a class="open-link" [href]="ownerLink()" target="_blank" rel="noopener noreferrer">Open exclude link</a>
        }
        <button type="button" class="undo" (click)="undoBrowser()">Undo</button>
      </div>

      @if (loading()) {
        <p class="muted">Loading email exclusions…</p>
      } @else {
      <label class="toggle-row">
        <input type="checkbox" [ngModel]="settings().excludeMyVisits" (ngModelChange)="toggleMine($event)" [disabled]="saving()" />
        <span>Exclude my visits when I’m signed in as <strong>{{ settings().ownerEmail || 'my account email' }}</strong></span>
      </label>

      <div class="emails">
        <label for="excl-email">Also exclude these emails (teammates, QA)</label>
        <div class="email-add">
          <input id="excl-email" type="email" placeholder="name@company.com" [(ngModel)]="draftEmail" (keydown.enter)="add()" [disabled]="saving()" />
          <button type="button" (click)="add()" [disabled]="saving()">Add</button>
        </div>
        @if (formError()) { <p class="error" role="alert">{{ formError() }}</p> }
        <ul class="email-list">
          @for (e of settings().excludedEmails; track e) {
            <li><span>{{ e }}</span><button type="button" class="link" (click)="remove(e)" [disabled]="saving()" [attr.aria-label]="'Remove ' + e">Remove</button></li>
          } @empty { <li class="muted">No extra emails.</li> }
        </ul>
      </div>
      }
      @if (status()) { <p class="status" role="status">{{ status() }}</p> }
    }
  </section>
  `,
  styles: [`
    .owner-exclusion { padding: 1rem 0; }
    .owner-exclusion h3 { display: flex; gap: .5rem; align-items: center; margin: 0 0 .5rem; }
    .muted { color: var(--text-color-secondary, #6b7280); font-size: .9rem; }
    .toggle-row { display: flex; gap: .5rem; align-items: center; margin: .75rem 0; }
    .emails, .owner-link { margin-top: 1rem; display: flex; flex-direction: column; gap: .4rem; }
    .email-add { display: flex; gap: .5rem; }
    .email-add input { flex: 1; padding: .45rem .6rem; border: 1px solid #d1d5db; border-radius: 6px; }
    .email-add button { padding: .45rem .9rem; border-radius: 6px; border: 1px solid #6366f1; background: #6366f1; color: #fff; cursor: pointer; }
    .email-list { list-style: none; padding: 0; margin: .25rem 0 0; }
    .email-list li { display: flex; justify-content: space-between; padding: .3rem 0; border-bottom: 1px solid #f1f5f9; }
    .link, .undo { background: none; border: none; color: #dc2626; cursor: pointer; font: inherit; }
    .undo { color: #4338ca; font-weight: 600; }
    .error { color: #dc2626; font-size: .85rem; margin: 0; }
    .status { font-size: .85rem; margin-top: .75rem; }
    .browser-toggle { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin: .75rem 0 .35rem; padding: .9rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
    .browser-toggle strong { color: #0f172a; }
    .state { margin: .2rem 0 0; color: #334155; font-size: .9rem; }
    .switch { width: 44px; height: 26px; border-radius: 999px; border: 0; background: #cbd5e1; position: relative; cursor: pointer; flex-shrink: 0; }
    .switch.on { background: #4f46e5; }
    .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
    .switch.on .knob { transform: translateX(18px); }
    .browser-actions { display: flex; gap: .75rem; align-items: center; margin: .35rem 0 .5rem; }
    .open-link { color: #4338ca; font-weight: 600; font-size: .9rem; }
  `],
})
export class OwnerExclusionSettingsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private apiKeys = inject(ApiKeysService);
  private sub?: Subscription;

  apiKey = signal<string>('');
  keyDoc = signal<ApiKey | null>(null);
  settings = signal<ExclusionSettings>({ apiKey: '', excludeMyVisits: false, ownerEmail: null, excludedEmails: [], excludedUserIds: [] });
  loading = signal(false);
  saving = signal(false);
  status = signal('');
  formError = signal('');
  draftEmail = '';
  browserState = signal<BrowserExclusion>('unknown');

  siteName = computed(() => this.keyDoc()?.name || this.apiKey());
  ownerLink = computed(() => ownerModeLink(this.keyDoc()?.allowedDomains?.[0], true));
  undoLink = computed(() => ownerModeLink(this.keyDoc()?.allowedDomains?.[0], false));
  browserLabel = computed(() => browserExclusionLabel(this.browserState()));
  canOpen = computed(() => canOpenOwnerLink(this.ownerLink()));

  private get base(): string { return `${environment.apiUrl}/api-keys/${encodeURIComponent(this.apiKey())}/exclusion`; }

  ngOnInit(): void {
    this.sub = this.apiKeys.selectedApiKey$.subscribe((key) => this.select(key || ''));
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private select(key: string): void {
    this.apiKey.set(key);
    this.keyDoc.set(this.apiKeys.getAvailableApiKeys().find((k: ApiKey) => k.apiKey === key) || null);
    this.browserState.set(readBrowserExclusion(this.storage(), key));
    this.status.set('');
    this.formError.set('');
    if (!key || key === 'DEMO-KEY') return;
    this.loading.set(true);
    this.http.get<ExclusionSettings>(this.base).subscribe({
      next: (s) => { this.settings.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.status.set('Couldn’t load exclusion settings. You can still change them below.'); },
    });
  }

  toggleMine(on: boolean): void { this.save({ excludeMyVisits: on }); }

  add(): void {
    const r = addEmail(this.settings().excludedEmails, this.draftEmail);
    this.formError.set(r.error || '');
    if (r.error) return;
    this.draftEmail = '';
    this.save({ excludedEmails: r.list });
  }

  remove(email: string): void { this.save({ excludedEmails: removeEmail(this.settings().excludedEmails, email) }); }

  private save(patch: Partial<ExclusionSettings>): void {
    const before = this.settings();
    this.settings.set({ ...before, ...patch });
    this.saving.set(true);
    this.status.set('Saving…');
    this.http.put<ExclusionSettings>(this.base, patch).subscribe({
      next: (s) => { this.settings.set(s); this.saving.set(false); this.status.set('Saved. Applies to new visits within about a minute.'); },
      error: (err) => {
        this.settings.set(before);
        this.saving.set(false);
        this.status.set(err?.error?.message || 'Couldn’t save. Try again.');
      },
    });
  }

  toggleBrowser(): void {
    if (this.browserState() === 'on') this.undoBrowser();
    else this.enableBrowser();
  }

  enableBrowser(): void { this.applyBrowser('on'); }

  undoBrowser(): void { this.applyBrowser('off'); }

  private applyBrowser(state: 'on' | 'off'): void {
    const key = this.apiKey();
    writeBrowserExclusion(this.storage(), key, state);
    this.browserState.set(state);
    const url = state === 'on' ? this.ownerLink() : this.undoLink();
    if (!canOpenOwnerLink(url)) {
      this.status.set(`Add a domain on this API key, then open your site with ${url}.`);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    this.status.set(state === 'on'
      ? 'Opened your site with owner mode on. This browser is excluded after that page loads.'
      : 'Opened your site with owner mode off. This browser is counted again.');
  }

  private storage(): Storage | null {
    try { return localStorage; } catch { return null; }
  }
}
