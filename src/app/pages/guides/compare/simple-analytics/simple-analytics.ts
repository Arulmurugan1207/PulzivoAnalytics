import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../../analytics/conversion';
import { COMPARE_SIMPLE } from '../../guide-copy';

@Component({
  selector: 'app-compare-simple-analytics',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './simple-analytics.html',
  styleUrl: '../../guide.scss',
})
export class CompareSimpleAnalytics {
  readonly trackId = COMPARE_SIMPLE.trackId;
  readonly kicker = COMPARE_SIMPLE.kicker;
  readonly lede = COMPARE_SIMPLE.lede;
  readonly otherName = COMPARE_SIMPLE.otherName;
  readonly tableTitle = COMPARE_SIMPLE.tableTitle;
  readonly tableIntro = COMPARE_SIMPLE.tableIntro;
  readonly tableNote = COMPARE_SIMPLE.tableNote;
  readonly sections = COMPARE_SIMPLE.sections;
  readonly rows = COMPARE_SIMPLE.rows;
  readonly faqs = COMPARE_SIMPLE.faqs;
  readonly related = COMPARE_SIMPLE.related;

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
