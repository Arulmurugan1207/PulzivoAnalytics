import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
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
  /** Small grey second line under the label (e.g. the path under a page title). */
  secondary?: string;
  /** External URL for the grey second line only (label stays plain text). */
  secondaryHref?: string;
  /** External URL; label becomes a link opening in a new tab. */
  href?: string;
  /** Share of the whole total, 0–100. Shown beside the count on pulse cards. */
  share?: number;
  /** 1-based rank. Pulse pages use this so page 2 starts at 11, not 1. */
  rank?: number;
  /** Slice / series colour. Assigned from the violet–teal palette when omitted. */
  color?: string;
  /** Hostname for a favicon. Letter avatar is used when this is missing or the image fails. */
  iconDomain?: string;
}

export type BreakdownTone = 'pages' | 'sources' | 'geo' | 'events';

/** Violet → teal, alternating so neighbours stay distinguishable. */
const PULSE_PALETTE = [
  '#6d28d9',
  '#0f766e',
  '#7c3aed',
  '#0891b2',
  '#a855f7',
  '#0d9488',
  '#4f46e5',
  '#14b8a6',
  '#9333ea',
  '#0e7490',
];

const DONUT_R = 46;
const DONUT_C = 2 * Math.PI * DONUT_R;

interface PaintedRow extends BreakdownRow {
  pct: number;
  color: string;
}

interface DonutSegment {
  key: string;
  label: string;
  color: string;
  /** Share used for the ring and the centre label while this slice is hovered. */
  pct: number;
  dash: string;
  offset: string;
}

/**
 * Ranked breakdown card shared by the marketing sample and the Overview.
 * `look="classic"` keeps the full-row bars used on the home page.
 * `look="pulse"` is the dashboard treatment: ranked pages, a source donut,
 * an events lollipop, and flag rows for countries. Charts are SVG/CSS only.
 */
@Component({
  selector: 'app-breakdown-card',
  imports: [DecimalPipe],
  templateUrl: './breakdown-card.html',
  styleUrl: './breakdown-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakdownCard {
  readonly title = input.required<string>();
  readonly metric = input('Visitors');
  readonly tone = input<BreakdownTone>('pages');
  readonly rows = input<BreakdownRow[]>([]);
  /** Show at most this many rows with a "Show more" toggle (0 = all). */
  readonly limit = input(0);
  /** `pulse` is the Overview redesign. Home keeps the default classic bars. */
  readonly look = input<'classic' | 'pulse'>('classic');

  readonly expanded = signal(false);
  /** Index into the donut segments, including the synthetic "Other" slice. */
  readonly hover = signal(-1);
  private readonly failedIcons = signal<ReadonlySet<string>>(new Set());

  readonly visibleRows = computed<PaintedRow[]>(() => {
    const rows = this.rows();
    const max = Math.max(0, ...rows.map(r => (typeof r.value === 'number' ? r.value : 0)));
    const withPct: PaintedRow[] = rows.map((r, i) => ({
      ...r,
      color: r.color || PULSE_PALETTE[i % PULSE_PALETTE.length],
      pct: r.pct ?? (max > 0 && typeof r.value === 'number' ? Math.max(2, (r.value / max) * 100) : 0),
    }));
    const limit = this.limit();
    return limit > 0 && !this.expanded() ? withPct.slice(0, limit) : withPct;
  });

  readonly hiddenCount = computed(() => {
    const limit = this.limit();
    return limit > 0 ? Math.max(0, this.rows().length - limit) : 0;
  });

  readonly sourceChart = computed(() => {
    const rows = this.visibleRows();
    const everyShare = rows.length > 0 && rows.every(r => typeof r.share === 'number');
    const parts: { key: string; label: string; color: string; weight: number }[] = rows.map(r => ({
      key: String(r.key ?? r.label),
      label: r.label,
      color: r.color,
      weight: everyShare ? Number(r.share) : (typeof r.value === 'number' ? r.value : 0),
    }));
    const listed = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0);
    let other: { pct: number } | null = null;
    if (everyShare && this.hiddenCount() > 0 && listed < 99.5) {
      const rest = Math.max(0, 100 - listed);
      parts.push({ key: '__other', label: 'Other', color: '#c4b5d4', weight: rest });
      other = { pct: rest };
    }
    const totalWeight = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0) || 1;
    const gap = parts.length > 1 ? Math.min(3.2, (DONUT_C / parts.length) * 0.16) : 0;
    let cursor = 0;
    const segments: DonutSegment[] = parts.map(part => {
      const span = (Math.max(0, part.weight) / totalWeight) * DONUT_C;
      const len = Math.max(0, span - gap);
      const segment: DonutSegment = {
        key: part.key,
        label: part.label,
        color: part.color,
        pct: (Math.max(0, part.weight) / totalWeight) * 100,
        dash: `${len.toFixed(3)} ${(DONUT_C - len).toFixed(3)}`,
        offset: (-cursor).toFixed(3),
      };
      cursor += span;
      return segment;
    });
    const total = this.rows().reduce((sum, row) => sum + (typeof row.value === 'number' ? row.value : 0), 0);
    return { segments, total, other };
  });

  readonly donutCenter = computed(() => {
    const chart = this.sourceChart();
    const segment = chart.segments[this.hover()];
    if (segment) {
      return { value: `${this.shareText(segment.pct)}%`, caption: segment.label };
    }
    return { value: new Intl.NumberFormat('en-US').format(chart.total), caption: this.metric() };
  });

  readonly sourceSummary = computed(() => {
    const bits = this.visibleRows().slice(0, 6).map(row => {
      const share = typeof row.share === 'number' ? `${this.shareText(row.share)}%` : String(row.value);
      return `${row.label} ${share}`;
    });
    return `${this.title()}: ${bits.join(', ')}`;
  });

  isNumber(v: number | string): v is number {
    return typeof v === 'number';
  }

  rankOf(row: BreakdownRow, index: number): number {
    return row.rank ?? index + 1;
  }

  initial(label: string): string {
    const ch = (label || '?').trim().charAt(0).toUpperCase();
    return /[A-Z0-9]/.test(ch) ? ch : '•';
  }

  faviconUrl(domain: string | undefined): string | null {
    const host = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  }

  showFavicon(row: BreakdownRow): boolean {
    return !!row.iconDomain && !!this.faviconUrl(row.iconDomain) && !this.failedIcons().has(row.iconDomain);
  }

  onIconError(domain: string): void {
    if (this.failedIcons().has(domain)) return;
    const next = new Set(this.failedIcons());
    next.add(domain);
    this.failedIcons.set(next);
  }

  shareText(value: number): string {
    if (!Number.isFinite(value)) return '0.0';
    if (value > 0 && value < 0.05) return '<0.1';
    return value.toFixed(1);
  }
}
