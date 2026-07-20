import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError, of, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ApiKey {
  _id?: string;
  apiKey: string;
  name: string;
  description?: string;
  isActive: boolean;
  environment?: 'development' | 'production';
  createdAt: Date;
  limits?: {
    daily: number;
    monthly: number;
  };
  allowedDomains?: string[];
  userId?: string;
}

export interface ApiKeysResponse {
  apiKeys: ApiKey[];
  summary: {
    totalKeys: number;
    activeKeys: number;
    archivedKeys: number;
    keysCreatedThisMonth: number;
    totalKeysCreated: number;
  };
}

export interface ApiKeyUsage {
  apiKey: string;
  limits: { daily: number; monthly: number };
  usage: {
    daily: number;
    weekly: number;
    monthly: number;
    total: number;
  };
  lastUsed?: Date;
  allowedDomains?: string[];
}

const SELECTED_API_KEY_STORAGE = 'selectedApiKey';

@Injectable({
  providedIn: 'root'
})
export class ApiKeysService {
  private baseUrl = `${environment.apiUrl}/api-keys`;
  private selectedEnvironment: 'development' | 'production' = 'production';

  private selectedApiKeySubject = new BehaviorSubject<string | null>(this.readStoredApiKey());
  private availableApiKeysSubject = new BehaviorSubject<ApiKey[]>([]);
  private keysLoadedSubject = new BehaviorSubject<boolean>(false);

  /** Currently selected API key (persisted in localStorage). */
  readonly selectedApiKey$ = this.selectedApiKeySubject.asObservable();
  /** Active API keys available to the signed-in user. */
  readonly availableApiKeys$ = this.availableApiKeysSubject.asObservable();
  /** True after the first successful/failed keys load attempt. */
  readonly keysLoaded$ = this.keysLoadedSubject.asObservable();

  private loadInFlight: Observable<ApiKey[]> | null = null;

  constructor(private http: HttpClient) {}

  createApiKey(name: string, description: string, limits?: { daily: number; monthly: number }, allowedDomains?: string[], environment: 'development' | 'production' = 'production'): Observable<ApiKey> {
    const body: any = { name, description, environment };
    if (limits) {
      body.limits = limits;
    }
    if (allowedDomains && allowedDomains.length > 0) {
      body.allowedDomains = allowedDomains;
    }
    return this.http.post<ApiKey>(this.baseUrl, body).pipe(
      tap(() => {
        // Refresh shared list after creating a key
        this.loadAvailableApiKeys(true).subscribe();
      })
    );
  }

  getApiKeys(environment?: 'development' | 'production'): Observable<ApiKeysResponse> {
    const params = environment ? `?environment=${environment}` : '';
    return this.http.get<ApiKeysResponse>(`${this.baseUrl}${params}`);
  }

  /**
   * Load active API keys into shared state and restore the last selected key
   * from localStorage when still valid. Safe to call from multiple pages.
   */
  loadAvailableApiKeys(force = false): Observable<ApiKey[]> {
    if (!force && this.keysLoadedSubject.value) {
      return of(this.availableApiKeysSubject.value);
    }
    if (!force && this.loadInFlight) {
      return this.loadInFlight;
    }

    this.loadInFlight = this.getApiKeys().pipe(
      map((response) => (response.apiKeys || []).filter((k) => k.isActive !== false)),
      tap((keys) => {
        this.availableApiKeysSubject.next(keys);
        this.resolveSelectedApiKey(keys);
        this.keysLoadedSubject.next(true);
        this.loadInFlight = null;
      }),
      catchError(() => {
        this.availableApiKeysSubject.next([]);
        this.setSelectedApiKey(null);
        this.keysLoadedSubject.next(true);
        this.loadInFlight = null;
        return of([] as ApiKey[]);
      })
    );

    return this.loadInFlight;
  }

  updateApiKey(apiKey: string, updates: Partial<ApiKey>): Observable<ApiKey> {
    return this.http.put<ApiKey>(`${this.baseUrl}/${apiKey}`, updates).pipe(
      tap(() => this.loadAvailableApiKeys(true).subscribe())
    );
  }

  archiveApiKey(apiKey: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/${apiKey}/archive`, {}).pipe(
      tap(() => this.loadAvailableApiKeys(true).subscribe())
    );
  }

  restoreApiKey(apiKey: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/${apiKey}/restore`, {}).pipe(
      tap(() => this.loadAvailableApiKeys(true).subscribe())
    );
  }

  getApiKeyUsage(apiKey: string): Observable<ApiKeyUsage> {
    return this.http.get<ApiKeyUsage>(`${this.baseUrl}/${apiKey}/usage`);
  }

  // Environment management methods
  setSelectedEnvironment(environment: 'development' | 'production'): void {
    this.selectedEnvironment = environment;
  }

  getSelectedEnvironment(): 'development' | 'production' {
    return this.selectedEnvironment;
  }

  // API Key selection methods
  setSelectedApiKey(apiKey: string | null): void {
    const next = apiKey || null;
    if (this.selectedApiKeySubject.value === next) {
      // Still ensure storage stays in sync
      if (next) {
        localStorage.setItem(SELECTED_API_KEY_STORAGE, next);
      } else {
        localStorage.removeItem(SELECTED_API_KEY_STORAGE);
      }
      return;
    }

    this.selectedApiKeySubject.next(next);
    if (next) {
      localStorage.setItem(SELECTED_API_KEY_STORAGE, next);
    } else {
      localStorage.removeItem(SELECTED_API_KEY_STORAGE);
    }
  }

  getSelectedApiKey(): string | null {
    return this.selectedApiKeySubject.value;
  }

  getAvailableApiKeys(): ApiKey[] {
    return this.availableApiKeysSubject.value;
  }

  /** Demo mode helper — inject a fake key without hitting the API. */
  setDemoApiKeys(keys: ApiKey[], selectedApiKey: string): void {
    this.availableApiKeysSubject.next(keys);
    this.setSelectedApiKey(selectedApiKey);
    this.keysLoadedSubject.next(true);
  }

  private resolveSelectedApiKey(keys: ApiKey[]): void {
    if (!keys.length) {
      this.setSelectedApiKey(null);
      return;
    }

    const stored = this.getSelectedApiKey() || this.readStoredApiKey();
    const stillValid = stored && keys.some((k) => k.apiKey === stored);
    this.setSelectedApiKey(stillValid ? stored : keys[0].apiKey);
  }

  private readStoredApiKey(): string | null {
    try {
      return localStorage.getItem(SELECTED_API_KEY_STORAGE);
    } catch {
      return null;
    }
  }
}
