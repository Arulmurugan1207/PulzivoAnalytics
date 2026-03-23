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
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';

import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

// Plan feature access map matching the analytics SDK
const PLAN_FEATURES: Record<string, string[]> = {
  free: ['page_views', 'clicks', 'custom_events'],
  starter: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'utm_attribution', 'custom_events'],
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
  plan?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
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
    TextareaModule,
    ToastModule,
    TagModule,
    DialogModule,
    DividerModule,
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
  analyticsForm!: FormGroup;

  // Tab state
  activeTab = signal('profile');
  showDeleteAccountDialog = signal(false);
  showPasswordForm = signal(false);

  // Delete Account
  deleteConfirmation = '';

  // Password strength (0-4)
  passwordStrength = signal(0);

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
    this.loadAnalyticsPreferences();
    // Track password strength as user types
    this.passwordForm.get('newPassword')?.valueChanges.subscribe(value => {
      this.passwordStrength.set(this.computePasswordStrength(value || ''));
    });
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
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    // Analytics form is built dynamically in loadAnalyticsPreferences()
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
          this.showPasswordForm.set(false);
          this.passwordForm.reset();
          this.passwordStrength.set(0);
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
  exportProfileData() {
    const userData = this.authService.getUserData();
    const analyticsPrefs = localStorage.getItem('analytics_preferences');
    const exportData = {
      profile: {
        firstname: userData?.firstname,
        lastname: userData?.lastname,
        email: userData?.email,
        role: userData?.role,
        plan: userData?.plan,
        createdAt: userData?.createdAt,
      },
      analyticsPreferences: analyticsPrefs ? JSON.parse(analyticsPrefs) : {},
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulzivo-profile-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.messageService.add({
      severity: 'success',
      summary: 'Data Exported',
      detail: 'Your profile and preferences have been exported'
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

  getUserInitials(): string {
    const user = this.user();
    if (user) {
      return `${user.firstname?.[0] || ''}${user.lastname?.[0] || ''}`.toUpperCase();
    }
    return '';
  }

  formatDate(date: string): string {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  }

  // ── Analytics Preferences ────────────────────────────────────────────────

  get lockedFeatures(): string[] {
    return Object.keys(FEATURE_DESCRIPTIONS).filter(
      feature => !this.availableFeatures.includes(feature)
    );
  }

  get proFeatures(): string[] {
    return PLAN_FEATURES['pro'].filter(f => !PLAN_FEATURES['starter'].includes(f));
  }

  get enterpriseOnlyFeatures(): string[] {
    return PLAN_FEATURES['enterprise'].filter(f => !PLAN_FEATURES['pro'].includes(f));
  }

  getFeatureMinPlan(feature: string): string {
    if (PLAN_FEATURES['free'].includes(feature)) return 'free';
    if (PLAN_FEATURES['starter'].includes(feature)) return 'starter';
    if (PLAN_FEATURES['pro'].includes(feature)) return 'pro';
    return 'enterprise';
  }

  loadAnalyticsPreferences() {
    // Owners always have enterprise access regardless of the stored plan value
    const userData = this.authService.getUserData();
    const isOwner = userData?.role === 'owner';
    this.userPlan = isOwner ? 'enterprise' : (userData?.plan || 'free');

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
      const formValue = this.analyticsForm.value;
      const enabledFeatures = Object.keys(formValue).filter(key => formValue[key] === true);

      localStorage.setItem('analytics_preferences', JSON.stringify(formValue));
      this.enabledFeatures.set(enabledFeatures);

      if ((window as any).PulzivoAnalytics?.updatePreferences) {
        (window as any).PulzivoAnalytics.updatePreferences(formValue);
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
    this.availableFeatures.forEach(feature => {
      this.analyticsForm.get(feature)?.setValue(true);
    });
    this.enabledFeatures.set([...this.availableFeatures]);
    this.messageService.add({
      severity: 'info',
      summary: 'Reset Complete',
      detail: 'Analytics preferences reset — all available features enabled'
    });
  }

  // ── Password Strength ────────────────────────────────────────────────────

  computePasswordStrength(password: string): number {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  }

  getPasswordStrengthLabel(): string {
    const s = this.passwordStrength();
    if (s <= 1) return 'weak';
    if (s === 2) return 'fair';
    if (s === 3) return 'good';
    return 'strong';
  }

  setActiveTab(tab: string): void {
    this.activeTab.set(tab);
  }
}