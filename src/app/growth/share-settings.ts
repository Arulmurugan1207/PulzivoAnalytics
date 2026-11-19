import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ApiKeysService } from '../services/api-keys.service';
import { accountApi, isMissingEndpoint } from './endpoint';
import { ShareLink, displayShareUrl, parseShareLink, shareStorageKey } from './share.logic';

/** Settings control for a read-only public link. Hidden when create returns 404. */
@Component({
  selector: 'app-share-settings',
  standalone: true,
  template: `
    @if (available()) {
      <section class="share" aria-labelledby="share-title">
        <h3 id="share-title"><i class="pi pi-link" aria-hidden="true"></i> Share a public link</h3>
        <p class="muted">Anyone with the link can see visitors, page views, top pages, sources, and countries. They cannot change anything.</p>
        @if (link(); as current) {
          <div class="row">
            <input type="text" readonly [value]="shown()" aria-label="Public link" />
            <button type="button" (click)="copy()">{{ copied() ? 'Copied' : 'Copy' }}</button>
            <button type="button" class="revoke" (click)="revoke()" [disabled]="busy()">Revoke</button>
          </div>
        } @else {
          <button type="button" class="create" (click)="create()" [disabled]="busy() || !apiKey()">Create public link</button>
        }
        @if (status()) { <p class="status" role="status">{{ status() }}</p> }
      </section>
    }
  `,
  styles: [`
    .share h3 { display: flex; gap: .5rem; align-items: center; margin: 0 0 .4rem; color: #0f172a; }
    .muted { color: #64748b; margin: 0 0 .75rem; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; }
    input { flex: 1; min-width: 12rem; padding: .5rem .7rem; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
    button { border: 0; border-radius: 8px; padding: .5rem .85rem; font-weight: 650; cursor: pointer; }
    .create, .row button { background: #4f46e5; color: #fff; }
    .row button.revoke { background: #fff; color: #9f1239; border: 1px solid #fecdd3; }
    button:disabled { opacity: .6; cursor: progress; }
    .status { color: #475569; font-size: .9rem; }
  `],
})
export class ShareSettingsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private apiKeys = inject(ApiKeysService);
  private sub?: Subscription;

  readonly apiKey = signal('');
  readonly link = signal<ShareLink | null>(null);
  readonly available = signal(true);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly status = signal('');

  ngOnInit(): void {
    this.sub = this.apiKeys.selectedApiKey$.subscribe((key) => {
      const next = key && key !== 'DEMO-KEY' ? key : '';
      this.apiKey.set(next);
      this.status.set('');
      this.link.set(this.read(next));
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  shown(): string {
    const current = this.link();
    if (!current) return '';
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return displayShareUrl(current, origin);
  }

  create(): void {
    const apiKey = this.apiKey();
    if (!apiKey) return;
    this.busy.set(true);
    this.status.set('');
    this.http.post(accountApi('/analytics/share'), { apiKey }).subscribe({
      next: (body) => {
        this.busy.set(false);
        const parsed = parseShareLink(body);
        if (!parsed) { this.status.set('The link did not come back. Try again.'); return; }
        this.write(apiKey, parsed);
        this.link.set(parsed);
        this.status.set('Public link created.');
      },
      error: (err) => {
        this.busy.set(false);
        if (isMissingEndpoint(err?.status)) { this.available.set(false); return; }
        this.status.set('Couldn’t create a link. Try again.');
      },
    });
  }

  revoke(): void {
    const apiKey = this.apiKey();
    const current = this.link();
    if (!current) return;
    this.busy.set(true);
    this.http.delete(accountApi(`/analytics/share/${encodeURIComponent(current.token)}`)).subscribe({
      next: () => { this.busy.set(false); this.clear(apiKey); this.status.set('Public link revoked.'); },
      error: (err) => {
        this.busy.set(false);
        if (isMissingEndpoint(err?.status)) { this.clear(apiKey); this.available.set(false); return; }
        this.status.set('Couldn’t revoke the link. Try again.');
      },
    });
  }

  copy(): void {
    navigator.clipboard?.writeText(this.shown()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => this.status.set('Copy failed. Select the link and copy it.'));
  }

  private read(apiKey: string): ShareLink | null {
    if (!apiKey) return null;
    try {
      const parsed = parseShareLink(JSON.parse(localStorage.getItem(shareStorageKey(apiKey)) || 'null'));
      return parsed;
    } catch { return null; }
  }

  private write(apiKey: string, link: ShareLink): void {
    try { localStorage.setItem(shareStorageKey(apiKey), JSON.stringify(link)); } catch { /* private mode */ }
  }

  private clear(apiKey: string): void {
    this.link.set(null);
    try { localStorage.removeItem(shareStorageKey(apiKey)); } catch { /* private mode */ }
  }
}
