import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-features',
  standalone: true,
  imports: [RouterLink, ButtonModule, TagModule, DividerModule],
  templateUrl: './features.html',
  styleUrl: './features.scss',
})
export class Features {

  categories = [
    {
      label: 'Automatic Tracking',
      icon: 'pi-chart-line',
      features: [
        {
          icon: 'pi-globe',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'Page Views',
          desc: 'Every route change tracked automatically — no manual calls needed.',
          docsSection: 'automatic-tracking', campaign: 'feat-page-views',
        },
        {
          icon: 'pi-mouse',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'Click Tracking',
          desc: 'Capture every click with element tag, text, and page context auto-populated.',
          docsSection: 'automatic-tracking', campaign: 'feat-click-tracking',
        },
        {
          icon: 'pi-arrow-down',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'Scroll Depth',
          desc: 'Track how far users scroll on each page — 25%, 50%, 75%, 100% milestones.',
          docsSection: 'automatic-tracking', campaign: 'feat-scroll-depth',
        },
        {
          icon: 'pi-users',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'Session Tracking',
          desc: 'Unique visitor + session detection built-in. No cookies required.',
          docsSection: 'automatic-tracking', campaign: 'feat-sessions',
        },
      ],
    },
    {
      label: 'Custom Events',
      icon: 'pi-bolt',
      features: [
        {
          icon: 'pi-bolt',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'Custom Events API',
          desc: 'Fire any named event with arbitrary metadata in one line of JavaScript.',
          docsSection: 'custom-events', campaign: 'feat-custom-events',
        },
        {
          icon: 'pi-user',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'User Identification',
          desc: 'Attach your own user IDs and traits to every event for user-level analytics.',
          docsSection: 'user-management', campaign: 'feat-user-id',
        },
        {
          icon: 'pi-megaphone',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'Campaign & Promo Tracking',
          desc: 'Track UTM parameters, referral sources, promo impressions, and clicks.',
          docsSection: 'promo-tracking', campaign: 'feat-promo',
        },
        {
          icon: 'pi-file-edit',
          tag: 'Enterprise', tagSeverity: 'danger' as const,
          title: 'Form Tracking',
          desc: 'Capture form starts, completions, and field interactions automatically.',
          docsSection: 'automatic-tracking', campaign: 'feat-form-tracking',
        },
      ],
    },
    {
      label: 'Performance & Vitals',
      icon: 'pi-gauge',
      features: [
        {
          icon: 'pi-gauge',
          tag: 'Enterprise', tagSeverity: 'danger' as const,
          title: 'Core Web Vitals',
          desc: 'LCP, FID, CLS, and TTFB captured on every page view automatically.',
          docsSection: 'automatic-tracking', campaign: 'feat-web-vitals',
        },
        {
          icon: 'pi-bolt',
          tag: 'Free', tagSeverity: 'success' as const,
          title: '5KB Bundle',
          desc: 'Entire SDK is under 5KB minified + gzipped. Zero impact on your page speed.',
          docsSection: 'getting-started', campaign: 'feat-bundle-size',
        },
        {
          icon: 'pi-exclamation-triangle',
          tag: 'Enterprise', tagSeverity: 'danger' as const,
          title: 'Error Tracking',
          desc: 'Uncaught JS errors and unhandled promise rejections captured with stack traces.',
          docsSection: 'automatic-tracking', campaign: 'feat-error-tracking',
        },
        {
          icon: 'pi-mobile',
          tag: 'Pro', tagSeverity: 'warn' as const,
          title: 'Device & Browser',
          desc: 'Device type, OS, browser, and viewport dimensions reported per event.',
          docsSection: 'automatic-tracking', campaign: 'feat-device',
        },
      ],
    },
    {
      label: 'Privacy & Control',
      icon: 'pi-shield',
      features: [
        {
          icon: 'pi-shield',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'No Cookies · No PII',
          desc: 'GDPR & CCPA compliant by design. No personal data ever stored.',
          docsSection: 'configuration', campaign: 'feat-privacy',
        },
        {
          icon: 'pi-eye-slash',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'Owner Exclusion',
          desc: 'Exclude your own visits with a single flag so your stats stay clean.',
          docsSection: 'owner-exclusion', campaign: 'feat-owner-exclusion',
        },
        {
          icon: 'pi-key',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'API Key Auth',
          desc: 'Every request is authenticated with a scoped API key — no data leakage.',
          docsSection: 'configuration', campaign: 'feat-api-key',
        },
        {
          icon: 'pi-code',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'Debug Mode',
          desc: 'Verbose console output in dev mode. See exactly what events fire and when.',
          docsSection: 'debugging', campaign: 'feat-debug',
        },
      ],
    },
  ];
}
