/* ============================================================
   BASELINE — app.js
   Shared state, db helpers, page navigation, boot.
   ============================================================ */

var SUPABASE_URL = 'https://zugyathhuiliaszixnlm.supabase.co';
var SUPABASE_KEY = 'sb_publishable_eTwm5JbLf6nW9zu3roUt6Q_D9JiacF4';

var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

var State = {
  currentUser: null,
  sheetData:   null,
  lastResult:  null,
  openWorkout: null
};

// ── DB helpers ────────────────────────────────────────────

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
    .insert({ user_id: State.currentUser.id, title: title, prompt: prompt, time_selection: timeSelection, workout_data: workoutData })
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

// ── UI helpers ────────────────────────────────────────────

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

// ── Start app ─────────────────────────────────────────────

async function startApp(user) {
  if (State.currentUser && State.currentUser.id === user.id) return; // already running
  State.currentUser = user;

  var profile = await dbGetProfile();
  if (!profile || !profile.first_name) {
    var meta = user.user_metadata || {};
    var firstName = meta.first_name || meta.given_name
      || (meta.full_name ? meta.full_name.split(' ')[0] : '');
    if (firstName) profile = await dbUpsertProfile(firstName);
  }

  var name = (profile && profile.first_name) || '';
  var greeting = document.getElementById('greeting');
  if (greeting) greeting.innerHTML = (name ? 'Hello <strong>' + name + '</strong>' : 'Hello') + '<span> — what would you like to work on today?</span>';
  document.getElementById('headerName').textContent = name;
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  loadSheetData();
  loadWorkouts();
}

function showAuthOverlay() {
  State.currentUser = null;
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ── Boot ──────────────────────────────────────────────────

window.addEventListener('load', function() {
  // onAuthStateChange is the single source of truth for session state
  sb.auth.onAuthStateChange(function(event, session) {
    if (session && session.user) {
      startApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      showAuthOverlay();
    }
  });
});
