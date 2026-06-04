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
}/* ============================================================
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
  document.getElementById('authStep1').querySelector('.auth-btn').textContent = 'Send sign-in code';

  if (error && error.message && error.message.toLowerCase().includes('not found')) {
    document.getElementById('err1').textContent = 'No account found. Please create one below.';
    return;
  }
  if (error) { document.getElementById('err1').textContent = error.message || 'Could not send code.'; return; }

  document.getElementById('otpSubtext').textContent = 'We sent a 6-digit code to ' + email + '. Enter it below - valid for 10 minutes.';
  document.getElementById('authStep1').style.display = 'none';
  document.getElementById('authStep2').style.display = 'block';
  setTimeout(function(){ document.getElementById('otpCode').focus(); }, 100);
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
async function register() {
  var name  = document.getElementById('regName').value.trim();
  var email = document.getElementById('regEmail').value.trim();
  var pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) { document.getElementById('err3').textContent = 'Please fill in all fields.'; return; }
  if (pass.length < 6) { document.getElementById('err3').textContent = 'Password must be at least 6 characters.'; return; }

  setBusy('btnRegister', true, 'Create account');
  var { data, error } = await sb.auth.signUp({
    email: email,
    password: pass,
    options: { data: { first_name: name } }
  });
  setBusy('btnRegister', false, 'Create account');

  if (error) { document.getElementById('err3').textContent = error.message || 'Registration failed.'; return; }

  if (data.user && data.session) {
    // Immediately signed in - save profile and go
    await dbUpsertProfile(name);
    // onAuthStateChange handles startApp
  } else {
    // Email confirmation required
    document.getElementById('err3').textContent = 'Account created! Check your email to confirm, then sign in.';
  }
}

// ── Sign out ──────────────────────────────────────────────
async function signOut() {
  State.sheetData = null; State.lastResult = null;
  await sb.auth.signOut();
  showStep1();
  document.getElementById('authEmail').value = '';
  document.getElementById('otpCode').value = '';
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
  pendingEmail = email;
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
  if (error) { document.getElementById('err1').textContent = error.message || 'Could not send code.'; return; }

  document.getElementById('otpSubtext').textContent = 'We sent a 6-digit code to ' + email + '. Enter it below - valid for 10 minutes.';
  document.getElementById('authStep1').style.display = 'none';
  document.getElementById('authStep2').style.display = 'block';
  setTimeout(function(){ document.getElementById('otpCode').focus(); }, 100);
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
async function register() {
  var name  = document.getElementById('regName').value.trim();
  var email = document.getElementById('regEmail').value.trim();
  var pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) { document.getElementById('err3').textContent = 'Please fill in all fields.'; return; }
  if (pass.length < 6) { document.getElementById('err3').textContent = 'Password must be at least 6 characters.'; return; }

  setBusy('btnRegister', true, 'Create account');
  var { data, error } = await sb.auth.signUp({
    email: email,
    password: pass,
    options: { data: { first_name: name } }
  });
  setBusy('btnRegister', false, 'Create account');

  if (error) { document.getElementById('err3').textContent = error.message || 'Registration failed.'; return; }

  if (data.user && data.session) {
    // Immediately signed in - save profile and go
    await dbUpsertProfile(name);
    // onAuthStateChange handles startApp
  } else {
    // Email confirmation required
    document.getElementById('err3').textContent = 'Account created! Check your email to confirm, then sign in.';
  }
}

// ── Sign out ──────────────────────────────────────────────
async function signOut() {
  State.sheetData = null; State.lastResult = null;
  await sb.auth.signOut();
  showStep1();
  document.getElementById('authEmail').value = '';
  document.getElementById('otpCode').value = '';
}
