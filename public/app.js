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
var ICON_REPLAY  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74"/><polyline points="3 3 3 8 8 8"/></svg>';
var ICON_SHARE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
var ICON_CHEVRON_CLOSED = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
var ICON_CHEVRON_OPEN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
var ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
var ICON_EXPAND = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
var ICON_LANDMINE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="21" x2="8" y2="21"/><line x1="4" y1="21" x2="4" y2="17"/><line x1="4" y1="19" x2="21" y2="5"/><circle cx="21" cy="5" r="2.2"/></svg>';
var ICON_KETTLEBELL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="7" rx="2.2"/><path d="M8 9 L4 13 L4 17 Q4 19 6 20 L10 21 L14 21 L18 20 Q20 19 20 17 L20 13 L16 9"/></svg>';
var ICON_BARBELL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="12" x2="23" y2="12"/><line x1="3" y1="10.5" x2="3" y2="13.5"/><line x1="5" y1="9.5" x2="5" y2="14.5"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/><line x1="19" y1="9.5" x2="19" y2="14.5"/><line x1="21" y1="10.5" x2="21" y2="13.5"/></svg>';
var ICON_PLYOMETRIC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C12 16 12 12 12 9"/><polyline points="9 12 12 9 15 12"/><path d="M12 21C11 14 8 11 4 10"/><polyline points="7 8 4 10 7 13"/><path d="M12 21C13 14 16 11 20 10"/><polyline points="17 8 20 10 17 13"/></svg>';
var ICON_DUMBBELL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="12" x2="15" y2="12"/><line x1="5" y1="7" x2="5" y2="17"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/><line x1="19" y1="7" x2="19" y2="17"/></svg>';
var ICON_MEDICINE_BALL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M7.5 5a10 10 0 0 1 0 14"/></svg>';
var ICON_MACHINE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 12 6 12 9 4 12 20 15 12 22 12"/></svg>';

// Maps a Main-sheet Type value to its equipment icon — shown next to the
// exercise name on the collapsed tile, before it's ever expanded. Type can be
// a comma-separated list (see parseList/matchesFilter in generator.js), so
// this checks each value and shows the first one that has an icon; types
// with no icon (bodyweight, hold, recovery, etc.) just show no icon.
var EQUIPMENT_ICONS = {
  barbell: ICON_BARBELL,
  dumbbell: ICON_DUMBBELL,
  kettlebell: ICON_KETTLEBELL,
  machine: ICON_MACHINE,
  landmine: ICON_LANDMINE,
  'medicine ball': ICON_MEDICINE_BALL,
  plyometric: ICON_PLYOMETRIC
};
function equipmentIconHTML(type){
  var types = parseList(type || '');
  for (var i = 0; i < types.length; i++){
    var icon = EQUIPMENT_ICONS[types[i].toLowerCase().trim()];
    if (icon) return '<span class="equipment-icon">' + icon + '</span>';
  }
  return '';
}

var State = {
  currentUser: null,
  sheetData:   null,
  lastResult:  null,
  lastSuggested: null,   // Suggest Exercises output — kept separate from lastResult
  openWorkout: null,
  workoutsNotif: false,  // true if there are unseen shared workouts
  cachedWorkouts: [],     // local cache updated immediately on title edits
  lastWorkout: null,      // most recent saved workout for generator card
  lastWorkout2: null,     // second most recent
  lastWorkout3: null      // third most recent
};

// DB helpers — see db.js

// ── Name handling ──────────────────────────────────────────
// 'Friend' shows up as first_name on a freshly created profiles row — a
// legacy DB-side default that predates this codebase, not something set
// by any code here. Never display it, never let anyone save it as their
// own name, and self-heal it out of the stored row the first time it's
// seen (see startApp). Same treatment for 'there', an old OAuth-metadata
// fallback.
var NAME_PLACEHOLDER = 'EnterName';

function normalizeUserName(rawName) {
  var name = (rawName || '').trim();
  if (!name) return '';
  var lower = name.toLowerCase();
  if (lower === 'friend' || lower === 'there') return '';
  return name;
}

function isReservedName(rawName) {
  var lower = (rawName || '').trim().toLowerCase();
  return lower === 'friend' || lower === 'there' || lower === NAME_PLACEHOLDER.toLowerCase();
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
  var dir     = (toIdx > fromIdx) ? 1 : -1; // 1 = new page to right, -1 = new page to left

  var outId = 'page' + _currentPage.charAt(0).toUpperCase() + _currentPage.slice(1);
  var inId  = 'page' + name.charAt(0).toUpperCase() + name.slice(1);
  var outPage = document.getElementById(outId);
  var inPage  = document.getElementById(inId);

  _currentPage = name;

  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  if (!outPage || !inPage || outPage === inPage) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    if (inPage) inPage.classList.add('active');
    onPageReady();
  } else {
    var DUR = 160;
    var startX = dir * 36;

    // Hide outgoing immediately — no dual-page overlap
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });

    // Prepare incoming off-screen, then make active (display:block via CSS)
    inPage.style.opacity = '0';
    inPage.style.transform = 'translateX(' + startX + 'px)';
    inPage.style.transition = 'none';
    inPage.classList.add('active');

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var easing = 'cubic-bezier(0.25,0.46,0.45,0.94)';
        var t = DUR + 'ms ' + easing;
        inPage.style.transition = 'opacity ' + t + ', transform ' + t;
        inPage.style.opacity    = '1';
        inPage.style.transform  = 'translateX(0)';

        setTimeout(function() {
          inPage.style.opacity    = '';
          inPage.style.transform  = '';
          inPage.style.transition = '';
          onPageReady();
        }, DUR + 10);
      });
    });
  }
}

function onPageReady() {
  var name = _currentPage;
  if (name === 'generator' && typeof loadLastWorkout === 'function') { if (typeof _pillsReady !== 'undefined') _pillsReady = false; loadLastWorkout(); }
  if (name === 'myWorkouts') {
    loadWorkouts(State.workoutsNotif);
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
  if (name === 'pro' && typeof renderProTab === 'function') renderProTab();
}

// ── Name prompt ───────────────────────────────────────────

function isInstalledPWA() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function showNamePrompt() {
  var wrap = document.getElementById('headerRight');
  wrap.innerHTML = '<div class="name-prompt-wrap">'
    + '<input class="name-prompt-input" id="nameInput" type="text" placeholder="Your name" maxlength="30" />'
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
  if (isReservedName(name)) {
    input.value = '';
    input.placeholder = 'Try a different name';
    input.style.borderColor = '#D9665C';
    setTimeout(function() { input.style.borderColor = ''; input.placeholder = 'Your name'; }, 2000);
    input.focus();
    return;
  }
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

// Fire-and-forget: starts the 14-day trial on first call for this user,
// no-ops on every call after (server-side idempotency in /api/init-trial).
// Runs on every session establishment rather than hooking each of the three
// signup paths (password/OTP/Google) separately, since it's cheap and safe
// to call repeatedly.
async function ensureTrialInitialized() {
  try {
    var auth = await getAuthHeader();
    if (!auth) return;
    await fetch('/api/init-trial', { method: 'POST', headers: { 'Authorization': auth } });
  } catch (err) {
    console.error('Trial init failed:', err);
  }
}

// Returns the auth header value for the current session, or null if signed out.
async function getAuthHeader() {
  var { data } = await sb.auth.getSession();
  var token = data && data.session && data.session.access_token;
  return token ? 'Bearer ' + token : null;
}

// Fetches fresh subscription status from the server. Used by the account
// menu and the mandatory-upgrade gate below, rather than caching it in
// State, since billing state can change asynchronously via webhook.
async function getSubscriptionStatus() {
  try {
    var auth = await getAuthHeader();
    if (!auth) return null;
    var res = await fetch('/api/subscription-status', { headers: { 'Authorization': auth } });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Could not load subscription status:', err);
    return null;
  }
}

async function startApp(user) {
  if (State.currentUser && State.currentUser.id === user.id) return;
  State.currentUser = user;

  // Awaited (not fire-and-forget) — a brand new user's trial row must exist
  // before the access check below runs, or they'd wrongly see the mandatory
  // upgrade modal on their very first load.
  await ensureTrialInitialized();
  redeemPendingReferralCodeIfAny(); // fire-and-forget — see its own comment

  var profile = await dbGetProfile();
  // Self-heal a legacy 'Friend'/'there' default straight out of the stored
  // row, so it never lingers as literal data for any other reader to see.
  if (profile && profile.first_name && isReservedName(profile.first_name)) {
    profile = await dbUpsertProfile('', profile.display_id);
  }
  State.cachedProfile = profile;

  if (profile && profile.deletion_requested_at) {
    // Recovery takes priority over the paywall gate — showing both at once
    // would stack two non-dismissable modals, so resolve this one first.
    // Next load re-evaluates the paywall normally once it's resolved.
    checkForPendingDeletion(profile);
  } else {
    var subStatus = await getSubscriptionStatus();
    // Cached so renderProTab() can pick its render branch synchronously
    // instead of re-fetching (and flashing the wrong shape) on every visit
    // to the Pro tab. Refreshed again after checkout success and whenever
    // the account menu opens (see upgrade.js/account.js).
    State.subscriptionStatus = subStatus;
    if (subStatus && !subStatus.hasAccess) {
      // Modal overlay blocks all clicks to the app underneath, so this alone
      // is the paywall gate — no separate blocking screen needed.
      openUpgradeModal('mandatory');
    } else {
      // Only checked when not being paywalled — see checkForCheckoutSuccess's
      // own comment for why this ordering is an acceptable trade-off.
      checkForCheckoutSuccess();
    }
  }

  // Only use manually entered name — never use OAuth metadata, never show 'friend'
  var name = normalizeUserName(profile && profile.first_name);

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

// Account menu — see account.js
