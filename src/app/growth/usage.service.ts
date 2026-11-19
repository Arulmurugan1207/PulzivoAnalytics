import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UsageSnapshot, parseUsage } from './usage.logic';
import { accountApi, isMissingEndpoint } from './endpoint';

/** GET /analytics/usage. Hidden when the endpoint is missing or the body is not the contract. */
@Injectable({ providedIn: 'root' })
export class UsageService {
  private http = inject(HttpClient);

  readonly snapshot = signal<UsageSnapshot | null>(null);
  readonly state = signal<'loading' | 'ready' | 'hidden'>('loading');
  private started = false;

  load(): void {
    if (this.started) return;
    this.started = true;
    this.http.get(accountApi('/analytics/usage')).subscribe({
      next: (body) => {
        const parsed = parseUsage(body);
        if (!parsed) {
          this.state.set('hidden');
          return;
        }
        this.snapshot.set(parsed);
        this.state.set('ready');
      },
      error: (err) => {
        if (!isMissingEndpoint(err?.status)) {
          console.warn('Usage meter unavailable', err?.status || err);
        }
        this.state.set('hidden');
      },
    });
  }
}
