import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError, of, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DEMO_API_KEY,
  KeySelectionState,
  SELECTED_API_KEY_STORAGE,
  applyLoadedKeys,
  enterDemo,
  initialSelection,
  isDemoApiKey,
  leaveDemo,
  selectKey,
  storedKeyShouldBeRemoved,
} from './api-key-selection';

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

@Injectable({
  providedIn: 'root'
})
export class ApiKeysService {
  private baseUrl = `${environment.apiUrl}/api-keys`;
  private selectedEnvironment: 'development' | 'production' = 'production';

  /** Real selection plus an in-memory demo overlay. Demo never writes localStorage. */
  private selection: KeySelectionState = initialSelection(null);

  private selectedApiKeySubject = new BehaviorSubject<string | null>(null);
  private availableApiKeysSubject = new BehaviorSubject<ApiKey[]>([]);
  private keysLoadedSubject = new BehaviorSubject<boolean>(false);

  /** Currently selected API key (persisted in localStorage). */
  readonly selectedApiKey$ = this.selectedApiKeySubject.asObservable();
  /** Active API keys available to the signed-in user. */
  readonly availableApiKeys$ = this.availableApiKeysSubject.asObservable();
  /** True after the first successful/failed keys load attempt. */
  readonly keysLoaded$ = this.keysLoadedSubject.asObservable();

  private loadInFlight: Observable<ApiKey[]> | null = null;

  constructor(private http: HttpClient) {
    const stored = this.readRawStoredKey();
    // A previous /demo visit may have saved DEMO-KEY over the real site. Drop only that entry.
    if (storedKeyShouldBeRemoved(stored)) {
      this.writeStored(null);
    }
    this.selection = initialSelection(stored);
    this.publish();
  }

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
    // Callers want the signed-in sites. Park any demo overlay first so it cannot satisfy the cache.
    this.endDemoSession();
    if (!force && this.selection.loaded && !this.selection.demo) {
      return of(this.availableApiKeysSubject.value);
    }
    if (!force && this.loadInFlight) {
      return this.loadInFlight;
    }

    this.loadInFlight = this.getApiKeys().pipe(
      map((response) => (response.apiKeys || []).filter((k) => k.isActive !== false && !isDemoApiKey(k.apiKey))),
      tap((keys) => {
        this.commit(applyLoadedKeys(this.selection, keys));
        this.loadInFlight = null;
      }),
      catchError(() => {
        // Keep the current real site. A failed refresh must not erase the saved selection.
        this.selection = { ...this.selection, loaded: true };
        this.keysLoadedSubject.next(true);
        this.loadInFlight = null;
        return of(this.availableApiKeysSubject.value);
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
    this.commit(selectKey(this.selection, apiKey || null));
  }

  getSelectedApiKey(): string | null {
    return this.selectedApiKeySubject.value;
  }

  getAvailableApiKeys(): ApiKey[] {
    return this.availableApiKeysSubject.value;
  }

  /**
   * Show the public demo site in memory only.
   * The signed-in selection stays parked and localStorage is not written.
   */
  setDemoApiKeys(keys: ApiKey[], selectedApiKey: string = DEMO_API_KEY): void {
    this.commit(enterDemo(this.selection, keys, selectedApiKey));
  }

  /** Restore the site that was selected before /demo. Safe to call more than once. */
  endDemoSession(): void {
    if (!this.selection.demo) return;
    this.commit(leaveDemo(this.selection));
  }

  private commit(next: { state: KeySelectionState; persist: string | null | undefined }): void {
    this.selection = next.state;
    if (next.persist !== undefined) this.writeStored(next.persist);
    this.publish();
  }

  private publish(): void {
    this.selectedApiKeySubject.next(this.selection.selected);
    this.availableApiKeysSubject.next(this.selection.keys as ApiKey[]);
    this.keysLoadedSubject.next(this.selection.loaded);
  }

  private readRawStoredKey(): string | null {
    try {
      return localStorage.getItem(SELECTED_API_KEY_STORAGE);
    } catch {
      return null;
    }
  }

  /** `null` removes only the selected-site entry. Other settings are left alone. */
  private writeStored(value: string | null): void {
    try {
      if (value && !isDemoApiKey(value)) {
        localStorage.setItem(SELECTED_API_KEY_STORAGE, value);
      } else {
        localStorage.removeItem(SELECTED_API_KEY_STORAGE);
      }
    } catch {
      // Private mode or a blocked storage API should not break the dashboard.
    }
  }
}
