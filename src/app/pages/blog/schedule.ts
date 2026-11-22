/**
 * Blog schedule and reading time.
 *
 * publishDate is a calendar day in America/Toronto. A post is included in the
 * build (routes, prerendered HTML, blog index, sitemap, related links) only
 * when publishDate <= that Toronto day.
 *
 * PULZIVO_AS_OF=YYYY-MM-DD overrides the clock. Tests set it. The deploy
 * workflow must not, or a future article would ship early.
 *
 * Reading time follows the dev.to pattern: words in the article HTML divided
 * by 225 words per minute (inside the 200–230 band), rounded up, minimum 1.
 * It is computed from the HTML, never stored as a hand-written number.
 */

const WORDS_PER_MINUTE = 225;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type Dated = { publishDate?: string; date?: string };

function readAsOfOverride(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = env?.['PULZIVO_AS_OF'];
  if (value && ISO_DAY.test(value)) return value;
  return null;
}

/** Calendar day in America/Toronto, or PULZIVO_AS_OF when a test sets it. */
function asOfDate(now: Date = new Date()): string {
  return readAsOfOverride() ?? torontoDate(now);
}

function torontoDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/**
 * The latest publishDate the live site should already be serving.
 *
 * The deploy cron is 11:05 UTC (about 6:05 AM America/Toronto in winter).
 * At that hour Toronto is still on the same calendar day as UTC, and that
 * run is what adds today's article. Before 11:05 UTC the last scheduled
 * deploy published the previous UTC date.
 */
function liveAsOf(now: Date = new Date()): string {
  const override = readAsOfOverride();
  if (override) return override;
  const utc = now.toISOString().slice(0, 10);
  const deployed = now.getUTCHours() > 11 || (now.getUTCHours() === 11 && now.getUTCMinutes() >= 5);
  return deployed ? utc : shiftIsoDate(utc, -1);
}

function publishDay(post: Dated): string {
  const day = post.publishDate || post.date || '';
  return ISO_DAY.test(day) ? day : '';
}

function isPublished(post: Dated, asOf?: string): boolean {
  const day = publishDay(post);
  if (!day) return false;
  return day <= (asOf ?? asOfDate());
}

function publishedPosts<T extends Dated>(posts: readonly T[], asOf?: string): T[] {
  const day = asOf ?? asOfDate();
  return posts.filter((post) => isPublished(post, day));
}

/** Newest published posts first. Same-day posts keep their existing order. */
function latestPosts<T extends Dated>(posts: readonly T[], limit = 3): T[] {
  const cap = limit > 0 ? limit : 0;
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => {
      const byDay = publishDay(b.post).localeCompare(publishDay(a.post));
      return byDay || a.index - b.index;
    })
    .slice(0, cap)
    .map((item) => item.post);
}

function relatedPosts<T extends Dated & { slug: string }>(posts: readonly T[], slug: string, limit = 3): T[] {
  return latestPosts(
    posts.filter((post) => post.slug !== slug),
    limit,
  );
}

function articleText(html: string): string {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&[a-z#0-9]+;/gi, ' ');
}

function wordCount(html: string): number {
  return articleText(html).split(/\s+/).filter(Boolean).length;
}

function readingMinutes(html: string, wpm: number = WORDS_PER_MINUTE): number {
  const rate = wpm > 0 ? wpm : WORDS_PER_MINUTE;
  return Math.max(1, Math.ceil(wordCount(html) / rate));
}

function readingLabel(html: string): string {
  return `${readingMinutes(html)} min read`;
}

export {
  WORDS_PER_MINUTE,
  asOfDate,
  torontoDate,
  shiftIsoDate,
  liveAsOf,
  publishDay,
  isPublished,
  publishedPosts,
  latestPosts,
  relatedPosts,
  articleText,
  wordCount,
  readingMinutes,
  readingLabel,
};
