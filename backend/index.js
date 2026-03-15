require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('./middleware/authenticate');
const cookieParser = require('cookie-parser');
const Stripe = require("stripe");

const app = express();
const prisma = new PrismaClient();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// Webhook to handle Stripe events
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send({ message: `Webhook Error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const stripeSubscriptionId = session.subscription;

    // Fetch full subscription details
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const product = await stripe.products.retrieve(subscription.items.data[0].price.product);

    const existing = await prisma.subscription.findUnique({ where: { userId: userId } });
    if (!existing) {
      await prisma.subscription.create({
        data: {
          userId,
          stripeId: stripeSubscriptionId,
          tier: product.name,
          active: true,
          cancel_at_period_end: false,
          current_period_end: subscription.items.data[0].current_period_end,
          status: subscription.status,
        },
      });
    } else {
      await prisma.subscription.update({
        where: { userId: userId },
        data: {
          stripeId: stripeSubscriptionId,
          active: true,
          cancel_at_period_end: false,
          current_period_end: subscription.items.data[0].current_period_end,
          status: subscription.status,
        },
      });
    }
  }

  if (event.type === 'checkout.session.completed' || event.type === 'invoice.payment_succeeded' || event.type === 'invoice.paid') {
    const session = event.data.object;
    const userId = session.metadata.userId;

    // Optional: fetch subscription details to determine tier
    const subscriptionId = session.subscription;
    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
    const dbSub = await prisma.subscription.findUnique({
      where: { stripeId: subscriptionId },
      select: { tier: true }
    });

    const tokenAmount = getTokenAmountForTier(dbSub.tier); // 👇

    await prisma.subscription.update({
      where: { userId },
      data: {
        searchTokens: tokenAmount,
      },
    });
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object;

    const status = subscription.status; // 'active', 'trialing', etc.
    const stripeId = subscription.id;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    const currentPeriodEnd = subscription.items.data[0].current_period_end;

    const isActive = ['active', 'trialing', 'past_due', 'unpaid', 'canceled'].includes(status);

    await prisma.subscription.update({
      where: { stripeId },
      data: {
        status,
        active: isActive,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: currentPeriodEnd,
      },
    });
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;

    await prisma.subscription.update({
      where: { stripeId: subscription.id },
      data: {
        status: 'canceled',
        active: false,
      },
    });
  }

  res.sendStatus(200);
});

app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/onboarding', authenticate, require('./routes/onboarding'));
app.use('/api/billing', authenticate, require('./routes/billing'));
app.use('/api/leads', authenticate, require('./routes/leads'));
app.use('/api/search', authenticate, require('./routes/search'));
app.use('/api/lists', authenticate, require('./routes/lists'));

app.listen(process.env.PORT, () =>
  console.log(`Server running on http://localhost:${process.env.PORT}`)
);

function getTokenAmountForTier(tier) {
  switch (tier) {
    case 'Base Outreach Tier':
      return 250;
    default:
      return 0;
  }
}