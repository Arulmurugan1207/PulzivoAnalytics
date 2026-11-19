import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../analytics/conversion';
import { GA4_ALTERNATIVE } from '../guide-copy';

@Component({
  selector: 'app-ga4-alternative',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ga4-alternative.html',
  styleUrl: '../guide.scss',
})
export class Ga4Alternative {
  readonly trackId = GA4_ALTERNATIVE.trackId;
  readonly kicker = GA4_ALTERNATIVE.kicker;
  readonly lede = GA4_ALTERNATIVE.lede;
  readonly otherName = GA4_ALTERNATIVE.otherName;
  readonly tableTitle = GA4_ALTERNATIVE.tableTitle;
  readonly tableIntro = GA4_ALTERNATIVE.tableIntro;
  readonly tableNote = GA4_ALTERNATIVE.tableNote;
  readonly sections = GA4_ALTERNATIVE.sections;
  readonly rows = GA4_ALTERNATIVE.rows;
  readonly faqs = GA4_ALTERNATIVE.faqs;
  readonly related = GA4_ALTERNATIVE.related;

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
