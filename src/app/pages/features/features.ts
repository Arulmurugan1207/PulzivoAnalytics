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
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'Click Tracking',
          desc: 'Capture clicks with element tag, text, and page context. Included on Free.',
          docsSection: 'automatic-tracking', campaign: 'feat-click-tracking',
        },
        {
          icon: 'pi-arrow-down',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'Scroll Depth',
          desc: 'How far visitors scroll on each page, reported with time on page. Included on Free.',
          docsSection: 'automatic-tracking', campaign: 'feat-scroll-depth',
        },
        {
          icon: 'pi-users',
          tag: 'Starter', tagSeverity: 'info' as const,
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
          tag: 'Free', tagSeverity: 'success' as const,
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
          tag: 'Starter', tagSeverity: 'info' as const,
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
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'Core Web Vitals',
          desc: 'LCP, INP, CLS, FCP and TTFB from real visitors, on every plan including Free.',
          docsSection: 'automatic-tracking', campaign: 'feat-web-vitals',
        },
        {
          icon: 'pi-bolt',
          tag: 'Free', tagSeverity: 'success' as const,
          title: 'About 9KB gzip',
          desc: 'The core SDK is about 9KB minified + gzipped. Plan-only modules (forms, errors, rage clicks) load separately, only when enabled.',
          docsSection: 'getting-started', campaign: 'feat-bundle-size',
        },
        {
          icon: 'pi-exclamation-triangle',
          tag: 'Pro', tagSeverity: 'warn' as const,
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
          title: 'No Cookies · No PII by Default',
          desc: 'No cookies and no personal data collected by default. Signed-in users are identified only if you opt in with IDs you supply.',
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
