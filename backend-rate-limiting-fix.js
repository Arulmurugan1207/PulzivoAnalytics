/**
 * BACKEND RATE LIMITING FIX FOR ENTERPRISE USERS
 * 
 * Add this middleware to your analytics service:
 * Location: C:\Users\arul0\Documents\MyProjects\node-server-api\services\analytics\middleware\rateLimiter.js
 * 
 * This fixes the "Daily limit exceeded" error for enterprise users
 */

const { ObjectId } = require('mongodb');

// Plan-based rate limits
const PLAN_LIMITS = {
  free: {
    dailyLimit: 1000,
    monthlyLimit: 5000,
    rateLimitPerMinute: 10
  },
  pro: {
    dailyLimit: 50000,
    monthlyLimit: 500000,
    rateLimitPerMinute: 100
  },
  enterprise: {
    dailyLimit: null, // No daily limit
    monthlyLimit: null, // No monthly limit
    rateLimitPerMinute: null // No rate limit per minute
  }
};

/**
 * Rate limiting middleware for analytics endpoints
 */
async function rateLimitingMiddleware(req, res, next) {
  try {
    const apiKey = req.query.apiKey || req.body.apiKey || req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ message: 'API key required' });
    }

    const db = req.db || await initDb(); // Assuming you have database connection
    
    // Get API key details and user plan
    const apiKeyDoc = await db.collection('apiKeys').findOne({ 
      apiKey: apiKey 
    });
    
    if (!apiKeyDoc) {
      return res.status(401).json({ message: 'Invalid API key' });
    }

    // Get user and their plan
    const user = await db.collection('users').findOne({ 
      _id: apiKeyDoc.userId 
    });
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const userPlan = user.plan || 'free';
    const planLimits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;

    // ENTERPRISE USERS: Skip all rate limiting
    if (userPlan === 'enterprise') {
      console.log(`[Rate Limiter] Enterprise user ${user._id} - No limits applied`);
      req.userPlan = userPlan;
      req.userId = user._id;
      req.apiKeyDoc = apiKeyDoc;
      return next();
    }

    // Apply rate limiting for free and pro users only
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Check daily limit (if plan has one)
    if (planLimits.dailyLimit) {
      const dailyCount = await db.collection('analytics').countDocuments({
        userId: user._id,
        timestamp: { $gte: todayStart }
      });

      if (dailyCount >= planLimits.dailyLimit) {
        console.log(`[Rate Limiter] Daily limit exceeded for user ${user._id} (${userPlan} plan): ${dailyCount}/${planLimits.dailyLimit}`);
        return res.status(429).json({ 
          message: 'Daily limit exceeded',
          plan: userPlan,
          dailyUsage: dailyCount,
          dailyLimit: planLimits.dailyLimit,
          resetTime: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) // Tomorrow
        });
      }
    }

    // Check monthly limit (if plan has one)
    if (planLimits.monthlyLimit) {
      const monthlyCount = await db.collection('analytics').countDocuments({
        userId: user._id,
        timestamp: { $gte: monthStart }
      });

      if (monthlyCount >= planLimits.monthlyLimit) {
        console.log(`[Rate Limiter] Monthly limit exceeded for user ${user._id} (${userPlan} plan): ${monthlyCount}/${planLimits.monthlyLimit}`);
        return res.status(429).json({ 
          message: 'Monthly limit exceeded',
          plan: userPlan,
          monthlyUsage: monthlyCount,
          monthlyLimit: planLimits.monthlyLimit,
          resetTime: new Date(now.getFullYear(), now.getMonth() + 1, 1) // Next month
        });
      }
    }

    // Rate limiting per minute (if plan has one)
    if (planLimits.rateLimitPerMinute) {
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const recentCount = await db.collection('analytics').countDocuments({
        userId: user._id,
        timestamp: { $gte: oneMinuteAgo }
      });

      if (recentCount >= planLimits.rateLimitPerMinute) {
        console.log(`[Rate Limiter] Per-minute rate limit exceeded for user ${user._id} (${userPlan} plan): ${recentCount}/${planLimits.rateLimitPerMinute}`);
        return res.status(429).json({ 
          message: 'Rate limit exceeded - too many requests per minute',
          plan: userPlan,
          perMinuteUsage: recentCount,
          perMinuteLimit: planLimits.rateLimitPerMinute,
          retryAfter: 60 // seconds
        });
      }
    }

    // All checks passed - allow request
    console.log(`[Rate Limiter] Rate limit check passed for user ${user._id} (${userPlan} plan)`);
    req.userPlan = userPlan;
    req.userId = user._id;
    req.apiKeyDoc = apiKeyDoc;
    next();

  } catch (error) {
    console.error('[Rate Limiter] Error in rate limiting middleware:', error);
    res.status(500).json({ message: 'Internal server error during rate limiting' });
  }
}

/**
 * Enhanced analytics logging endpoint with proper rate limiting
 * POST /analytics/log
 */
async function logAnalyticsEvents(req, res) {
  try {
    const events = req.body;
    const userId = req.userId; // Set by middleware
    const userPlan = req.userPlan; // Set by middleware
    
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ message: 'Events array required' });
    }

    const db = req.db || await initDb();
    
    // Process events for storage
    const processedEvents = events.map(event => ({
      ...event,
      userId: new ObjectId(userId),
      timestamp: new Date(),
      plan: userPlan,
      processed_at: new Date()
    }));

    // Store events in database
    const result = await db.collection('analytics').insertMany(processedEvents);
    
    console.log(`[Analytics] Stored ${result.insertedCount} events for user ${userId} (${userPlan} plan)`);
    
    res.status(200).json({ 
      success: true,
      eventsReceived: events.length,
      eventsStored: result.insertedCount,
      plan: userPlan
    });

  } catch (error) {
    console.error('[Analytics] Error logging events:', error);
    res.status(500).json({ message: 'Failed to log analytics events', error: error.message });
  }
}

// ============================================
// USAGE INSTRUCTIONS
// ============================================

/*
1. Add this middleware to your analytics routes:

// In your router file (e.g., routes/analytics.js)
const express = require('express');
const router = express.Router();

// Apply rate limiting middleware
router.use(rateLimitingMiddleware);

// Analytics endpoints
router.post('/log', logAnalyticsEvents);
router.get('/metrics', getMetrics);
// ... other endpoints

module.exports = router;

2. Make sure your user collection has the correct plan field:
   - 'free', 'pro', or 'enterprise'
   - Enterprise users will bypass all rate limits

3. Update any existing rate limiting logic to use this middleware instead

4. Test with enterprise API keys to confirm no limits are applied
*/

module.exports = {
  rateLimitingMiddleware,
  logAnalyticsEvents,
  PLAN_LIMITS
};