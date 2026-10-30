'use strict';

// Single source of truth for turning a utm_source value or a referrer host
// into a canonical display name ("ig", "instagram", "l.instagram.com" -> "Instagram").
// Used by traffic-sources, attribution and the per-visit "How they got here" identity.

const HOST_RULES = [
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
const TOKEN_ALIASES = {
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

const CANONICAL_NAMES = new Map(
  [...HOST_RULES.map((r) => r[1]), ...Object.values(TOKEN_ALIASES)].map((n) => [n.toLowerCase(), n]),
);

/** Lowercase host without scheme, www., path or port. Accepts URLs, hosts, android-app:// refs. */
function normalizeHost(value) {
  let s = String(value || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return s;
}

/** Canonical name for a known source, or '' when unknown. */
function knownSourceName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (CANONICAL_NAMES.has(raw)) return CANONICAL_NAMES.get(raw);
  if (Object.prototype.hasOwnProperty.call(TOKEN_ALIASES, raw)) return TOKEN_ALIASES[raw];
  const host = normalizeHost(raw);
  if (Object.prototype.hasOwnProperty.call(TOKEN_ALIASES, host)) return TOKEN_ALIASES[host];
  for (const [pattern, name] of HOST_RULES) {
    if (pattern.test(host)) return name;
  }
  return '';
}

/** Canonical display name; unknown values fall back to their lowercased host/token. */
function canonicalSourceName(value) {
  return knownSourceName(value) || normalizeHost(value);
}

module.exports = { normalizeHost, knownSourceName, canonicalSourceName, HOST_RULES, TOKEN_ALIASES };
