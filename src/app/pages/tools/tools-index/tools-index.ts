import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../analytics/conversion';

@Component({
  selector: 'app-tools-index',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './tools-index.html',
  styleUrls: ['../../guides/guide.scss', '../tool.scss'],
})
export class ToolsIndexPage {
  readonly tools = [
    {
      href: '/tools/utm-builder',
      title: 'UTM campaign URL builder',
      summary:
        'Build a link with source, medium, campaign, term, and content. Presets cover Google Ads, Facebook, newsletters, X, LinkedIn, WhatsApp, and YouTube. The URL is assembled in the browser.',
    },
    {
      href: '/tools/page-speed-checker',
      title: 'Page speed checker',
      summary:
        'Send one public URL to Google PageSpeed Insights. See the lab performance score, LCP, INP when Chrome has field data, or TBT labelled as a lab proxy, plus CLS and the top three opportunities.',
    },
  ];

  readonly faqs = [
    {
      question: 'Are these tools free?',
      answer:
        'Yes. Both run in your browser and do not ask for an account. The page speed checker calls Google\'s public PageSpeed Insights API. Google may rate-limit that shared quota. The UTM builder does not call any API.',
    },
    {
      question: 'Do I need a Pulzivo account to use them?',
      answer:
        'No. A Pulzivo account is only for measuring your own site. The free plan is 10,000 events a month and includes Core Web Vitals (LCP, INP, and CLS) from real visitors. UTM attribution, which groups visits by the parameters the builder creates, starts on the Starter plan. The core script is about 9KB gzip.',
    },
  ];

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
