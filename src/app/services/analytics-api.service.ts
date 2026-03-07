import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { APIKeyManagementService } from './api-key-management.service';
import { UserAPIKeysResponse, APIKey } from './api-key.model';
import { ApiKeysService } from './api-keys.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsAPIService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private apiKeyManagement: APIKeyManagementService,
    private apiKeysService: ApiKeysService
  ) { }

  /**
   * Fetch real analytics data from your backend
   * Replace these endpoints with your actual API endpoints
   */
  getRealtimeMetrics(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of({});
    }
    return this.http.get(`${this.apiUrl}/analytics/metrics?apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of({});
      })
    );
  }

  getPageViewsData(timeRange: string = '7d'): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of([]);
    }
    return this.http.get(`${this.apiUrl}/analytics/page-views?range=${timeRange}&apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of([]);
      })
    );
  }

  getUserEvents(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/analytics/users/${userId}/events`).pipe(
      catchError(() => {
        console.warn('API endpoint not available');
        return of([]);
      })
    );
  }

  getConversionFunnel(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of({ steps: [] });
    }
    return this.http.get(`${this.apiUrl}/analytics/conversion-funnel?apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of({ steps: [] });
      })
    );
  }

  getGeographicData(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of([]);
    }
    return this.http.get(`${this.apiUrl}/analytics/geographic?apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of([]);
      })
    );
  }

  getDeviceBreakdown(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of({});
    }
    return this.http.get(`${this.apiUrl}/analytics/device-breakdown?apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of({});
      })
    );
  }

  getPageViewsTrend(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of([]);
    }
    return this.http.get(`${this.apiUrl}/analytics/page-views-trend?apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of([]);
      })
    );
  }

  getFunnelEvents(stepEvent: string, limit: number = 20): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of([]);
    }
    return this.http.get(`${this.apiUrl}/analytics/funnel-events/${stepEvent}?limit=${limit}&apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of([]);
      })
    );
  }

  getTopPages(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) {
      return of([]);
    }
    return this.http.get(`${this.apiUrl}/analytics/top-pages?apiKey=${selectedApiKey}`).pipe(
      catchError(() => {
        console.warn('API endpoint not available or no API key selected');
        return of([]);
      })
    );
  }

  getTrafficSources(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) return of({});
    return this.http.get(`${this.apiUrl}/analytics/traffic-sources?apiKey=${selectedApiKey}`).pipe(
      catchError(() => of({}))
    );
  }

  getBrowserBreakdown(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) return of({});
    return this.http.get(`${this.apiUrl}/analytics/browser-breakdown?apiKey=${selectedApiKey}`).pipe(
      catchError(() => of({}))
    );
  }

  getWebVitals(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) return of({});
    return this.http.get(`${this.apiUrl}/analytics/web-vitals?apiKey=${selectedApiKey}`).pipe(
      catchError(() => of({}))
    );
  }

  getEventsBreakdown(): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) return of({});
    return this.http.get(`${this.apiUrl}/analytics/events-breakdown?apiKey=${selectedApiKey}`).pipe(
      catchError(() => of({}))
    );
  }

  getEventHistory(page = 1, limit = 50, eventType = '', search = ''): Observable<any> {
    const selectedApiKey = this.apiKeysService.getSelectedApiKey();
    if (!selectedApiKey) return of({ events: [], total: 0, eventTypes: [] });
    const params = new URLSearchParams({ apiKey: selectedApiKey, page: String(page), limit: String(limit) });
    if (eventType) params.set('eventType', eventType);
    if (search) params.set('search', search);
    return this.http.get(`${this.apiUrl}/analytics/event-history?${params}`).pipe(
      catchError(() => of({ events: [], total: 0, eventTypes: [] }))
    );
  }

  /**
   * Validate if user has access to the specified API key
   */
  validateAPIKeyAccess(apiKey: string): Observable<boolean> {
    return this.apiKeyManagement.getUserAPIKeys().pipe(
      map((response: UserAPIKeysResponse) => response.apiKeys.some((apiKeyObj: APIKey) => apiKeyObj.apiKey === apiKey)),
      catchError(() => of(false))
    );
  }

  /**
   * Send analytics event to backend with API key validation
   */
  sendAnalyticsEvent(eventData: any, apiKey?: string): Observable<any> {
    // If apiKey is provided, validate access first
    if (apiKey) {
      return this.validateAPIKeyAccess(apiKey).pipe(
        switchMap(hasAccess => {
          if (!hasAccess) {
            return throwError(() => new Error('Access denied: Invalid API key or key not owned by user'));
          }
          // Add apiKey to event data
          const eventWithApiKey = { ...eventData, apiKey };
          return this.http.post(`${this.apiUrl}/analytics/events`, eventWithApiKey);
        }),
        catchError((error) => {
          console.warn('Failed to send analytics event:', error);
          return of({ success: false, error: error.message });
        })
      );
    } else {
      // No API key validation needed
      return this.http.post(`${this.apiUrl}/analytics/events`, eventData).pipe(
        catchError((error) => {
          console.warn('Failed to send analytics event:', error);
          return of({ success: false, error: error.message });
        })
      );
    }
  }
}