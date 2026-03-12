/**
 * Backend API Endpoints for Plan History & Billing
 * 
 * Add these endpoints to your user controller in the analytics service
 * Location: C:\Users\arul0\Documents\MyProjects\node-server-api\services\analytics\controllers\user.controller.js
 */

// ============================================
// 1. GET PLAN HISTORY
// ============================================
/**
 * Get user's plan change history
 * GET /api/users/:userId/plan-history
 */
async function getPlanHistory(req, res) {
  try {
    const { userId } = req.params;
    const db = await initDb();
    
    // Fetch plan history from planHistory collection
    const history = await db.collection('planHistory')
      .find({ userId: new ObjectId(userId) })
      .sort({ changedAt: -1 })
      .toArray();
    
    res.json({ history });
  } catch (error) {
    console.error('Error fetching plan history:', error);
    res.status(500).json({ message: 'Failed to fetch plan history', error: error.message });
  }
}

// ============================================
// 2. GET CURRENT BILLING CYCLE INFO
// ============================================
/**
 * Get current billing cycle and usage information
 * GET /api/users/:userId/billing/current
 */
async function getCurrentBillingInfo(req, res) {
  try {
    const { userId } = req.params;
    const db = await initDb();
    
    // Get user data
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get API keys count
    const apiKeysUsed = await db.collection('apiKeys').countDocuments({ userId: new ObjectId(userId) });
    
    // Calculate current period (assuming monthly billing)
    const planStartDate = user.planStartDate || user.createdAt;
    const currentDate = new Date();
    const currentPeriodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentPeriodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    // Calculate days remaining
    const daysRemaining = Math.ceil((currentPeriodEnd - currentDate) / (1000 * 60 * 60 * 24));
    
    // Get events count for current month
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const eventsUsed = await db.collection('analytics').countDocuments({
      userId: new ObjectId(userId),
      timestamp: { $gte: startOfMonth }
    });
    
    // Define limits based on plan
    const planLimits = {
      free: { apiKeysLimit: 1, eventsLimit: 5000, dataRetention: '7 days' },
      pro: { apiKeysLimit: 5, eventsLimit: 500000, dataRetention: '12 months' },
      enterprise: { apiKeysLimit: 'unlimited', eventsLimit: 'unlimited', dataRetention: '24 months' }
    };
    
    const limits = planLimits[user.plan] || planLimits.free;
    
    res.json({
      eventsUsed,
      eventsLimit: limits.eventsLimit,
      apiKeysUsed,
      apiKeysLimit: limits.apiKeysLimit,
      dataRetention: limits.dataRetention,
      currentPeriodStart,
      currentPeriodEnd,
      daysRemaining
    });
  } catch (error) {
    console.error('Error fetching billing info:', error);
    res.status(500).json({ message: 'Failed to fetch billing info', error: error.message });
  }
}

// ============================================
// 3. GET PAYMENT HISTORY
// ============================================
/**
 * Get user's payment history
 * GET /api/users/:userId/payments
 */
async function getPaymentHistory(req, res) {
  try {
    const { userId } = req.params;
    const db = await initDb();
    
    // Fetch payment history
    const payments = await db.collection('payments')
      .find({ userId: new ObjectId(userId) })
      .sort({ billingDate: -1 })
      .toArray();
    
    res.json({ payments });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ message: 'Failed to fetch payment history', error: error.message });
  }
}

// ============================================
// 4. GET USAGE METRICS
// ============================================
/**
 * Get user's usage metrics over time
 * GET /api/users/:userId/usage?start=date&end=date
 */
async function getUsageMetrics(req, res) {
  try {
    const { userId } = req.params;
    const { start, end } = req.query;
    const db = await initDb();
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Aggregate daily usage
    const metrics = await db.collection('analytics').aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          eventsCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          eventsCount: 1
        }
      },
      { $sort: { date: 1 } }
    ]).toArray();
    
    // Get API keys count (assume constant for now)
    const apiKeysUsed = await db.collection('apiKeys').countDocuments({ userId: new ObjectId(userId) });
    
    // Add apiKeysUsed to each metric
    const enrichedMetrics = metrics.map(m => ({
      ...m,
      apiKeysUsed
    }));
    
    res.json({ metrics: enrichedMetrics });
  } catch (error) {
    console.error('Error fetching usage metrics:', error);
    res.status(500).json({ message: 'Failed to fetch usage metrics', error: error.message });
  }
}

// ============================================
// 5. UPDATE USER PLAN (Enhanced)
// ============================================
/**
 * Update user's plan and record history
 * PUT /api/users/:userId/plan
 */
async function updateUserPlanWithHistory(req, res) {
  try {
    const { userId } = req.params;
    const { plan } = req.body;
    const db = await initDb();
    
    // Get current user data
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const previousPlan = user.plan;
    
    // Determine change type
    const planHierarchy = { free: 0, pro: 1, enterprise: 2 };
    const changeType = planHierarchy[plan] > planHierarchy[previousPlan] ? 'upgrade' :
                       planHierarchy[plan] < planHierarchy[previousPlan] ? 'downgrade' : 'initial';
    
    // Calculate price
    const prices = { free: 0, pro: 19, enterprise: 79 };
    const pricePaid = prices[plan] || 0;
    
    // Update user plan
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          plan,
          planUpdatedAt: new Date(),
          planStartDate: new Date()
        }
      }
    );
    
    // Record plan history
    await db.collection('planHistory').insertOne({
      userId: new ObjectId(userId),
      previousPlan,
      newPlan: plan,
      changeType,
      changedAt: new Date(),
      pricePaid,
      billingCycle: 'month',
      changedBy: userId
    });
    
    // If it's an upgrade/downgrade, create a payment record
    if (pricePaid > 0 && changeType !== 'initial') {
      const currentDate = new Date();
      const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      await db.collection('payments').insertOne({
        userId: new ObjectId(userId),
        plan,
        amount: pricePaid,
        status: 'completed',
        paymentMethod: 'card',
        transactionId: `txn_${Date.now()}`,
        billingDate: new Date(),
        periodStart,
        periodEnd,
        invoiceUrl: null
      });
    }
    
    res.json({ 
      message: 'Plan updated successfully',
      plan,
      previousPlan,
      changeType
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ message: 'Failed to update plan', error: error.message });
  }
}

// ============================================
// 6. CANCEL SUBSCRIPTION
// ============================================
/**
 * Cancel user's subscription
 * POST /api/users/:userId/cancel-subscription
 */
async function cancelSubscription(req, res) {
  try {
    const { userId } = req.params;
    const db = await initDb();
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Set cancellation date (will downgrade to free at end of billing period)
    const currentDate = new Date();
    const periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          planCancelledAt: new Date(),
          cancellationReason: 'user_request',
          downgradedAt: periodEnd
        }
      }
    );
    
    res.json({ 
      message: 'Subscription cancelled successfully',
      activeUntil: periodEnd
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription', error: error.message });
  }
}

// ============================================
// ADD THESE ROUTES TO YOUR EXPRESS APP
// ============================================
/*
router.get('/users/:userId/plan-history', verifyToken, getPlanHistory);
router.get('/users/:userId/billing/current', verifyToken, getCurrentBillingInfo);
router.get('/users/:userId/payments', verifyToken, getPaymentHistory);
router.get('/users/:userId/usage', verifyToken, getUsageMetrics);
router.put('/users/:userId/plan', verifyToken, updateUserPlanWithHistory);
router.post('/users/:userId/cancel-subscription', verifyToken, cancelSubscription);
*/

// ============================================
// MONGODB COLLECTIONS NEEDED
// ============================================
/*
1. planHistory collection:
{
  userId: ObjectId,
  previousPlan: String,
  newPlan: String,
  changeType: String,
  changedAt: Date,
  pricePaid: Number,
  billingCycle: String,
  changedBy: String
}

2. payments collection:
{
  userId: ObjectId,
  plan: String,
  amount: Number,
  status: String,
  paymentMethod: String,
  transactionId: String,
  billingDate: Date,
  periodStart: Date,
  periodEnd: Date,
  invoiceUrl: String
}

3. Update users collection to include:
{
  ...existing fields,
  planStartDate: Date,
  planUpdatedAt: Date,
  planCancelledAt: Date,
  cancellationReason: String,
  downgradedAt: Date
}
*/

module.exports = {
  getPlanHistory,
  getCurrentBillingInfo,
  getPaymentHistory,
  getUsageMetrics,
  updateUserPlanWithHistory,
  cancelSubscription,
  getTopPages
};

// ============================================
// TOP PAGES ANALYTICS ENDPOINT  
// ============================================
/**
 * Get top pages by page views
 * GET /api/analytics/top-pages?apiKey={apiKey}&limit={limit}
 */
async function getTopPages(req, res) {
  try {
    const { apiKey, limit = 10 } = req.query;
    
    if (!apiKey) {
      return res.status(400).json({ message: 'API key is required' });
    }
    
    const db = await initDb();
    
    // Find the API key and get the user
    const apiKeyDoc = await db.collection('apiKeys').findOne({ apiKey });
    if (!apiKeyDoc) {
      return res.status(404).json({ message: 'API key not found' });
    }
    
    // Aggregate page views from analytics collection
    const topPages = await db.collection('analytics').aggregate([
      {
        $match: {
          apiKey: apiKey,
          event_name: 'page_view',
          'data.page': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$data.page',
          views: { $sum: 1 },
          title: { $last: '$data.page_title' }
        }
      },
      {
        $sort: { views: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $project: {
          _id: 0,
          path: '$_id',
          views: 1,
          title: 1
        }
      }
    ]).toArray();
    
    // Calculate total page views for percentage calculation
    const totalPageViews = await db.collection('analytics').countDocuments({
      apiKey: apiKey,
      event_name: 'page_view'
    });
    
    // Add percentage to each page
    const pagesWithPercentage = topPages.map(page => ({
      ...page,
      percentage: totalPageViews > 0 ? (page.views / totalPageViews * 100) : 0
    }));
    
    res.json({
      pages: pagesWithPercentage,
      totalPageViews
    });
    
  } catch (error) {
    console.error('Error fetching top pages:', error);
    res.status(500).json({ message: 'Failed to fetch top pages', error: error.message });
  }
}

// ============================================
// FUNNEL EVENTS ENDPOINT
// ============================================
/**
 * Get unique visitor count for a specific event — used by the Funnel Builder
 * to calculate step-by-step conversion rates.
 *
 * GET /api/analytics/funnel-events/:eventName?limit=&apiKey=
 * 
 * Returns: { eventName, count, uniqueVisitors }
 * 
 * Route registration (add to your Express router):
 *   router.get('/analytics/funnel-events/:eventName', validateApiKey, getFunnelEventCount);
 */
async function getFunnelEventCount(req, res) {
  try {
    const { eventName } = req.params;
    const { apiKey, startDate, endDate } = req.query;

    if (!apiKey || !eventName) {
      return res.status(400).json({ message: 'apiKey and eventName are required' });
    }

    const db = await initDb();

    // Validate the API key belongs to a real user
    const key = await db.collection('apiKeys').findOne({ apiKey, isActive: { $ne: false } });
    if (!key) {
      return res.status(401).json({ message: 'Invalid or inactive API key' });
    }

    // Build date filter (optional)
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate)   dateFilter.$lte = new Date(endDate);

    const matchStage = {
      apiKey,
      event_name: eventName,
      ...(Object.keys(dateFilter).length ? { timestamp: dateFilter } : {})
    };

    // Count distinct user_ids who fired this event — this is what makes
    // funnel math meaningful (we count people, not raw event hits)
    const result = await db.collection('analytics').aggregate([
      { $match: matchStage },
      { $group: { _id: '$user_id' } },
      { $count: 'uniqueVisitors' }
    ]).toArray();

    const uniqueVisitors = result[0]?.uniqueVisitors ?? 0;

    res.json({
      eventName,
      count: uniqueVisitors,       // Alias: funnels.ts checks both `count` and `uniqueVisitors`
      uniqueVisitors
    });

  } catch (error) {
    console.error('Error fetching funnel event count:', error);
    res.status(500).json({ message: 'Failed to fetch funnel event count', error: error.message });
  }
}

// ============================================
// CONVERSION FUNNEL ENDPOINT
// ============================================
/**
 * Returns a preset conversion funnel for the Overview dashboard chart.
 * Steps are fixed to the core Pulzivo acquisition funnel.
 *
 * GET /api/analytics/conversion-funnel?apiKey=
 *
 * Returns: { steps: [{ label, count, percentage }] }
 *
 * Route registration:
 *   router.get('/analytics/conversion-funnel', validateApiKey, getConversionFunnel);
 */
async function getConversionFunnel(req, res) {
  try {
    const { apiKey } = req.query;

    if (!apiKey) {
      return res.status(400).json({ message: 'apiKey is required' });
    }

    const db = await initDb();

    // Validate the API key
    const key = await db.collection('apiKeys').findOne({ apiKey, isActive: { $ne: false } });
    if (!key) {
      return res.status(401).json({ message: 'Invalid or inactive API key' });
    }

    // Fixed funnel steps: the core Pulzivo product acquisition pipeline
    const funnelSteps = [
      { label: 'Visited Homepage', eventName: 'page_view' },
      { label: 'Viewed Pricing',   eventName: 'pricing_viewed' },
      { label: 'Sign Up Started',  eventName: 'signup_started' },
      { label: 'Sign Up Completed',eventName: 'signup_completed' },
    ];

    // Count unique users per step in parallel
    const counts = await Promise.all(
      funnelSteps.map(async (step) => {
        const result = await db.collection('analytics').aggregate([
          { $match: { apiKey, event_name: step.eventName } },
          { $group: { _id: '$user_id' } },
          { $count: 'n' }
        ]).toArray();
        return result[0]?.n ?? 0;
      })
    );

    const baseline = counts[0] || 0;

    const steps = funnelSteps.map((step, i) => ({
      label:      step.label,
      count:      counts[i],
      percentage: baseline > 0 ? Math.round((counts[i] / baseline) * 1000) / 10 : 0
    }));

    res.json({ steps });

  } catch (error) {
    console.error('Error fetching conversion funnel:', error);
    res.status(500).json({ message: 'Failed to fetch conversion funnel', error: error.message });
  }
}
