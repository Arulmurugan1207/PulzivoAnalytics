#!/usr/bin/env node
'use strict';

/**
 * PROPOSAL — NOT EXECUTED. Do not run against prod without the owner's sign-off.
 *
 * Adds a TTL index so raw events expire ~13 months after the server received them.
 *
 * Why receivedAt (not timestamp):
 *  - TTL only works on BSON Date fields. Older rows store `timestamp` as epoch
 *    numbers or ISO strings; MongoDB silently never expires those.
 *  - `receivedAt` is set server-side at ingest (server.js normalizeEvents) as a
 *    Date, so a client-supplied clock cannot keep a row alive forever.
 *  - Rows that predate receivedAt are NOT covered by TTL; see LEGACY below.
 *
 * Impact when applied:
 *  - Index build on `events` (background on Atlas; extra IO while it builds).
 *  - The TTL monitor then deletes everything older than 13 months in batches
 *    (runs every 60s). This is a permanent delete. Take a snapshot/export first
 *    if any older history must be kept (e.g. yearly-comparison reports).
 *  - Dashboard ranges older than 13 months will show nothing afterwards.
 *
 * Usage (dry run is the default; nothing is written without --apply):
 *   MONGODB_URI=... MONGODB_DB=analytics node migrations/2026-10-ttl-raw-events.js
 *   MONGODB_URI=... MONGODB_DB=analytics node migrations/2026-10-ttl-raw-events.js --apply
 */

const { MongoClient } = require('mongodb');

const TTL_DAYS = Number(process.env.TTL_DAYS || 396); // ~13 months
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;
const FIELD = 'receivedAt';
const INDEX_NAME = 'events_receivedAt_ttl';

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(process.env.MONGODB_DB || 'analytics').collection(process.env.EVENTS_COLLECTION || 'events');
    const cutoff = new Date(Date.now() - TTL_SECONDS * 1000);
    const [total, wouldExpire, noReceivedAt, existing] = await Promise.all([
      col.estimatedDocumentCount(),
      col.countDocuments({ [FIELD]: { $lt: cutoff } }),
      col.countDocuments({ [FIELD]: { $not: { $type: 'date' } } }),
      col.indexes(),
    ]);
    console.log(JSON.stringify({ ttlDays: TTL_DAYS, cutoff, total, wouldExpireImmediately: wouldExpire,
      legacyRowsWithoutDateReceivedAt: noReceivedAt, existingTtl: existing.filter((i) => i.expireAfterSeconds != null) }, null, 2));
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to create the TTL index.');
      return;
    }
    // If a plain index on receivedAt already exists with another option set, use collMod instead.
    await col.createIndex({ [FIELD]: 1 }, { name: INDEX_NAME, expireAfterSeconds: TTL_SECONDS });
    console.log(`Created ${INDEX_NAME} (expireAfterSeconds=${TTL_SECONDS}).`);
  } finally {
    await client.close();
  }
}

// LEGACY: rows without a Date receivedAt are never expired by TTL. Options (owner decides):
//  a) one-off: deleteMany({ receivedAt: { $exists: false }, timestamp: { $lt: <Date cutoff> } }) plus the
//     same for numeric/string timestamps, run in small batches off-peak; or
//  b) backfill receivedAt from timestamp (updateMany) so TTL picks them up.

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { TTL_DAYS, TTL_SECONDS, FIELD, INDEX_NAME };
