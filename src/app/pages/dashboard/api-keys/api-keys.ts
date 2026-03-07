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
  userPlan: UserPlan = { type: 'free', apiKeyLimit: 3, price: 0 };
  currentUsage = 0;
  totalKeysCreated = 0;
  archivedKeysCount = 0;
  keysCreatedThisMonth = 0;

  // Environment
  selectedEnvironment: 'development' | 'production' = 'production';

  planUsageLimits: Record<string, { daily: number | null; monthly: number | null }> = {
    'free': { daily: 1000, monthly: 10000 },
    'starter': { daily: 10000, monthly: 100000 },
    'professional': { daily: 50000, monthly: 500000 },
    'enterprise': { daily: null, monthly: null } // No limits for enterprise
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

    this.loadApiKeys();
  }

  loadApiKeys(): void {
    this.isLoading = true;
    this.apiKeysService.getApiKeys().subscribe({
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
  }

  // CRUD
  openCreateDialog(): void {
    if (!this.canCreateMoreKeys()) return;
    this.createForm.reset();
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

    this.apiKeysService.createApiKey(name, description, limits, domainsArray).subscribe({
      next: () => {
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
    this.apiKeysService.archiveApiKey(apiKey).subscribe({
      next: () => this.loadApiKeys(),
      error: (err) => console.error('Error archiving key', err)
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
