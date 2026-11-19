import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { trackConversion } from '../../analytics/conversion';

@Component({
  selector: 'app-why-pulzivo',
  imports: [RouterLink, ButtonModule, DividerModule],
  templateUrl: './why-pulzivo.html',
  styleUrl: './why-pulzivo.scss'
})
export class WhyPulzivo {
  track(location: string, plan?: string) {
    trackConversion('cta_click', plan ? { location, plan } : { location });
  }
}
