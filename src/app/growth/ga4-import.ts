import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiKeysService } from '../services/api-keys.service';
import { accountApi, isMissingEndpoint } from './endpoint';
import { Ga4ImportResult, parseGa4Import } from './share.logic';

const STEPS = [
  'In Google Analytics, open the GA4 property you want to bring over.',
  'Go to Reports → Engagement → Pages and screens, or Reports → Acquisition → Traffic acquisition.',
  'Set the date range at the top of the report.',
  'Click Share this report (the share icon) → Download file → Download CSV.',
  'Upload that CSV here. Repeat with another report if you want sources as well as pages.',
];

/** Settings → Import from GA4. Hidden when the upload endpoint is missing. */
@Component({
  selector: 'app-ga4-import',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (available()) {
      <section class="ga4" aria-labelledby="ga4-title">
        <h3 id="ga4-title"><i class="pi pi-upload" aria-hidden="true"></i> Import from GA4</h3>
        <p class="muted">Bring a CSV export into this site. Pulzivo reads the rows you upload. It does not connect to your Google account.</p>
        <ol>
          @for (step of steps; track step) { <li>{{ step }}</li> }
        </ol>
        <label class="file">
          <input type="file" accept=".csv,text/csv" (change)="onFile($event)" [disabled]="busy() || !apiKey()" />
          <span>{{ fileName() || 'Choose a CSV' }}</span>
        </label>
        @if (busy()) {
          <div class="progress" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
            <div [style.width.%]="progress()"></div>
          </div>
          <p class="status">Uploading… {{ progress() }}%</p>
        }
        @if (result(); as done) {
          <p class="result" role="status">Imported {{ done.rowsImported | number }} rows@if (done.dateRange) { for {{ done.dateRange }}}.</p>
        }
        @if (status()) { <p class="status" role="status">{{ status() }}</p> }
      </section>
    }
  `,
  styles: [`
    .ga4 h3 { display: flex; gap: .5rem; align-items: center; margin: 0 0 .4rem; color: #0f172a; }
    .muted { color: #64748b; margin: 0 0 .75rem; }
    ol { margin: 0 0 .9rem; padding-left: 1.2rem; color: #334155; }
    li { margin: .3rem 0; }
    .file { display: inline-flex; align-items: center; gap: .6rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: .6rem .8rem; cursor: pointer; }
    .file input { max-width: 14rem; }
    .progress { height: 8px; background: #e2e8f0; border-radius: 999px; margin-top: .75rem; overflow: hidden; }
    .progress div { height: 100%; background: #4f46e5; }
    .status { color: #475569; font-size: .9rem; }
    .result { margin-top: .75rem; background: #ecfdf5; color: #065f46; border-radius: 10px; padding: .7rem .85rem; }
  `],
})
export class Ga4ImportComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private apiKeys = inject(ApiKeysService);
  private sub?: Subscription;

  readonly steps = STEPS;
  readonly apiKey = signal('');
  readonly available = signal(true);
  readonly busy = signal(false);
  readonly progress = signal(0);
  readonly fileName = signal('');
  readonly result = signal<Ga4ImportResult | null>(null);
  readonly status = signal('');

  ngOnInit(): void {
    this.sub = this.apiKeys.selectedApiKey$.subscribe((key) => {
      this.apiKey.set(key && key !== 'DEMO-KEY' ? key : '');
      this.result.set(null);
      this.status.set('');
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.apiKey()) return;
    this.fileName.set(file.name);
    this.result.set(null);
    this.status.set('');
    this.progress.set(0);
    this.busy.set(true);
    const body = new FormData();
    body.append('file', file, file.name);
    body.append('apiKey', this.apiKey());
    const url = accountApi(`/analytics/import/ga4?apiKey=${encodeURIComponent(this.apiKey())}`);
    this.http.post(url, body, { reportProgress: true, observe: 'events' }).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.progress.set(event.total ? Math.round((event.loaded / event.total) * 100) : this.progress());
        } else if (event.type === HttpEventType.Response) {
          this.busy.set(false);
          this.progress.set(100);
          const parsed = parseGa4Import(event.body);
          if (!parsed) { this.status.set('The file uploaded, but the summary was missing.'); return; }
          this.result.set(parsed);
        }
      },
      error: (err) => {
        this.busy.set(false);
        if (isMissingEndpoint(err?.status)) { this.available.set(false); return; }
        this.status.set('Couldn’t import that file. Check that it is the CSV from GA4 and try again.');
      },
    });
  }
}
