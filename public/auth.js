/* ============================================================
   BASELINE - auth.js
   Google OAuth + email OTP + email/password registration.
   All auth goes through Supabase JS - no custom token handling.
   ============================================================ */

var APP_URL = 'https://www.baseline.fitness';
var pendingEmail = '';

function showStep1() {
  document.getElementById('authStep1').style.display = 'block';
  document.getElementById('authStep2').style.display = 'none';
  document.getElementById('authStep3').style.display = 'none';
  document.getElementById('err1').textContent = '';
}

function showRegister() {
  document.getElementById('authStep1').style.display = 'none';
  document.getElementById('authStep3').style.display = 'block';
  document.getElementById('err3').textContent = '';
  // Reset in case they previously got as far as "check your email" and
  // came back to try again.
  document.getElementById('registerFormWrap').style.display = 'block';
  document.getElementById('registerVerifyPending').style.display = 'none';
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
  pendingEmail = email;
  document.getElementById('err1').textContent = '';
  document.getElementById('authStep1').querySelector('.auth-btn').disabled = true;
  document.getElementById('authStep1').querySelector('.auth-btn').textContent = 'Sending...';

  var { error } = await sb.auth.signInWithOtp({
    email: email,
    options: { shouldCreateUser: false }
  });

  document.getElementById('authStep1').querySelector('.auth-btn').disabled = false;
  document.getElementById('authStep1').querySelector('.auth-btn').textContent = 'Send sign-in link';

  if (error && error.message && error.message.toLowerCase().includes('not found')) {
    document.getElementById('err1').textContent = 'No account found. Please create one below.';
    return;
  }
  if (error) {
    var msg = (error.message || '').toLowerCase();
    if (msg.includes('not allowed') || msg.includes('signup') || msg.includes('otp')) {
      document.getElementById('err1').textContent = 'Please create an account first.';
    } else {
      document.getElementById('err1').textContent = error.message || 'Could not send link.';
    }
    return;
  }

  document.getElementById('err1').textContent = '';
  document.getElementById('err1').style.color = 'var(--accent)';
  document.getElementById('err1').textContent = 'Check your email for a sign-in link.';
}

async function verifyOTP() {
  var code = document.getElementById('otpCode').value.trim().replace(/\s/g, '');
  if (code.length !== 6) { document.getElementById('err2').textContent = 'Please enter the 6-digit code.'; return; }
  document.getElementById('err2').textContent = '';
  setBusy ? setBusy('', true, '') : null;

  var btn = document.getElementById('authStep2').querySelector('.auth-btn');
  btn.disabled = true; btn.textContent = 'Verifying...';

  var { data, error } = await sb.auth.verifyOtp({
    email: pendingEmail,
    token: code,
    type: 'email'
  });

  btn.disabled = false; btn.textContent = 'Sign in';

  if (error) { document.getElementById('err2').textContent = error.message || 'Invalid or expired code.'; return; }
  // Session is set - onAuthStateChange in app.js handles the rest
}

// ── Register ──────────────────────────────────────────────
// Password alone doesn't prove email ownership, so verification is done
// with the exact mechanism the sign-in flow already uses: send a real
// magic link, require it be clicked before granting access, rather than
// relying on Supabase's separate "Confirm email" setting. signUp() below
// only creates the account; any session it hands back is immediately
// discarded — the magic-link click is what grants the real one.
async function register() {
  var email = document.getElementById('regEmail').value.trim();
  var pass  = document.getElementById('regPassword').value;
  var referralCode = document.getElementById('regReferralCode').value.trim();
  if (!email || !pass) { document.getElementById('err3').textContent = 'Please fill in all fields.'; return; }
  if (!email.includes('@')) { document.getElementById('err3').textContent = 'Please enter a valid email.'; return; }
  if (pass.length < 6) { document.getElementById('err3').textContent = 'Password must be at least 6 characters.'; return; }

  var btn = document.getElementById('btnRegister');
  btn.disabled = true; btn.textContent = 'Creating...';

  // Stashed in localStorage rather than a JS variable — this page will be
  // long gone by the time the user actually comes back via the emailed
  // link, possibly in a different tab (startApp reads and clears it).
  if (referralCode) localStorage.setItem('baseline_pending_referral_code', referralCode);

  var { data, error } = await sb.auth.signUp({ email: email, password: pass });

  if (error) {
    btn.disabled = false; btn.textContent = 'Create account';
    document.getElementById('err3').textContent = error.message || 'Registration failed.';
    return;
  }

  if (data.session) await sb.auth.signOut();

  var { error: linkError } = await sb.auth.signInWithOtp({
    email: email,
    options: { shouldCreateUser: false }
  });

  btn.disabled = false; btn.textContent = 'Create account';

  if (linkError) {
    document.getElementById('err3').textContent = linkError.message || 'Account created, but could not send the verification email.';
    return;
  }

  document.getElementById('registerVerifySubtext').textContent =
    'Click the link we sent to ' + email + ' to finish creating your account.';
  document.getElementById('registerFormWrap').style.display = 'none';
  document.getElementById('registerVerifyPending').style.display = 'block';
}

// ── Sign out ──────────────────────────────────────────────
async function signOut() {
  State.sheetData = null; State.lastResult = null;
  await sb.auth.signOut();
  showStep1();
  document.getElementById('authEmail').value = '';
  // Defensive: some of these modals have their own sign-out shortcut (e.g.
  // the verify-email gate), so signing out from inside one must not leave
  // it stuck open over the now-empty login screen.
  ['accountModal', 'upgradeModal', 'congratsModal', 'recoverModal', 'verifyEmailModal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
}

// ── Email verification gate ───────────────────────────────
// Only reachable in practice if Supabase grants a session before the
// confirmation link is clicked — with "Confirm email" on, signUp() usually
// withholds the session entirely until then (see register()'s else branch
// above). This is a defensive backstop for startApp, not the primary gate.

function showEmailVerificationGate(email) {
  document.getElementById('verifyEmailModalBody').textContent =
    'We sent a confirmation link to ' + email + '. Click it, then come back here.';
  document.getElementById('verifyEmailModal').classList.add('open');
}

async function checkEmailVerified() {
  var msg = document.getElementById('verifyEmailMsg');
  try {
    var { data, error } = await sb.auth.refreshSession();
    if (error) throw error;
    var user = data && data.user;
    if (user && user.email_confirmed_at) {
      document.getElementById('verifyEmailModal').classList.remove('open');
      State.currentUser = null; // clear the guard so startApp actually re-runs
      startApp(user);
    } else {
      msg.textContent = 'Still not verified — check your email and click the link.';
    }
  } catch (err) {
    msg.textContent = err.message || 'Could not check verification status.';
  }
}

async function resendVerificationEmail() {
  var msg = document.getElementById('verifyEmailMsg');
  try {
    var email = State.currentUser && State.currentUser.email;
    var { error } = await sb.auth.resend({ type: 'signup', email: email });
    if (error) throw error;
    msg.textContent = 'Verification email resent.';
  } catch (err) {
    msg.textContent = err.message || 'Could not resend email.';
  }
}
