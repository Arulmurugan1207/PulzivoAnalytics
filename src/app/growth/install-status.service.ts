import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  INSTALL_POLL_MAX_MS, INSTALL_POLL_MS, InstallPhase, InstallStatus,
  installPhase, installPollContinues, parseInstallStatus,
} from './install-status.logic';
import { accountApi, isMissingEndpoint } from './endpoint';

/**
 * Polls install-status for the selected site. A 404 hides the indicator
 * so the dashboard can ship before node-server-api does.
 */
@Injectable({ providedIn: 'root' })
export class InstallStatusService {
  private http = inject(HttpClient);

  readonly status = signal<InstallStatus | null>(null);
  readonly unavailable = signal(false);
  readonly elapsedMs = signal(0);
  readonly phase: () => InstallPhase = computed(() =>
    installPhase(this.status(), this.elapsedMs(), this.unavailable()));

  private key = '';
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  watch(apiKey: string): void {
    const key = String(apiKey || '').trim();
    if (!key || key === 'DEMO-KEY') {
      this.reset('');
      this.unavailable.set(true);
      return;
    }
    if (key === this.key) return;
    this.reset(key);
    this.poll();
  }

  private reset(key: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.key = key;
    this.startedAt = Date.now();
    this.elapsedMs.set(0);
    this.status.set(null);
    this.unavailable.set(false);
  }

  private poll(): void {
    const key = this.key;
    if (!key) return;
    const url = accountApi(`/analytics/install-status?apiKey=${encodeURIComponent(key)}`);
    this.http.get(url).subscribe({
      next: (body) => {
        if (key !== this.key) return;
        const parsed = parseInstallStatus(body);
        this.elapsedMs.set(Date.now() - this.startedAt);
        if (!parsed) {
          this.unavailable.set(true);
          this.status.set(null);
          return;
        }
        this.status.set(parsed);
        if (installPollContinues(this.elapsedMs(), parsed.installed)) this.schedule();
      },
      error: (err) => {
        if (key !== this.key) return;
        this.elapsedMs.set(Date.now() - this.startedAt);
        if (isMissingEndpoint(err?.status)) {
          this.unavailable.set(true);
          this.status.set(null);
          return;
        }
        if (this.elapsedMs() < INSTALL_POLL_MAX_MS) this.schedule();
      },
    });
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), INSTALL_POLL_MS);
  }
}
