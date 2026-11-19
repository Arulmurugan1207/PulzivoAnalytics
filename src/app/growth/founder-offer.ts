import { Component } from '@angular/core';
import { FOUNDER_OFFER } from './usage.logic';

/** Honest founder-offer line. Parents render this only for Free accounts. */
@Component({
  selector: 'app-founder-offer',
  standalone: true,
  template: `<p class="founder-offer">{{ offer }}</p>`,
  styles: [`
    :host { display: block; margin-top: 0.75rem; flex-basis: 100%; }
    .founder-offer {
      margin: 0;
      padding: 0.65rem 0.8rem;
      background: #eef2ff;
      color: #312e81;
      border: 1px solid #c7d2fe;
      border-radius: 10px;
      font-size: 0.88rem;
      line-height: 1.45;
      font-weight: 600;
    }
  `],
})
export class FounderOfferComponent {
  readonly offer = FOUNDER_OFFER;
}
