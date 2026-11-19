import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, afterNextRender, inject } from '@angular/core';

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'flexible';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileApi {
  ready: (fn: () => void) => void;
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loadPromise: Promise<TurnstileApi> | null = null;

function loadTurnstileApi(): Promise<TurnstileApi> {
  const existing = (window as Window & { turnstile?: TurnstileApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset['turnstile'] = 'explicit';
    script.onload = () => {
      const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
      if (!api) {
        loadPromise = null;
        reject(new Error('Turnstile loaded without an API'));
        return;
      }
      api.ready(() => resolve(api));
    };
    script.onerror = () => {
      loadPromise = null;
      script.remove();
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

@Component({
  selector: 'app-turnstile',
  template: `<div class="turnstile-slot" #slot></div>`,
  styles: [`
    :host { display: block; margin-bottom: 1.25rem; }
    .turnstile-slot { min-height: 65px; }
  `],
})
export class TurnstileWidget implements OnDestroy {
  @Input({ required: true }) siteKey = '';
  @Output() tokenChange = new EventEmitter<string>();
  @Output() loadError = new EventEmitter<string>();

  @ViewChild('slot', { static: true }) private slot!: ElementRef<HTMLElement>;

  private zone = inject(NgZone);
  private widgetId = '';
  private alive = true;

  constructor() {
    afterNextRender(() => this.mount());
  }

  ngOnDestroy() {
    this.alive = false;
    const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
    if (api && this.widgetId) {
      try { api.remove(this.widgetId); } catch { /* widget already removed */ }
    }
  }

  /** Tokens are single-use. Call this after the API rejects the signup. */
  reset(): void {
    this.tokenChange.emit('');
    const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
    if (api && this.widgetId) api.reset(this.widgetId);
  }

  private mount(): void {
    const el = this.slot?.nativeElement;
    const sitekey = this.siteKey.trim();
    if (!el || !sitekey) return;
    loadTurnstileApi().then((api) => {
      if (!this.alive) return;
      this.widgetId = api.render(el, {
        sitekey,
        theme: 'light',
        size: 'flexible',
        callback: (token) => this.zone.run(() => {
          this.loadError.emit('');
          this.tokenChange.emit(token);
        }),
        'expired-callback': () => this.zone.run(() => {
          this.tokenChange.emit('');
          this.loadError.emit('Verification expired. Please confirm you are human again.');
        }),
        'error-callback': () => this.zone.run(() => {
          this.tokenChange.emit('');
          this.loadError.emit('Verification could not be completed. Please try again.');
        }),
      });
    }).catch(() => {
      if (!this.alive) return;
      this.zone.run(() => {
        this.tokenChange.emit('');
        this.loadError.emit('Verification could not load. Refresh the page and try again.');
      });
    });
  }
}
