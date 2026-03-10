import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-use-cases',
  standalone: true,
  imports: [RouterLink, ButtonModule, TagModule],
  templateUrl: './use-cases.html',
  styleUrl: './use-cases.scss',
})
export class UseCases {

  useCases = [
    {
      icon: 'pi-chart-line',
      tag: 'Free',
      tagSeverity: 'success' as const,
      title: 'Page Analytics',
      description: 'Automatically track every page view, session duration, and bounce rate with zero configuration. Understand where visitors come from and where they drop off.',
      highlights: ['Page views & sessions', 'Bounce rate', 'Navigation paths', 'Time on page'],
      docsSection: 'automatic-tracking',
      campaign: 'uc-page-analytics',
    },
    {
      icon: 'pi-bolt',
      tag: 'Pro',
      tagSeverity: 'warn' as const,
      title: 'Custom Events',
      description: 'Track any user action — signups, purchases, form submissions, video plays. One line of JavaScript fires a fully attributed event.',
      highlights: ['Button clicks', 'Form submissions', 'Purchases & conversions', 'Any custom action'],
      docsSection: 'custom-events',
      campaign: 'uc-custom-events',
    },
    {
      icon: 'pi-user',
      tag: 'Pro',
      tagSeverity: 'warn' as const,
      title: 'User Identification',
      description: 'Attach your own user IDs and metadata to every event. Follow individual user journeys and understand your most engaged users.',
      highlights: ['Link events to users', 'Custom user metadata', 'Session stitching', 'Cohort-ready data'],
      docsSection: 'user-management',
      campaign: 'uc-user-management',
    },
    {
      icon: 'pi-megaphone',
      tag: 'Pro',
      tagSeverity: 'warn' as const,
      title: 'Campaign & UTM Tracking',
      description: 'See exactly which campaigns, referrers, and UTM parameters drive traffic and conversions — built-in attribution, no extra configuration.',
      highlights: ['UTM source / medium / campaign', 'Referrer attribution', 'Promo impressions & clicks', 'Source reports'],
      docsSection: 'promo-tracking',
      campaign: 'uc-campaigns',
    },
    {
      icon: 'pi-gauge',
      tag: 'Enterprise',
      tagSeverity: 'danger' as const,
      title: 'Performance Monitoring',
      description: 'Core Web Vitals captured automatically — LCP, FID, CLS, TTFB. Correlate performance with user behaviour and conversion rates.',
      highlights: ['Core Web Vitals', 'Page load timings', 'Time to interactive', 'Performance trends'],
      docsSection: 'automatic-tracking',
      campaign: 'uc-performance',
    },
    {
      icon: 'pi-eye-slash',
      tag: 'Free',
      tagSeverity: 'success' as const,
      title: 'Owner Exclusion',
      description: 'Keep your analytics clean by excluding your own visits with a single flag. Localhost is excluded automatically.',
      highlights: ['Cookie-based exclusion', 'Localhost auto-excluded', 'Admin bypass', 'Accurate data only'],
      docsSection: 'owner-exclusion',
      campaign: 'uc-owner-exclusion',
    },
  ];
}
