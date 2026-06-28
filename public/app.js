/* ============================================================
   BASELINE - app.js
   Shared state, db helpers, page navigation, boot.
   ============================================================ */

var SUPABASE_URL = 'https://zugyathhuiliaszixnlm.supabase.co';
var SUPABASE_KEY = 'sb_publishable_eTwm5JbLf6nW9zu3roUt6Q_D9JiacF4';

var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken:true, persistSession:true, detectSessionInUrl:true }
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
    .insert({ user_id: State.currentUser.id, title:title, prompt:prompt, time_selection:timeSelection, workout_data:workoutData })
    .select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteWorkout(id) {
  await sb.from('workouts').delete().eq('id', id).eq('user_id', State.currentUser.id);
}

async function dbInsertScore(workoutId, scoresData) {
  var { data, error } = await sb.from('scores')
    .insert({ workout_id:workoutId, user_id:State.currentUser.id, scores_data:scoresData, completed_at:new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteScore(id) {
  await sb.from('scores').delete().eq('id', id).eq('user_id', State.currentUser.id);
}

// ── Splash ───────────────────────────────────────────────

function dismissSplash() {
  var splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash-out');
  setTimeout(function(){ splash.style.display='none'; }, 600);
}

// ── Generator panel toggle ────────────────────────────────

function toggleGeneratorPanel() {
  var panel = document.getElementById('generatorPanel');
  if (!panel) return;
  var open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
}

function openGeneratorPanel() {
  var panel = document.getElementById('generatorPanel');
  if (!panel) return;
  panel.style.display = 'block';
}

// ── UI helpers ────────────────────────────────────────────

function setBusy(id, busy, label) {
  var b = document.getElementById(id);
  if (!b) return;
  b.disabled = busy;
  b.textContent = busy ? 'Please wait...' : label;
}

function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'myWorkouts') loadWorkouts();
  if (name === 'library' && typeof renderLibrary === 'function') renderLibrary();
}

// ── Name prompt ───────────────────────────────────────────

function isInstalledPWA() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function showNamePrompt() {
  var wrap = document.getElementById('headerRight');
  wrap.innerHTML = '<div class="name-prompt-wrap">'
    + '<input class="name-prompt-input" id="nameInput" type="text" placeholder="Enter your name" maxlength="30" />'
    + '<button class="name-prompt-btn" onclick="saveName()">Save</button>'
    + '</div>'
    + (!isInstalledPWA() ? '<button class="install-btn" onclick="showInstallTip()">Install</button>' : '');
  setTimeout(function(){ var el=document.getElementById('nameInput'); if(el) el.focus(); }, 100);
  document.getElementById('nameInput').addEventListener('keydown', function(e){
    if (e.key === 'Enter') saveName();
  });
}

async function saveName() {
  var input = document.getElementById('nameInput');
  if (!input) return;
  var name = input.value.trim();
  if (!name) return;
  await dbUpsertProfile(name);
  setHeaderName(name);
  updateGreeting(name);
}

function setHeaderName(name) {
  var wrap = document.getElementById('headerRight');
  wrap.innerHTML = '<button class="install-btn" onclick="showAccountMenu()">Account</button>'
    + (!isInstalledPWA() ? '<button class="install-btn" onclick="showInstallTip()">Install</button>' : '')
    + '<button class="sign-out-btn" onclick="signOut()">Sign out</button>';
}

function showInstallTip() {
  document.getElementById('installModal').classList.add('open');
}

function closeInstallModal() {
  document.getElementById('installModal').classList.remove('open');
}

function handleInstallModalClick(e) {
  if (e.target === document.getElementById('installModal')) closeInstallModal();
}

function updateGreeting(name) {
  var el = document.getElementById('greeting');
  if (el) el.innerHTML = 'Hello <strong>' + name + '</strong><span> - what would you like to work on today?</span>';
}

// ── Start app ─────────────────────────────────────────────

async function startApp(user) {
  if (State.currentUser && State.currentUser.id === user.id) return;
  State.currentUser = user;

  var profile = await dbGetProfile();
  State.cachedProfile = profile;
  // Only use manually entered name — never use OAuth metadata, never show 'friend'
  var name = (profile && profile.first_name) ? profile.first_name : '';
  if (name.toLowerCase() === 'friend' || name.toLowerCase() === 'there') name = '';

  var greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.innerHTML = name
      ? 'Hello <strong>' + name + '</strong><span> - what would you like to work on today?</span>'
      : 'Hello<span> - what would you like to work on today?</span>';
  }

  // Header: show name if known, otherwise show name prompt input
  if (name) {
    setHeaderName(name);
  } else {
    showNamePrompt();
  }

  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  dismissSplash();

  loadSheetData();
  loadWorkouts();
}

function showAuthOverlay() {
  State.currentUser = null;
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  dismissSplash();
}

// ── Boot ──────────────────────────────────────────────────

window.addEventListener('load', function() {
  sb.auth.onAuthStateChange(function(event, session) {
    if (session && session.user) {
      startApp(session.user);
    } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
      showAuthOverlay();
    }
  });

  // Safety fallback — dismiss splash after 6s no matter what
  setTimeout(function() {
    var splash = document.getElementById('splash');
    if (splash && splash.style.display !== 'none') {
      dismissSplash();
      if (!State.currentUser) showAuthOverlay();
    }
  }, 6000);
});

function generateUserId(name, uuid) {
  var clean = name.replace(/\s+/g, '');
  var short = (uuid || '').replace(/-/g, '').substring(0, 4).toUpperCase();
  return clean + '_' + short;
}

function showAccountMenu() {
  var user  = State.currentUser;
  var profile = State.cachedProfile || {};
  var name  = profile.first_name || '';
  var uuid  = user ? user.id : '';
  var userId = generateUserId(name, uuid);

  // Format created_at
  var createdAt = '';
  if (user && user.created_at) {
    var d = new Date(user.created_at);
    createdAt = d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  }

  var body = document.getElementById('accountModalBody');
  body.innerHTML =
    '<div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">'
    + '<div><span style="color:var(--text);font-size:13px;">' + name + '</span></div>'
    + '<button onclick="startEditName()" style="background:none;border:none;cursor:pointer;font-size:15px;padding:0 4px;" title="Edit name">✏️</button>'
    + '</div>'
    + '<div id="editNameWrap" style="display:none;margin-bottom:16px;">'
    + '<input id="editNameInput" type="text" value="' + name + '" maxlength="30" '
    + 'style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:6px 10px;border-radius:6px;width:100%;box-sizing:border-box;margin-bottom:8px;" />'
    + '<button onclick="saveEditName()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:6px 16px;border:1px solid var(--accent);border-radius:20px;background:none;color:var(--accent);cursor:pointer;">Save</button>'
    + '</div>'
    + '<div style="padding:12px 0;border-top:1px solid var(--border);">'
    + '<div style="margin-bottom:6px;">Member since <span style="color:var(--text);">' + createdAt + '</span></div>'
    + '<div>User ID <span style="color:var(--text);">' + userId + '</span></div>'
    + '</div>';

  document.getElementById('accountModal').classList.add('open');
}

function startEditName() {
  document.getElementById('editNameWrap').style.display = 'block';
  document.getElementById('editNameInput').focus();
}

async function saveEditName() {
  var input = document.getElementById('editNameInput');
  if (!input) return;
  var name = input.value.trim();
  if (!name) return;
  await dbUpsertProfile(name);
  State.cachedProfile = State.cachedProfile || {};
  State.cachedProfile.first_name = name;
  setHeaderName(name);
  updateGreeting(name);
  closeAccountModal();
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('open');
}

function handleAccountModalClick(e) {
  if (e.target === document.getElementById('accountModal')) closeAccountModal();
}
