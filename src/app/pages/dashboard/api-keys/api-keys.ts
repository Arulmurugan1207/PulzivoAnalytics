import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { MessageModule } from 'primeng/message';
import { ApiKeysService, ApiKey, ApiKeyUsage } from '../../../services/api-keys.service';
import { AuthService } from '../../../services/auth.service';

const APP_OWNER_EMAIL = 'arul007rajmathy@gmail.com';

interface UserPlan {
  type: string;
  apiKeyLimit: number | 'unlimited';
  price: number;
}

@Component({
  selector: 'app-dashboard-api-keys',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    TableModule, ButtonModule, DialogModule,
    InputTextModule, TextareaModule, TagModule,
    ProgressBarModule, TooltipModule, ToggleButtonModule,
    MessageModule
  ],
  templateUrl: './api-keys.html',
  styleUrl: './api-keys.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardApiKeys implements OnInit {
  apiKeys: ApiKey[] = [];
  archivedKeys: ApiKey[] = [];
  isLoading = false;
  isSubmitting = false;
  showArchivedKeys = false;
  copiedApiKey: string | null = null;

  // Dialogs
  showCreateDialog = false;
  showEditDialog = false;
  showUsageDialog = false;

  // Forms
  createForm: FormGroup;
  editForm: FormGroup;
  selectedKey: ApiKey | null = null;
  usage: ApiKeyUsage | null = null;

  // Plan
  userPlan: UserPlan = { type: 'free', apiKeyLimit: 1, price: 0 };
  currentUsage = 0;
  totalKeysCreated = 0;
  archivedKeysCount = 0;
  keysCreatedThisMonth = 0;
  archiveErrorMsg: string | null = null;
  createSuccessMsg: string | null = null;

  // Environment
  selectedEnvironment: 'development' | 'production' = 'production';

  get environmentLabel(): string {
    return this.selectedEnvironment === 'production' ? 'Production' : 'Development';
  }

  get isProduction(): boolean {
    return this.selectedEnvironment === 'production';
  }

  // Must match canonical plan names in backend planPolicy.js (free | pro | enterprise)
  planUsageLimits: Record<string, { daily: number | null; monthly: number | null }> = {
    'free':       { daily: 1000,  monthly: 10000  },
    'pro':        { daily: 50000, monthly: 500000 },
    'enterprise': { daily: null,  monthly: null   },
  };

  constructor(
    private fb: FormBuilder,
    private apiKeysService: ApiKeysService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      description: ['', [Validators.maxLength(200)]],
      allowedDomains: ['']
    });

    this.editForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      description: ['', [Validators.maxLength(200)]],
      allowedDomains: ['']
    });
  }

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
      return;
    }

    const storedEnv = localStorage.getItem('selectedEnvironment') as 'development' | 'production';
    this.selectedEnvironment = storedEnv || 'production';
    this.apiKeysService.setSelectedEnvironment(this.selectedEnvironment);

    // Load user plan from auth
    const user = this.authService.getUserData();
    const isOwner = user?.email === APP_OWNER_EMAIL || user?.role === 'owner';
    const plan = isOwner ? 'enterprise' : (user?.plan || 'free');
    const planLimits: Record<string, number | 'unlimited'> = { free: 1, pro: 5, enterprise: 'unlimited' };
    this.userPlan = { type: plan, apiKeyLimit: planLimits[plan] ?? 1, price: 0 };

    this.loadApiKeys();
  }

  loadApiKeys(): void {
    this.isLoading = true;
    this.apiKeysService.getApiKeys(this.selectedEnvironment).subscribe({
      next: (response) => {
        this.apiKeys = response.apiKeys.filter(key => key.isActive !== false);
        this.archivedKeys = response.apiKeys.filter(key => key.isActive === false);
        if (response.summary) {
          this.currentUsage = response.summary.activeKeys;
          this.totalKeysCreated = response.summary.totalKeysCreated;
          this.archivedKeysCount = response.summary.archivedKeys;
          this.keysCreatedThisMonth = response.summary.keysCreatedThisMonth;
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.isLoading = false; this.cdr.markForCheck(); }
    });
  }

  // Environment
  toggleEnvironment(): void {
    this.selectedEnvironment = this.selectedEnvironment === 'development' ? 'production' : 'development';
    localStorage.setItem('selectedEnvironment', this.selectedEnvironment);
    this.apiKeysService.setSelectedEnvironment(this.selectedEnvironment);
    this.archiveErrorMsg = null;
    this.createSuccessMsg = null;
    this.updateDomainValidators();
    this.loadApiKeys();
  }

  private updateDomainValidators(): void {
    const ctrl = this.createForm.get('allowedDomains');
    if (this.isProduction) {
      ctrl?.setValidators([Validators.required, this.singleDomainValidator]);
    } else {
      ctrl?.clearValidators();
    }
    ctrl?.updateValueAndValidity();
  }

  private singleDomainValidator(control: import('@angular/forms').AbstractControl) {
    const val = control.value?.trim();
    if (!val) return null; // required validator handles empty
    const domains = val.split(',').map((d: string) => d.trim()).filter((d: string) => d.length > 0);
    return domains.length > 1 ? { singleDomain: true } : null;
  }

  // CRUD
  openCreateDialog(): void {
    if (!this.canCreateMoreKeys()) return;
    this.createForm.reset();
    this.createSuccessMsg = null;
    this.updateDomainValidators();
    this.showCreateDialog = true;
  }

  createApiKey(): void {
    if (!this.createForm.valid) return;
    this.isSubmitting = true;
    const { name, description, allowedDomains } = this.createForm.value;
    const domainsArray = this.parseDomains(allowedDomains);
    const planLimits = this.planUsageLimits[this.userPlan.type] || this.planUsageLimits['free'];
    
    // For enterprise users, don't pass limits (undefined) since they have no limits
    const limits = (planLimits.daily === null || planLimits.monthly === null) 
      ? undefined 
      : { daily: planLimits.daily, monthly: planLimits.monthly };

    this.apiKeysService.createApiKey(name, description, limits, domainsArray, this.selectedEnvironment).subscribe({
      next: (createdKey) => {
        const keyEnvironment = createdKey.environment || this.selectedEnvironment;
        const keyIndex = this.totalKeysCreated + 1;
        const isFirstKey = keyIndex === 1;
        const isFirstProdKey = keyEnvironment === 'production' && !this.apiKeys.some(k => (k.environment || 'production') === 'production');

        if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
          // Compute minutes since signup for activation funnel
          const user = this.authService.getUserData();
          const signupDate = user?.createdDate ? new Date(user.createdDate) : null;
          const minutesSinceSignup = signupDate
            ? Math.round((Date.now() - signupDate.getTime()) / 60000)
            : null;

          (window as any).PulzivoAnalytics('event', 'api_key_created', {
            // Core
            plan:                  this.userPlan.type,
            environment:           keyEnvironment,

            // Activation signals
            key_index:             keyIndex,               // 1 = first ever key (activation)
            is_first_key:          isFirstKey,
            is_first_prod_key:     isFirstProdKey,         // true = went live
            minutes_since_signup:  minutesSinceSignup,     // time-to-activate metric

            // Setup quality signals
            has_domain_restriction: !!(domainsArray && domainsArray.length > 0),
            has_description:        !!(description?.trim()),
            used_default_name:      !name?.trim() || name.trim().toLowerCase() === 'my website',
          });

          // Separate high-value milestone events for funnel segmentation
          if (isFirstKey) {
            (window as any).PulzivoAnalytics('event', 'activation_first_key', {
              plan: this.userPlan.type,
              environment: keyEnvironment,
              minutes_since_signup: minutesSinceSignup,
            });
          }
          if (isFirstProdKey) {
            (window as any).PulzivoAnalytics('event', 'activation_went_live', {
              plan: this.userPlan.type,
              minutes_since_signup: minutesSinceSignup,
            });
          }
        }

        this.createSuccessMsg = `API key created in ${keyEnvironment === 'production' ? 'Production' : 'Development'} environment.`;
        this.loadApiKeys();
        this.showCreateDialog = false;
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: () => { this.isSubmitting = false; this.cdr.markForCheck(); }
    });
  }

  openEditDialog(key: ApiKey): void {
    this.selectedKey = key;
    this.editForm.patchValue({
      name: key.name,
      description: key.description,
      allowedDomains: key.allowedDomains?.join(', ') || ''
    });
    this.showEditDialog = true;
  }

  updateApiKey(): void {
    if (!this.editForm.valid || !this.selectedKey) return;
    this.isSubmitting = true;
    const { name, description, allowedDomains } = this.editForm.value;
    const domainsArray = this.parseDomains(allowedDomains);

    this.apiKeysService.updateApiKey(this.selectedKey.apiKey, {
      name, description, allowedDomains: domainsArray
    }).subscribe({
      next: () => {
        this.loadApiKeys();
        this.showEditDialog = false;
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: () => { this.isSubmitting = false; this.cdr.markForCheck(); }
    });
  }

  archiveApiKey(apiKey: string): void {
    this.archiveErrorMsg = null;
    this.apiKeysService.archiveApiKey(apiKey).subscribe({
      next: () => this.loadApiKeys(),
      error: (err) => {
        this.archiveErrorMsg = err?.error?.message || 'Failed to archive key. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  restoreKey(apiKey: string): void {
    this.archiveErrorMsg = null;
    this.apiKeysService.restoreApiKey(apiKey).subscribe({
      next: () => this.loadApiKeys(),
      error: (err) => {
        this.archiveErrorMsg = err?.error?.message || 'Failed to restore key. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  viewUsage(apiKey: string): void {
    this.usage = null;
    this.apiKeysService.getApiKeyUsage(apiKey).subscribe({
      next: (usage) => {
        this.usage = usage;
        this.showUsageDialog = true;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Error fetching usage', err)
    });
  }

  copyApiKey(apiKey: string): void {
    navigator.clipboard.writeText(apiKey).then(() => {
      this.copiedApiKey = apiKey;
      setTimeout(() => this.copiedApiKey = null, 2000);
    });
  }

  // Plan
  canCreateMoreKeys(): boolean {
    // Only active keys count toward the limit — archived slots can be recycled
    return this.userPlan.apiKeyLimit === 'unlimited' || this.currentUsage < (this.userPlan.apiKeyLimit as number);
  }

  getPlanLimitDisplay(): string {
    return this.userPlan.apiKeyLimit === 'unlimited' ? '∞' : String(this.userPlan.apiKeyLimit);
  }

  getDisplayedKeys(): ApiKey[] {
    return this.showArchivedKeys ? [...this.apiKeys, ...this.archivedKeys] : this.apiKeys;
  }

  getUsagePercent(used: number, limit: number): number {
    return limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }

  getUsageSeverity(used: number, limit: number): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | undefined {
    const pct = this.getUsagePercent(used, limit);
    if (pct >= 90) return 'danger';
    if (pct >= 75) return 'warn';
    return 'success';
  }

  private parseDomains(raw: string): string[] | undefined {
    if (!raw?.trim()) return undefined;
    return raw.split(',').map(d => d.trim()).filter(d => d.length > 0);
  }
}
