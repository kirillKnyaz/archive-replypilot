require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const authenticate = require('./middleware/authenticate');
const { runAllCampaigns } = require('./service/campaignRunner');

const app = express();

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(cors({
  origin: (origin, cb) => {
    const allowed = process.env.CLIENT_URL || 'http://localhost:5173';
    // Allow web app origin, any chrome-extension origin, and no-origin (tools like curl)
    if (!origin || origin === allowed || origin.startsWith('chrome-extension://')) {
      return cb(null, true);
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Stripe webhook — must use raw body before express.json() parses it
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = require('./lib/prisma');

app.post('/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[stripe] Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata.userId;
        const subscriptionId = session.subscription;
        await prisma.subscription.upsert({
          where: { userId },
          create: { userId, stripeId: subscriptionId, status: 'active', active: true },
          update: { stripeId: subscriptionId, status: 'active', active: true },
        });
      }

      if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeId: sub.id },
          data: {
            status: sub.status,
            active: sub.status === 'active',
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.current_period_end,
          },
        });
      }

      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeId: sub.id },
          data: { status: 'canceled', active: false },
        });
      }
    } catch (err) {
      console.error('[stripe] Webhook handler error:', err.message);
    }

    res.json({ received: true });
  }
);

app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', authenticate, require('./routes/leads'));
app.use('/api/leads/:id/reaches', authenticate, require('./routes/reaches'));
app.use('/api/search', authenticate, require('./routes/search'));
app.use('/api/lists', authenticate, require('./routes/lists'));
app.use('/api/campaigns', authenticate, require('./routes/campaigns'));
app.use('/api/billing', authenticate, require('./routes/billing'));
app.use('/api/admin', authenticate, require('./routes/admin'));

// Daily campaign runs at 6am
cron.schedule('0 6 * * *', async () => {
  console.log('[cron] Starting daily campaign runs...');
  try {
    const results = await runAllCampaigns();
    console.log('[cron] Daily run complete:', JSON.stringify(results));
  } catch (e) {
    console.error('[cron] Daily run failed:', e.message);
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Server running on http://localhost:${process.env.PORT}`)
);
