import { Component, Input, signal } from '@angular/core';
import { INSTALL_TABS, InstallTabId, installGuide } from './install-snippets';

/** Tabs for HTML, WordPress, Shopify, Webflow, Next.js, React/Vite, and Angular. */
@Component({
  selector: 'app-install-snippets',
  standalone: true,
  template: `
    <div class="install-tabs">
      <div class="tab-row" role="tablist">
        @for (tab of tabs; track tab.id) {
          <button type="button" role="tab" [class.on]="active() === tab.id" [attr.aria-selected]="active() === tab.id" (click)="active.set(tab.id)">{{ tab.label }}</button>
        }
      </div>
      <ol>
        @for (step of guide().steps; track step) { <li>{{ step }}</li> }
      </ol>
      <pre><code>{{ guide().code }}</code></pre>
      <button type="button" class="copy" (click)="copy()">{{ copied() ? 'Copied' : 'Copy' }}</button>
    </div>
  `,
  styles: [`
    .install-tabs { margin-top: .75rem; }
    .tab-row { display: flex; flex-wrap: wrap; gap: .35rem; }
    .tab-row button { border: 1px solid #e2e8f0; background: #fff; color: #475569; border-radius: 999px; padding: .35rem .7rem; cursor: pointer; font: inherit; font-size: .85rem; }
    .tab-row button.on { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; font-weight: 650; }
    ol { margin: .75rem 0; padding-left: 1.2rem; color: #334155; }
    li { margin: .25rem 0; }
    pre { background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: .75rem 1rem; overflow-x: auto; margin: 0; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .8rem; white-space: pre-wrap; }
    .copy { margin-top: .6rem; background: #eef2ff; color: #3730a3; border: 0; border-radius: 8px; padding: .45rem .8rem; font-weight: 650; cursor: pointer; }
  `],
})
export class InstallSnippetsComponent {
  @Input() apiKey = '';
  readonly tabs = INSTALL_TABS;
  readonly active = signal<InstallTabId>('html');
  readonly copied = signal(false);

  guide() { return installGuide(this.active(), this.apiKey); }

  copy(): void {
    const code = this.guide().code;
    navigator.clipboard?.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => {});
  }
}
