# Architecture: Cloud Run vs App Engine, and where "plan" lives

## Services
| Concern | Service | Code |
|---|---|---|
| Event ingest (`/analytics/log`, `/analytics/events`), dashboard reporting, public stats, `/api-keys/:key/validate` used by the tracker | Cloud Run `pulzivo-analytics-api` (project node-server-apis, us-east1) | `PulzivoAnalytics/analytics-api/` |
| Users, auth/JWT, API key CRUD, billing (Stripe checkout + webhook), plan changes, plan history, saved reports | App Engine service `analytics` | `node-server-api/services/analytics/` |
| Marketing site / SPA | Cloud Run service `analytics` (never deploy the API over it) and cPanel | `PulzivoAnalytics/src` |

Both backends talk to the same Atlas database (`analytics`): `users`,
`api_keys`, `events`, `plan_history`, `payments`.

## The plan is stored twice
- `users.plan` — written by the Stripe webhook (`billing.controller.js`),
  admin `PUT /users/:userId/plan`, cancellations/downgrades.
- `api_keys.plan` — a mirror written by `utils/syncApiKeyPlan.js` after those
  writes, so Cloud Run can answer `/validate` and gate features with one
  `api_keys` read and no `users` lookup.

Failure modes today:
1. `syncApiKeysPlan` never throws; if it fails after `users.plan` is written the
   two disagree silently until the next plan change.
2. Any code path that sets `users.plan` without calling the sync (new admin
   tools, manual DB edits, scripts) drifts.
3. Keys created after an upgrade must copy the plan at creation time.
4. App Engine rate limiting reads `users.plan` (owner role → enterprise) while
   Cloud Run reads `api_keys.plan`, so limits and features can disagree.

## Recommendation: `users.plan` is the single source of truth
- Treat `users.plan` (+ `subscriptionStatus`, `planUpdatedAt`) as canonical.
  Stripe is upstream of it; only the webhook and the admin endpoint write it.
- Keep `api_keys.plan` strictly as a **read cache**, never written by any
  other path, always stamped with `planUpdatedAt`.
- Cloud Run: on validate/ingest, if `api_keys.planUpdatedAt` is missing or
  older than a short TTL (e.g. 10 min), read `users.plan` by `userId` and use
  that (in-process cache keyed by apiKey for 60 s, like owner exclusion). This
  bounds drift without a hot-path `users` read on every event.
- Put role overrides (owner → enterprise) in one shared helper so both
  services compute the effective plan the same way (`planPolicy.js` logic).
- Add a nightly read-only reconciliation job that reports
  `api_keys.plan != users.plan` mismatches (alert; fix via the sync helper).
- Make the webhook idempotent per Stripe event id and retry the mirror write;
  log a structured `plan_sync_failed` line that can alert.

Not chosen: making `api_keys.plan` canonical (a user has many keys; Stripe
subscriptions are per user) or moving billing into Cloud Run now (larger
change; possible later once the App Engine service is retired).
