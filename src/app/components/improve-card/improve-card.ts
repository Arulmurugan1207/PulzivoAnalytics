import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type FindingType =
  | 'rage_clicks' | 'dead_clicks' | 'form_abandon' | 'slow_page'
  | 'not_found' | 'js_error' | 'low_scroll' | 'dead_end';

export interface ImproveFinding {
  type: FindingType;
  page: string;
  element?: string;
  metric?: string;
  title: string;
  fix: string;
  evidenceText: string;
  visitorsAffected: number;
  severity: number;
  evidence?: Record<string, unknown>;
  vsPrevious?: { changePct: number | null } | null;
}

export interface ImprovedItem { type: FindingType; page: string; title: string; changePct: number; }

export interface ImproveReport {
  status: 'ok' | 'insufficient_data';
  reason?: string | null;
  sample?: { pageViews: number; visitors: number };
  minimums?: { pageViews: number; visitors: number };
  findings: ImproveFinding[];
  improved: ImprovedItem[];
}

const TYPE_META: Record<FindingType, { icon: string; tone: string; label: string }> = {
  rage_clicks: { icon: 'pi-bolt', tone: 'rose', label: 'Rage clicks' },
  js_error: { icon: 'pi-exclamation-triangle', tone: 'rose', label: 'JS error' },
  form_abandon: { icon: 'pi-file-edit', tone: 'amber', label: 'Form drop-off' },
  not_found: { icon: 'pi-link', tone: 'amber', label: '404' },
  slow_page: { icon: 'pi-stopwatch', tone: 'violet', label: 'Speed' },
  dead_clicks: { icon: 'pi-ban', tone: 'sky', label: 'Dead clicks' },
  low_scroll: { icon: 'pi-arrow-down', tone: 'sky', label: 'Low scroll' },
  dead_end: { icon: 'pi-sign-out', tone: 'slate', label: 'Dead end' },
};

@Component({
  selector: 'app-improve-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './improve-card.html',
  styleUrl: './improve-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImproveCard {
  @Input() report: ImproveReport | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  /** Host for page links (from the API key's allowed domains / site name). */
  @Input() domain: string | null = null;

  meta(type: FindingType) { return TYPE_META[type] || TYPE_META.dead_end; }

  href(page: string): string | null {
    if (!this.domain || !page || !page.startsWith('/')) return null;
    return `https://${this.domain}${page}`;
  }

  get findings(): ImproveFinding[] { return this.report?.findings ?? []; }
  get improved(): ImprovedItem[] { return this.report?.improved ?? []; }
}
