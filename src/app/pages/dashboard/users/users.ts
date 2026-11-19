import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { UserService, User, GrowthStats, UserListStatus } from '../../../services/user.service';
import { AuthService } from '../../../services/auth.service';
import {
  ConfirmKind,
  displayInitials,
  displayName,
  hardDeleteHint,
  hardDeleteMatches,
  removalBlocked,
  removalDialog,
} from './users-removal.logic';

// App owner email
const APP_OWNER_EMAIL = 'arul007rajmathy@gmail.com';

@Component({
  selector: 'app-dashboard-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule, SkeletonModule],
  templateUrl: './users.html',
  styleUrls: ['./users.scss']
})
export class DashboardUsersComponent implements OnInit, OnDestroy {
  users: User[] = [];
  filteredUsers: User[] = [];
  loading = true;
  loadingGrowth = true;
  searchQuery = '';
  selectedPlanFilter = 'all';
  selectedRoleFilter = 'all';
  sortNewestFirst = true;
  activeTab: UserListStatus = 'active';
  activeTotal = 0;
  removedTotal = 0;
  busy = false;
  pending: { kind: ConfirmKind; user: User } | null = null;
  confirmText = '';
  actionError = '';

  // Growth stats
  growthStats: GrowthStats = { todayCount: 0, weekCount: 0, monthCount: 0, totalCount: 0, trend: [] };
  trendChartData: any = {};
  trendChartOptions: any = {};

  private destroy$ = new Subject<void>();
  readonly appOwnerEmail = APP_OWNER_EMAIL;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initChartOptions();
    this.loadUsers();
    this.loadGrowthStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.loading = true;
    
    this.userService.getAllUsers(this.activeTab === 'removed' ? 'removed' : 'active')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.activeTotal = Number(response.activeTotal) || 0;
          this.removedTotal = Number(response.removedTotal) || 0;
          this.users = response.users
            .map(user => ({
              ...user,
              plan: user.email === APP_OWNER_EMAIL ? 'enterprise' : (user.plan || 'free'),
              role: user.email === APP_OWNER_EMAIL ? 'owner' : (user.role || 'viewer')
            }))
            .sort((a, b) => new Date(b.createdDate || 0).getTime() - new Date(a.createdDate || 0).getTime());
          this.filterUsers();
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading users:', error);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  loadGrowthStats(): void {
    this.loadingGrowth = true;
    this.userService.getGrowthStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.growthStats = stats;
          this.buildTrendChart(stats.trend);
          this.loadingGrowth = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadingGrowth = false;
          this.cdr.detectChanges();
        }
      });
  }

  private initChartOptions(): void {
    this.trendChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleFont: { size: 12 },
          bodyFont: { size: 13 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) => ` ${ctx.parsed.y} new sign-up${ctx.parsed.y !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        },
        x: {
          ticks: { maxTicksLimit: 10, color: '#94a3b8', font: { size: 11 } },
          grid: { display: false },
          border: { display: false }
        }
      }
    };
  }

  private buildTrendChart(trend: { date: string; count: number }[]): void {
    this.trendChartData = {
      labels: trend.map(d => {
        const dt = new Date(d.date + 'T00:00:00');
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [{
        data: trend.map(d => d.count),
        backgroundColor: 'rgba(42,109,246,0.15)',
        borderColor: '#2a6df6',
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 18
      }]
    };
  }

  isNewUser(createdDate: string | null | undefined): boolean {
    if (!createdDate) return false;
    const created = new Date(createdDate).getTime();
    if (Number.isNaN(created)) return false;
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return created >= threeDaysAgo;
  }

  formatTimeAgo(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  filterUsers(): void {
    let filtered = this.users;

    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(user =>
        displayName(user).toLowerCase().includes(query) ||
        String(user.email || '').toLowerCase().includes(query)
      );
    }

    // Filter by plan
    if (this.selectedPlanFilter !== 'all') {
      filtered = filtered.filter(user => user.plan === this.selectedPlanFilter);
    }

    // Filter by role
    if (this.selectedRoleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === this.selectedRoleFilter);
    }

    this.filteredUsers = filtered;
  }

  onPlanChange(event: Event, userId: string): void {
    const target = event.target as HTMLSelectElement;
    this.updateUserPlan(userId, target.value);
  }

  updateUserPlan(userId: string, newPlan: string): void {
    this.userService.updateUserPlan(userId, newPlan as 'free' | 'starter' | 'pro' | 'enterprise')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('User plan updated successfully');
          // Update local data
          const user = this.users.find(u => u._id === userId);
          if (user) {
            user.plan = newPlan as 'free' | 'starter' | 'pro' | 'enterprise';
          }
          this.filterUsers();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error updating user plan:', error);
          alert('Failed to update user plan');
        }
      });
  }

  onRoleChange(event: Event, userId: string): void {
    const target = event.target as HTMLSelectElement;
    this.updateUserRole(userId, target.value);
  }

  updateUserRole(userId: string, newRole: string): void {
    this.userService.updateUserRole(userId, newRole as 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('User role updated successfully');
          // Update local data
          const user = this.users.find(u => u._id === userId);
          if (user) {
            user.role = newRole as 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';
          }
          this.filterUsers();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error updating user role:', error);
          alert('Failed to update user role');
        }
      });
  }

  isOwner(email: string | undefined): boolean {
    return !!email && email === APP_OWNER_EMAIL;
  }

  getPlanBadgeClass(plan: string | undefined): string {
    switch (plan) {
      case 'starter':
        return 'badge-starter';
      case 'pro':
        return 'badge-pro';
      case 'enterprise':
        return 'badge-enterprise';
      case 'free':
      default:
        return 'badge-free';
    }
  }

  getRoleBadgeClass(role: string | undefined): string {
    switch (role) {
      case 'owner':
        return 'badge-owner';
      case 'admin':
        return 'badge-admin';
      case 'developer':
        return 'badge-developer';
      case 'analyst':
        return 'badge-analyst';
      case 'viewer':
      default:
        return 'badge-viewer';
    }
  }

  getRoleLabel(role: string | undefined): string {
    const roleMap: Record<string, string> = {
      'owner': 'Owner',
      'admin': 'Admin',
      'developer': 'Developer',
      'analyst': 'Analyst',
      'viewer': 'Viewer'
    };
    return roleMap[role || 'viewer'] || 'Viewer';
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  setTab(tab: 'active' | 'removed'): void {
    if (this.activeTab === tab || this.busy) return;
    this.activeTab = tab;
    this.searchQuery = '';
    this.cancelPending();
    this.loadUsers();
  }

  nameOf(user: User): string {
    return displayName(user);
  }

  initialsOf(user: User): string {
    return displayInitials(user);
  }

  currentUserId(): string {
    const me = this.authService.getUserData();
    return String(me?._id || me?.id || '');
  }

  canManage(user: User): boolean {
    return !removalBlocked(user, this.currentUserId(), APP_OWNER_EMAIL);
  }

  askRemove(user: User): void {
    if (this.busy || !this.canManage(user)) return;
    this.pending = { kind: 'soft', user };
    this.confirmText = '';
    this.actionError = '';
  }

  askRestore(user: User): void {
    if (this.busy) return;
    this.pending = { kind: 'restore', user };
    this.confirmText = '';
    this.actionError = '';
  }

  askHardDelete(user: User): void {
    if (this.busy || !this.canManage(user)) return;
    this.pending = { kind: 'hard', user };
    this.confirmText = '';
    this.actionError = '';
  }

  cancelPending(): void {
    if (this.busy) return;
    this.pending = null;
    this.confirmText = '';
    this.actionError = '';
  }

  pendingTitle(): string {
    return this.pending ? removalDialog(this.pending.kind, this.pending.user).title : '';
  }

  pendingBody(): string {
    return this.pending ? removalDialog(this.pending.kind, this.pending.user).body : '';
  }

  pendingConfirmLabel(): string {
    return this.pending ? removalDialog(this.pending.kind, this.pending.user).confirm : '';
  }

  pendingHint(): string {
    return this.pending?.kind === 'hard' ? hardDeleteHint(this.pending.user) : '';
  }

  confirmDisabled(): boolean {
    if (!this.pending || this.busy) return true;
    if (this.pending.kind !== 'hard') return false;
    return !hardDeleteMatches(this.pending.user, this.confirmText);
  }

  confirmPending(): void {
    const pending = this.pending;
    if (!pending || this.confirmDisabled()) return;
    const id = pending.user._id;
    if (!id) {
      this.actionError = 'Missing user id.';
      return;
    }
    const name = displayName(pending.user);
    this.busy = true;
    this.actionError = '';
    const done = (fallback: string) => ({
      next: () => {
        this.busy = false;
        this.pending = null;
        this.confirmText = '';
        this.loadUsers();
        this.loadGrowthStats();
        this.cdr.detectChanges();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy = false;
        this.actionError = err?.error?.message || fallback;
        this.cdr.detectChanges();
      },
    });
    if (pending.kind === 'soft') {
      this.userService.softDeleteUser(id).pipe(takeUntil(this.destroy$)).subscribe(
        done(`Could not remove ${name}.`)
      );
      return;
    }
    if (pending.kind === 'restore') {
      this.userService.restoreUser(id).pipe(takeUntil(this.destroy$)).subscribe(
        done(`Could not restore ${name}.`)
      );
      return;
    }
    this.userService.deleteUser(id).pipe(takeUntil(this.destroy$)).subscribe(
      done(`Could not delete ${name}.`)
    );
  }
}
