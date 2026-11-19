/**
 * Read a Google PageSpeed Insights v5 (runPagespeed) response.
 *
 * These are function declarations, exported at the bottom, so they can call
 * each other. The prerender loader turns `export function` into a function
 * expression, which cannot see its siblings.
 * The request is made from the browser. This module only builds the URL
 * and turns the JSON into a small view model.
 *
 * Lighthouse lab data includes LCP, CLS, and Total Blocking Time.
 * Real INP is field data (Chrome UX Report). When that is missing, TBT
 * is shown and labelled as a lab proxy. TBT is not INP.
 *
 * Cutoffs, from web.dev:
 * - LCP: good ≤ 2.5s, poor > 4s
 * - INP: good ≤ 200ms, poor > 500ms
 * - CLS: good ≤ 0.1, poor > 0.25
 * - TBT (Lighthouse): good ≤ 200ms, poor > 600ms
 * - Performance score: good ≥ 90, poor < 50
 */

export type DeviceStrategy = 'mobile' | 'desktop';
export type VitalBand = 'good' | 'needs-work' | 'poor' | 'missing';

export interface SpeedMetric {
  id: 'lcp' | 'inp' | 'tbt' | 'cls';
  name: string;
  valueLabel: string;
  band: VitalBand;
  bandLabel: string;
  detail: string;
}

export interface SpeedOpportunity {
  id: string;
  title: string;
  text: string;
}

export interface SpeedReport {
  score: number | null;
  scoreLabel: string;
  scoreBand: VitalBand;
  scoreBandLabel: string;
  finalUrl: string;
  strategy: DeviceStrategy;
  metrics: SpeedMetric[];
  opportunities: SpeedOpportunity[];
  note: string;
}

interface LighthouseAudit {
  title?: string;
  description?: string;
  score?: number | null;
  numericValue?: number;
  scoreDisplayMode?: string;
  details?: { type?: string; overallSavingsMs?: number };
}

interface CruxExperience {
  metrics?: Record<string, { percentile?: number } | undefined>;
}

interface PageSpeedJson {
  lighthouseResult?: {
    finalUrl?: string;
    requestedUrl?: string;
    runtimeError?: { message?: string };
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, LighthouseAudit | undefined>;
  };
  loadingExperience?: CruxExperience;
  originLoadingExperience?: CruxExperience;
  error?: { code?: number; status?: string };
}

const OPPORTUNITY_COPY: Record<string, string> = {
  'render-blocking-resources': 'CSS or JavaScript in the head is delaying the first paint. Load less of it up front, or mark what can wait.',
  'unused-css-rules': 'The page ships CSS that the first view does not use. Split or remove the unused rules.',
  'unused-javascript': 'The page downloads JavaScript that does not run on the first view. Split or remove it.',
  'modern-image-formats': 'Some images would be smaller as AVIF or WebP.',
  'offscreen-images': 'Images below the first screen are downloaded immediately. Lazy-load those.',
  'unminified-css': 'CSS is sent with comments and extra whitespace. Minify it.',
  'unminified-javascript': 'JavaScript is sent without minification. Minify it.',
  'efficiently-encode-images': 'Images are larger than they need to be for how they look. Compress them.',
  'uses-optimized-images': 'Images can be compressed further without a visible change.',
  'uses-text-compression': 'Text responses are not compressed. Enable gzip or Brotli on the server.',
  'uses-responsive-images': 'Images are larger than the slot they fill. Serve a size closer to the screen.',
  'server-response-time': 'The server is slow to send the first byte. Cache the document, or speed up the backend.',
  redirects: 'The URL redirects before the page loads. Link to the final address.',
  'uses-rel-preconnect': 'The page connects to another origin early, without a preconnect hint.',
  'legacy-javascript': 'The bundle includes JavaScript for browsers your current visitors do not use.',
  'duplicated-javascript': 'The same JavaScript is downloaded more than once.',
  'prioritize-lcp-image': 'The largest image is discovered late. Preload it, or give it a high fetch priority.',
  'lcp-lazy-loaded': 'The largest image is lazy-loaded, so it starts late. Do not lazy-load that image.',
  'uses-long-cache-ttl': 'Static files expire quickly. A longer cache lifetime avoids downloading them on every visit.',
  'unsized-images': 'Some images have no width and height, so the layout moves when they load.',
  'font-display': 'A web font hides text while it loads. font-display: swap, or a smaller font file, keeps the text visible.',
  'third-party-facades': 'A third-party embed loads immediately. A static stand-in can wait until someone interacts.',
  'total-byte-weight': 'The page downloads a lot. Images, fonts, and scripts are the usual place to cut.',
  'bootup-time': 'JavaScript keeps the main thread busy while the page starts.',
  'mainthread-work-breakdown': 'The main thread spends a long time on script, style, and layout during load.',
};

function pageSpeedKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pageSpeedEndpoint(target: string, strategy: DeviceStrategy, apiKey: string): string {
  const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  url.searchParams.set('url', target);
  url.searchParams.set('strategy', strategy);
  url.searchParams.set('category', 'performance');
  const key = pageSpeedKey(apiKey);
  if (key) url.searchParams.set('key', key);
  return url.toString();
}

function normalizePublicUrl(raw: string): { href: string; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { href: '', error: 'Enter a URL to test.' };
  let withScheme = trimmed;
  if (trimmed.startsWith('//')) withScheme = `https:${trimmed}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) withScheme = `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { href: '', error: 'That URL is not valid. Use a public http or https address.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { href: '', error: 'Use an http or https URL. Google tests the page from its own servers.' };
  }
  if (isPrivateHost(parsed.hostname)) {
    return {
      href: '',
      error: 'Google tests the public page from its own servers. localhost and private network addresses cannot be measured from here.',
    };
  }
  return { href: parsed.href, error: '' };
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '::') return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function pageSpeedErrorMessage(status: number, body: unknown): string {
  const code = errorCode(body);
  const limited = status === 429 || code === 429 || code === 'RESOURCE_EXHAUSTED' || code === 'OVER_QUERY_LIMIT';
  if (limited) {
    return "Google's PageSpeed API is rate-limiting this request. The shared quota is used up. Try again later.";
  }
  if (status === 400) return 'Google could not test that URL. Check that it is a public http or https address.';
  if (status === 403) return 'Google refused the PageSpeed request (HTTP 403). Wait a minute and try again.';
  return `PageSpeed did not return a result (HTTP ${status}). Wait a moment and try again.`;
}

function errorCode(body: unknown): number | string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: { code?: unknown; status?: unknown } }).error;
  if (!error) return null;
  if (typeof error.code === 'number') return error.code;
  if (typeof error.status === 'string') return error.status;
  return null;
}

function bandLabel(band: VitalBand): string {
  if (band === 'good') return 'Good';
  if (band === 'needs-work') return 'Needs work';
  if (band === 'poor') return 'Poor';
  return 'Not reported';
}

function bandFor(metric: 'lcp' | 'inp' | 'tbt' | 'cls' | 'score', value: number): VitalBand {
  if (metric === 'lcp') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-work' : 'poor';
  if (metric === 'inp') return value <= 200 ? 'good' : value <= 500 ? 'needs-work' : 'poor';
  if (metric === 'tbt') return value <= 200 ? 'good' : value <= 600 ? 'needs-work' : 'poor';
  if (metric === 'cls') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-work' : 'poor';
  return value >= 90 ? 'good' : value >= 50 ? 'needs-work' : 'poor';
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} s`;
  }
  return `${Math.round(ms)} ms`;
}

function formatCls(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(3);
}

function auditValue(audit: LighthouseAudit | undefined): number | null {
  if (!audit) return null;
  const mode = audit.scoreDisplayMode;
  if (mode === 'notApplicable' || mode === 'manual' || mode === 'error' || mode === 'informative') return null;
  const value = audit.numericValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metric(id: SpeedMetric['id'], name: string, valueLabel: string, band: VitalBand, detail: string): SpeedMetric {
  return { id, name, valueLabel, band, bandLabel: bandLabel(band), detail };
}

function fieldPercentile(experience: CruxExperience | undefined, key: string): number | null {
  const value = experience?.metrics?.[key]?.percentile;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function plainSentence(markdown: string): string {
  const text = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = text.split(/(?<=\.)\s/)[0] || text;
  return sentence.length > 280 ? `${sentence.slice(0, 277).trimEnd()}…` : sentence;
}

function opportunitiesOf(audits: Record<string, LighthouseAudit | undefined> | undefined): SpeedOpportunity[] {
  const rows: { id: string; title: string; text: string; savings: number }[] = [];
  for (const [id, audit] of Object.entries(audits || {})) {
    if (!audit || audit.details?.type !== 'opportunity') continue;
    if (audit.score == null || audit.score >= 1) continue;
    const savings = typeof audit.details.overallSavingsMs === 'number' ? audit.details.overallSavingsMs : 0;
    const known = OPPORTUNITY_COPY[id];
    const fallback = audit.description ? plainSentence(audit.description) : '';
    const body = known || fallback || 'Lighthouse flagged this as a way to shorten the lab visit.';
    const savingsText = savings >= 50 ? ` Estimated savings on this lab run: ${formatMs(savings)}.` : '';
    rows.push({
      id,
      title: audit.title || id,
      text: `${body}${savingsText}`,
      savings,
    });
  }
  rows.sort((a, b) => b.savings - a.savings || a.title.localeCompare(b.title));
  return rows.slice(0, 3).map(({ id, title, text }) => ({ id, title, text }));
}

function summarizePageSpeed(body: unknown, strategy: DeviceStrategy): { report: SpeedReport | null; error: string } {
  if (!body || typeof body !== 'object') {
    return { report: null, error: 'PageSpeed returned a response that was not JSON.' };
  }
  const json = body as PageSpeedJson;
  const lighthouse = json.lighthouseResult;
  if (!lighthouse) {
    return { report: null, error: 'Google returned a response without a Lighthouse result. Try the URL again.' };
  }
  const audits = lighthouse.audits || {};
  const rawScore = lighthouse.categories?.performance?.score;
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? Math.round(rawScore * 100) : null;
  const scoreBand: VitalBand = score == null ? 'missing' : bandFor('score', score);

  const lcpMs = auditValue(audits['largest-contentful-paint']);
  const cls = auditValue(audits['cumulative-layout-shift']);
  const lcpBand: VitalBand = lcpMs == null ? 'missing' : bandFor('lcp', lcpMs);
  const clsBand: VitalBand = cls == null ? 'missing' : bandFor('cls', cls);

  const urlInp = fieldPercentile(json.loadingExperience, 'INTERACTION_TO_NEXT_PAINT');
  const originInp = fieldPercentile(json.originLoadingExperience, 'INTERACTION_TO_NEXT_PAINT');
  let responsiveness: SpeedMetric;
  if (urlInp != null || originInp != null) {
    const value = (urlInp ?? originInp) as number;
    const where = urlInp != null ? 'this URL' : 'this site (the origin), not this exact URL';
    const band = bandFor('inp', value);
    responsiveness = metric(
      'inp',
      'INP',
      formatMs(value),
      band,
      `Interaction to Next Paint from Chrome field data for ${where}. Good is 200 ms or faster. Needs work is up to 500 ms. This is real-user data, separate from the lab score.`,
    );
  } else {
    const tbt = auditValue(audits['total-blocking-time']);
    const band: VitalBand = tbt == null ? 'missing' : bandFor('tbt', tbt);
    responsiveness = metric(
      'tbt',
      'TBT',
      tbt == null ? '—' : formatMs(tbt),
      band,
      'Total Blocking Time from this lab visit. Lighthouse did not return real INP, so TBT is a lab proxy. It is not INP. Good is 200 ms or less. Needs work is up to 600 ms.',
    );
  }

  const runtime = lighthouse.runtimeError?.message?.trim();
  const note = runtime
    ? `Lighthouse reported a runtime error: ${runtime}`
    : 'Performance, LCP, and CLS are from this one lab visit. A single visit will not match every phone, network, or cache.';

  const report: SpeedReport = {
    score,
    scoreLabel: score == null ? '—' : String(score),
    scoreBand,
    scoreBandLabel: bandLabel(scoreBand),
    finalUrl: lighthouse.finalUrl || lighthouse.requestedUrl || '',
    strategy,
    metrics: [
      metric(
        'lcp',
        'LCP',
        lcpMs == null ? '—' : formatMs(lcpMs),
        lcpBand,
        'Largest Contentful Paint from this lab visit. Good is 2.5 s or faster. Needs work is up to 4 s.',
      ),
      responsiveness,
      metric(
        'cls',
        'CLS',
        cls == null ? '—' : formatCls(cls),
        clsBand,
        'Cumulative Layout Shift from this lab visit. Good is 0.1 or less. Needs work is up to 0.25.',
      ),
    ],
    opportunities: opportunitiesOf(audits),
    note,
  };

  if (score == null && lcpMs == null && cls == null && responsiveness.band === 'missing') {
    return {
      report: null,
      error: runtime
        ? `Lighthouse could not finish the test. ${runtime}`
        : 'Lighthouse ran but did not return a performance score. Try the URL again.',
    };
  }
  return { report, error: '' };
}

export { pageSpeedKey, pageSpeedEndpoint, normalizePublicUrl, pageSpeedErrorMessage, summarizePageSpeed };
