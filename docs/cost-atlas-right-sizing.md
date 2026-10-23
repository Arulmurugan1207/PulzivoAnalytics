# Cost: raw-event retention and Atlas right-sizing

Staying on MongoDB Atlas (document DB). No Postgres migration.

## 1. Retention (TTL) — proposal, not applied
`analytics-api/migrations/2026-10-ttl-raw-events.js` creates a TTL index on
`events.receivedAt` (~13 months, 396 days). It is dry-run by default and has
**not** been run against any database.

- `receivedAt` is used rather than `timestamp` because TTL only works on BSON
  Dates; legacy `timestamp` values are numbers/strings and would never expire,
  and `timestamp` comes from the client.
- Applying it permanently deletes older raw events. Decide first: keep 13
  months? export older data to cheap storage (Atlas Online Archive or a
  `mongoexport` to GCS) before applying?
- Legacy rows without `receivedAt` need a one-off batch delete or backfill
  (see the comment at the bottom of the script).

## 2. Right-sizing Atlas
1. Measure before changing tiers: Atlas Metrics → data size, index size,
   WiredTiger cache usage, CPU, disk IOPS, connections over 30 days.
2. Working set (hot indexes + recent data) should fit in RAM. After TTL and
   the `{ apiKey, timestamp }` indexes (PR #12), the working set shrinks; if
   cache hit stays high and CPU < ~40% p95, step down one tier.
3. Drop unused indexes (`$indexStats` ops == 0 over weeks) — each costs RAM and
   write IO on every ingest.
4. Storage: TTL + `compact` (or let Atlas reclaim on resync) lowers disk; set
   disk auto-scaling on but the tier auto-scale ceiling conservatively.
5. Connections: Cloud Run `--max-instances 5` × driver pool. Set
   `maxPoolSize` (e.g. 10) so a scale-out does not force a bigger tier.
6. Consider Atlas Online Archive for events older than ~90 days instead of
   deleting, if historical reports matter — cheaper than tier RAM.
7. Do not move dev/staging onto the prod cluster; use M0/Flex for those.
