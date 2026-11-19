import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../analytics/conversion';
import { COOKIELESS } from '../guide-copy';

@Component({
  selector: 'app-cookieless-analytics',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cookieless-analytics.html',
  styleUrl: '../guide.scss',
})
export class CookielessAnalytics {
  readonly trackId = COOKIELESS.trackId;
  readonly kicker = COOKIELESS.kicker;
  readonly lede = COOKIELESS.lede;
  readonly otherName = COOKIELESS.otherName;
  readonly tableTitle = COOKIELESS.tableTitle;
  readonly tableIntro = COOKIELESS.tableIntro;
  readonly tableNote = COOKIELESS.tableNote;
  readonly sections = COOKIELESS.sections;
  readonly rows = COOKIELESS.rows;
  readonly faqs = COOKIELESS.faqs;
  readonly related = COOKIELESS.related;

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
