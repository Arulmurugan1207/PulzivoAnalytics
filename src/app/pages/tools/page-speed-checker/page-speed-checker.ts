import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../analytics/conversion';
import { environment } from '../../../../environments/environment';
import {
  normalizePublicUrl,
  pageSpeedEndpoint,
  pageSpeedErrorMessage,
  pageSpeedKey,
  summarizePageSpeed,
  type DeviceStrategy,
  type SpeedReport,
} from '../page-speed';

@Component({
  selector: 'app-page-speed-checker',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './page-speed-checker.html',
  styleUrls: ['../../guides/guide.scss', '../tool.scss'],
})
export class PageSpeedCheckerPage {
  readonly pageSpeedApiKey = pageSpeedKey(environment.pageSpeedApiKey);
  readonly pageSpeedEndpoint = pageSpeedEndpoint;
  readonly normalizePublicUrl = normalizePublicUrl;
  readonly pageSpeedErrorMessage = pageSpeedErrorMessage;
  readonly summarizePageSpeed = summarizePageSpeed;

  readonly url = signal('');
  readonly strategy = signal<DeviceStrategy>('mobile');
  readonly status = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  readonly errorMessage = signal('');
  readonly report = signal<SpeedReport | null>(null);

  readonly faqs = [
    {
      question: 'What does this checker measure?',
      answer:
        'It asks Google PageSpeed Insights to load the URL once in a lab, on mobile or desktop, and return the Lighthouse performance score plus LCP and CLS. That is one automated visit. It is not the experience of your visitors.',
    },
    {
      question: 'Why is INP sometimes shown as TBT?',
      answer:
        'Real INP (Interaction to Next Paint) comes from Chrome field data. When Google has that for the URL, or for the site as a whole, this page shows INP and says so. When it does not, Lighthouse has no INP number. The card then shows Total Blocking Time and labels it as a lab proxy. TBT is not INP.',
    },
    {
      question: 'Does Pulzivo receive the URL I test?',
      answer:
        'No. The browser calls Google\'s public PageSpeed Insights API directly. Pulzivo does not store the URL or the result. If the site is configured with a PageSpeed API key, that key is included in the browser request to Google. The tool also works with no key, on Google\'s shared quota.',
    },
    {
      question: 'How is this different from Pulzivo Core Web Vitals?',
      answer:
        'This is a lab test of one visit. Pulzivo records LCP, INP, and CLS from people actually using the site. Those field vitals are on the free plan, which is 10,000 events a month. The core script is about 9KB gzip.',
    },
  ];

  onUrl(event: Event): void {
    this.url.set(event.target instanceof HTMLInputElement ? event.target.value : '');
  }

  setStrategy(strategy: DeviceStrategy): void {
    this.strategy.set(strategy);
  }

  async check(event: Event): Promise<void> {
    event.preventDefault();
    if (this.status() === 'loading') return;
    const target = this.normalizePublicUrl(this.url());
    if (target.error) {
      this.report.set(null);
      this.errorMessage.set(target.error);
      this.status.set('error');
      return;
    }
    this.report.set(null);
    this.status.set('loading');
    this.errorMessage.set('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const endpoint = this.pageSpeedEndpoint(target.href, this.strategy(), this.pageSpeedApiKey);
      const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        this.report.set(null);
        this.errorMessage.set(this.pageSpeedErrorMessage(response.status, body));
        this.status.set('error');
        return;
      }
      const summary = this.summarizePageSpeed(body, this.strategy());
      this.report.set(summary.report);
      this.errorMessage.set(summary.error);
      this.status.set(summary.report ? 'done' : 'error');
    } catch (err) {
      this.report.set(null);
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      this.errorMessage.set(
        aborted
          ? 'The test ran longer than 60 seconds and was stopped. Try again.'
          : 'The request to Google did not finish. Check the connection and try again.',
      );
      this.status.set('error');
    } finally {
      clearTimeout(timer);
    }
  }

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
