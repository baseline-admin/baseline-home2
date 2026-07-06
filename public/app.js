/* ============================================================
   BASELINE - app.js
   Shared state, db helpers, page navigation, boot.
   ============================================================ */

var SUPABASE_URL = 'https://zugyathhuiliaszixnlm.supabase.co';
var SUPABASE_KEY = 'sb_publishable_eTwm5JbLf6nW9zu3roUt6Q_D9JiacF4';

var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken:true, persistSession:true, detectSessionInUrl:true }
});


// ── Shared icon SVGs (monochrome, stroke-based) ──────────────────────────
var ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
var ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
var ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
var ICON_REFRESH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
var ICON_SHARE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
var ICON_CHEVRON_CLOSED = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
var ICON_CHEVRON_OPEN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

var State = {
  currentUser: null,
  sheetData:   null,
  lastResult:  null,
  openWorkout: null,
  workoutsNotif: false,  // true if there are unseen shared workouts
  cachedWorkouts: [],     // local cache updated immediately on title edits
  lastWorkout: null,      // most recent saved workout for generator card
  lastWorkout2: null,     // second most recent
  lastWorkout3: null      // third most recent
};

// ── DB helpers ────────────────────────────────────────────

async function dbGetProfile() {
  var { data } = await sb.from('profiles').select('*').eq('id', State.currentUser.id).single();
  return data;
}

async function dbUpsertProfile(firstName, displayId) {
  var payload = { id: State.currentUser.id, first_name: firstName, email: State.currentUser.email };
  if (displayId) payload.display_id = displayId;
  var { data } = await sb.from('profiles').upsert(payload).select().single();
  return data;
}

function randomSuffix() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var s = '';
  for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function buildDisplayId(name) {
  var clean = (name || '').replace(/\s+/g, '');
  return clean + '_' + randomSuffix();
}

async function dbLookupUserByDisplayId(displayId) {
  var { data } = await sb.from('profiles').select('id, first_name, display_id').eq('display_id', displayId).maybeSingle();
  return data;
}

async function dbShareWorkout(workout, recipientDisplayIds) {
  var senderDisplayId = (State.cachedProfile && State.cachedProfile.display_id) || '';
  var results = [];
  for (var i = 0; i < recipientDisplayIds.length; i++) {
    var rid = recipientDisplayIds[i].trim();
    if (!rid) continue;
    var recipient = await dbLookupUserByDisplayId(rid);
    if (!recipient) { results.push({ id: rid, ok: false, reason: 'not found' }); continue; }
    if (recipient.id === State.currentUser.id) { results.push({ id: rid, ok: false, reason: 'cannot share with yourself' }); continue; }
    var workoutDataCopy = JSON.parse(JSON.stringify(workout.workout_data || {}));
    workoutDataCopy.sharedBy = senderDisplayId;
    try {
      await sb.from('workouts').insert({
        user_id: recipient.id,
        title: workout.title,
        prompt: workout.prompt,
        time_selection: workout.time_selection,
        workout_data: workoutDataCopy,
        shared_by_display_id: senderDisplayId,
        is_shared: true,
        seen: false
      });
      results.push({ id: rid, ok: true });
    } catch(e) {
      results.push({ id: rid, ok: false, reason: 'error' });
    }
  }
  return results;
}

async function dbHasUnseenSharedWorkouts() {
  var { data } = await sb.from('workouts')
    .select('id')
    .eq('user_id', State.currentUser.id)
    .eq('is_shared', true)
    .eq('seen', false)
    .limit(1);
  return !!(data && data.length);
}

async function dbMarkSharedWorkoutsSeen() {
  await sb.from('workouts')
    .update({ seen: true })
    .eq('user_id', State.currentUser.id)
    .eq('is_shared', true)
    .eq('seen', false);
}

async function dbGetWorkouts() {
  var { data } = await sb.from('workouts')
    .select('*, scores(*)')
    .eq('user_id', State.currentUser.id)
    .order('generated_at', { ascending: false });
  State.cachedWorkouts = data || [];
  return State.cachedWorkouts;
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

var PAGE_ORDER = ['generator', 'myWorkouts', 'library', 'pro'];
var _currentPage = 'generator';

function showPage(name, btn) {
  var fromIdx = PAGE_ORDER.indexOf(_currentPage);
  var toIdx   = PAGE_ORDER.indexOf(name);
  var dir     = toIdx > fromIdx ? 1 : -1; // 1 = slide left, -1 = slide right

  var outPage = document.getElementById('page' + _currentPage.charAt(0).toUpperCase() + _currentPage.slice(1));
  var inPage  = document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1));

  _currentPage = name;

  if (!outPage || !inPage || outPage === inPage) {
    // Fallback: no animation
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    if (inPage) inPage.classList.add('active');
  } else {
    // Slide out current, slide in new
    var slideOut = dir === 1 ? 'page-slide-out-left' : 'page-slide-out-right';
    var slideIn  = dir === 1 ? 'page-slide-in-right' : 'page-slide-in-left';

    // Position incoming page off-screen, make it visible
    inPage.classList.add('active', slideIn);

    // Animate outgoing page
    outPage.classList.add(slideOut);

    setTimeout(function() {
      outPage.classList.remove('active', slideOut);
      inPage.classList.remove(slideIn);
    }, 180);
  }

  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (name === 'generator' && typeof loadLastWorkout === 'function') { if (typeof _pillsReady !== 'undefined') _pillsReady = false; loadLastWorkout(); }
  if (name === 'myWorkouts') {
    loadWorkouts(State.workoutsNotif); // pass notif state so Shared section opens by default
    if (State.workoutsNotif) {
      dbMarkSharedWorkoutsSeen().then(function() {
        State.workoutsNotif = false;
        var tab = document.querySelector('.nav-tab[onclick*="myWorkouts"]');
        var existing = tab && tab.querySelector('.notif-dot');
        if (existing) existing.remove();
      });
    }
  }
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
  wrap.innerHTML = '<span class="user-name" style="font-family:var(--mono);font-size:13px;color:var(--text);margin-right:4px;">' + name + '</span>'
    + '<button class="install-btn" onclick="showAccountMenu()">Account</button>'
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
  refreshWorkoutsNotifDot();
  // Load last workout card after user is confirmed — dbGetWorkouts needs currentUser
  setTimeout(function() {
    if (typeof loadLastWorkout === 'function') loadLastWorkout();
  }, 800);
}

async function refreshWorkoutsNotifDot() {
  var has = await dbHasUnseenSharedWorkouts();
  State.workoutsNotif = has;
  var tab = document.querySelector('.nav-tab[onclick*="myWorkouts"]');
  if (!tab) return;
  var existing = tab.querySelector('.notif-dot');
  if (has && !existing) {
    var dot = document.createElement('span');
    dot.className = 'notif-dot';
    tab.appendChild(dot);
  } else if (!has && existing) {
    existing.remove();
  }
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

async function showAccountMenu() {
  var user    = State.currentUser;
  var profile = State.cachedProfile || {};
  var name    = profile.first_name || '';

  // Ensure a display_id exists (first-time users who signed up before this feature)
  if (!profile.display_id) {
    var newId = buildDisplayId(name);
    var updated = await dbUpsertProfile(name, newId);
    State.cachedProfile = updated;
    profile = updated;
  }

  var displayId = profile.display_id;

  var createdAt = '';
  if (user && user.created_at) {
    var d = new Date(user.created_at);
    createdAt = d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  }

  var body = document.getElementById('accountModalBody');
  body.innerHTML =
    '<div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">'
    + '<div><span style="color:var(--text);font-size:13px;">' + name + '</span></div>'
    + '<button onclick="startEditName()" class="icon-btn" title="Edit name">' + ICON_EDIT + '</button>'
    + '</div>'
    + '<div id="editNameWrap" style="display:none;margin-bottom:16px;">'
    + '<input id="editNameInput" type="text" value="' + name + '" maxlength="30" '
    + 'style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:6px 10px;border-radius:6px;width:100%;box-sizing:border-box;margin-bottom:8px;" />'
    + '<button onclick="saveEditName()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:6px 16px;border:1px solid var(--accent);border-radius:20px;background:none;color:var(--accent);cursor:pointer;">Save</button>'
    + '</div>'
    + '<div style="padding:12px 0;border-top:1px solid var(--border);">'
    + '<div style="margin-bottom:6px;">Member since <span style="color:var(--text);">' + createdAt + '</span></div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<span>User ID <span style="color:var(--text);" id="accountDisplayId">' + displayId + '</span></span>'
    + '<div style="display:flex;align-items:center;gap:4px;">'
    + '<button onclick="copyDisplayId()" class="icon-btn" id="copyIdBtn" title="Copy User ID">' + ICON_COPY + '</button>'
    + '<button onclick="confirmRefreshDisplayId()" class="icon-btn" title="Refresh ID">' + ICON_REFRESH + '</button>'
    + '</div>'
    + '</div>'
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
  var newDisplayId = buildDisplayId(name);
  var updated = await dbUpsertProfile(name, newDisplayId);
  State.cachedProfile = updated;
  setHeaderName(name);
  updateGreeting(name);
  closeAccountModal();
}

function copyDisplayId() {
  var el = document.getElementById('accountDisplayId');
  var btn = document.getElementById('copyIdBtn');
  if (!el || !btn) return;
  navigator.clipboard.writeText(el.textContent).then(function() {
    // Swap to checkmark, fade out, fade back
    btn.innerHTML = ICON_CHECK;
    btn.style.opacity = '1';
    setTimeout(function() {
      btn.style.transition = 'opacity 0.3s';
      btn.style.opacity = '0';
      setTimeout(function() {
        btn.innerHTML = ICON_COPY;
        btn.style.opacity = '1';
        btn.style.transition = '';
      }, 350);
    }, 900);
  });
}

function cancelRefreshId() {
  var p = document.getElementById('refreshConfirmPopup');
  if (p) p.remove();
}

function confirmRefreshDisplayId() {
  // Show confirmation popup overlay
  var existing = document.getElementById('refreshConfirmPopup');
  if (existing) return;

  var popup = document.createElement('div');
  popup.id = 'refreshConfirmPopup';
  popup.style.cssText = 'position:absolute;inset:0;background:rgba(30,44,53,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border-radius:inherit;z-index:10;';
  popup.innerHTML =
    '<div style="font-family:var(--mono);font-size:13px;color:var(--text);letter-spacing:0.04em;">Refresh user ID?</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="cancelRefreshId()" '
    + 'style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--border);border-radius:20px;background:none;color:var(--muted);cursor:pointer;">Cancel</button>'
    + '<button onclick="doRefreshDisplayId()" '
    + 'style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--text);border-radius:20px;background:none;color:var(--text);cursor:pointer;">Refresh</button>'
    + '</div>';

  var box = document.querySelector('#accountModal .ex-modal-box');
  if (box) { box.style.position = 'relative'; box.appendChild(popup); }
}

async function doRefreshDisplayId() {
  var p = document.getElementById('refreshConfirmPopup');
  if (p) p.remove();
  var profile = State.cachedProfile || {};
  var name = profile.first_name || '';
  var newDisplayId = buildDisplayId(name);
  var updated = await dbUpsertProfile(name, newDisplayId);
  State.cachedProfile = updated;
  var el = document.getElementById('accountDisplayId');
  if (el) el.textContent = newDisplayId;
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('open');
}

function handleAccountModalClick(e) {
  if (e.target === document.getElementById('accountModal')) closeAccountModal();
}
