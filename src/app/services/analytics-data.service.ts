import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, interval } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { AnalyticsAPIService, DateRange } from './analytics-api.service';
import { ApiKeysService } from './api-keys.service';
import { environment } from '../../environments/environment';

export type { DateRange };

export interface AnalyticsMetrics {
  liveVisitors: number;
  totalPageViews: number;
  conversionRate: number;
  bounceRate: number;
  avgSessionDuration: number;
  newVsReturning: {
    new: number;
    returning: number;
  };
  uniqueVisitors?: number;
  avgScrollDepth?: number;
  avgTimeOnPage?: number;
}

export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
  desktopPercentage?: number;
  mobilePercentage?: number;
  tabletPercentage?: number;
}

export interface PageData {
  path: string;
  title?: string;
  views: number;
  percentage: number;
}

export interface GeographicData {
  country: string;
  visitors: number;
  percentage: number;
  flag: string;
}

export interface PageViewsTrendData {
  date: string;
  pageViews: number;
}

export interface ConversionFunnel {
  steps: {
    name: string;
    visitors: number;
    conversion: number;
  }[];
  labels?: string[];
  values?: number[];
}

export interface RealtimeEvent {
  id: string;
  event_name: string;
  user_id: string;
  timestamp: string;
  data: {
    event_category?: string;
    page: string;
    user_type: string;
    country?: string;
    visit_count?: number;
    time_on_page?: number;
    [key: string]: any;
  };
}

export interface TrafficSource {
  source: string;
  visits: number;
  percentage: number;
}

export interface UtmSource {
  source: string;
  medium: string;
  campaign: string;
  visits: number;
}

export interface BrowserData {
  name: string;
  count: number;
  percentage: number;
}

export interface WebVitalMetric {
  avg: number | null;
  p75: number | null;
  count: number;
  rating: 'good' | 'needs-improvement' | 'poor' | 'no-data';
}

export interface WebVitals {
  LCP: WebVitalMetric;
  FID: WebVitalMetric;
  CLS: WebVitalMetric;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsDataService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private analyticsAPI: AnalyticsAPIService,
    private apiKeysService: ApiKeysService
  ) { }

  /**
   * Send analytics event with API key validation
   */
  sendAnalyticsEvent(eventData: any, apiKey?: string): Observable<any> {
    return this.analyticsAPI.sendAnalyticsEvent(eventData, apiKey);
  }

  /**
   * Get analytics metrics
   */
  getMetrics(dateRange?: DateRange, apiKey?: string): Observable<AnalyticsMetrics> {
    return this.analyticsAPI.getRealtimeMetrics(dateRange).pipe(
      map((data: any) => ({
        liveVisitors: data.liveVisitors || 0,
        totalPageViews: data.totalPageViews || 0,
        conversionRate: data.conversionRate || 0,
        bounceRate: data.bounceRate || 0,
        avgSessionDuration: data.avgSessionDuration || 0,
        newVsReturning: data.newVsReturning || { new: 0, returning: 0 }
      })),
      catchError(() => of({
        liveVisitors: 0,
        totalPageViews: 0,
        conversionRate: 0,
        bounceRate: 0,
        avgSessionDuration: 0,
        newVsReturning: { new: 0, returning: 0 }
      }))
    );
  }

  /**
   * Get device breakdown data
   */
  getDeviceBreakdown(dateRange?: DateRange, apiKey?: string): Observable<DeviceBreakdown> {
    return this.analyticsAPI.getDeviceBreakdown(dateRange).pipe(
      map((data: any) => {
        // Handle new API format: {"devices":[{"device":"Desktop","count":174,"percentage":100}]}
        if (data && data.devices && Array.isArray(data.devices)) {
          const deviceBreakdown: DeviceBreakdown = {
            desktop: 0,
            mobile: 0,
            tablet: 0,
            desktopPercentage: 0,
            mobilePercentage: 0,
            tabletPercentage: 0
          };

          // Transform array format to object format
          data.devices.forEach((deviceData: any) => {
            const deviceName = deviceData.device?.toLowerCase();
            const count = deviceData.count || 0;
            const percentage = deviceData.percentage || 0;

            switch (deviceName) {
              case 'desktop':
                deviceBreakdown.desktop = count;
                deviceBreakdown.desktopPercentage = percentage;
                break;
              case 'mobile':
                deviceBreakdown.mobile = count;
                deviceBreakdown.mobilePercentage = percentage;
                break;
              case 'tablet':
                deviceBreakdown.tablet = count;
                deviceBreakdown.tabletPercentage = percentage;
                break;
            }
          });

          return deviceBreakdown;
        }

        // Fallback for old format or empty data
        return data || {
          desktop: 0,
          mobile: 0,
          tablet: 0,
          desktopPercentage: 0,
          mobilePercentage: 0,
          tabletPercentage: 0
        };
      }),
      catchError(() => of({
        desktop: 0,
        mobile: 0,
        tablet: 0,
        desktopPercentage: 0,
        mobilePercentage: 0,
        tabletPercentage: 0
      }))
    );
  }

  /**
   * Get top pages data with server-side pagination
   */
  getTopPages(dateRange?: DateRange, page = 1, limit = 10): Observable<{ pages: PageData[]; total: number }> {
    return this.analyticsAPI.getTopPages(dateRange, page, limit).pipe(
      map((data: any) => ({
        pages: Array.isArray(data?.pages) ? data.pages : [],
        total: data?.total ?? 0
      })),
      catchError(() => {
        console.warn('Failed to load top pages data');
        return of({ pages: [], total: 0 });
      })
    );
  }

  /**
   * Get geographic data
   */
  getGeographicData(dateRange?: DateRange, apiKey?: string): Observable<GeographicData[]> {
    return this.analyticsAPI.getGeographicData(dateRange).pipe(
      map((data: any) => {
        // Handle new API format: {"geographic": [{"country": "Unknown", "visitors": 172, "percentage": 98.85, "flag": "🏳️"}, ...]}
        if (data && data.geographic && Array.isArray(data.geographic)) {
          return data.geographic;
        }

        // Fallback for old format or empty data
        return Array.isArray(data) ? data : [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Get page views trend data
   */
  getPageViewsTrend(dateRange?: DateRange, period?: string, apiKey?: string): Observable<PageViewsTrendData[]> {
    return this.analyticsAPI.getPageViewsTrend(dateRange, period).pipe(
      map((data: any) => {
        // Handle API format: {"trend":[{"date":"2025-11-30","pageViews":37}],"period":"daily"}
        if (data && data.trend && Array.isArray(data.trend)) {
          return data.trend;
        }

        // Fallback for old format or empty data
        return Array.isArray(data) ? data : [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Get funnel events for a specific step
   */
  getFunnelEvents(stepEvent: string, limit: number = 20): Observable<RealtimeEvent[]> {
    return this.analyticsAPI.getFunnelEvents(stepEvent, limit).pipe(
      map((data: any) => {
        // Handle API format: {"step": "page_view", "eventName": "page_view", "events": [...], "pagination": {...}}
        if (data && data.events && Array.isArray(data.events)) {
          return data.events;
        }

        // Fallback for old format or empty data
        return Array.isArray(data) ? data : [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Get conversion funnel data
   */
  getConversionFunnel(dateRange?: DateRange, apiKey?: string): Observable<ConversionFunnel> {
    return this.analyticsAPI.getConversionFunnel().pipe(
      map((data: any) => {
        // Handle new API format: {"funnel": [{"step": "Page View", "visitors": 34, "conversionRate": 100}, ...]}
        if (data && data.funnel && Array.isArray(data.funnel)) {
          const steps: { name: string; visitors: number; conversion: number }[] = data.funnel.map((stepData: any) => ({
            name: stepData.step || '',
            visitors: stepData.visitors || 0,
            conversion: stepData.conversionRate || 0
          }));

          return {
            steps,
            labels: steps.map(step => step.name),
            values: steps.map(step => step.visitors)
          };
        }

        // Fallback for old format or empty data
        return data || {
          steps: [],
          labels: [],
          values: []
        };
      }),
      catchError(() => of({
        steps: [],
        labels: [],
        values: []
      }))
    );
  }

  /**
   * Get traffic sources / referrers
   */
  getTrafficSources(dateRange?: DateRange): Observable<{ sources: TrafficSource[]; utmSources: UtmSource[]; totalVisits: number }> {
    return this.analyticsAPI.getTrafficSources(dateRange).pipe(
      map((data: any) => ({
        sources: data?.sources || [],
        utmSources: data?.utmSources || [],
        totalVisits: data?.totalVisits || 0
      })),
      catchError(() => of({ sources: [], utmSources: [], totalVisits: 0 }))
    );
  }

  /**
   * Get browser and OS breakdown
   */
  getBrowserBreakdown(dateRange?: DateRange): Observable<{ browsers: BrowserData[]; operatingSystems: BrowserData[] }> {
    return this.analyticsAPI.getBrowserBreakdown(dateRange).pipe(
      map((data: any) => ({
        browsers: data?.browsers || [],
        operatingSystems: data?.operatingSystems || []
      })),
      catchError(() => of({ browsers: [], operatingSystems: [] }))
    );
  }

  /**
   * Get Core Web Vitals
   */
  getWebVitals(dateRange?: DateRange): Observable<WebVitals> {
    const empty: WebVitalMetric = { avg: null, p75: null, count: 0, rating: 'no-data' };
    return this.analyticsAPI.getWebVitals(dateRange).pipe(
      map((data: any) => (data?.vitals || { LCP: empty, FID: empty, CLS: empty }) as WebVitals),
      catchError(() => of({ LCP: empty, FID: empty, CLS: empty } as WebVitals))
    );
  }

  /**
   * Get realtime events stream using SSE (Server-Sent Events)
   */
  getRealtimeEvents(): Observable<RealtimeEvent> {
    return new Observable(observer => {
      const apiKey = this.apiKeysService.getSelectedApiKey();
      if (!apiKey) {
        console.error('[Analytics] No API key selected for live events');
        observer.error('No API key selected');
        return;
      }

      const eventSource = new EventSource(`${this.baseUrl}/analytics/realtime-events?apiKey=${apiKey}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          observer.next(data);
        } catch (error) {
          console.error('[Analytics] Error parsing SSE data:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('[Analytics] SSE connection error:', error);
        eventSource.close();
        observer.error(error);
      };

      console.log('[Analytics] SSE connection established to:', `${this.baseUrl}/analytics/realtime-events`);
      
      // Cleanup on unsubscribe
      return () => {
        console.log('[Analytics] Closing SSE connection');
        eventSource.close();
      };
    });
  }


}
