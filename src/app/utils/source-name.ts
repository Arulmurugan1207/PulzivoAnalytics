/**
 * Canonical traffic-source names for the dashboard.
 * KEEP IN SYNC with analytics-api/sources.js (both test suites run the shared
 * table in analytics-api/test-fixtures/source-name-cases.json).
 * Pure helper (no Angular imports) so it runs under `node --test`.
 */

export const HOST_RULES: Array<[RegExp, string]> = [
  [/(^|\.)youtube\.com$|^youtu\.be$|^com\.google\.android\.youtube$/, 'YouTube'],
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.(gm|googlequicksearchbox)$/, 'Google'],
  [/(^|\.)facebook\.com$|^fb\.com$|^fb\.me$|^com\.facebook\.(katana|orca)$/, 'Facebook'],
  [/(^|\.)instagram\.com$|^com\.instagram\.android$/, 'Instagram'],
  [/(^|\.)twitter\.com$|^t\.co$|(^|\.)x\.com$/, 'X'],
  [/(^|\.)whatsapp\.com$|^wa\.me$|^com\.whatsapp$/, 'WhatsApp'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)reddit\.com$|^redd\.it$/, 'Reddit'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, 'Pinterest'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
  [/(^|\.)telegram\.org$|^t\.me$/, 'Telegram'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'Yahoo'],
  [/(^|\.)search\.brave\.com$|^brave\.com$/, 'Brave Search'],
  [/(^|\.)chatgpt\.com$|^chat\.openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)baidu\.com$/, 'Baidu'],
  [/^news\.ycombinator\.com$/, 'Hacker News'],
  [/(^|\.)github\.com$/, 'GitHub'],
];

// Bare utm_source tokens (no dot). Matched case-insensitively on the whole value.
export const TOKEN_ALIASES: Record<string, string> = {
  google: 'Google', youtube: 'YouTube', yt: 'YouTube',
  ig: 'Instagram', instagram: 'Instagram', insta: 'Instagram',
  fb: 'Facebook', facebook: 'Facebook', meta: 'Facebook',
  x: 'X', twitter: 'X', tw: 'X',
  whatsapp: 'WhatsApp', wa: 'WhatsApp',
  bing: 'Bing', yahoo: 'Yahoo', duckduckgo: 'DuckDuckGo', ddg: 'DuckDuckGo',
  brave: 'Brave Search', chatgpt: 'ChatGPT', openai: 'ChatGPT', perplexity: 'Perplexity',
  reddit: 'Reddit', linkedin: 'LinkedIn', tiktok: 'TikTok', pinterest: 'Pinterest',
  telegram: 'Telegram', threads: 'Threads', snapchat: 'Snapchat', baidu: 'Baidu',
  github: 'GitHub', copy: 'Copied link', 'copied-link': 'Copied link', copylink: 'Copied link',
};

const CANONICAL_NAMES = new Map<string, string>(
  [...HOST_RULES.map((r) => r[1]), ...Object.values(TOKEN_ALIASES)].map((n) => [n.toLowerCase(), n] as [string, string]),
);

/** Lowercase host without scheme, www., path or port. Accepts URLs, hosts, android-app:// refs. */
export function normalizeHost(value: unknown): string {
  let s = String(value || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return s;
}

/** Canonical name for a known source, or '' when unknown. */
export function knownSourceName(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (CANONICAL_NAMES.has(raw)) return CANONICAL_NAMES.get(raw)!;
  if (Object.prototype.hasOwnProperty.call(TOKEN_ALIASES, raw)) return TOKEN_ALIASES[raw];
  const host = normalizeHost(raw);
  if (Object.prototype.hasOwnProperty.call(TOKEN_ALIASES, host)) return TOKEN_ALIASES[host];
  for (const [pattern, name] of HOST_RULES) {
    if (pattern.test(host)) return name;
  }
  return '';
}

/** Canonical display name; unknown values fall back to their lowercased host/token. */
export function canonicalSourceName(value: unknown): string {
  return knownSourceName(value) || normalizeHost(value);
}


export interface SourceRowLike {
  name: string;
  channel: string;
  host: string;
  visits: number;
  percentage: number;
}

/**
 * Merge rows that resolve to the same canonical name (e.g. "ig" + "Instagram"),
 * summing visits/percentages, keeping the busiest host as the grey hint, re-sorted.
 * Idempotent, so it is safe on top of an API that already merges.
 */
export function mergeSourceRows<T extends SourceRowLike>(rows: T[]): T[] {
  const merged = new Map<string, { row: T; hosts: Map<string, number>; top: number }>();
  for (const row of rows || []) {
    const raw = row?.name || '';
    // Channel-only rows ("Direct", "Referral") are labels, not hosts: keep them verbatim.
    const name = raw === 'Direct' || raw === row?.channel || (/\s/.test(raw) && !knownSourceName(raw)) ? raw : (knownSourceName(raw) || knownSourceName(row?.host) || canonicalSourceName(raw) || raw);
    const visits = row?.visits || 0;
    const host = normalizeHost(row?.host);
    let entry = merged.get(name);
    if (!entry) {
      entry = { row: { ...row, name, host: '', visits: 0, percentage: 0 }, hosts: new Map(), top: -1 };
      merged.set(name, entry);
    }
    if (visits > entry.top) { entry.top = visits; entry.row.channel = row.channel; }
    entry.row.visits += visits;
    entry.row.percentage += row?.percentage || 0;
    if (host) entry.hosts.set(host, (entry.hosts.get(host) || 0) + visits);
  }
  return [...merged.values()].map(({ row, hosts }) => {
    let best = ['', -1] as [string, number];
    for (const e of hosts) if (e[1] > best[1]) best = e;
    return { ...row, host: best[0], percentage: Math.round(row.percentage * 100) / 100 };
  }).sort((a, b) => b.visits - a.visits);
}
