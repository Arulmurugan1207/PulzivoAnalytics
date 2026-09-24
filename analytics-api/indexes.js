'use strict';

/**
 * Dashboard reads are equality on apiKey plus a timestamp range.
 * Ingest (server.js normalizeEvents) stores timestamp, createdAt, and receivedAt
 * as Date. Older rows may still use epoch numbers or ISO strings on timestamp,
 * so the same { apiKey, timestamp } index serves each $or branch of buildDateFilter.
 *
 * createIndex is idempotent and does not rewrite event documents.
 */

const EVENT_INDEXES = [
  { key: { apiKey: 1, timestamp: 1 }, name: 'events_apiKey_timestamp' },
  { key: { apiKey: 1, event_name: 1, timestamp: 1 }, name: 'events_apiKey_event_timestamp' },
  { key: { apiKey: 1, createdAt: 1 }, name: 'events_apiKey_createdAt' },
  { key: { apiKey: 1, receivedAt: 1 }, name: 'events_apiKey_receivedAt' },
  { key: { apiKey: 1, session_id: 1, timestamp: 1 }, name: 'events_apiKey_session_timestamp' },
];

async function ensureEventIndexes(db) {
  if (!db || typeof db.collection !== 'function') return [];
  const name = process.env.EVENTS_COLLECTION || 'events';
  const col = db.collection(name);
  if (!col || typeof col.createIndex !== 'function') return [];
  const created = [];
  for (const spec of EVENT_INDEXES) {
    try {
      await col.createIndex(spec.key, { name: spec.name });
      created.push(spec.name);
    } catch (err) {
      console.error('[analytics-api] index create failed', spec.name, err && err.message ? err.message : err);
    }
  }
  return created;
}

module.exports = { EVENT_INDEXES, ensureEventIndexes };
