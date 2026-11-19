import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserListStatus = 'active' | 'removed' | 'all';

export interface User {
  _id: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  mobileno?: string;
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  role?: 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';
  createdDate?: string;
  lastLoginDate?: string | null;
  apiKeysCount: number;
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  removedBy?: string | null;
}

export interface GrowthStats {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  totalCount: number;
  trend: { date: string; count: number }[];
}

export interface UsersResponse {
  status: number;
  count: number;
  total?: number;
  activeTotal?: number;
  removedTotal?: number;
  users: User[];
}

export interface UserActionResponse {
  message?: string;
  deletedId?: string;
}

export interface UpdatePlanResponse {
  status: number;
  message: string;
  plan: string;
}

export interface UpdateRoleResponse {
  status: number;
  message: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Get users. status=active (default) hides soft-removed accounts.
   * status=removed is the Removed tab. Same query names as Table Tennis Tube.
   */
  getAllUsers(status: UserListStatus = 'active'): Observable<UsersResponse> {
    return this.http.get<UsersResponse>(`${this.apiUrl}/users`, { params: { status } });
  }

  /** POST /users/softDeleteUser { _id } — owner only. */
  softDeleteUser(id: string): Observable<UserActionResponse> {
    return this.http.post<UserActionResponse>(`${this.apiUrl}/users/softDeleteUser`, { _id: id });
  }

  /** POST /users/restoreUser { _id } — owner only. */
  restoreUser(id: string): Observable<UserActionResponse> {
    return this.http.post<UserActionResponse>(`${this.apiUrl}/users/restoreUser`, { _id: id });
  }

  /** POST /users/deleteUser { _id } — owner only, and only after a soft remove. */
  deleteUser(id: string): Observable<UserActionResponse> {
    return this.http.post<UserActionResponse>(`${this.apiUrl}/users/deleteUser`, { _id: id });
  }

  /**
   * Get sign-up growth KPIs and 30-day daily trend
   */
  getGrowthStats(): Observable<GrowthStats> {
    return this.http.get<GrowthStats>(`${this.apiUrl}/users/growth-stats`);
  }

  /**
   * Update user's plan (requires authentication via interceptor)
   */
  updateUserPlan(userId: string, plan: 'free' | 'starter' | 'pro' | 'enterprise'): Observable<UpdatePlanResponse> {
    return this.http.put<UpdatePlanResponse>(
      `${this.apiUrl}/users/${userId}/plan`,
      { plan }
    );
  }

  /**
   * Update user's role (requires authentication via interceptor)
   */
  updateUserRole(userId: string, role: 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer'): Observable<UpdateRoleResponse> {
    return this.http.put<UpdateRoleResponse>(
      `${this.apiUrl}/users/${userId}/role`,
      { role }
    );
  }
}
