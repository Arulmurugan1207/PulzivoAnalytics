import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { APIKey, CreateAPIKeyRequest, APIKeyResponse, UserAPIKeysResponse } from './api-key.model';

@Injectable({
  providedIn: 'root'
})
export class APIKeyManagementService {
  private apiUrl = environment.apiUrl;
  private apiKeysStorageKey = 'user_api_keys';

  constructor(private http: HttpClient) { }

  /**
   * Store API key locally for retrieval
   */
  private storeApiKeyLocally(apiKey: APIKey): void {
    const stored = this.getStoredApiKeys();
    const existingIndex = stored.findIndex(k => k._id === apiKey._id);
    if (existingIndex >= 0) {
      stored[existingIndex] = apiKey;
    } else {
      stored.push(apiKey);
    }
    localStorage.setItem(this.apiKeysStorageKey, JSON.stringify(stored));
  }

  /**
   * Get stored API keys from localStorage
   */
  private getStoredApiKeys(): APIKey[] {
    try {
      const stored = localStorage.getItem(this.apiKeysStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Remove API key from local storage
   */
  private removeStoredApiKey(apiKeyId: string): void {
    const stored = this.getStoredApiKeys();
    const filtered = stored.filter(k => k._id !== apiKeyId);
    localStorage.setItem(this.apiKeysStorageKey, JSON.stringify(filtered));
  }

  /**
   * Create a new API key for the authenticated user
   */
  createAPIKey(apiKeyData: CreateAPIKeyRequest): Observable<APIKeyResponse> {
    // Generate API key and add it to the API key data
    const apiKeyWithGeneratedKey = {
      ...apiKeyData,
      apiKey: null
    };

    return this.http.post<APIKeyResponse>(`${this.apiUrl}/api-keys`, apiKeyWithGeneratedKey).pipe(
      map(response => {
        // Transform the response to match our interface
        if (response.apiKey) {
          const transformedApiKey: APIKey = {
            _id: response.apiKey._id || (response.apiKey as any).id,
            apiKey: response.apiKey.apiKey, // Use the generated API key
            name: response.apiKey.name,
            userId: response.apiKey.userId,
            createdDate: (response.apiKey as any).createdAt || response.apiKey.createdDate,
            description: response.apiKey.description,
            isActive: response.apiKey.isActive !== false
          };
          return { ...response, apiKey: transformedApiKey };
        }
        return response;
      }),
      tap(response => {
        console.log('API Key created:', response.apiKey);
        // Store the API key locally for future retrieval
        if (response.apiKey) {
          this.storeApiKeyLocally(response.apiKey);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get all API keys for the authenticated user
   */
  getUserAPIKeys(): Observable<UserAPIKeysResponse> {
    return this.http.get<UserAPIKeysResponse>(`${this.apiUrl}/api-keys`).pipe(
      map(response => {
        // Get locally stored API keys for reference
        const storedApiKeys = this.getStoredApiKeys();

        // Transform the response to match our interface
        if (response.apiKeys && response.apiKeys.length > 0) {
          const transformedApiKeys = response.apiKeys.map(apiKey => {
            // Find the matching stored API key to get the real API key value
            const storedKey = storedApiKeys.find(k => k._id === apiKey._id || k._id === (apiKey as any).id);
            return {
              _id: apiKey._id || (apiKey as any).id,
              apiKey: storedKey?.apiKey || (apiKey as any).apiKey || 'STK-XXXXX', // Use stored API key or fallback
              name: apiKey.name,
              userId: apiKey.userId,
              createdDate: (apiKey as any).createdAt || apiKey.createdDate,
              description: apiKey.description,
              isActive: apiKey.isActive !== false
            };
          });
          return { ...response, apiKeys: transformedApiKeys };
        }
        return response;
      }),
      tap(response => {
        console.log('User API keys:', response.apiKeys);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a specific API key by API key value
   */
  getAPIKey(apiKey: string): Observable<APIKeyResponse> {
    return this.http.get<APIKeyResponse>(`${this.apiUrl}/api-keys/${apiKey}`).pipe(
      map(response => {
        // Transform the response to match our interface
        if (response.apiKey) {
          const transformedApiKey: APIKey = {
            _id: response.apiKey._id || (response.apiKey as any).id,
            apiKey: (response.apiKey as any).apiKey || apiKey, // Use the apiKey from URL if not in response
            name: response.apiKey.name,
            userId: response.apiKey.userId,
            createdDate: (response.apiKey as any).createdAt || response.apiKey.createdDate,
            description: response.apiKey.description,
            isActive: response.apiKey.isActive !== false
          };
          return { ...response, apiKey: transformedApiKey };
        }
        return response;
      }),
      tap(response => {
        console.log('API Key details:', response.apiKey);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update an API key
   */
  updateAPIKey(apiKey: string, updateData: Partial<CreateAPIKeyRequest>): Observable<APIKeyResponse> {
    return this.http.put<APIKeyResponse>(`${this.apiUrl}/api-keys/${apiKey}`, updateData).pipe(
      map(response => {
        // Transform the response to match our interface
        if (response.apiKey) {
          const transformedApiKey: APIKey = {
            _id: response.apiKey._id || (response.apiKey as any).id,
            apiKey: (response.apiKey as any).apiKey || apiKey, // Use the apiKey from URL if not in response
            name: response.apiKey.name,
            userId: response.apiKey.userId,
            createdDate: (response.apiKey as any).createdAt || response.apiKey.createdDate,
            description: response.apiKey.description,
            isActive: response.apiKey.isActive !== false
          };
          return { ...response, apiKey: transformedApiKey };
        }
        return response;
      }),
      tap(response => {
        console.log('API Key updated:', response.apiKey);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Soft delete an API key (mark as deleted but keep data for retention period)
   */
  deleteAPIKey(apiKey: string): Observable<{ status: number; message: string; apiKey: APIKey }> {
    return this.http.delete<{ status: number; message: string; apiKey: APIKey }>(`${this.apiUrl}/api-keys/${apiKey}`).pipe(
      tap(response => {
        console.log('API Key soft deleted:', apiKey);
        // Update the stored API key to mark as deleted
        if (response.apiKey) {
          this.storeApiKeyLocally(response.apiKey);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Permanently delete an API key (hard delete after retention period)
   */
  permanentlyDeleteAPIKey(apiKey: string): Observable<{ status: number; message: string }> {
    return this.http.delete<{ status: number; message: string }>(`${this.apiUrl}/api-keys/${apiKey}/permanent`).pipe(
      tap(response => {
        console.log('API Key permanently deleted:', apiKey);
        // Remove from local storage
        const storedKeys = this.getStoredApiKeys();
        const keyToDelete = storedKeys.find(k => k.apiKey === apiKey);
        if (keyToDelete) {
          this.removeStoredApiKey(keyToDelete._id);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Restore a soft-deleted API key
   */
  restoreAPIKey(apiKey: string): Observable<APIKeyResponse> {
    return this.http.post<APIKeyResponse>(`${this.apiUrl}/api-keys/${apiKey}/restore`, {}).pipe(
      map(response => {
        // Transform the response to match our interface
        if (response.apiKey) {
          const transformedApiKey: APIKey = {
            _id: response.apiKey._id || (response.apiKey as any).id,
            apiKey: (response.apiKey as any).apiKey || apiKey,
            name: response.apiKey.name,
            userId: response.apiKey.userId,
            createdDate: (response.apiKey as any).createdAt || response.apiKey.createdDate,
            description: response.apiKey.description,
            isActive: response.apiKey.isActive !== false,
            isDeleted: response.apiKey.isDeleted || false,
            deletedAt: (response.apiKey as any).deletedAt,
            retentionExpiresAt: (response.apiKey as any).retentionExpiresAt
          };
          return { ...response, apiKey: transformedApiKey };
        }
        return response;
      }),
      tap(response => {
        console.log('API Key restored:', response.apiKey);
        // Update stored API key
        if (response.apiKey) {
          this.storeApiKeyLocally(response.apiKey);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get archived (soft-deleted) API keys
   */
  getArchivedAPIKeys(): Observable<UserAPIKeysResponse> {
    return this.http.get<UserAPIKeysResponse>(`${this.apiUrl}/api-keys/archived`).pipe(
      map(response => {
        // Get locally stored API keys for reference
        const storedApiKeys = this.getStoredApiKeys();

        // Transform the response to match our interface
        if (response.apiKeys && response.apiKeys.length > 0) {
          const transformedApiKeys = response.apiKeys.map(apiKey => {
            // Find the matching stored API key to get the real API key value
            const storedKey = storedApiKeys.find(k => k._id === apiKey._id || k._id === (apiKey as any).id);
            return {
              _id: apiKey._id || (apiKey as any).id,
              apiKey: storedKey?.apiKey || (apiKey as any).apiKey || 'STK-XXXXX',
              name: apiKey.name,
              userId: apiKey.userId,
              createdDate: (apiKey as any).createdAt || apiKey.createdDate,
              description: apiKey.description,
              isActive: false, // Archived keys are not active
              isDeleted: true,
              deletedAt: (apiKey as any).deletedAt,
              retentionExpiresAt: (apiKey as any).retentionExpiresAt
            };
          });
          return { ...response, apiKeys: transformedApiKeys };
        }
        return response;
      }),
      tap(response => {
        console.log('Archived API keys:', response.apiKeys);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Validate if user has access to an API key
   */
  validateAPIKeyAccess(apiKey: string): Observable<{ status: number; message: string; hasAccess: boolean }> {
    return this.http.get<{ status: number; message: string; hasAccess: boolean }>(`${this.apiUrl}/api-keys/${apiKey}/validate`).pipe(
      tap(response => {
        console.log('API Key access validation:', response);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Generate a unique API key
   */
  generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'STK-';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side or network error
      errorMessage = error.error.message;
    } else {
      // Backend returned an unsuccessful response code
      if (error.error && typeof error.error === 'object' && error.error.message) {
        errorMessage = error.error.message;
      } else if (error.error && typeof error.error === 'string') {
        errorMessage = error.error;
      } else {
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('API Key API Error:', errorMessage);
    return throwError(() => ({ message: errorMessage, status: error.status }));
  }
}