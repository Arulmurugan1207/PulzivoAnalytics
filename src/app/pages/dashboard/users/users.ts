import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserService, User } from '../../../services/user.service';

// App owner email
const APP_OWNER_EMAIL = 'arul007rajmathy@gmail.com';

@Component({
  selector: 'app-dashboard-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.html',
  styleUrls: ['./users.scss']
})
export class DashboardUsersComponent implements OnInit, OnDestroy {
  users: User[] = [];
  filteredUsers: User[] = [];
  loading = true;
  searchQuery = '';
  selectedPlanFilter = 'all';
  selectedRoleFilter = 'all';
  private destroy$ = new Subject<void>();
  
  readonly appOwnerEmail = APP_OWNER_EMAIL;

  constructor(
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadUsers();
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
          // Set default plan and role, mark owner
          this.users = response.users.map(user => ({
            ...user,
            plan: user.email === APP_OWNER_EMAIL ? 'enterprise' : (user.plan || 'free'),
            role: user.email === APP_OWNER_EMAIL ? 'owner' : (user.role || 'viewer')
          }));
          this.filteredUsers = this.users;
          this.loading = false;
          this.cdr.detectChanges();
          console.log('Users loaded:', this.users.length);
        },
        error: (error) => {
          console.error('Error loading users:', error);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
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
