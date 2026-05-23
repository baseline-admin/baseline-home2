/* ============================================================
   BASELINE — auth.js
   Auth using Supabase JS library directly.
   ============================================================ */

var APP_URL = 'https://baseline-home.vercel.app';
var SUPABASE_PROJECT = 'zugyathhuiliaszixnlm';

function switchTab(tab) {
  document.getElementById('formSignIn').style.display   = tab === 'signin'   ? 'block' : 'none';
  document.getElementById('formRegister').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tabSignIn').className   = 'auth-tab' + (tab === 'signin'   ? ' active' : '');
  document.getElementById('tabRegister').className = 'auth-tab' + (tab === 'register' ? ' active' : '');
  document.getElementById('errSignIn').textContent   = '';
  document.getElementById('errRegister').textContent = '';
}

// ── Google OAuth — direct redirect, no fetch ──────────────
function signInWithGoogle() {
  var redirectTo = encodeURIComponent(APP_URL);
  var url = 'https://' + SUPABASE_PROJECT + '.supabase.co/auth/v1/authorize'
    + '?provider=google'
    + '&redirect_to=' + redirectTo;
  window.location.href = url;
}

// ── Email / password sign in ──────────────────────────────
async function signIn() {
  var email = document.getElementById('siEmail').value.trim();
  var pass  = document.getElementById('siPassword').value;
  if (!email || !pass) { document.getElementById('errSignIn').textContent = 'Please fill in all fields.'; return; }
  setBusy('btnSignIn', true, 'Sign in');
  var { data, error } = await sb.auth.signInWithPassword({ email: email, password: pass });
  setBusy('btnSignIn', false, 'Sign in');
  if (error) { document.getElementById('errSignIn').textContent = error.message || 'Sign in failed.'; return; }
  await startApp(data.user);
}

// ── Register ──────────────────────────────────────────────
async function register() {
  var name  = document.getElementById('regName').value.trim();
  var email = document.getElementById('regEmail').value.trim();
  var pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) { document.getElementById('errRegister').textContent = 'Please fill in all fields.'; return; }
  if (pass.length < 6) { document.getElementById('errRegister').textContent = 'Password must be at least 6 characters.'; return; }
  setBusy('btnRegister', true, 'Create account');
  var { data, error } = await sb.auth.signUp({
    email: email, password: pass,
    options: { data: { first_name: name } }
  });
  setBusy('btnRegister', false, 'Create account');
  if (error) { document.getElementById('errRegister').textContent = error.message || 'Registration failed.'; return; }
  if (data.user && data.session) {
    await dbUpsertProfile(name);
    await startApp(data.user);
  } else {
    document.getElementById('errRegister').textContent = 'Account created! Please check your email then sign in.';
    switchTab('signin');
    document.getElementById('siEmail').value = email;
  }
}

// ── Sign out ──────────────────────────────────────────────
async function signOut() {
  await sb.auth.signOut();
  State.currentUser = null; State.sheetData = null; State.lastResult = null;
  switchTab('signin');
}
