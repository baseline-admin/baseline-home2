/* ============================================================
   BASELINE - referral.js
   Signup-time referral code redemption. Reading/displaying a
   user's own code lives in account.js (RLS lets them select it
   directly — no server round-trip needed for that part).
   Depends on: app.js (getAuthHeader)
   ============================================================ */

// Called once from startApp, right after the trial is initialized (so the
// referred user already has a trial_ends_at to extend). Silently no-ops on
// failure — an optional field mistyped at signup shouldn't alarm a brand
// new user; the account menu's trial-day count is the natural confirmation
// that it worked.
async function redeemPendingReferralCodeIfAny() {
  var code = localStorage.getItem('baseline_pending_referral_code');
  if (!code) return;
  localStorage.removeItem('baseline_pending_referral_code'); // one attempt, ever
  try {
    var auth = await getAuthHeader();
    if (!auth) return;
    var res = await fetch('/api/redeem-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify({ code: code }),
    });
    if (!res.ok) {
      var body = await res.json().catch(function() { return {}; });
      console.error('Referral code not applied:', body.error || res.status);
    }
  } catch (err) {
    console.error('Referral redemption failed:', err);
  }
}
