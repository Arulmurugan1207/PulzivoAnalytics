import { Component, inject } from '@angular/core';
import { WEEKLY_EMAIL_INCLUDES } from './email-prefs.logic';
import { EmailPrefsService } from './email-prefs.service';

/** Settings → Email. Renders nothing until the prefs endpoint answers. */
@Component({
  selector: 'app-email-prefs',
  standalone: true,
  template: `
    @if (prefs.state() === 'ready') {
      <section class="email-prefs" aria-labelledby="email-prefs-title">
        <h3 id="email-prefs-title">Email preferences</h3>
        <p class="lead">These notes come from Pulzivo. Turn off either one whenever you like.</p>

        <label class="pref">
          <span>
            <strong>Weekly report</strong>
            <em>A Monday summary of last week. One email, no extras.</em>
          </span>
          <button type="button" class="switch" [class.on]="prefs.prefs().weeklyReport"
            [attr.aria-pressed]="prefs.prefs().weeklyReport"
            (click)="prefs.update({ weeklyReport: !prefs.prefs().weeklyReport })"
            aria-label="Weekly report">
            <span class="knob"></span>
          </button>
        </label>

        <label class="pref">
          <span>
            <strong>Product tips</strong>
            <em>A short note when we ship something that helps you read your site.</em>
          </span>
          <button type="button" class="switch" [class.on]="prefs.prefs().productTips"
            [attr.aria-pressed]="prefs.prefs().productTips"
            (click)="prefs.update({ productTips: !prefs.prefs().productTips })"
            aria-label="Product tips">
            <span class="knob"></span>
          </button>
        </label>

        @if (prefs.status()) { <p class="status" role="status">{{ prefs.status() }}</p> }

        <aside class="preview">
          <h4>What the weekly email includes</h4>
          <ul>
            @for (item of includes; track item) {
              <li><i class="pi pi-envelope" aria-hidden="true"></i> {{ item }}</li>
            }
          </ul>
        </aside>
      </section>
    }
  `,
  styles: [`
    .email-prefs { display: flex; flex-direction: column; gap: .85rem; }
    h3 { margin: 0; color: #0f172a; }
    .lead, em { color: #64748b; font-style: normal; }
    .lead { margin: 0; }
    .pref { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: .9rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
    .pref strong { display: block; color: #0f172a; }
    .pref em { display: block; margin-top: .15rem; font-size: .9rem; }
    .switch { width: 44px; height: 26px; border-radius: 999px; border: 0; background: #cbd5e1; position: relative; cursor: pointer; flex-shrink: 0; }
    .switch.on { background: #4f46e5; }
    .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
    .switch.on .knob { transform: translateX(18px); }
    .status { margin: 0; color: #475569; font-size: .9rem; }
    .preview { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1rem 1.1rem; }
    .preview h4 { margin: 0 0 .6rem; color: #0f172a; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .45rem; }
    li { display: flex; gap: .5rem; color: #334155; }
    li i { color: #4f46e5; margin-top: .15rem; }
  `],
})
export class EmailPrefsComponent {
  readonly prefs = inject(EmailPrefsService);
  readonly includes = WEEKLY_EMAIL_INCLUDES;
}
