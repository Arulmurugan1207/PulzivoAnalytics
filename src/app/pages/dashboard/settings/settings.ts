import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';

// PrimeNG Imports
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AvatarModule } from 'primeng/avatar';
import { FileUploadModule } from 'primeng/fileupload';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { ChipModule } from 'primeng/chip';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';

import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

// Plan feature access map matching the analytics SDK
const PLAN_FEATURES: Record<string, string[]> = {
  free: ['page_views', 'clicks'],
  pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events'],
  enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'client_hints', 'form_tracking', 'error_tracking', 'rage_clicks', 'dead_clicks', 'web_vitals', 'resource_timing', 'heatmap_data', 'custom_dimensions']
};

// Feature descriptions for the UI
const FEATURE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  page_views: { label: 'Page Views', description: 'Track when users visit pages' },
  clicks: { label: 'Manual Clicks', description: 'Track clicks you manually trigger' },
  auto_clicks: { label: 'Auto Clicks', description: 'Automatically track all click events' },
  scroll_depth: { label: 'Scroll Depth', description: 'Monitor how far users scroll on pages' },
  page_exit: { label: 'Page Exit', description: 'Track when users leave pages' },
  visibility: { label: 'Page Visibility', description: 'Monitor when page becomes visible/hidden' },
  unique_visitors: { label: 'Unique Visitors', description: 'Identify and count unique users' },
  sessions: { label: 'Sessions', description: 'Track user sessions and duration' },
  performance: { label: 'Performance', description: 'Monitor page load times and performance' },
  utm_attribution: { label: 'UTM Tracking', description: 'Track marketing campaign attribution' },
  user_identity: { label: 'User Identity', description: 'Link events to identified users' },
  custom_events: { label: 'Custom Events', description: 'Track custom business events' },
  client_hints: { label: 'Client Hints', description: 'Collect device and browser information' },
  form_tracking: { label: 'Form Tracking', description: 'Monitor form interactions and submissions' },
  error_tracking: { label: 'Error Tracking', description: 'Capture JavaScript errors and exceptions' },
  rage_clicks: { label: 'Rage Clicks', description: 'Detect frustrated user behavior' },
  dead_clicks: { label: 'Dead Clicks', description: 'Track clicks on non-interactive elements' },
  web_vitals: { label: 'Web Vitals', description: 'Monitor Core Web Vitals (LCP, FID, CLS)' },
  resource_timing: { label: 'Resource Timing', description: 'Track resource loading performance' },
  heatmap_data: { label: 'Heatmap Data', description: 'Collect data for click and scroll heatmaps' },
  custom_dimensions: { label: 'Custom Dimensions', description: 'Add custom data to events' }
};

interface User {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
  avatar?: string;
  timezone?: string;
  bio?: string;
  role?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  preferences?: {
    notifications: {
      email: boolean;
      browser: boolean;
      weeklyReports: boolean;
      securityAlerts: boolean;
    };
    dashboard: {
      defaultDateRange: string;
      theme: string;
      timeFormat: string;
    };
    privacy: {
      dataRetention: string;
      shareUsageData: boolean;
    };
  };
}

interface ApiToken {
  _id: string;
  name: string;
  token: string;
  lastUsed?: string;
  createdAt: string;
  permissions: string[];
  isActive: boolean;
}

interface ActiveSession {
  _id: string;
  device: string;
  browser: string;
  location: string;
  ipAddress: string;
  lastActivity: string;
  isCurrent: boolean;
}

@Component({
  selector: 'app-dashboard-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    AvatarModule,
    FileUploadModule,
    TextareaModule,
    ToastModule,
    ConfirmDialogModule,
    TableModule,
    BadgeModule,
    TagModule,
    DialogModule,
    DividerModule,
    ChipModule,
    CheckboxModule,
    MessageModule
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  providers: [MessageService]
})
export class DashboardSettings implements OnInit {
  user = signal<User | null>(null);
  loading = signal(false);
  
  // Form groups
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  apiTokenForm!: FormGroup;
  analyticsForm!: FormGroup;
  
  // Data
  
  // State
  activeTab = signal('profile');
  apiTokens = signal<ApiToken[]>([]);
  activeSessions = signal<ActiveSession[]>([]);
  showApiTokenDialog = signal(false);
  showDeleteAccountDialog = signal(false);
  showChangePasswordDialog = signal(false);
  show2FASetup = signal(false);
  
  // Security
  twoFactorEnabled = signal(false);
  qrCode = signal('');
  backupCodes = signal<string[]>([]);
  
  // API Token Creation
  selectedPermissions: string[] = [];
  availablePermissions = [
    { key: 'read', label: 'Read Access', description: 'View analytics data and settings' },
    { key: 'write', label: 'Write Access', description: 'Create and modify analytics data' },
    { key: 'delete', label: 'Delete Access', description: 'Remove analytics data' },
    { key: 'admin', label: 'Admin Access', description: 'Full administrative privileges' }
  ];
  
  // Delete Account
  deleteConfirmation = '';
  
  // Analytics tracking preferences
  userPlan = 'free';
  availableFeatures: string[] = [];
  enabledFeatures = signal<string[]>([]);
  featureDescriptions = FEATURE_DESCRIPTIONS;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private messageService: MessageService
  ) {
    this.initializeForms();
  }

  ngOnInit() {
    this.loadUserData();
    this.loadApiTokens();
    this.loadActiveSessions();
    this.loadAnalyticsPreferences();
  }

  initializeForms() {
    this.profileForm = this.fb.group({
      firstname: ['', Validators.required],
      lastname: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      bio: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    this.apiTokenForm = this.fb.group({
      name: ['', Validators.required]
    });
    
    // Analytics form will be initialized in loadAnalyticsPreferences
    this.analyticsForm = this.fb.group({});
  }

  passwordMatchValidator(form: FormGroup) {
    const newPassword = form.get('newPassword')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  loadUserData() {
    const userData = this.authService.getUserData();
    if (userData) {
      this.user.set(userData);
      this.profileForm.patchValue(userData);
    }
  }

  loadApiTokens() {
    const userId = this.user()?._id;
    if (userId) {
      this.http.get<ApiToken[]>(`${environment.apiUrl}/users/${userId}/api-tokens`).subscribe({
        next: (tokens) => this.apiTokens.set(tokens),
        error: (error) => console.error('Failed to load API tokens:', error)
      });
    }
  }

  loadActiveSessions() {
    const userId = this.user()?._id;
    if (userId) {
      this.http.get<ActiveSession[]>(`${environment.apiUrl}/users/${userId}/sessions`).subscribe({
        next: (sessions) => this.activeSessions.set(sessions),
        error: (error) => console.error('Failed to load sessions:', error)
      });
    }
  }

  saveProfile() {
    if (this.profileForm.valid) {
      this.loading.set(true);
      const userId = this.user()?._id;
      
      this.http.put(`${environment.apiUrl}/users/${userId}/profile`, this.profileForm.value).subscribe({
        next: (response) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'Profile Updated',
            detail: 'Your profile has been updated successfully'
          });
          
          // Update local user data
          const updatedUser = { ...this.user(), ...this.profileForm.value };
          this.user.set(updatedUser);
          this.authService.updateUserData(updatedUser);
        },
        error: (error) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Update Failed',
            detail: error.error?.message || 'Failed to update profile'
          });
        }
      });
    }
  }

  changePassword() {
    if (this.passwordForm.valid) {
      this.loading.set(true);
      const userId = this.user()?._id;
      
      this.http.put(`${environment.apiUrl}/users/${userId}/password`, {
        currentPassword: this.passwordForm.value.currentPassword,
        newPassword: this.passwordForm.value.newPassword
      }).subscribe({
        next: () => {
          this.loading.set(false);
          this.showChangePasswordDialog.set(false);
          this.passwordForm.reset();
          this.messageService.add({
            severity: 'success',
            summary: 'Password Changed',
            detail: 'Your password has been updated successfully'
          });
        },
        error: (error) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Password Change Failed',
            detail: error.error?.message || 'Failed to change password'
          });
        }
      });
    }
  }

  setup2FA() {
    const userId = this.user()?._id;
    this.http.post(`${environment.apiUrl}/users/${userId}/2fa/setup`, {}).subscribe({
      next: (response: any) => {
        this.qrCode.set(response.qrCode);
        this.backupCodes.set(response.backupCodes);
        this.show2FASetup.set(true);
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Setup Failed',
          detail: 'Failed to setup two-factor authentication'
        });
      }
    });
  }

  createApiToken() {
    if (this.apiTokenForm.valid) {
      const userId = this.user()?._id;
      
      this.http.post(`${environment.apiUrl}/users/${userId}/api-tokens`, this.apiTokenForm.value).subscribe({
        next: (response: any) => {
          this.loadApiTokens();
          this.showApiTokenDialog.set(false);
          this.apiTokenForm.reset();
          this.messageService.add({
            severity: 'success',
            summary: 'Token Created',
            detail: 'API token created successfully'
          });
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Creation Failed',
            detail: 'Failed to create API token'
          });
        }
      });
    }
  }

  revokeApiToken(tokenId: string) {
    const userId = this.user()?._id;
    
    this.http.delete(`${environment.apiUrl}/users/${userId}/api-tokens/${tokenId}`).subscribe({
      next: () => {
        this.loadApiTokens();
        this.messageService.add({
          severity: 'success',
          summary: 'Token Revoked',
          detail: 'API token has been revoked'
        });
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Revocation Failed',
          detail: 'Failed to revoke API token'
        });
      }
    });
  }

  revokeSession(sessionId: string) {
    const userId = this.user()?._id;
    
    this.http.delete(`${environment.apiUrl}/users/${userId}/sessions/${sessionId}`).subscribe({
      next: () => {
        this.loadActiveSessions();
        this.messageService.add({
          severity: 'success',
          summary: 'Session Revoked',
          detail: 'Session has been terminated'
        });
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Revocation Failed',
          detail: 'Failed to revoke session'
        });
      }
    });
  }

  exportData() {
    const userId = this.user()?._id;
    
    this.http.post(`${environment.apiUrl}/users/${userId}/export-data`, {}, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `simpletrack-data-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
        
        this.messageService.add({
          severity: 'success',
          summary: 'Data Exported',
          detail: 'Your data has been exported successfully'
        });
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Export Failed',
          detail: 'Failed to export your data'
        });
      }
    });
  }

  deleteAccount() {
    const userId = this.user()?._id;
    
    this.http.delete(`${environment.apiUrl}/users/${userId}/account`).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Account Deleted',
          detail: 'Your account has been deleted successfully'
        });
        
        setTimeout(() => {
          this.authService.signout();
          window.location.href = '/';
        }, 2000);
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Deletion Failed',
          detail: error.error?.message || 'Failed to delete account'
        });
      }
    });
  }

  onAvatarUpload(event: any) {
    const file = event.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('avatar', file);
      
      const userId = this.user()?._id;
      this.http.post(`${environment.apiUrl}/users/${userId}/avatar`, formData).subscribe({
        next: (response: any) => {
          const currentUser = this.user();
          if (currentUser) {
            const updatedUser = { ...currentUser, avatar: response.avatarUrl };
            this.user.set(updatedUser);
            this.authService.updateUserData(updatedUser);
          }
          
          this.messageService.add({
            severity: 'success',
            summary: 'Avatar Updated',
            detail: 'Your profile picture has been updated'
          });
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Upload Failed',
            detail: 'Failed to update profile picture'
          });
        }
      });
    }
  }

  getUserInitials(): string {
    const user = this.user();
    if (user) {
      return `${user.firstname?.[0] || ''}${user.lastname?.[0] || ''}`.toUpperCase();
    }
    return '';
  }

  getSessionSeverity(session: ActiveSession): 'success' | 'info' {
    return session.isCurrent ? 'success' : 'info';
  }

  getTokenStatusSeverity(token: ApiToken): 'success' | 'danger' {
    return token.isActive ? 'success' : 'danger';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleString();
  }

  loadAnalyticsPreferences() {
    // Get user plan (fallback to 'free' if not available)
    const userData = this.authService.getUserData();
    this.userPlan = userData?.plan || 'free';
    
    // Get available features for the plan
    this.availableFeatures = PLAN_FEATURES[this.userPlan] || PLAN_FEATURES['free'];
    
    // Load existing preferences from localStorage
    const savedPreferences = localStorage.getItem('analytics_preferences');
    let currentPreferences: string[] = [];
    let preferencesObject: {[key: string]: boolean} = {};
    
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences);
        
        // Handle both old array format and new object format
        if (Array.isArray(parsed)) {
          // Old format: array of enabled features
          currentPreferences = parsed;
          
          // Convert to new object format for storage
          this.availableFeatures.forEach(feature => {
            preferencesObject[feature] = parsed.includes(feature);
          });
          
          // Save in new format
          localStorage.setItem('analytics_preferences', JSON.stringify(preferencesObject));
        } else if (typeof parsed === 'object' && parsed !== null) {
          // New format: object with feature keys and boolean values
          preferencesObject = parsed;
          currentPreferences = Object.keys(parsed).filter(key => parsed[key] === true);
        }
      } catch (e) {
        console.warn('Failed to parse analytics preferences from localStorage');
      }
    }
    
    // If no preferences found, default to all available features enabled
    if (currentPreferences.length === 0) {
      currentPreferences = [...this.availableFeatures];
      this.availableFeatures.forEach(feature => {
        preferencesObject[feature] = true;
      });
    }
    
    // Filter to only include features available in current plan
    currentPreferences = currentPreferences.filter(feature => 
      this.availableFeatures.includes(feature)
    );
    
    this.enabledFeatures.set(currentPreferences);
    
    // Build form controls for available features
    const formControls: any = {};
    this.availableFeatures.forEach(feature => {
      // Use preferencesObject if available, otherwise check currentPreferences array
      const isEnabled = preferencesObject[feature] !== undefined 
        ? preferencesObject[feature] 
        : currentPreferences.includes(feature);
      formControls[feature] = [isEnabled];
    });
    
    this.analyticsForm = this.fb.group(formControls);
  }

  saveAnalyticsPreferences() {
    if (this.analyticsForm.valid) {
      this.loading.set(true);
      
      // Get form value (already has boolean values for each feature)
      const formValue = this.analyticsForm.value;
      
      // Get enabled features for the signal (array format)
      const enabledFeatures = Object.keys(formValue)
        .filter(key => formValue[key] === true);
      
      // Save to localStorage
      localStorage.setItem('analytics_preferences', JSON.stringify(formValue));
      
      // Update the signal
      this.enabledFeatures.set(enabledFeatures);
      
      // Notify analytics SDK if it exists (use STKAnalytics global)
      if ((window as any).STKAnalytics && (window as any).STKAnalytics.updatePreferences) {
        (window as any).STKAnalytics.updatePreferences(formValue);
      }
      
      this.loading.set(false);
      this.messageService.add({
        severity: 'success',
        summary: 'Preferences Saved',
        detail: 'Your analytics tracking preferences have been updated'
      });
    }
  }

  resetToDefaults() {
    // Enable all available features by default
    const defaultPreferences = [...this.availableFeatures];
    
    // Update form
    this.availableFeatures.forEach(feature => {
      this.analyticsForm.get(feature)?.setValue(true);
    });
    
    this.enabledFeatures.set(defaultPreferences);
    
    this.messageService.add({
      severity: 'info',
      summary: 'Reset Complete',
      detail: 'Analytics preferences have been reset to defaults (all features enabled)'
    });
  }

  setActiveTab(tab: string): void {
    this.activeTab.set(tab);
  }
}