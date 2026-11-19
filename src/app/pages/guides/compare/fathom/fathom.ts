import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../../analytics/conversion';
import { COMPARE_FATHOM } from '../../guide-copy';

@Component({
  selector: 'app-compare-fathom',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './fathom.html',
  styleUrl: '../../guide.scss',
})
export class CompareFathom {
  readonly trackId = COMPARE_FATHOM.trackId;
  readonly kicker = COMPARE_FATHOM.kicker;
  readonly lede = COMPARE_FATHOM.lede;
  readonly otherName = COMPARE_FATHOM.otherName;
  readonly tableTitle = COMPARE_FATHOM.tableTitle;
  readonly tableIntro = COMPARE_FATHOM.tableIntro;
  readonly tableNote = COMPARE_FATHOM.tableNote;
  readonly sections = COMPARE_FATHOM.sections;
  readonly rows = COMPARE_FATHOM.rows;
  readonly faqs = COMPARE_FATHOM.faqs;
  readonly related = COMPARE_FATHOM.related;

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
