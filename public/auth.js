/* ============================================================
   BASELINE - auth.js
   Google OAuth + email OTP + email/password registration.
   All auth goes through Supabase JS - no custom token handling.
   ============================================================ */

var APP_URL = 'https://www.baseline.fitness';
var pendingEmail = '';

// Kept in sessionStorage so that switching to the mail app to read the code
// (which can reload the page on a phone) doesn't throw the user back to the
// email step. Cleared on Back, on success, and on sign-out.
var OTP_PENDING_KEY = 'baseline_pending_otp_email';

function clearPendingOtp() {
  pendingEmail = '';
  try { sessionStorage.removeItem(OTP_PENDING_KEY); } catch (e) {}
}

function showStep1() {
  document.getElementById('authStep1').style.display = 'block';
  document.getElementById('authStep2').style.display = 'none';
  document.getElementById('authStep3').style.display = 'none';
  document.getElementById('err1').textContent = '';
  document.getElementById('err2').textContent = '';
  document.getElementById('otpCode').value = '';
  clearPendingOtp();
}

function showOtpStep(email) {
  pendingEmail = email;
  try { sessionStorage.setItem(OTP_PENDING_KEY, email); } catch (e) {}
  document.getElementById('authStep1').style.display = 'none';
  document.getElementById('authStep2').style.display = 'block';
  document.getElementById('authStep3').style.display = 'none';
  document.getElementById('otpSubtext').textContent = 'We sent a code to ' + email + '. Enter it below to sign in.';
  document.getElementById('err2').textContent = '';
  document.getElementById('otpCode').value = '';
  setTimeout(function() { var el = document.getElementById('otpCode'); if (el) el.focus(); }, 100);
}

function showRegister() {
  document.getElementById('authStep1').style.display = 'none';
  document.getElementById('authStep3').style.display = 'block';
  document.getElementById('err3').textContent = '';
}

// ── Google OAuth ──────────────────────────────────────────
// Uses Supabase's authorize endpoint directly - plain redirect, no JS fetch
function signInWithGoogle() {
  window.location.href =
    'https://zugyathhuiliaszixnlm.supabase.co/auth/v1/authorize?provider=google&redirect_to=' +
    encodeURIComponent(APP_URL);
}

// ── Email OTP ─────────────────────────────────────────────
async function sendOTP() {
  var email = document.getElementById('authEmail').value.trim();
  if (!email || !email.includes('@')) { document.getElementById('err1').textContent = 'Please enter a valid email.'; return; }
  document.getElementById('err1').textContent = '';
  document.getElementById('authStep1').querySelector('.auth-btn').disabled = true;
  document.getElementById('authStep1').querySelector('.auth-btn').textContent = 'Sending...';

  var { error } = await sb.auth.signInWithOtp({
    email: email,
    options: { shouldCreateUser: false }
  });

  document.getElementById('authStep1').querySelector('.auth-btn').disabled = false;
  document.getElementById('authStep1').querySelector('.auth-btn').textContent = 'Send sign-in code';

  if (error && error.message && error.message.toLowerCase().includes('not found')) {
    document.getElementById('err1').textContent = 'No account found. Please create one below.';
    return;
  }
  if (error) {
    var msg = (error.message || '').toLowerCase();
    if (msg.includes('not allowed') || msg.includes('signup') || msg.includes('otp')) {
      document.getElementById('err1').textContent = 'Please create an account first.';
    } else {
      document.getElementById('err1').textContent = error.message || 'Could not send code.';
    }
    return;
  }

  showOtpStep(email);
}

async function verifyOTP() {
  var errEl = document.getElementById('err2');
  var code = document.getElementById('otpCode').value.trim().replace(/\s/g, '');
  if (!/^\d{6,10}$/.test(code)) { errEl.textContent = 'Please enter the code from your email.'; return; }
  if (!pendingEmail) { errEl.textContent = 'Please go back and request a new code.'; return; }
  errEl.textContent = '';

  var btn = document.getElementById('btnVerifyOtp');
  btn.disabled = true; btn.textContent = 'Verifying...';

  var { error } = await sb.auth.verifyOtp({
    email: pendingEmail,
    token: code,
    type: 'email'
  });

  btn.disabled = false; btn.textContent = 'Sign in';

  if (error) {
    var msg = (error.message || '').toLowerCase();
    errEl.textContent = (msg.includes('expired') || msg.includes('invalid'))
      ? 'That code is invalid or has expired. Please try again.'
      : (error.message || 'Could not verify code.');
    return;
  }
  // Session is set - onAuthStateChange in app.js handles the rest
  clearPendingOtp();
}

// If the page reloaded while the user was reading the code in their mail app,
// put them back on the code step instead of the email step.
(function restorePendingOtpStep() {
  try {
    var email = sessionStorage.getItem(OTP_PENDING_KEY);
    if (email) showOtpStep(email);
  } catch (e) {}
})();

// ── Register ──────────────────────────────────────────────
async function register() {
  var email = document.getElementById('regEmail').value.trim();
  var pass  = document.getElementById('regPassword').value;
  var referralCode = document.getElementById('regReferralCode').value.trim();
  if (!email || !pass) { document.getElementById('err3').textContent = 'Please fill in all fields.'; return; }
  if (!email.includes('@')) { document.getElementById('err3').textContent = 'Please enter a valid email.'; return; }
  if (pass.length < 6) { document.getElementById('err3').textContent = 'Password must be at least 6 characters.'; return; }

  var btn = document.getElementById('btnRegister');
  btn.disabled = true; btn.textContent = 'Creating...';

  // Stashed in localStorage rather than a JS variable so startApp (in a
  // fresh page load, once signed in) can pick it up and redeem it.
  if (referralCode) localStorage.setItem('baseline_pending_referral_code', referralCode);

  var { data, error } = await sb.auth.signUp({ email: email, password: pass });

  btn.disabled = false; btn.textContent = 'Create account';

  if (error) { document.getElementById('err3').textContent = error.message || 'Registration failed.'; return; }

  if (data.user && data.session) {
    // Signed in immediately — onAuthStateChange fires and calls startApp
  } else {
    document.getElementById('err3').style.color = 'var(--accent)';
    document.getElementById('err3').textContent = 'Account created! Check your email to confirm, then sign in.';
  }
}

// ── Sign out ──────────────────────────────────────────────
async function signOut() {
  State.sheetData = null; State.lastResult = null;
  await sb.auth.signOut();
  showStep1();
  document.getElementById('authEmail').value = '';
  // Defensive: signing out from inside a modal must not leave it stuck
  // open over the now-empty login screen.
  ['accountModal', 'upgradeModal', 'congratsModal', 'recoverModal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
}
