/**
 * Client-side UTM URL builder. Nothing here sends the URL anywhere.
 *
 * These are function declarations, exported at the bottom, so they can call
 * each other. The prerender loader turns `export function` into a function
 * expression, which cannot see its siblings.
 * Values are trimmed, lowercased, and spaces become hyphens so one
 * campaign does not split into two rows. The URL API encodes the result.
 */

export interface UtmPreset {
  id: string;
  label: string;
  source: string;
  medium: string;
}

const UTM_PRESETS: readonly UtmPreset[] = [
  { id: 'google', label: 'Google Ads', source: 'google', medium: 'cpc' },
  { id: 'facebook', label: 'Facebook', source: 'facebook', medium: 'social' },
  { id: 'newsletter', label: 'Newsletter', source: 'newsletter', medium: 'email' },
  { id: 'x', label: 'X', source: 'x', medium: 'social' },
  { id: 'linkedin', label: 'LinkedIn', source: 'linkedin', medium: 'social' },
  { id: 'whatsapp', label: 'WhatsApp', source: 'whatsapp', medium: 'social' },
  { id: 'youtube', label: 'YouTube', source: 'youtube', medium: 'video' },
];

export interface UtmInput {
  url: string;
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
}

export interface UtmBuildResult {
  url: string;
  error: string;
  hints: string[];
}

const FIELDS = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['term', 'utm_term'],
  ['content', 'utm_content'],
] as const;

function normalizeUtmToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizeWebsiteUrl(raw: string): { href: string; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { href: '', error: 'Enter a website URL.' };
  let withScheme = trimmed;
  if (trimmed.startsWith('//')) withScheme = `https:${trimmed}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) withScheme = `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { href: '', error: 'That website URL is not valid. Use an address such as https://example.com/pricing.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { href: '', error: 'Use an http or https URL.' };
  }
  if (!parsed.hostname) return { href: '', error: 'That website URL needs a hostname.' };
  return { href: parsed.href, error: '' };
}

function buildCampaignUrl(input: UtmInput): UtmBuildResult {
  const hints: string[] = [];
  const filled = FIELDS.some(([field]) => input[field].trim() !== '') || input.url.trim() !== '';
  if (!filled) return { url: '', error: '', hints };

  const website = normalizeWebsiteUrl(input.url);
  if (website.error) return { url: '', error: website.error, hints };

  const tokens: Partial<Record<(typeof FIELDS)[number][1], string>> = {};
  for (const [field, param] of FIELDS) {
    const trimmed = input[field].trim();
    if (!trimmed) continue;
    const normalized = normalizeUtmToken(trimmed);
    if (normalized !== trimmed) hints.push(`${param} is sent as "${normalized}".`);
    tokens[param] = normalized;
  }

  if (!tokens.utm_source) {
    return {
      url: '',
      error: 'Add a source. utm_source is what the report groups on, for example google or newsletter.',
      hints,
    };
  }
  if (!tokens.utm_medium) {
    hints.push('Medium is empty. cpc, email, social, or video makes the rows easier to group.');
  }
  if (!tokens.utm_campaign) {
    hints.push('Campaign is empty. A short name is how you tell one launch from another.');
  }

  const parsed = new URL(website.href);
  for (const [, param] of FIELDS) parsed.searchParams.delete(param);
  for (const [, param] of FIELDS) {
    const value = tokens[param];
    if (value) parsed.searchParams.set(param, value);
  }
  return { url: parsed.toString(), error: '', hints };
}

export { UTM_PRESETS, normalizeUtmToken, normalizeWebsiteUrl, buildCampaignUrl };
