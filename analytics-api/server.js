'use strict';

/**
 * Pulzivo Analytics Node API — ingest, key validate, dashboard metrics.
 *
 * Distinct from Cloud Run service `analytics` (Pulzivo marketing SPA).
 * Matches App Engine analytics-dot-node-server-apis /analytics/log behavior:
 *   OPTIONS -> 204 + CORS
 *   POST    -> 200 {"status":"ok"}
 *   GET     -> 404
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
const { buildDateFilter, toDate } = require('./query');
const { registerMetricRoutes } = require('./metrics');
const { ensureEventIndexes } = require('./indexes');

const DEFAULT_ORIGINS = [
  'https://tabletennistube.com',
  'https://www.tabletennistube.com',
  'https://pulzivo.com',
  'https://www.pulzivo.com',
];

const CORS_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'x-api-key',
  'apiKey',
  'Cache-Control',
  'Pragma',
  'Expires',
  'Accept',
];

function parseOrigins(raw) {
  if (!raw || !String(raw).trim()) return [...DEFAULT_ORIGINS];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || '';
}

function mongoDbName() {
  return process.env.MONGODB_DB || process.env.MONGO_DB || 'analytics';
}

function apiKeysCollectionName() {
  return process.env.API_KEYS_COLLECTION || 'api_keys';
}

function eventsCollectionName() {
  return process.env.EVENTS_COLLECTION || 'events';
}


function normalizePagePath(page) {
  if (typeof page !== 'string') return page;
  let p = page;
  for (let i = 0; i < 3; i++) {
    p = p
      .replace(/%0A/gi, '')
      .replace(/%0D/gi, '')
      .replace(/%09/gi, '')
      .replace(/\r/g, '')
      .replace(/\n/g, '')
      .replace(/\t/g, '');
  }
  p = p.trim();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

// Date matching lives in query.js so numeric ingest timestamps are included.

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostnameFromOrigin(origin) {
  if (!origin) return '';
  try {
    return new URL(origin).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(origin).replace(/^www\./, '').toLowerCase();
  }
}

async function resolveApiKeyFromRequest(db, req) {
  const q = String(req.query.apiKey || req.query.apikey || req.headers['x-api-key'] || '').trim();
  if (q && q !== 'unknown') return q;
  if (!db) return '';
  const host = hostnameFromOrigin(req.headers.origin || req.headers.referer || req.headers.referrer || '');
  if (!host) return '';
  const doc = await db.collection(apiKeysCollectionName()).findOne({
    isActive: { $ne: false },
    isDeleted: { $ne: true },
    allowedDomains: {
      $elemMatch: {
        $regex: `^(https?://)?(www\\.)?${escapeRegex(host)}/?$`,
        $options: 'i',
      },
    },
  });
  return doc?.apiKey || '';
}

function createApp(options = {}) {
  const allowedOrigins = new Set(options.origins || parseOrigins(process.env.CORS_ORIGINS));
  const db = options.db || null;

  const app = express();
  // Cloud Run sits behind a single Google Frontend hop.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  // Restore Express signature to match AE analytics (x-powered-by: Express).
  app.use((_req, res, next) => {
    res.setHeader('X-Powered-By', 'Express');
    next();
  });

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, origin);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: CORS_HEADERS,
    optionsSuccessStatus: 204,
    maxAge: 86400,
    credentials: false,
  };

  app.use(cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/plain', 'text/*'], limit: '1mb' }));

  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 200),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false },
  }));

  // Always ACK preflight with 204 (AE analytics). Reflect ACAO only for allowlisted origins.
  app.options('/analytics/log', (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS.join(','));
    res.status(204).end();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'pulzivo-analytics-api',
      mongo: Boolean(db),
    });
  });

  app.get('/', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'pulzivo-analytics-api',
      endpoints: [
        '/analytics/log',
        '/analytics/public-stats',
        '/analytics/page-stats',
        '/analytics/metrics',
        '/analytics/page-views',
        '/analytics/event-history',
        '/api-keys/:apiKey/validate',
        '/health',
      ],
    });
  });

  app.get('/api-keys/:apiKey/validate', async (req, res) => {
    const apiKey = String(req.params.apiKey || '').trim();
    if (!apiKey || apiKey === 'unknown') {
      return res.status(401).json({ valid: false, message: 'Invalid API key' });
    }

    if (!db) {
      return res.status(503).json({ valid: false, message: 'API key store unavailable' });
    }

    try {
      const doc = await db.collection(apiKeysCollectionName()).findOne({
        apiKey,
        isActive: { $ne: false },
        isDeleted: { $ne: true },
      });
      if (!doc) {
        return res.status(401).json({ valid: false, message: 'Invalid API key' });
      }
      return res.status(200).json({
        valid: true,
        plan: doc.plan || 'free',
        userId: doc.userId || null,
        name: doc.name || '',
        limits: doc.limits || { daily: null, monthly: null, rateLimitPerMinute: null },
      });
    } catch (err) {
      console.error('[analytics-api] validate failed', err);
      return res.status(503).json({ valid: false, message: 'API key store unavailable' });
    }
  });


  // Site-wide public counters (footer / header visits)
  app.get('/analytics/public-stats', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: 'stats unavailable' });
      }
      const apiKey = await resolveApiKeyFromRequest(db, req);
      if (!apiKey) {
        return res.status(400).json({ error: 'apiKey query param required' });
      }
      const [totalPageViews, scriptCopied] = await Promise.all([
        db.collection(eventsCollectionName()).countDocuments({ apiKey, event_name: 'page_view' }),
        db.collection(eventsCollectionName()).countDocuments({ apiKey, event_name: 'script_copied' }),
      ]);
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=60');
      return res.json({ totalPageViews, scriptCopied });
    } catch (err) {
      console.error('[analytics-api] public-stats failed', err);
      return res.status(500).json({ error: err.message || 'stats failed' });
    }
  });

  // Per-path counters (articles / tournaments). Tournament root paths use prefix match.
  app.get('/analytics/page-stats', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ error: 'stats unavailable' });
      }
      const apiKey = await resolveApiKeyFromRequest(db, req);
      const rawPath = String(req.query.path || '').trim();
      if (!rawPath) {
        return res.status(400).json({ error: 'path query param required' });
      }

      let decodedPath = rawPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        decodedPath = rawPath;
      }
      const normalizedPath = normalizePagePath(decodedPath.split('?')[0]);

      const truthy = (value) => {
        const v = String(value ?? '').trim().toLowerCase();
        return v === '1' || v === 'true' || v === 'yes' || v === 'prefix' || v === 'recursive';
      };
      const matchRaw = String(req.query.match || '').trim().toLowerCase();
      const wantsPrefix =
        matchRaw === 'prefix' ||
        truthy(req.query.prefix) ||
        truthy(req.query.includeChildren) ||
        truthy(req.query.recursive);
      const isTournamentRoot = /^\/tournaments\/[^/]+$/.test(normalizedPath);
      const usePrefix = matchRaw === 'exact' ? false : (wantsPrefix || isTournamentRoot);
      const matchMode = usePrefix ? 'prefix' : 'exact';

      let pageFilter;
      if (usePrefix) {
        const prefixRegex = `^${escapeRegex(normalizedPath)}(?:/.*)?$`;
        pageFilter = { 'data.page': { $regex: prefixRegex, $options: 'i' } };
      } else {
        const variants = Array.from(new Set([
          normalizedPath,
          `${normalizedPath}/`,
          rawPath,
          decodedPath,
        ].map((p) => normalizePagePath(String(p || '').split('?')[0]))));
        pageFilter = { 'data.page': { $in: variants } };
      }

      const dateFilter = buildDateFilter(req);
      const apiKeyFilter = apiKey ? { apiKey } : {};
      const events = db.collection(eventsCollectionName());
      const [totalPageViews, totalShares] = await Promise.all([
        events.countDocuments({ ...apiKeyFilter, event_name: 'page_view', ...pageFilter, ...dateFilter }),
        events.countDocuments({ ...apiKeyFilter, event_name: 'article_share', ...pageFilter, ...dateFilter }),
      ]);

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      return res.json({
        apiKey: apiKey || null,
        scopedByApiKey: Boolean(apiKey),
        path: normalizedPath,
        match: matchMode,
        totalPageViews,
        pageViews: totalPageViews,
        count: totalPageViews,
        totalShares,
        shares: totalShares,
      });
    } catch (err) {
      console.error('[analytics-api] page-stats failed', err);
      return res.status(500).json({ error: err.message || 'stats failed' });
    }
  });

  registerMetricRoutes(app, { db });

  const persistIngest = async (req, res) => {
    const events = normalizeEvents(req);
    if (db && events.length) {
      try {
        const now = new Date();
        const docs = events.map((event) => ({
          ...event,
          receivedAt: now,
          createdAt: event.createdAt ? new Date(event.createdAt) : now,
        }));
        await db.collection(eventsCollectionName()).insertMany(docs, { ordered: false });
      } catch (err) {
        // Ingest stays 200 like AE analytics — do not fail the tracker on a write error.
        console.error('[analytics-api] event insert failed', err);
      }
    }
    return res.status(200).json({ status: 'ok' });
  };

  app.post('/analytics/log', persistIngest);
  app.post('/analytics/events', persistIngest);

  app.use((req, res) => {
    res.status(404).type('html').send(
      `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot ${req.method} ${req.path}</pre>
</body>
</html>`
    );
  });

  return app;
}

function parseMaybeJson(body) {
  if (body == null) return null;
  if (typeof body === 'object') return body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeEvents(req) {
  const parsed = parseMaybeJson(req.body);
  const queryKey = req.query && (req.query.apiKey || req.query.apikey);
  let list = [];
  let envelopeKey = queryKey;

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && Array.isArray(parsed.events)) {
    list = parsed.events;
    envelopeKey = parsed.apiKey || parsed.service || envelopeKey;
  } else if (parsed && parsed.event_name) {
    list = [parsed];
    envelopeKey = parsed.apiKey || parsed.service || envelopeKey;
  }

  return list
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const service = event.service || event.apiKey || envelopeKey || null;
      return {
        event_name: event.event_name || event.eventType || event.name || 'unknown',
        user_id: event.user_id || event.userId || null,
        user_email: event.user_email || event.userEmail || null,
        data: event.data && typeof event.data === 'object' ? event.data : event,
        service,
        apiKey: service,
        page: event.page || event.data?.page || null,
        session_id: event.session_id || event.data?.session_id || null,
        timestamp: toDate(event.timestamp || event.data?.timestamp) || new Date(),
      };
    });
}

async function connectMongo() {
  const uri = mongoUri();
  if (!uri) {
    console.warn('[analytics-api] No MONGODB_URI/MONGO_URI — ingest will ACK without persist');
    return { client: null, db: null };
  }
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(mongoDbName());
  console.log(`[analytics-api] Mongo connected db=${mongoDbName()}`);
  return { client, db };
}

async function start() {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  let client = null;
  let db = null;
  try {
    ({ client, db } = await connectMongo());
  } catch (err) {
    console.error('[analytics-api] Mongo connect failed; serving ingest without persist', err);
  }
  const app = createApp({ db });
  if (db) {
    // Do not await: index builds must not hold the startup probe.
    // createIndex is idempotent and does not rewrite event documents.
    ensureEventIndexes(db).catch((err) => {
      console.error('[analytics-api] ensure indexes failed', err);
    });
  }
  const server = app.listen(port, host, () => {
    console.log(`[analytics-api] listening on ${host}:${port}`);
  });
  const shutdown = async () => {
    server.close();
    if (client) await client.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createApp, start, parseOrigins, DEFAULT_ORIGINS, normalizeEvents, buildDateFilter, toDate };
