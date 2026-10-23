import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiKeysService, ApiKey } from '../../services/api-keys.service';
import { ExclusionSettings, addEmail, removeEmail, ownerModeLink } from './owner-exclusion.logic';

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
    } @else if (loading()) {
      <p class="muted">Loading settings for {{ siteName() }}…</p>
    } @else {
      <p class="muted">For <strong>{{ siteName() }}</strong>. Excluded visits are dropped when they arrive and hidden from reports. Nothing is deleted.</p>

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

      <div class="owner-link">
        <label>This device (also works when you’re not signed in)</label>
        <p class="muted">Open this link once on each phone or browser you use. The tracker remembers it in that browser (<code>pulz_is_owner</code>). Use <code>?pulz_owner=0</code> to undo.</p>
        <div class="email-add">
          <input type="text" readonly [value]="ownerLink()" aria-label="Owner mode link" />
          <button type="button" (click)="copyLink()">{{ copied() ? 'Copied' : 'Copy link' }}</button>
        </div>
      </div>

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
    .link { background: none; border: none; color: #dc2626; cursor: pointer; }
    .error { color: #dc2626; font-size: .85rem; margin: 0; }
    .status { font-size: .85rem; margin-top: .75rem; }
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
  copied = signal(false);
  draftEmail = '';

  siteName = computed(() => this.keyDoc()?.name || this.apiKey());
  ownerLink = computed(() => ownerModeLink(this.keyDoc()?.allowedDomains?.[0]));

  private get base(): string { return `${environment.apiUrl}/api-keys/${encodeURIComponent(this.apiKey())}/exclusion`; }

  ngOnInit(): void {
    this.sub = this.apiKeys.selectedApiKey$.subscribe((key) => this.select(key || ''));
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private select(key: string): void {
    this.apiKey.set(key);
    this.keyDoc.set(this.apiKeys.getAvailableApiKeys().find((k: ApiKey) => k.apiKey === key) || null);
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

  copyLink(): void {
    navigator.clipboard?.writeText(this.ownerLink()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => this.status.set('Copy failed — select the link and copy it manually.'));
  }
}
