import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { UserService, User, GrowthStats } from '../../../services/user.service';

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

  // Growth stats
  growthStats: GrowthStats = { todayCount: 0, weekCount: 0, monthCount: 0, totalCount: 0, trend: [] };
  trendChartData: any = {};
  trendChartOptions: any = {};

  private destroy$ = new Subject<void>();
  readonly appOwnerEmail = APP_OWNER_EMAIL;

  constructor(
    private userService: UserService,
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
    
    this.userService.getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.users = response.users
            .map(user => ({
              ...user,
              plan: user.email === APP_OWNER_EMAIL ? 'enterprise' : (user.plan || 'free'),
              role: user.email === APP_OWNER_EMAIL ? 'owner' : (user.role || 'viewer')
            }))
            .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
          this.filteredUsers = this.users;
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

  isNewUser(createdDate: string): boolean {
    const created = new Date(createdDate).getTime();
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
        user.firstname.toLowerCase().includes(query) ||
        user.lastname.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
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
    this.userService.updateUserPlan(userId, newPlan as 'free' | 'pro' | 'enterprise')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('User plan updated successfully');
          // Update local data
          const user = this.users.find(u => u._id === userId);
          if (user) {
            user.plan = newPlan as 'free' | 'pro' | 'enterprise';
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

  isOwner(email: string): boolean {
    return email === APP_OWNER_EMAIL;
  }

  getPlanBadgeClass(plan: string | undefined): string {
    switch (plan) {
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

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
}
