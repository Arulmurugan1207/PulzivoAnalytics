import { Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface BreakdownRow {
  /** Unique key for tracking. Defaults to label. */
  key?: string;
  label: string;
  /** Number (formatted with thousands separators) or pre-formatted string. */
  value: number | string;
  /** Bar width 0–100. If omitted it is computed from numeric values relative to the largest. */
  pct?: number;
  /** Emoji flag shown before the label (e.g. country rows). */
  flag?: string;
  /** CSS flag class (flag-us, flag-de, flag-in, flag-fr) for the marketing sample. */
  flagClass?: string;
  /** Muted secondary text after the label (e.g. referrer host). */
  sub?: string;
  /** Native tooltip with extra detail. */
  tooltip?: string;
  /** External URL; label becomes a link opening in a new tab. */
  href?: string;
}

export type BreakdownTone = 'pages' | 'sources' | 'geo';

/**
 * "Top pages / Top sources / Countries" card: small bold title, muted metric
 * header on the right, pastel bar behind each row sized by value.
 * Shared by the marketing home sample dashboard and the real Overview page.
 * Anything projected (loading/empty/locked states, pagers) renders below the rows.
 */
@Component({
  selector: 'app-breakdown-card',
  imports: [DecimalPipe],
  templateUrl: './breakdown-card.html',
  styleUrl: './breakdown-card.scss',
})
export class BreakdownCard {
  readonly title = input.required<string>();
  readonly metric = input('Visitors');
  readonly tone = input<BreakdownTone>('pages');
  readonly rows = input<BreakdownRow[]>([]);
  /** Show at most this many rows with a "Show more" toggle (0 = all). */
  readonly limit = input(0);

  readonly expanded = signal(false);

  readonly visibleRows = computed(() => {
    const rows = this.rows();
    const max = Math.max(0, ...rows.map(r => (typeof r.value === 'number' ? r.value : 0)));
    const withPct = rows.map(r => ({
      ...r,
      pct: r.pct ?? (max > 0 && typeof r.value === 'number' ? Math.max(2, (r.value / max) * 100) : 0),
    }));
    const limit = this.limit();
    return limit > 0 && !this.expanded() ? withPct.slice(0, limit) : withPct;
  });

  readonly hiddenCount = computed(() => {
    const limit = this.limit();
    return limit > 0 ? Math.max(0, this.rows().length - limit) : 0;
  });

  isNumber(v: number | string): v is number {
    return typeof v === 'number';
  }
}
