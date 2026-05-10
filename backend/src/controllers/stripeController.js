const prisma = require('../utils/prismaClient');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ─── Plan map: Stripe Price ID → internal plan name ──────────
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]:  'starter',
  [process.env.STRIPE_PRICE_PRO]:      'pro',
  [process.env.STRIPE_PRICE_BUSINESS]: 'business',
};

const PLAN_TO_PRICE = {
  starter:          process.env.STRIPE_PRICE_STARTER,
  pro:              process.env.STRIPE_PRICE_PRO,
  business:         process.env.STRIPE_PRICE_BUSINESS,
  starter_annual:   process.env.STRIPE_PRICE_STARTER_ANNUAL || process.env.STRIPE_PRICE_STARTER,
  pro_annual:       process.env.STRIPE_PRICE_PRO_ANNUAL || process.env.STRIPE_PRICE_PRO,
  business_annual:  process.env.STRIPE_PRICE_BUSINESS_ANNUAL || process.env.STRIPE_PRICE_BUSINESS,
};

// ─── POST /stripe/checkout ────────────────────────────────────
// Creates a Stripe Checkout session and returns the URL
async function handleCreateCheckout(req, res) {
  try {
    const { plan } = req.body;
    const userId = req.userId;

    if (!['starter', 'pro', 'business', 'starter_annual', 'pro_annual', 'business_annual'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    const priceId = PLAN_TO_PRICE[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Plan price not configured.' });
    }

    // Get or create Stripe customer
    const user = await prisma.user.findUnique({ where: { id: userId } });
    let customerId = user?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard.html?upgrade=success&plan=${plan}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing.html?upgrade=cancelled`,
      metadata: { userId, plan },
      subscription_data: {
        metadata: { userId, plan },
      },
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('handleCreateCheckout error:', err);
    return res.status(500).json({ error: 'Could not create checkout session.' });
  }
}

// ─── POST /stripe/portal ──────────────────────────────────────
// Opens Stripe Customer Portal for subscription management
async function handleCustomerPortal(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription found.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('handleCustomerPortal error:', err);
    return res.status(500).json({ error: 'Could not open billing portal.' });
  }
}

// ─── GET /stripe/status ───────────────────────────────────────
// Returns current subscription status for the user
async function handleSubscriptionStatus(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    return res.status(200).json({
      plan: user?.plan || 'free',
      stripeCustomerId: user?.stripeCustomerId || null,
      stripeSubscriptionId: user?.stripeSubscriptionId || null,
      subscriptionStatus: user?.subscriptionStatus || null,
    });
  } catch (err) {
    console.error('handleSubscriptionStatus error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── POST /stripe/webhook ─────────────────────────────────────
// Stripe sends events here — updates plan in database
async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body required
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // ── Payment succeeded — activate plan ──────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;

        if (userId && plan) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              plan,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              subscriptionStatus: 'active',
            },
          });
          console.log(`✅ Plan upgraded: user ${userId} → ${plan}`);
        }
        break;
      }

      // ── Subscription updated (upgrade/downgrade) ───────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];
        const customerId = subscription.customer;

        if (plan && customerId) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              plan,
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            },
          });
          console.log(`✅ Subscription updated: customer ${customerId} → ${plan}`);
        }
        break;
      }

      // ── Subscription cancelled — downgrade to free ─────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: 'free',
            stripeSubscriptionId: null,
            subscriptionStatus: 'cancelled',
          },
        });
        console.log(`⚠️ Subscription cancelled: customer ${customerId} → free`);
        break;
      }

      // ── Payment failed — log it ────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { subscriptionStatus: 'past_due' },
        });
        console.log(`❌ Payment failed: customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}

module.exports = {
  handleCreateCheckout,
  handleCustomerPortal,
  handleSubscriptionStatus,
  handleWebhook,
};
