import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsAPIService } from '../../../services/analytics-api.service';
import { ApiKeysService } from '../../../services/api-keys.service';
import { DemoService } from '../../../services/demo.service';

export interface GoalDef {
  id: string;
  type: 'event' | 'page';
  value: string;
}

interface GoalRow { label: string; available: boolean; visitors: number; conversions: number; rate: number | null; }

export interface GoalReport {
  status: string;
  reason?: string;
  visitors: number | null;
  conversions: number | null;
  rate: number | null;
  changePct: number | null;
  denominatorNote?: string;
  previous?: { status: string; visitors: number | null; conversions: number | null; rate: number | null } | null;
  bySource: GoalRow[];
  byCampaign: GoalRow[];
  byLanding: GoalRow[];
}

/** Same shape as analytics-api/goals.spec.js for the labelled demo. */
const DEMO_REPORT: GoalReport = {
  status: 'ok',
  visitors: 3,
  conversions: 1,
  rate: 33.3,
  changePct: null,
  denominatorNote: 'Distinct visitors with a page view in this range. A goal without a page view is not a conversion.',
  previous: { status: 'insufficient_data', visitors: 0, conversions: 0, rate: null },
  bySource: [
    { label: 'Instagram', available: true, visitors: 1, conversions: 1, rate: 100 },
    { label: 'Hacker News', available: true, visitors: 1, conversions: 0, rate: 0 },
    { label: 'Unavailable', available: false, visitors: 1, conversions: 0, rate: 0 },
  ],
  byCampaign: [
    { label: 'spring', available: true, visitors: 1, conversions: 1, rate: 100 },
    { label: 'Unavailable', available: false, visitors: 2, conversions: 0, rate: 0 },
  ],
  byLanding: [
    { label: '/', available: true, visitors: 1, conversions: 1, rate: 100 },
    { label: '/pricing', available: true, visitors: 1, conversions: 0, rate: 0 },
    { label: 'Unavailable', available: false, visitors: 1, conversions: 0, rate: 0 },
  ],
};

@Component({
  selector: 'app-dashboard-goals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
})
export class DashboardGoals implements OnInit {
  goals: GoalDef[] = [];
  selectedId = '';
  draftType: 'event' | 'page' = 'event';
  draftValue = '';
  report: GoalReport | null = null;
  loading = false;
  error: string | null = null;
  range: '7' | '30' = '30';

  constructor(
    private api: AnalyticsAPIService,
    private keys: ApiKeysService,
    public demo: DemoService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.goals = this.readGoals();
    if (!this.goals.length && this.demo.isDemoMode()) {
      this.goals = [{ id: 'demo-signup', type: 'event', value: 'signup' }];
    }
    this.selectedId = this.goals[0]?.id || '';
    this.load();
  }

  get selected(): GoalDef | undefined {
    return this.goals.find(goal => goal.id === this.selectedId);
  }

  add(): void {
    const value = this.draftValue.trim();
    if (!value || value.length > 120) return;
    const goal: GoalDef = { id: `${Date.now()}`, type: this.draftType, value };
    this.goals = [...this.goals, goal];
    this.selectedId = goal.id;
    this.draftValue = '';
    this.writeGoals();
    this.load();
  }

  remove(id: string): void {
    this.goals = this.goals.filter(goal => goal.id !== id);
    if (this.selectedId === id) this.selectedId = this.goals[0]?.id || '';
    this.writeGoals();
    this.load();
  }

  choose(id: string): void {
    this.selectedId = id;
    this.load();
  }

  setRange(range: '7' | '30'): void {
    this.range = range;
    this.load();
  }

  load(): void {
    const goal = this.selected;
    this.error = null;
    if (!goal) {
      this.report = null;
      return;
    }
    if (this.demo.isDemoMode()) {
      this.report = { ...DEMO_REPORT, goal: undefined } as GoalReport;
      this.loading = false;
      return;
    }
    const end = new Date();
    const start = new Date(end.getTime() - Number(this.range) * 86400000);
    this.loading = true;
    this.api.getGoalConversion(goal.type, goal.value, { startDate: start, endDate: end }).subscribe({
      next: (report) => {
        this.report = report;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.report = null;
        this.error = 'Couldn’t load this goal. Check the site and date range.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  rateText(rate: number | null | undefined): string {
    return rate == null ? 'Unavailable' : `${rate}%`;
  }

  private storageKey(): string {
    if (this.demo.isDemoMode()) return 'pulzivo_goals_demo';
    return `pulzivo_goals_${this.keys.getSelectedApiKey() || 'none'}`;
  }

  private readGoals(): GoalDef[] {
    try {
      const raw = localStorage.getItem(this.storageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(goal => goal && (goal.type === 'event' || goal.type === 'page') && goal.value) : [];
    } catch {
      return [];
    }
  }

  private writeGoals(): void {
    localStorage.setItem(this.storageKey(), JSON.stringify(this.goals));
  }
}
