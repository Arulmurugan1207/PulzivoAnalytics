'use strict';

/**
 * Server-side owner / internal-traffic exclusion.
 *
 * The tracker's owner mode (localStorage pulz_is_owner, ?pulz_owner=1) is
 * per-browser, so a site owner signed in on a new browser/device is still
 * tracked. This module drops those events at ingest and hides older rows
 * at report time, independent of any browser flag.
 *
 * Sources (merged):
 *  - env EXCLUDED_EMAILS / EXCLUDED_USER_IDS (comma-separated, all keys)
 *  - api_keys doc: ownerEmail, excludedEmails[], excludedUserIds[]
 */

const CACHE_MS = 60 * 1000;
const cache = new Map();

function parseList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v || '').trim()).filter(Boolean);
}

function buildRules({ emails = [], userIds = [] } = {}) {
  return {
    emails: new Set(parseList(emails).map((e) => e.toLowerCase())),
    userIds: new Set(parseList(userIds)),
  };
}

function envRules(env = process.env) {
  return buildRules({ emails: parseList(env.EXCLUDED_EMAILS), userIds: parseList(env.EXCLUDED_USER_IDS) });
}

function mergeRules(...list) {
  const out = buildRules();
  for (const r of list) {
    if (!r) continue;
    r.emails.forEach((e) => out.emails.add(e));
    r.userIds.forEach((u) => out.userIds.add(u));
  }
  return out;
}

function rulesFromKeyDoc(doc) {
  if (!doc) return buildRules();
  return buildRules({
    emails: [...parseList(doc.ownerEmail), ...parseList(doc.excludedEmails)],
    userIds: parseList(doc.excludedUserIds),
  });
}

async function loadExclusionRules(db, apiKey, { keysCollection = 'api_keys', env = process.env, now = Date.now() } = {}) {
  const base = envRules(env);
  if (!db || !apiKey) return base;
  const hit = cache.get(apiKey);
  if (hit && now - hit.at < CACHE_MS) return mergeRules(base, hit.rules);
  let keyRules = buildRules();
  try {
    const doc = await db.collection(keysCollection).findOne({ apiKey });
    keyRules = rulesFromKeyDoc(doc);
  } catch (err) {
    console.error('[analytics-api] exclusion rules lookup failed', err);
  }
  cache.set(apiKey, { at: now, rules: keyRules });
  return mergeRules(base, keyRules);
}

function clearExclusionCache() {
  cache.clear();
}

function isEmpty(rules) {
  return !rules || (rules.emails.size === 0 && rules.userIds.size === 0);
}

function isExcludedEvent(event, rules) {
  if (isEmpty(rules) || !event) return false;
  const data = event.data || {};
  const emails = [event.user_email, event.userEmail, data.user_email, data.userEmail]
    .filter(Boolean).map((e) => String(e).trim().toLowerCase());
  if (emails.some((e) => rules.emails.has(e))) return true;
  const ids = [event.user_id, event.userId, data.user_id, data.userId].filter(Boolean).map(String);
  return ids.some((id) => rules.userIds.has(id));
}

/** Mongo filter hiding excluded rows (report-time; historical rows stay in the DB). */
function exclusionMatch(rules) {
  if (isEmpty(rules)) return {};
  const parts = [];
  if (rules.emails.size) {
    const emails = [...rules.emails];
    parts.push({ user_email: { $nin: emails } }, { 'data.user_email': { $nin: emails } });
  }
  if (rules.userIds.size) {
    const ids = [...rules.userIds];
    parts.push({ user_id: { $nin: ids } }, { 'data.user_id': { $nin: ids } });
  }
  return { $and: parts };
}

module.exports = {
  parseList,
  buildRules,
  envRules,
  rulesFromKeyDoc,
  loadExclusionRules,
  clearExclusionCache,
  isExcludedEvent,
  exclusionMatch,
};
