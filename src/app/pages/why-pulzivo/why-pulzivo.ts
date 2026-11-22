import { Component, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { Subscription, timeout } from 'rxjs';
import { trackConversion } from '../../analytics/conversion';
import { environment } from '../../../environments/environment';
import {
  LaunchOfferState,
  applyLaunchOfferResponse,
  defaultLaunchOffer,
  discountedAmount,
  formatPlanAmount,
  launchOfferLine,
  launchOfferUrl,
} from '../../growth/launch-offer';

@Component({
  selector: 'app-why-pulzivo',
  imports: [RouterLink, ButtonModule, DividerModule],
  templateUrl: './why-pulzivo.html',
  styleUrl: './why-pulzivo.scss'
})
export class WhyPulzivo implements OnDestroy {
  private offerSub: Subscription | null = null;
  /** Defaults on. GET /billing/launch-offer can set active=false. Failures keep this. */
  launchOffer: LaunchOfferState = defaultLaunchOffer();
  formatPlanAmount = formatPlanAmount;
  discountedAmount = discountedAmount;
  launchOfferLine = launchOfferLine;
  readonly paidPlans = [
    { name: 'Starter', plan: 'starter', monthly: 9, desc: 'Sessions, scroll depth, UTM attribution', featured: true },
    { name: 'Pro', plan: 'pro', monthly: 29, desc: 'Opt-in user identification and performance', featured: false },
    { name: 'Enterprise', plan: 'enterprise', monthly: 99, desc: 'Errors, rage clicks, Web Vitals', featured: false },
  ];

  constructor(private http: HttpClient, private ngZone: NgZone) {
    this.offerSub = this.http.get(launchOfferUrl(environment.apiUrl)).pipe(timeout(4000)).subscribe({
      next: (body) => {
        this.ngZone.run(() => {
          this.launchOffer = applyLaunchOfferResponse(this.launchOffer, body);
        });
      },
      error: () => {},
    });
  }

  ngOnDestroy() {
    this.offerSub?.unsubscribe();
  }

  track(location: string, plan?: string) {
    trackConversion('cta_click', plan ? { location, plan } : { location });
  }
}
