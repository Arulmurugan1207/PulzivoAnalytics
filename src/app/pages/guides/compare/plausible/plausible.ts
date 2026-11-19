import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../../analytics/conversion';
import { COMPARE_PLAUSIBLE } from '../../guide-copy';

@Component({
  selector: 'app-compare-plausible',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './plausible.html',
  styleUrl: '../../guide.scss',
})
export class ComparePlausible {
  readonly trackId = COMPARE_PLAUSIBLE.trackId;
  readonly kicker = COMPARE_PLAUSIBLE.kicker;
  readonly lede = COMPARE_PLAUSIBLE.lede;
  readonly otherName = COMPARE_PLAUSIBLE.otherName;
  readonly tableTitle = COMPARE_PLAUSIBLE.tableTitle;
  readonly tableIntro = COMPARE_PLAUSIBLE.tableIntro;
  readonly tableNote = COMPARE_PLAUSIBLE.tableNote;
  readonly sections = COMPARE_PLAUSIBLE.sections;
  readonly rows = COMPARE_PLAUSIBLE.rows;
  readonly faqs = COMPARE_PLAUSIBLE.faqs;
  readonly related = COMPARE_PLAUSIBLE.related;

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
