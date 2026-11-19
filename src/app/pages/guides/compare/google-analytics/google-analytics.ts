import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../../analytics/conversion';
import { COMPARE_GA } from '../../guide-copy';

@Component({
  selector: 'app-compare-google-analytics',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './google-analytics.html',
  styleUrl: '../../guide.scss',
})
export class CompareGoogleAnalytics {
  readonly trackId = COMPARE_GA.trackId;
  readonly kicker = COMPARE_GA.kicker;
  readonly lede = COMPARE_GA.lede;
  readonly otherName = COMPARE_GA.otherName;
  readonly tableTitle = COMPARE_GA.tableTitle;
  readonly tableIntro = COMPARE_GA.tableIntro;
  readonly tableNote = COMPARE_GA.tableNote;
  readonly sections = COMPARE_GA.sections;
  readonly rows = COMPARE_GA.rows;
  readonly faqs = COMPARE_GA.faqs;
  readonly related = COMPARE_GA.related;

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
