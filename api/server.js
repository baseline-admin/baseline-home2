/* ============================================================
   BASELINE — api/server.js
   Proxies the Google Sheet data, books Pro consultations, and
   (as of the paywall build) handles Stripe billing. Everyday
   auth/database reads are still client-side via Supabase JS —
   this server only does the writes that must stay out of the
   client's hands (subscription status, referral grants).
   ============================================================ */
const express = require('express');
const fetch   = require('node-fetch');
const { createConsultationEvent } = require('./google-calendar');
const { buildConsultationIcs } = require('./ics');
const { getSupabaseAdmin } = require('./supabaseAdmin');
const { getStripe } = require('./stripeClient');
require('dotenv').config();

const STRIPE_PRICE_IDS = {
  baseline: process.env.STRIPE_PRICE_ID_BASELINE,
  baseline_pro: process.env.STRIPE_PRICE_ID_BASELINE_PRO,
};

function tierFromPriceId(priceId) {
  for (const tier of Object.keys(STRIPE_PRICE_IDS)) {
    if (STRIPE_PRICE_IDS[tier] && STRIPE_PRICE_IDS[tier] === priceId) return tier;
  }
  return null;
}

// Stripe has more subscription statuses than we need to expose — collapse
// them onto the four our `subscriptions.status` check constraint allows.
function mapStripeStatus(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due') return 'past_due';
  return 'canceled'; // canceled, unpaid, incomplete, incomplete_expired, paused
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_LENGTH_DAYS = 14;

// Shared by /api/subscription-status and /api/init-trial. Trial expiry is
// judged live against trial_ends_at, not a stored status, since nothing
// flips 'trialing' to anything else when a trial runs out.
function buildStatusResponse(sub) {
  if (!sub) {
    return {
      status: 'none', tier: null, isLifetimeFree: false,
      trialEndsAt: null, trialDaysRemaining: null, hasAccess: false,
    };
  }
  const trialEndsAtMs = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
  const trialActive = trialEndsAtMs !== null && trialEndsAtMs > Date.now();
  const trialDaysRemaining = trialActive ? Math.max(1, Math.ceil((trialEndsAtMs - Date.now()) / DAY_MS)) : null;
  const hasAccess = sub.is_lifetime_free || sub.status === 'active' || trialActive;
  return {
    status: sub.status,
    tier: sub.tier,
    isLifetimeFree: sub.is_lifetime_free,
    trialEndsAt: sub.trial_ends_at,
    trialDaysRemaining,
    hasAccess,
  };
}

const app = express();

// Stripe signs the *raw* request body, so this route must read it before
// express.json() parses (and thereby destroys) it. Registering the route
// ahead of the json() middleware below achieves that — Express walks
// middleware in registration order, and this handler ends the response
// itself, so json() never touches a webhook request.
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabaseAdmin = getSupabaseAdmin();
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (!userId) {
          console.error('checkout.session.completed had no client_reference_id, skipping');
          break;
        }

        // Fetched before the upsert below overwrites it — an upgrade or
        // downgrade checkout creates a brand new Stripe subscription rather
        // than modifying the existing one, so the old one needs cancelling
        // separately or the customer gets billed for both.
        const { data: existingSub } = await supabaseAdmin
          .from('subscriptions')
          .select('stripe_subscription_id')
          .eq('user_id', userId)
          .maybeSingle();
        const previousSubId = existingSub && existingSub.stripe_subscription_id;

        const stripeSub = await getStripe().subscriptions.retrieve(session.subscription);
        // Newer Stripe API versions moved current_period_end/price off the
        // Subscription object onto each SubscriptionItem (multi-item support).
        const item = stripeSub.items.data[0];
        const tier = (session.metadata && session.metadata.tier) || tierFromPriceId(item && item.price.id);
        const { error } = await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          status: mapStripeStatus(stripeSub.status),
          tier,
          current_period_ends_at: new Date(item.current_period_end * 1000).toISOString(),
        }, { onConflict: 'user_id' });
        if (error) console.error('Failed to record checkout completion:', error.message);

        if (previousSubId && previousSubId !== session.subscription) {
          try {
            await getStripe().subscriptions.cancel(previousSubId);
          } catch (cancelErr) {
            console.error('Failed to cancel previous subscription', previousSubId, cancelErr.message);
          }
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const item = sub.items.data[0];
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStripeStatus(sub.status);
        const tier = tierFromPriceId(item && item.price.id);
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status,
            ...(tier ? { tier } : {}),
            current_period_ends_at: new Date(item.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_customer_id', sub.customer);
        if (error) console.error('Failed to update subscription from webhook:', error.message);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

app.use(express.json());
app.use(express.static('public'));

app.get('/api/sheet-data', async (req, res) => {
  try {
    const response = await fetch(process.env.SHEET_API_URL);
    if (!response.ok) throw new Error('Sheet fetch failed');
    res.json(await response.json());
  } catch (err) {
    console.error('Sheet error:', err.message);
    res.status(500).json({ error: 'Could not fetch sheet data' });
  }
});

app.post('/api/book-consultation', async (req, res) => {
  const { slotISO, email, notes, userLabel } = req.body || {};
  if (!slotISO || isNaN(new Date(slotISO).getTime())) {
    return res.status(400).json({ error: 'Invalid slot time' });
  }
  if (!email || typeof email !== 'string' || email.indexOf('@') === -1) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  try {
    const result = await createConsultationEvent({
      slotISO,
      attendeeEmail: email,
      notes: typeof notes === 'string' ? notes.slice(0, 2000) : '',
      userLabel: (typeof userLabel === 'string' && userLabel.trim()) ? userLabel.trim().slice(0, 80) : email,
    });
    res.json({ ok: true, meetLink: result.meetLink });
  } catch (err) {
    console.error('Consultation booking error:', err.message);
    res.status(500).json({ error: 'Could not create calendar event' });
  }
});

app.get('/api/consultation-ics', (req, res) => {
  const slot = req.query.slot;
  const start = new Date(slot);
  if (!slot || isNaN(start.getTime())) {
    return res.status(400).send('Invalid slot time');
  }
  const ics = buildConsultationIcs({
    start,
    notes: typeof req.query.notes === 'string' ? req.query.notes.slice(0, 2000) : '',
    meetLink: typeof req.query.meet === 'string' ? req.query.meet : '',
    userLabel: typeof req.query.name === 'string' ? req.query.name.slice(0, 80) : '',
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  // 'inline' (not 'attachment') lets iOS Safari hand this off directly to
  // its native "Add Event" sheet instead of forcing a generic file download.
  res.setHeader('Content-Disposition', 'inline; filename="baseline-pro-consultation.ics"');
  res.send(ics);
});

// Verifies the caller's Supabase access token server-side and returns the
// user it belongs to — never trust a client-supplied user id for anything
// that touches billing.
async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

app.post('/api/create-checkout', async (req, res) => {
  const { tier } = req.body || {};
  const priceId = STRIPE_PRICE_IDS[tier];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid tier' });
  }
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const stripe = getStripe();
    let customerId = existingSub && existingSub.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      metadata: { supabase_user_id: user.id, tier },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err.message);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

app.post('/api/create-portal', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const { data: sub, error } = await getSupabaseAdmin()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!sub || !sub.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account yet — subscribe first' });
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('create-portal error:', err.message);
    res.status(500).json({ error: 'Could not create billing portal session' });
  }
});

const DELETION_GRACE_DAYS = 14;

// Deactivates the account and schedules a hard delete 14 days out, so the
// user can recover by signing back in before then (recovery flow and the
// actual hard-delete cron job are separate, later pieces of work — this
// endpoint only records the request). Does NOT touch deleted_account_emails
// yet — that permanent "trial already used" record is written at the point
// of hard deletion, not here, since the account isn't really gone yet.
app.post('/api/request-deletion', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const scheduledDeletionAt = new Date(Date.now() + DELETION_GRACE_DAYS * DAY_MS).toISOString();
    const { error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ deletion_requested_at: new Date().toISOString(), scheduled_deletion_at: scheduledDeletionAt })
      .eq('id', user.id);
    if (error) throw error;

    res.json({ scheduledDeletionAt });
  } catch (err) {
    console.error('request-deletion error:', err.message);
    res.status(500).json({ error: 'Could not schedule account deletion' });
  }
});

// Reverses a pending deletion — called when a user signs back in during
// the 14-day grace window and chooses to keep their account.
app.post('/api/cancel-deletion', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const { error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ deletion_requested_at: null, scheduled_deletion_at: null })
      .eq('id', user.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('cancel-deletion error:', err.message);
    res.status(500).json({ error: 'Could not cancel deletion' });
  }
});

// Hit daily by Vercel Cron (see vercel.json). Hard-deletes any account whose
// 14-day grace period has passed. Records the email in deleted_account_emails
// BEFORE deleting the user — deleteUser() cascades to profiles and
// subscriptions automatically, so that's the last chance to capture it.
app.get('/api/cron-hard-delete', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { data: dueProfiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .not('deletion_requested_at', 'is', null)
      .lte('scheduled_deletion_at', new Date().toISOString());
    if (error) throw error;

    let deleted = 0;
    const failures = [];
    for (const profile of dueProfiles || []) {
      try {
        if (profile.email) {
          await supabaseAdmin.from('deleted_account_emails').upsert({
            email: profile.email.toLowerCase(),
            original_user_id: profile.id,
          }, { onConflict: 'email' });
        }
        await supabaseAdmin.auth.admin.deleteUser(profile.id);
        deleted++;
      } catch (err) {
        console.error('Failed to hard-delete', profile.id, err.message);
        failures.push(profile.id);
      }
    }

    res.json({ checked: (dueProfiles || []).length, deleted, failures });
  } catch (err) {
    console.error('cron-hard-delete error:', err.message);
    res.status(500).json({ error: 'Hard-delete sweep failed' });
  }
});

// Called on app load. Access is granted for a lifetime-free grant, an
// active paid subscription, or a trial whose end date hasn't passed yet.
app.get('/api/subscription-status', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const { data: sub, error } = await getSupabaseAdmin()
      .from('subscriptions')
      .select('status, tier, is_lifetime_free, trial_ends_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    res.json(buildStatusResponse(sub));
  } catch (err) {
    console.error('subscription-status error:', err.message);
    res.status(500).json({ error: 'Could not load subscription status' });
  }
});

// Called once, right after signup, to start the 14-day trial. Idempotent —
// if a subscriptions row already exists (e.g. called twice, or the user is
// returning) it's returned as-is rather than reset. One trial per email
// ever: if this email previously deleted an account, skip the trial and
// land straight on canceled, which the client shows as the mandatory
// upgrade modal.
app.post('/api/init-trial', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('subscriptions')
      .select('status, tier, is_lifetime_free, trial_ends_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return res.json(buildStatusResponse(existing));

    let usedTrialBefore = false;
    if (user.email) {
      const { data: deletedRecord, error: deletedErr } = await supabaseAdmin
        .from('deleted_account_emails')
        .select('id')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();
      if (deletedErr) throw deletedErr;
      usedTrialBefore = !!deletedRecord;
    }

    const newRow = usedTrialBefore
      ? { user_id: user.id, status: 'canceled', trial_ends_at: null }
      : { user_id: user.id, status: 'trialing', trial_ends_at: new Date(Date.now() + TRIAL_LENGTH_DAYS * DAY_MS).toISOString() };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('subscriptions')
      .insert(newRow)
      .select('status, tier, is_lifetime_free, trial_ends_at')
      .single();
    if (insertErr) throw insertErr;

    res.json(buildStatusResponse(inserted));
  } catch (err) {
    console.error('init-trial error:', err.message);
    res.status(500).json({ error: 'Could not start trial' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
module.exports = app;
