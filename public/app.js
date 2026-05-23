/* ============================================================
   BASELINE — app.js
   Shared state, shared helpers, page navigation, boot.
   Uses Supabase JS library loaded from CDN in index.html.
   ============================================================ */

var SUPABASE_URL = 'https://zugyathhuiliaszixnlm.supabase.co';
var SUPABASE_KEY = 'sb_publishable_eTwm5JbLf6nW9zu3roUt6Q_D9JiacF4';

// Supabase client — initialised once, used everywhere
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Shared state
var State = {
  currentUser: null,
  sheetData:   null,
  lastResult:  null,
  openWorkout: null
};

// ── API helper (sheet data only) ──────────────────────────
async function apiFetch(path, opts) {
  opts = opts || {};
  return fetch(path, opts);
}

// ── Supabase database helpers ─────────────────────────────
// All DB calls go direct to Supabase from the browser

async function dbGetProfile() {
  var { data } = await sb.from('profiles').select('*').eq('id', State.currentUser.id).single();
  return data;
}

async function dbUpsertProfile(firstName) {
  var { data } = await sb.from('profiles')
    .upsert({ id: State.currentUser.id, first_name: firstName, email: State.currentUser.email })
    .select().single();
  return data;
}

async function dbGetWorkouts() {
  var { data } = await sb.from('workouts')
    .select('*, scores(*)')
    .eq('user_id', State.currentUser.id)
    .order('generated_at', { ascending: false });
  return data || [];
}

async function dbInsertWorkout(title, prompt, timeSelection, workoutData) {
  var { data, error } = await sb.from('workouts')
    .insert({ user_id: State.currentUser.id, title, prompt, time_selection: timeSelection, workout_data: workoutData })
    .select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteWorkout(id) {
  await sb.from('workouts').delete().eq('id', id).eq('user_id', State.currentUser.id);
}

async function dbInsertScore(workoutId, scoresData) {
  var { data, error } = await sb.from('scores')
    .insert({ workout_id: workoutId, user_id: State.currentUser.id, scores_data: scoresData, completed_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteScore(id) {
  await sb.from('scores').delete().eq('id', id).eq('user_id', State.currentUser.id);
}

// ── Shared UI helpers ─────────────────────────────────────
function setBusy(id, busy, label) {
  var b = document.getElementById(id);
  b.disabled = busy;
  b.textContent = busy ? 'Please wait...' : label;
}

function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'myWorkouts') loadWorkouts();
}

// ── Start app after auth ──────────────────────────────────
async function startApp(user) {
  State.currentUser = user;
  var profile = await dbGetProfile();
  var name = (profile && profile.first_name)
    || (user.user_metadata && (user.user_metadata.first_name || user.user_metadata.given_name))
    || (user.user_metadata && user.user_metadata.full_name && user.user_metadata.full_name.split(' ')[0])
    || 'there';

  document.getElementById('greetingName').textContent = name;
  document.getElementById('headerName').textContent   = name;
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('app').style.display         = 'block';

  loadSheetData();
  loadWorkouts();
}

// ── Boot: check for existing session ─────────────────────
window.addEventListener('load', async function() {
  var { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    await startApp(session.user);
  }

  // Listen for auth state changes (handles OAuth redirect)
  sb.auth.onAuthStateChange(async function(event, session) {
    if (event === 'SIGNED_IN' && session && session.user) {
      await startApp(session.user);
    }
    if (event === 'SIGNED_OUT') {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }
  });
});
