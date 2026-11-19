import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DEFAULT_EMAIL_PREFS, EmailPrefs, parseEmailPrefs } from './email-prefs.logic';
import { accountApi, isMissingEndpoint } from './endpoint';

/**
 * GET shows the saved toggles. PATCH saves them.
 * A 404 or a body that is not `{weeklyReport, productTips}` hides the section.
 */
@Injectable({ providedIn: 'root' })
export class EmailPrefsService {
  private http = inject(HttpClient);

  readonly prefs = signal<EmailPrefs>(DEFAULT_EMAIL_PREFS);
  readonly state = signal<'loading' | 'ready' | 'hidden'>('loading');
  readonly status = signal('');
  private started = false;

  load(): void {
    if (this.started) return;
    this.started = true;
    this.http.get(accountApi('/users/me/email-prefs')).subscribe({
      next: (body) => {
        const parsed = parseEmailPrefs(body);
        if (!parsed) {
          this.state.set('hidden');
          return;
        }
        this.prefs.set(parsed);
        this.state.set('ready');
      },
      error: (err) => {
        if (!isMissingEndpoint(err?.status)) console.warn('Email preferences unavailable', err?.status || err);
        this.state.set('hidden');
      },
    });
  }

  update(patch: Partial<EmailPrefs>): void {
    if (this.state() !== 'ready') return;
    const before = this.prefs();
    const next = { ...before, ...patch };
    this.prefs.set(next);
    this.status.set('Saving…');
    this.http.patch(accountApi('/users/me/email-prefs'), next).subscribe({
      next: (body) => {
        const parsed = parseEmailPrefs(body);
        if (parsed) this.prefs.set(parsed);
        this.status.set('Saved.');
      },
      error: (err) => {
        if (isMissingEndpoint(err?.status)) {
          this.state.set('hidden');
          return;
        }
        this.prefs.set(before);
        this.status.set('Couldn’t save. Try again.');
      },
    });
  }
}
