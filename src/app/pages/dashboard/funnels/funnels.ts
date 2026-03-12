import { Component, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../../services/auth.service';
import { DemoService } from '../../../services/demo.service';
import { AnalyticsAPIService } from '../../../services/analytics-api.service';
import { ApiKeysService } from '../../../services/api-keys.service';

export interface FunnelStep {
  id: string;
  name: string;
  eventName: string;
  visitors: number | null;
  dropOff: number;
  conversionFromPrev: number;
  conversionFromFirst: number;
}

export interface Funnel {
  id: string;
  name: string;
  steps: FunnelStep[];
  createdAt: Date;
}

// App owner email — must stay in sync with dashboard.ts
const APP_OWNER_EMAIL = 'arul007rajmathy@gmail.com';

@Component({
  selector: 'app-dashboard-funnels',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    ProgressBarModule,
    TooltipModule,
    SkeletonModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './funnels.html',
  styleUrl: './funnels.scss',
})
export class DashboardFunnels implements OnInit {
  userPlan: 'free' | 'pro' | 'enterprise' = 'free';

  // ─── Builder state ─────────────────────────────────────────────────────────
  funnelName = 'New Funnel';
  isEditingName = false;
  steps: { name: string; eventName: string }[] = [
    { name: 'Landing', eventName: 'page_view' },
    { name: 'Sign Up Started', eventName: 'signup_started' },
    { name: 'Sign Up Completed', eventName: 'signup_completed' },
  ];

  // ─── Results state ─────────────────────────────────────────────────────────
  loading = signal(false);
  hasResults = signal(false);
  funnelResult: FunnelStep[] = [];
  totalEntrants = 0;
  overallConversion = 0;

  // ─── Saved funnels ─────────────────────────────────────────────────────────
  savedFunnels: Funnel[] = [];

  constructor(
    private authService: AuthService,
    public demoService: DemoService,
    private analyticsAPI: AnalyticsAPIService,
    private apiKeysService: ApiKeysService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    const user = this.authService.getUserData();

    if (user?.email === APP_OWNER_EMAIL || user?.role === 'owner') {
      this.userPlan = 'enterprise';
    } else {
      this.userPlan = (user?.plan as any) || 'free';
    }

    if (this.demoService.isDemoMode()) {
      this.userPlan = 'pro';
      this.loadDemoFunnel();
    }

    // Load saved funnels from localStorage
    const saved = localStorage.getItem('pulzivo_funnels');
    if (saved) {
      try { this.savedFunnels = JSON.parse(saved); } catch { this.savedFunnels = []; }
    }
  }

  isPlanAtLeast(plan: 'free' | 'pro' | 'enterprise'): boolean {
    const order: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
    return (order[this.userPlan] ?? 0) >= (order[plan] ?? 0);
  }

  // ─── Step management ───────────────────────────────────────────────────────

  addStep() {
    if (this.steps.length >= 8) {
      this.messageService.add({ severity: 'warn', summary: 'Max steps', detail: 'A funnel can have up to 8 steps.' });
      return;
    }
    this.steps.push({ name: '', eventName: '' });
  }

  removeStep(index: number) {
    if (this.steps.length <= 2) {
      this.messageService.add({ severity: 'warn', summary: 'Min steps', detail: 'A funnel needs at least 2 steps.' });
      return;
    }
    this.steps.splice(index, 1);
    if (this.hasResults()) this.runFunnel();
  }

  moveStepUp(index: number) {
    if (index === 0) return;
    [this.steps[index - 1], this.steps[index]] = [this.steps[index], this.steps[index - 1]];
    if (this.hasResults()) this.runFunnel();
  }

  moveStepDown(index: number) {
    if (index === this.steps.length - 1) return;
    [this.steps[index], this.steps[index + 1]] = [this.steps[index + 1], this.steps[index]];
    if (this.hasResults()) this.runFunnel();
  }

  trackByIndex(index: number): number { return index; }

  // ─── Run funnel ────────────────────────────────────────────────────────────

  canRun(): boolean {
    return this.steps.length >= 2 &&
      this.steps.every(s => s.name.trim() && s.eventName.trim());
  }

  runFunnel() {
    if (!this.canRun()) {
      this.messageService.add({ severity: 'warn', summary: 'Incomplete', detail: 'Fill in name and event for every step.' });
      return;
    }

    if (this.demoService.isDemoMode()) {
      this.loadDemoFunnel();
      return;
    }

    this.loading.set(true);
    this.hasResults.set(false);
    this.cdr.markForCheck();

    // Call the funnel-events endpoint for each step in sequence
    const stepEventNames = this.steps.map(s => s.eventName.trim());
    this.fetchFunnelData(stepEventNames);
  }

  private fetchFunnelData(eventNames: string[]) {
    const promises = eventNames.map(ev =>
      this.analyticsAPI.getFunnelEvents(ev, 1000).toPromise()
        .then((data: any) => {
          // Backend returns unique visitor count for this event
          if (typeof data?.count === 'number') return data.count;
          if (typeof data?.uniqueVisitors === 'number') return data.uniqueVisitors;
          if (Array.isArray(data)) return data.length;
          return 0;
        })
        .catch(() => 0)
    );

    Promise.all(promises).then(counts => {
      this.buildFunnelResult(counts);
      this.loading.set(false);
      this.hasResults.set(true);
      this.cdr.markForCheck();
    });
  }

  private buildFunnelResult(counts: number[]) {
    const first = counts[0] || 0;
    this.totalEntrants = first;
    this.funnelResult = this.steps.map((step, i) => {
      const visitors = counts[i] ?? 0;
      const prev = i === 0 ? visitors : (counts[i - 1] ?? 0);
      const dropOff = Math.max(0, prev - visitors);
      const conversionFromPrev = prev > 0 ? Math.round((visitors / prev) * 1000) / 10 : 0;
      const conversionFromFirst = first > 0 ? Math.round((visitors / first) * 1000) / 10 : 0;
      return {
        id: `step-${i}`,
        name: step.name,
        eventName: step.eventName,
        visitors,
        dropOff,
        conversionFromPrev,
        conversionFromFirst,
      };
    });
    const last = counts[counts.length - 1] ?? 0;
    this.overallConversion = first > 0 ? Math.round((last / first) * 1000) / 10 : 0;
  }

  private loadDemoFunnel() {
    this.loading.set(true);
    this.hasResults.set(false);

    // Simulate async load
    setTimeout(() => {
      const demoData = this.demoService.funnelBuilderData;
      this.steps = demoData.steps.map(s => ({ name: s.name, eventName: s.eventName }));
      this.buildFunnelResult(demoData.counts);
      this.loading.set(false);
      this.hasResults.set(true);
      this.cdr.markForCheck();
    }, 600);
  }

  // ─── Save / Load ───────────────────────────────────────────────────────────

  saveFunnel() {
    if (!this.hasResults()) return;
    const funnel: Funnel = {
      id: Date.now().toString(),
      name: this.funnelName,
      steps: [...this.funnelResult],
      createdAt: new Date(),
    };
    this.savedFunnels.unshift(funnel);
    if (this.savedFunnels.length > 10) this.savedFunnels.pop();
    localStorage.setItem('pulzivo_funnels', JSON.stringify(this.savedFunnels));
    this.messageService.add({ severity: 'success', summary: 'Saved', detail: `"${this.funnelName}" saved.` });
  }

  loadSavedFunnel(funnel: Funnel) {
    this.funnelName = funnel.name;
    this.steps = funnel.steps.map(s => ({ name: s.name, eventName: s.eventName }));
    this.funnelResult = funnel.steps;
    this.totalEntrants = funnel.steps[0]?.visitors ?? 0;
    const last = funnel.steps[funnel.steps.length - 1]?.visitors ?? 0;
    this.overallConversion = this.totalEntrants > 0
      ? Math.round((last / this.totalEntrants) * 1000) / 10 : 0;
    this.hasResults.set(true);
  }

  deleteSavedFunnel(id: string) {
    this.savedFunnels = this.savedFunnels.filter(f => f.id !== id);
    localStorage.setItem('pulzivo_funnels', JSON.stringify(this.savedFunnels));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  formatVisitors(n: number | null): string {
    if (n === null) return '—';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  }

  getBarColor(conversionFromFirst: number): string {
    if (conversionFromFirst >= 70) return '#22c55e';
    if (conversionFromFirst >= 40) return '#f59e0b';
    return '#ef4444';
  }

  getDropOffSeverity(dropOff: number): 'success' | 'warn' | 'danger' | 'secondary' {
    if (this.totalEntrants === 0) return 'secondary';
    const pct = (dropOff / this.totalEntrants) * 100;
    if (pct < 10) return 'success';
    if (pct < 30) return 'warn';
    return 'danger';
  }

  getConversionLabel(pct: number): string {
    if (pct >= 70) return 'Healthy';
    if (pct >= 40) return 'Average';
    return 'Needs work';
  }
}
