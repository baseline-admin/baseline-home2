/* ============================================================
   BASELINE — api/stripeClient.js
   Server-only Stripe client, authenticated with the secret key.
   Never import this from anything served to the browser.
   ============================================================ */
const Stripe = require('stripe');

let client = null;

function getStripe() {
  if (client) return client;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  client = new Stripe(secretKey);
  return client;
}

module.exports = { getStripe };
