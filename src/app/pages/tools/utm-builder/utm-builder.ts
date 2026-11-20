import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { trackConversion } from '../../../analytics/conversion';
import { UTM_PRESETS, buildCampaignUrl, normalizeUtmToken } from '../utm-url';

@Component({
  selector: 'app-utm-builder',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './utm-builder.html',
  styleUrls: ['../../guides/guide.scss', '../tool.scss'],
})
export class UtmBuilderPage {
  readonly presets = UTM_PRESETS;
  readonly buildCampaignUrl = buildCampaignUrl;
  readonly normalizeUtmToken = normalizeUtmToken;
  readonly example = buildCampaignUrl({
    url: 'https://example.com/pricing',
    source: 'newsletter',
    medium: 'email',
    campaign: 'spring launch',
    term: '',
    content: 'hero',
  }).url;

  readonly url = signal('');
  readonly source = signal('');
  readonly medium = signal('');
  readonly campaign = signal('');
  readonly term = signal('');
  readonly content = signal('');
  readonly copyLabel = signal('Copy URL');

  readonly faqs = [
    {
      question: 'What is a UTM parameter?',
      answer:
        'It is a query-string tag on a link. Analytics reads utm_source, utm_medium, utm_campaign, utm_term, and utm_content so a visit can be tied to the campaign that sent it. The same landing page can then show email, ads, and social as separate rows.',
    },
    {
      question: 'Which fields should I fill in?',
      answer:
        'Source, medium, and campaign are the three that make a report useful. Term is for a paid keyword. Content is for the creative or the position of the link, such as hero or footer. Leave a field blank if you do not have a value. Do not invent one.',
    },
    {
      question: 'Does this page send my URL anywhere?',
      answer:
        'No. The campaign URL is built in this browser. Copy it and paste it into the ad, email, or post. Pulzivo does not receive the URL or the parameters.',
    },
    {
      question: 'When does Pulzivo show these parameters?',
      answer:
        'UTM attribution is a Starter feature. The free plan is 10,000 events a month and includes page views, clicks, custom events, scroll depth, and Core Web Vitals (LCP, INP, and CLS). It does not include the UTM report. Tag the links whenever you like. The report appears after the site is on Starter or above.',
    },
  ];

  get result() {
    return this.buildCampaignUrl({
      url: this.url(),
      source: this.source(),
      medium: this.medium(),
      campaign: this.campaign(),
      term: this.term(),
      content: this.content(),
    });
  }

  get activePresetId(): string {
    const source = this.normalizeUtmToken(this.source());
    const medium = this.normalizeUtmToken(this.medium());
    const hit = this.presets.find((preset) => preset.source === source && preset.medium === medium);
    return hit ? hit.id : '';
  }

  onField(field: 'url' | 'source' | 'medium' | 'campaign' | 'term' | 'content', event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this[field].set(value);
    this.copyLabel.set('Copy URL');
  }

  applyPreset(source: string, medium: string): void {
    this.source.set(source);
    this.medium.set(medium);
    this.copyLabel.set('Copy URL');
  }

  async copy(): Promise<void> {
    const url = this.result.url;
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else throw new Error('clipboard unavailable');
      this.copyLabel.set('Copied');
    } catch {
      this.copyLabel.set('Copy failed. Select the URL and copy it.');
    }
  }

  track(location: string): void {
    trackConversion('cta_click', { location });
  }
}
