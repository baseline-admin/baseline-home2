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
const { getR2Client } = require('./r2Client');
const { PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
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
const REFERRAL_BONUS_DAYS = 30;

// Lowercases and strips any +tag from the local part, so
// user+anything@gmail.com and user@gmail.com are treated as the same
// person for one-trial-per-email purposes. Used wherever we decide trial
// eligibility — not applied to the email Supabase actually sends mail to,
// only to our own dedup checks.
function normalizeEmail(email) {
  const trimmed = String(email).trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return trimmed;
  const local = trimmed.slice(0, atIndex).split('+')[0];
  const domain = trimmed.slice(atIndex + 1);
  return `${local}@${domain}`;
}

// Curated list of common disposable/throwaway email providers — not
// exhaustive, but catches the casual/lazy trial-abuse case cheaply without
// an external API call or a huge third-party list to maintain.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'mailinator.net', 'mailinator.org',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
  '10minutemail.com', '10minutemail.net', '10minutemail.co.za',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com',
  'throwawaymail.com', 'throwaway.email',
  'yopmail.com', 'yopmail.net', 'yopmail.fr',
  'trashmail.com', 'trashmail.net', 'trash-mail.com',
  'getnada.com', 'dispostable.com', 'fakeinbox.com', 'sharklasers.com',
  'maildrop.cc', 'mintemail.com', 'mailnesia.com', 'moakt.com',
  'spamgourmet.com', 'mytemp.email', 'emailondeck.com', 'mohmal.com',
  'discard.email', 'fakemail.net', 'tempinbox.com', 'burnermail.io',
  '33mail.com', 'anonaddy.com', 'inboxbear.com', 'crazymailing.com',
]);

function isDisposableEmail(email) {
  const domain = normalizeEmail(email).split('@')[1];
  return !!domain && DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L

function generateReferralCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)];
  return 'REF-' + code;
}

// Idempotent, like initTrial's subscriptions row — safe to call on every
// login, not just the first. Retries on the rare code collision.
async function ensureReferralCode(supabaseAdmin, userId) {
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { data: inserted, error } = await supabaseAdmin
      .from('referral_codes')
      .insert({ user_id: userId, code })
      .select('code')
      .single();
    if (!error) return inserted.code;
    if (error.code !== '23505') throw error; // anything but a collision is a real failure
  }
  throw new Error('Could not generate a unique referral code after 5 attempts');
}

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

// Coaching (video upload + chat) requires an active baseline_pro
// subscription specifically — a lifetime_free promo grant (software-only
// comp) does not include human coaching, which has real marginal cost.
async function isBaselinePro(userId) {
  const { data } = await getSupabaseAdmin()
    .from('subscriptions')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data && data.tier === 'baseline_pro';
}

// The coach is identified by a flag on their own profiles row (auth.users.id),
// set by hand once — see supabase/pro_coaching.sql. Not email or display_id.
// Tolerates the column not existing yet (e.g. that migration hasn't been run
// in this environment) so a missing column can't break subscription-status —
// and therefore the paywall check — for every signed-in user.
async function isCoachUser(userId) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('is_coach')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return !!data && data.is_coach === true;
  } catch (err) {
    console.error('isCoachUser check failed (has supabase/pro_coaching.sql been run?):', err.message);
    return false;
  }
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
          // Normalized so a +alias of a deleted email is also blocked from a
          // fresh trial, not just an exact re-registration.
          await supabaseAdmin.from('deleted_account_emails').upsert({
            email: normalizeEmail(profile.email),
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

    const isCoach = await isCoachUser(user.id);
    res.json({ ...buildStatusResponse(sub), isCoach });
  } catch (err) {
    console.error('subscription-status error:', err.message);
    res.status(500).json({ error: 'Could not load subscription status' });
  }
});

const PRO_VIDEO_MAX_BYTES = 500 * 1024 * 1024; // 500MB sanity cap

function extFromFilename(filename) {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(filename || '');
  return m ? m[1].toLowerCase() : 'mp4';
}

// Step 1 of the upload flow: issue a presigned PUT URL so the browser can
// upload the video straight to R2, not through this Vercel function (no
// body-size override is configured, so the default ~4.5MB request-body
// ceiling would make routing video bytes through here a non-starter).
app.post('/api/pro-video-upload-url', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    if (!(await isBaselinePro(user.id))) {
      return res.status(403).json({ error: 'Baseline Pro required' });
    }

    const { filename, contentType } = req.body || {};
    if (!contentType || !contentType.startsWith('video/')) {
      return res.status(400).json({ error: 'File must be a video' });
    }

    const key = `pro-videos/${user.id}/${crypto.randomUUID()}.${extFromFilename(filename)}`;
    // ContentType is deliberately NOT included in the signed command — if it
    // were, the browser's actual PUT would have to send an identical
    // Content-Type header string or R2 rejects it with SignatureDoesNotMatch.
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 60 * 60 });
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error('pro-video-upload-url error:', err.message);
    res.status(500).json({ error: 'Could not start video upload' });
  }
});

// Step 2: called after the browser's direct PUT to R2 finishes. HEAD-checks
// the object actually landed before trusting it — the client never inserts
// the pro_videos row itself, closing the "claims an upload that never
// happened" gap.
app.post('/api/pro-video-confirm', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    if (!(await isBaselinePro(user.id))) {
      return res.status(403).json({ error: 'Baseline Pro required' });
    }

    const { key, originalFilename } = req.body || {};
    if (!key || !key.startsWith(`pro-videos/${user.id}/`)) {
      return res.status(400).json({ error: 'Invalid key' });
    }

    const head = await getR2Client().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })
    );
    if (head.ContentLength && head.ContentLength > PRO_VIDEO_MAX_BYTES) {
      return res.status(400).json({ error: 'Video is too large' });
    }

    const { data: inserted, error } = await getSupabaseAdmin()
      .from('pro_videos')
      .insert({ user_id: user.id, r2_key: key, original_filename: originalFilename || null })
      .select('id, r2_key, original_filename, created_at')
      .single();
    if (error) throw error;

    res.json(inserted);
  } catch (err) {
    console.error('pro-video-confirm error:', err.message);
    res.status(500).json({ error: 'Could not confirm video upload — did it finish uploading?' });
  }
});

// Called lazily when a video panel is expanded/played, not upfront for the
// whole list. Owner keeps view access even if their subscription lapses —
// this only gates on ownership (or coach), not current tier.
app.get('/api/pro-video-view-url', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const { id } = req.query;
    const { data: video, error } = await getSupabaseAdmin()
      .from('pro_videos')
      .select('user_id, r2_key')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const allowed = video.user_id === user.id || (await isCoachUser(user.id));
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: video.r2_key });
    const viewUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 60 * 60 });
    res.json({ viewUrl });
  } catch (err) {
    console.error('pro-video-view-url error:', err.message);
    res.status(500).json({ error: 'Could not load video' });
  }
});

// Coach-only: lists every baseline_pro subscriber with their latest message
// and video activity. Must be server-side — subscriptions deliberately has
// no policy letting any client (coach included) enumerate other users' rows.
app.get('/api/coach-inbox', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    if (!(await isCoachUser(user.id))) return res.status(403).json({ error: 'Not authorized' });

    const supabaseAdmin = getSupabaseAdmin();
    const [{ data: subs, error: subsErr }, { data: profiles, error: profilesErr },
      { data: messages, error: messagesErr }, { data: videos, error: videosErr }] = await Promise.all([
      supabaseAdmin.from('subscriptions').select('user_id').eq('tier', 'baseline_pro'),
      supabaseAdmin.from('profiles').select('id, first_name'),
      supabaseAdmin.from('pro_messages').select('user_id, sender, body, created_at').order('created_at', { ascending: false }),
      supabaseAdmin.from('pro_videos').select('user_id, created_at').order('created_at', { ascending: false }),
    ]);
    if (subsErr) throw subsErr;
    if (profilesErr) throw profilesErr;
    if (messagesErr) throw messagesErr;
    if (videosErr) throw videosErr;

    const profileById = {};
    (profiles || []).forEach((p) => { profileById[p.id] = p; });
    const lastMessageByUser = {};
    (messages || []).forEach((m) => { if (!lastMessageByUser[m.user_id]) lastMessageByUser[m.user_id] = m; });
    const lastVideoAtByUser = {};
    const videoCountByUser = {};
    (videos || []).forEach((v) => {
      videoCountByUser[v.user_id] = (videoCountByUser[v.user_id] || 0) + 1;
      if (!lastVideoAtByUser[v.user_id]) lastVideoAtByUser[v.user_id] = v.created_at;
    });

    const inbox = (subs || []).map((s) => {
      const lastMessage = lastMessageByUser[s.user_id] || null;
      const lastVideoAt = lastVideoAtByUser[s.user_id] || null;
      const lastActivityAt = [lastMessage && lastMessage.created_at, lastVideoAt]
        .filter(Boolean)
        .sort()
        .pop() || null;
      return {
        userId: s.user_id,
        firstName: (profileById[s.user_id] && profileById[s.user_id].first_name) || null,
        lastMessage: lastMessage && { sender: lastMessage.sender, body: lastMessage.body, createdAt: lastMessage.created_at },
        videoCount: videoCountByUser[s.user_id] || 0,
        lastActivityAt,
      };
    });

    // Most recent activity first; subscribers with no activity yet go last
    // (not buried entirely — the coach still needs to see and reach out to
    // them), sorted amongst themselves with no particular ordering.
    inbox.sort((a, b) => {
      if (a.lastActivityAt && b.lastActivityAt) return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
      if (a.lastActivityAt) return -1;
      if (b.lastActivityAt) return 1;
      return 0;
    });

    res.json({ inbox });
  } catch (err) {
    console.error('coach-inbox error:', err.message);
    res.status(500).json({ error: 'Could not load coach inbox' });
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

    // Separate concern from the trial itself — every user gets a code
    // eventually, including old accounts that predate this feature. Awaited
    // so it's ready the moment the account menu wants to display it, but a
    // failure here still shouldn't fail the actual trial-init response.
    try {
      await ensureReferralCode(supabaseAdmin, user.id);
    } catch (err) {
      console.error('referral code generation failed:', err.message);
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('subscriptions')
      .select('status, tier, is_lifetime_free, trial_ends_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return res.json(buildStatusResponse(existing));

    let usedTrialBefore = false;
    let normalizedEmail = null;
    if (user.email) {
      normalizedEmail = normalizeEmail(user.email);

      if (isDisposableEmail(user.email)) {
        usedTrialBefore = true;
      } else {
        const { data: deletedRecord, error: deletedErr } = await supabaseAdmin
          .from('deleted_account_emails')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (deletedErr) throw deletedErr;

        // Tolerates the table not existing yet (supabase/trial_grants_schema.sql
        // not run in this environment) so a missing table can't break signup
        // for every new user — falls through as "no grant on record" instead.
        let grantRecord = null;
        const { data: grantData, error: grantErr } = await supabaseAdmin
          .from('trial_grants')
          .select('user_id')
          .eq('normalized_email', normalizedEmail)
          .maybeSingle();
        if (grantErr && grantErr.code !== '42P01') throw grantErr;
        if (grantErr && grantErr.code === '42P01') {
          console.error('trial_grants query failed (has supabase/trial_grants_schema.sql been run?):', grantErr.message);
        } else {
          grantRecord = grantData;
        }

        usedTrialBefore = !!deletedRecord || !!grantRecord;
      }
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

    // Recorded only for genuine trial grants — disposable/repeat emails
    // never reach here with usedTrialBefore true, so this can't mark a
    // rejected signup as having "used" the normalized email itself.
    if (!usedTrialBefore && normalizedEmail) {
      const { error: grantInsertErr } = await supabaseAdmin
        .from('trial_grants')
        .insert({ normalized_email: normalizedEmail, user_id: user.id, original_email: user.email });
      if (grantInsertErr) console.error('Failed to record trial grant:', grantInsertErr.message);
    }

    res.json(buildStatusResponse(inserted));
  } catch (err) {
    console.error('init-trial error:', err.message);
    res.status(500).json({ error: 'Could not start trial' });
  }
});

// Called once at signup if the new user entered someone else's referral
// code. referral_uses.referred_user_id is unique, so this is naturally
// one redemption per person, ever — enforced by the DB, not just this
// endpoint's logic.
app.post('/api/redeem-referral', async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Invalid referral code' });
  }
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const supabaseAdmin = getSupabaseAdmin();
    const normalizedCode = code.trim().toUpperCase();

    const { data: referralCode, error: codeErr } = await supabaseAdmin
      .from('referral_codes')
      .select('user_id, uses')
      .eq('code', normalizedCode)
      .maybeSingle();
    if (codeErr) throw codeErr;
    if (!referralCode) return res.status(400).json({ error: 'Invalid referral code' });
    if (referralCode.user_id === user.id) {
      return res.status(400).json({ error: 'Cannot use your own referral code' });
    }
    const referrerId = referralCode.user_id;

    const { error: useInsertErr } = await supabaseAdmin.from('referral_uses').insert({
      referrer_user_id: referrerId,
      referred_user_id: user.id,
      code: normalizedCode,
      free_month_granted: true,
    });
    if (useInsertErr) {
      if (useInsertErr.code === '23505') { // unique_violation on referred_user_id
        return res.status(400).json({ error: 'You have already used a referral code' });
      }
      throw useInsertErr;
    }

    // Referred user: extend their trial by 30 days from wherever it
    // currently ends (set 14 days out by init-trial moments earlier).
    const { data: referredSub } = await supabaseAdmin
      .from('subscriptions')
      .select('trial_ends_at')
      .eq('user_id', user.id)
      .maybeSingle();
    const referredBase = (referredSub && referredSub.trial_ends_at) ? new Date(referredSub.trial_ends_at) : new Date();
    await supabaseAdmin
      .from('subscriptions')
      .update({ trial_ends_at: new Date(referredBase.getTime() + REFERRAL_BONUS_DAYS * DAY_MS).toISOString() })
      .eq('user_id', user.id);

    // Referrer: extend whichever date currently governs their access —
    // the paid period if they're subscribed, otherwise their trial.
    const { data: referrerSub } = await supabaseAdmin
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_ends_at')
      .eq('user_id', referrerId)
      .maybeSingle();
    if (referrerSub) {
      if (referrerSub.status === 'active') {
        const base = referrerSub.current_period_ends_at ? new Date(referrerSub.current_period_ends_at) : new Date();
        await supabaseAdmin
          .from('subscriptions')
          .update({ current_period_ends_at: new Date(base.getTime() + REFERRAL_BONUS_DAYS * DAY_MS).toISOString() })
          .eq('user_id', referrerId);
      } else {
        const base = referrerSub.trial_ends_at ? new Date(referrerSub.trial_ends_at) : new Date();
        await supabaseAdmin
          .from('subscriptions')
          .update({ trial_ends_at: new Date(base.getTime() + REFERRAL_BONUS_DAYS * DAY_MS).toISOString() })
          .eq('user_id', referrerId);
      }
    }

    await supabaseAdmin.from('referral_codes').update({ uses: (referralCode.uses || 0) + 1 }).eq('code', normalizedCode);

    res.json({ ok: true });
  } catch (err) {
    console.error('redeem-referral error:', err.message);
    res.status(500).json({ error: 'Could not redeem referral code' });
  }
});

// Redeemable any time from the Account menu (unlike referral codes, which
// are signup-only) — admin-created lifetime-free grants for testers may
// need to apply to an account that already exists. One redemption per
// person, ever, enforced by promo_code_redemptions.user_id being unique.
app.post('/api/redeem-promo-code', async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Invalid code' });
  }
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });

    const supabaseAdmin = getSupabaseAdmin();
    const normalizedCode = code.trim().toUpperCase();

    const { data: promoCode, error: codeErr } = await supabaseAdmin
      .from('promo_codes')
      .select('grants, uses, max_uses')
      .eq('code', normalizedCode)
      .maybeSingle();
    if (codeErr) throw codeErr;
    if (!promoCode) return res.status(400).json({ error: 'Invalid code' });
    if (promoCode.max_uses !== null && promoCode.uses >= promoCode.max_uses) {
      return res.status(400).json({ error: 'This code has reached its usage limit' });
    }

    const { error: redemptionErr } = await supabaseAdmin.from('promo_code_redemptions').insert({
      user_id: user.id,
      code: normalizedCode,
    });
    if (redemptionErr) {
      if (redemptionErr.code === '23505') { // unique_violation on user_id
        return res.status(400).json({ error: 'You have already redeemed a code' });
      }
      throw redemptionErr;
    }

    if (promoCode.grants === 'lifetime_free') {
      const { error: upsertErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert({ user_id: user.id, is_lifetime_free: true, status: 'active' }, { onConflict: 'user_id' });
      if (upsertErr) throw upsertErr;
    }

    await supabaseAdmin.from('promo_codes').update({ uses: promoCode.uses + 1 }).eq('code', normalizedCode);

    res.json({ ok: true, grants: promoCode.grants });
  } catch (err) {
    console.error('redeem-promo-code error:', err.message);
    res.status(500).json({ error: 'Could not redeem code' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
module.exports = app;
