const prisma = require('../utils/prismaClient');
const plans = require('../config/plans');

// Constructed lazily, on first actual use, rather than at module load --
// requiring this controller (part of the unconditional route-require
// chain in index.js) must never crash the whole process just because
// STRIPE_SECRET_KEY isn't set in an environment that doesn't need Stripe
// (e.g. a StadtPocket-only staging backend). The `stripe` npm package
// itself has no such requirement; only calling it as a constructor does.
const Stripe = require('stripe');
let stripeClient = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured on this environment (STRIPE_SECRET_KEY missing).');
  }
  if (!stripeClient) stripeClient = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

// Plan ↔ Stripe Price ID mapping comes from config/plans.js
// (stripePriceIdForPlan / planIdForStripePrice): monthly and annual,
// no silent annual→monthly fallback, enterprise never purchasable.

// A subscription in one of these statuses no longer entitles the user
// (canonical plan model) and does not block a new checkout.
function isRevokedStatus(status) {
  return typeof status === 'string' &&
    plans.REVOKING_SUBSCRIPTION_STATUSES.includes(status.trim().toLowerCase());
}

// ─── POST /stripe/checkout ────────────────────────────────────
// Creates a Stripe Checkout session and returns the URL
async function handleCreateCheckout(req, res) {
  try {
    const { plan } = req.body;
    const userId = req.userId;

    if (!plans.isPurchasable(plan)) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    const priceId = plans.stripePriceIdForPlan(plan);
    if (!priceId) {
      return res.status(400).json({ error: 'Plan price not configured.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Internal accounts (enterprise = internal Business) are never sold a plan.
    if (user && plans.normalizePlan(user.plan).isInternal) {
      return res.status(409).json({
        error: 'internal_account',
        message: 'This account is managed internally and cannot purchase a plan.',
      });
    }

    // One subscription per account: plan changes go through the billing portal.
    if (user?.stripeSubscriptionId && !isRevokedStatus(user.subscriptionStatus)) {
      return res.status(409).json({
        error: 'subscription_exists',
        message: 'You already have a subscription. Use Manage Billing to change your plan.',
      });
    }

    // Get or create Stripe customer
    let customerId = user?.stripeCustomerId;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user?.email || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await getStripe().checkout.sessions.create({
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

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('handleCustomerPortal error:', err);
    return res.status(500).json({ error: 'Could not open billing portal.' });
  }
}

// Renewal / cancellation details read live from Stripe (not stored).
// Any Stripe error yields null so /stripe/status never fails because of it.
async function readSubscriptionDetails(subscriptionId) {
  try {
    const s = await getStripe().subscriptions.retrieve(subscriptionId);
    const item = s.items?.data?.[0];
    const periodEnd = s.current_period_end ?? item?.current_period_end ?? null;
    return {
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancelAtPeriodEnd: !!s.cancel_at_period_end,
      interval: item?.price?.recurring?.interval || null,
    };
  } catch (err) {
    console.error('readSubscriptionDetails error:', err.message);
    return null;
  }
}

// ─── GET /stripe/status ───────────────────────────────────────
// Returns current subscription status for the user
async function handleSubscriptionStatus(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const rawPlan = user?.plan || 'free';
    // Canonical effective plan (trial expiry, subscription status,
    // annual = base, enterprise = internal Business, unknown = Free).
    const r = plans.resolveEffectivePlan(user || {});
    const entitlements = plans.getPlanEntitlements(r.effectiveBase);
    const applies = r.plan.known && r.effectiveBase === r.plan.base;
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    const hasStripeCustomer = !!user?.stripeCustomerId;
    const hasSubscription = !!user?.stripeSubscriptionId;
    return res.status(200).json({
      plan: rawPlan,
      basePlan: r.effectiveBase,
      aiLimit: entitlements.smartPageLimit, // null = unlimited
      canCreateAI: entitlements.smartPageLimit !== 0,
      canUseDynamic: entitlements.dynamicQr,
      stripeCustomerId: user?.stripeCustomerId || null,
      stripeSubscriptionId: user?.stripeSubscriptionId || null,
      subscriptionStatus: user?.subscriptionStatus || null,
      // Additive fields for the Billing page
      isAnnual: applies && r.plan.isAnnual,
      isInternal: applies && r.plan.isInternal,
      isTrial: applies && r.plan.isTrial,
      trialExpiresAt: r.plan.isTrial ? (user?.trialExpiresAt || null) : null,
      hasStripeCustomer,
      hasSubscription,
      stripeConfigured,
      portalAvailable: stripeConfigured && hasStripeCustomer,
      subscription: stripeConfigured && hasSubscription
        ? await readSubscriptionDetails(user.stripeSubscriptionId)
        : null,
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
    event = getStripe().webhooks.constructEvent(
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
          // Internal accounts (enterprise = internal Business) are not
          // Stripe-driven: a completed checkout never replaces their plan or
          // status; only the Stripe references are stored so the resulting
          // subscription stays manageable (portal / cancellation).
          const owner = await prisma.user.findUnique({ where: { id: userId } });
          if (owner && plans.normalizePlan(owner.plan).isInternal) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                stripeCustomerId: session.customer,
                stripeSubscriptionId: session.subscription,
              },
            });
            console.log(`ℹ️ Checkout completed: internal account kept (user ${userId})`);
            break;
          }
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
        const plan = plans.planIdForStripePrice(priceId); // monthly or annual; null if unknown
        const customerId = subscription.customer;

        if (customerId) {
          // Status is always recorded; the plan changes only for a known price,
          // so an unknown price can never assign a paid plan.
          // Internal accounts (enterprise = internal Business) are not
          // Stripe-driven: their plan is never overwritten and Stripe's status
          // is not stored (a revoking status would resolve them to Free);
          // only the subscription ID is synchronized.
          const owners = await prisma.user.findMany({
            where: { stripeCustomerId: customerId },
            select: { id: true, plan: true },
          });
          for (const owner of owners) {
            const data = { stripeSubscriptionId: subscription.id };
            if (plans.normalizePlan(owner.plan).isInternal) {
              console.log(`ℹ️ Subscription updated: internal account kept (customer ${customerId}) [${subscription.status}]`);
            } else {
              data.subscriptionStatus = subscription.status;
              if (plan) data.plan = plan;
              console.log(`✅ Subscription updated: customer ${customerId} → ${plan || 'plan unchanged (unmapped price)'} [${subscription.status}]`);
            }
            await prisma.user.update({ where: { id: owner.id }, data });
          }
        }
        break;
      }

      // ── Subscription cancelled — downgrade to free ─────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Internal accounts (enterprise = internal Business) are not
        // Stripe-driven: plan and status are kept (a 'cancelled' status would
        // resolve them to Free). Only a reference to this exact, now-deleted
        // subscription is cleared.
        const owners = await prisma.user.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true, plan: true, stripeSubscriptionId: true },
        });
        for (const owner of owners) {
          if (plans.normalizePlan(owner.plan).isInternal) {
            if (owner.stripeSubscriptionId && owner.stripeSubscriptionId === subscription.id) {
              await prisma.user.update({ where: { id: owner.id }, data: { stripeSubscriptionId: null } });
            }
            console.log(`ℹ️ Subscription cancelled: internal account kept (customer ${customerId})`);
            continue;
          }
          await prisma.user.update({
            where: { id: owner.id },
            data: {
              plan: 'free',
              stripeSubscriptionId: null,
              subscriptionStatus: 'cancelled',
            },
          });
          console.log(`⚠️ Subscription cancelled: customer ${customerId} → free`);
        }
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
