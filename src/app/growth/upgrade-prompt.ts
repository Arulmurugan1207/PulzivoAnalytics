import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FOUNDER_OFFER } from './usage.logic';

/**
 * Shown when someone on Free or Starter clicks a Pro-only feature.
 * The founder line is only for Free accounts. Checkout leaves the Stripe
 * promotion-code box open so they can enter FOUNDER50.
 */
@Component({
  selector: 'app-upgrade-prompt',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="upgrade-backdrop" (click)="dismiss.emit()">
      <div class="upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" (click)="$event.stopPropagation()">
        <h2 id="upgrade-title">Pro unlocks this part of the dashboard</h2>
        <p>You can keep using the free dashboard. These are the pieces included with Pro.</p>
        <ul>
          @for (line of benefits; track line) {
            <li><i class="pi pi-check" aria-hidden="true"></i> {{ line }}</li>
          }
        </ul>
        @if (showOffer) {
          <p class="founder">{{ founderOffer }}</p>
        }
        <div class="upgrade-actions">
          <a class="upgrade-go" routerLink="/dashboard/plans" [queryParams]="{ plan: 'pro' }" (click)="dismiss.emit()">
            Continue to checkout
          </a>
          <button type="button" class="upgrade-later" (click)="dismiss.emit()">Not now</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .upgrade-backdrop {
      position: fixed; inset: 0; z-index: 1200;
      background: rgba(15, 23, 42, 0.45);
      display: flex; align-items: center; justify-content: center;
      padding: 1.25rem;
    }
    .upgrade-dialog {
      width: min(100%, 480px);
      background: #fff;
      border-radius: 16px;
      padding: 1.5rem 1.5rem 1.25rem;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
      color: #0f172a;
    }
    h2 { margin: 0 0 .4rem; font-size: 1.25rem; }
    p { margin: 0; color: #475569; line-height: 1.5; }
    ul { list-style: none; padding: 0; margin: 1rem 0; display: flex; flex-direction: column; gap: .45rem; }
    li { display: flex; gap: .5rem; align-items: flex-start; color: #1e293b; }
    li i { color: #16a34a; margin-top: .15rem; }
    .founder {
      background: #eef2ff; color: #312e81;
      border-radius: 10px; padding: .75rem .9rem; font-size: .92rem;
    }
    .upgrade-actions { display: flex; gap: .6rem; align-items: center; margin-top: 1rem; flex-wrap: wrap; }
    .upgrade-go {
      display: inline-flex; align-items: center;
      background: #4f46e5; color: #fff; text-decoration: none;
      font-weight: 650; border-radius: 8px; padding: .6rem 1rem;
    }
    .upgrade-later {
      background: transparent; border: 0; color: #475569;
      font: inherit; font-weight: 600; cursor: pointer; padding: .6rem .4rem;
    }
  `],
})
export class UpgradePromptComponent {
  @Input() benefits: string[] = [];
  /** Free accounts only. Paid plans are already customers. */
  @Input() showOffer = false;
  @Output() dismiss = new EventEmitter<void>();
  readonly founderOffer = FOUNDER_OFFER;

  @HostListener('document:keydown.escape')
  onEscape(): void { this.dismiss.emit(); }
}
