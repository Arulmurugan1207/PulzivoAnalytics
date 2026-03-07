import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
  mobileno?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  role?: 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';
  createdDate: string;
  apiKeysCount: number;
}

export interface UsersResponse {
  status: number;
  count: number;
  users: User[];
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
   * Get all users (requires authentication via interceptor)
   */
  getAllUsers(): Observable<UsersResponse> {
    return this.http.get<UsersResponse>(`${this.apiUrl}/users`);
  }

  /**
   * Update user's plan (requires authentication via interceptor)
   */
  updateUserPlan(userId: string, plan: 'free' | 'pro' | 'enterprise'): Observable<UpdatePlanResponse> {
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
