/* ============================================================
   BASELINE — workouts.js
   Save, load, display and delete workouts. Workout modal.
   Uses Supabase JS directly via db helpers in app.js.
   Depends on: app.js, generator.js, scores.js
   ============================================================ */
async function saveWorkout(callback) {
  if (!State.lastResult) return;
  var btn = document.getElementById('saveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    var saved = await dbInsertWorkout(makeTitle(State.lastResult), State.lastResult.prompt, State.lastResult.timeStr, State.lastResult);
    if (btn) { btn.textContent = 'Saved'; btn.classList.add('saved'); }
    var msg = document.getElementById('saveMsg');
    if (msg) msg.textContent = 'Added to My Workouts';
    await loadWorkouts();
    // Update last workout card on generator page
    if (typeof loadLastWorkout === 'function') loadLastWorkout();
    if (typeof callback === 'function') {
      var ws = await dbGetWorkouts();
      if (ws && ws.length) callback(ws[0].id);
    }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save workout'; }
    var msg = document.getElementById('saveMsg');
    if (msg) msg.textContent = 'Could not save. Please try again.';
  }
}

// ── Workouts tab — three collapsible sections ──────────────────────────
var WorkoutSections = { open: { mine:false, custom:false, shared:false } };

function workoutCardHTML(w) {
  var date = new Date(w.generated_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  var sc = w.scores ? w.scores.length : 0;
  var isCustom = w.workout_data && w.workout_data.custom;
  var isUnseenShared = w.is_shared && !w.seen;
  return '<div class="workout-card'+(isCustom?' workout-card-custom':'')+'" onclick="openWorkoutModal(\''+w.id+'\')">'
    + (isUnseenShared ? '<span class="notif-dot notif-dot-card"></span>' : '')
    + '<div class="wc-date">'+date+'</div>'
    + '<div class="wc-title">'+w.title+'</div>'
    + '<div class="wc-meta">'+(w.prompt||'')+' &middot; '+(w.time_selection||'')+'</div>'
    + (sc ? '<div class="wc-score-badge">'+sc+' result'+(sc>1?'s':'')+'</div>' : '')
    + '</div>';
}

function sectionHTML(key, label, list, openByDefault) {
  var isOpen = WorkoutSections.open[key] || openByDefault;
  var chevron = isOpen ? ICON_CHEVRON_OPEN : ICON_CHEVRON_CLOSED;
  var body = list.length
    ? '<div class="workouts-grid">' + list.map(workoutCardHTML).join('') + '</div>'
    : '<div class="empty-state" style="padding:16px 0;">No workouts here yet.</div>';
  return '<div class="ws-section">'
    + '<button class="ws-section-header" onclick="toggleWorkoutSection(\''+key+'\')">'
    + '<span>'+label+' <span class="ws-count">('+list.length+')</span></span>'
    + '<span class="ws-chevron">'+chevron+'</span>'
    + '</button>'
    + '<div class="ws-section-body" style="display:'+(isOpen?'block':'none')+';" id="wsBody_'+key+'">'+body+'</div>'
    + '</div>';
}

function toggleWorkoutSection(key) {
  WorkoutSections.open[key] = !WorkoutSections.open[key];
  loadWorkouts();
}

async function loadWorkouts(openSharedByDefault) {
  var ws = await dbGetWorkouts();
  var c = document.getElementById('workoutsContainer');
  if (!ws || !ws.length) {
    c.innerHTML = '<div class="empty-state">No saved workouts yet.</div>';
    return;
  }
  var mine   = ws.filter(function(w){ return !w.is_shared && !(w.workout_data && w.workout_data.custom); });
  var custom = ws.filter(function(w){ return !w.is_shared && (w.workout_data && w.workout_data.custom); });
  var shared = ws.filter(function(w){ return w.is_shared; });

  if (openSharedByDefault) WorkoutSections.open.shared = true;

  c.innerHTML =
    sectionHTML('mine',   'My Workouts',      mine,   false)
    + sectionHTML('custom', 'Custom Workouts', custom, false)
    + sectionHTML('shared', 'Shared Workouts', shared, !!openSharedByDefault);
}

// Render workouts tab from in-memory cache — no DB fetch, used after instant updates
function renderWorkoutsFromCache() {
  var ws = State.cachedWorkouts || [];
  var c = document.getElementById('workoutsContainer');
  if (!c) return;
  if (!ws.length) { c.innerHTML = '<div class="empty-state">No saved workouts yet.</div>'; return; }
  var mine   = ws.filter(function(w){ return !w.is_shared && !(w.workout_data && w.workout_data.custom); });
  var custom = ws.filter(function(w){ return !w.is_shared && (w.workout_data && w.workout_data.custom); });
  var shared = ws.filter(function(w){ return w.is_shared; });
  c.innerHTML =
    sectionHTML('mine',   'My Workouts',  mine,   false)
    + sectionHTML('custom','Custom Workouts', custom, false)
    + sectionHTML('shared','Shared Workouts', shared, false);
}



async function openWorkoutModal(id) {
  var ws = await dbGetWorkouts();
  var w = ws.find(function(x){ return x.id === id; }); if (!w) return;
  State.openWorkout = w;
  var date = new Date(w.generated_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  document.getElementById('modalTitle').innerHTML =
    '<span id="modalTitleText">' + w.title + '</span>'
    + '<button onclick="startEditWorkoutTitle()" class="icon-btn" style="margin-left:8px;vertical-align:middle;" title="Rename">' + ICON_EDIT + '</button>'
    + '<button onclick="openShareMenu()" class="icon-btn" style="margin-left:4px;vertical-align:middle;" title="Share">' + ICON_SHARE + '</button>';

  document.getElementById('modalDate').textContent  = date + ' · ' + (w.prompt||'') + ' · ' + (w.time_selection||'');

  if (w.workout_data && w.workout_data.custom) {
    document.getElementById('modalResults').innerHTML = renderCustomWorkoutResults(w.workout_data);
    document.getElementById('scoreInputs').innerHTML  = buildCustomScoreInputsHTML(w.workout_data);
  } else {
    document.getElementById('modalResults').innerHTML = buildResultsForModal(w.workout_data, w.id);
    document.getElementById('scoreInputs').innerHTML  = buildScoreInputsHTML(w.workout_data);
  }

  document.getElementById('scoresSavedMsg').textContent = '';
  var histHTML = buildScoreHistoryHTML(w);
  var histSection = document.getElementById('scoreHistory');
  if (histHTML) {
    histSection.style.display = 'block';
    document.getElementById('scoreHistoryList').innerHTML = histHTML;
  } else {
    histSection.style.display = 'none';
  }

  // Shared By / Shared With panels
  document.getElementById('sharedInfoSection').innerHTML = buildSharedInfoHTML(w);

  // Add Edit Workout button for custom workouts
  var editBtnWrap = document.getElementById('editWorkoutBtnWrap');
  if (editBtnWrap) {
    if (w.workout_data && w.workout_data.custom) {
      editBtnWrap.style.display = 'inline-block';
    } else {
      editBtnWrap.style.display = 'none';
    }
  }

  document.getElementById('workoutModal').classList.add('open');
}

function startEditWorkoutTitle() {
  var el = document.getElementById('modalTitleText');
  if (!el) return;
  var current = el.textContent;
  el.outerHTML = '<input id="modalTitleInput" type="text" value="' + current + '" maxlength="80" '
    + 'style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--font);font-size:inherit;font-weight:inherit;padding:4px 8px;border-radius:6px;width:70%;" />'
    + '<button onclick="saveWorkoutTitle()" style="font-family:var(--mono);font-size:10px;letter-spacing:0.08em;padding:4px 12px;border:1px solid var(--accent);border-radius:16px;background:none;color:var(--accent);cursor:pointer;margin-left:8px;">Save</button>';
  var input = document.getElementById('modalTitleInput');
  if (input) { input.focus(); input.select(); }
}

async function saveWorkoutTitle() {
  var input = document.getElementById('modalTitleInput');
  if (!input || !State.openWorkout) return;
  var newTitle = input.value.trim();
  if (!newTitle) return;
  var { error } = await sb.from('workouts')
    .update({ title: newTitle })
    .eq('id', State.openWorkout.id)
    .eq('user_id', State.currentUser.id);
  if (error) { console.error('Rename failed:', error); return; }

  // Update in memory immediately — avoids race condition where loadWorkouts()
  // reads the DB before the write has propagated, reverting the title
  State.openWorkout.title = newTitle;
  var cached = State.cachedWorkouts || [];
  var idx = cached.findIndex(function(w){ return w.id === State.openWorkout.id; });
  if (idx !== -1) cached[idx].title = newTitle;

  // Re-render title row in place (no modal re-open needed)
  var titleEl = document.getElementById('modalTitle');
  if (titleEl) {
    titleEl.innerHTML =
      '<span id="modalTitleText">' + newTitle + '</span>'
      + '<button onclick="startEditWorkoutTitle()" class="icon-btn" style="margin-left:8px;vertical-align:middle;" title="Rename">' + ICON_EDIT + '</button>'
      + '<button onclick="openShareMenu()" class="icon-btn" style="margin-left:4px;vertical-align:middle;" title="Share">' + ICON_SHARE + '</button>';
  }

  // Re-render workouts list from updated cache — no DB round-trip needed
  renderWorkoutsFromCache();
}

/* ── Shared By / Shared With panels ─────────────────────── */

var SharedPanels = { by: false, with: false };

function buildSharedInfoHTML(w) {
  var sharedBy = (w.workout_data && w.workout_data.sharedBy) || w.shared_by_display_id || null;
  var sharedWith = w.shared_with || []; // array of {display_id, sent_at}

  var byChevron   = SharedPanels.by   ? ICON_CHEVRON_OPEN : ICON_CHEVRON_CLOSED;
  var withChevron = SharedPanels.with ? ICON_CHEVRON_OPEN : ICON_CHEVRON_CLOSED;

  var byRow = sharedBy
    ? '<div class="shared-info-row">'
      + '<button class="shared-info-header" onclick="toggleSharedPanel(\'by\')">'
      + '<span>Shared by</span><span class="ws-chevron">' + byChevron + '</span>'
      + '</button>'
      + '<div class="shared-info-body" style="display:' + (SharedPanels.by ? 'block' : 'none') + ';">'
      + '<div class="shared-id shared-id-by">' + sharedBy + '</div>'
      + '</div>'
      + '</div>'
    : '';

  var withRow = '<div class="shared-info-row">'
    + '<button class="shared-info-header" onclick="toggleSharedPanel(\'with\')">'
    + '<span>Shared with</span><span class="ws-chevron">' + withChevron + '</span>'
    + '</button>'
    + '<div class="shared-info-body" style="display:' + (SharedPanels.with ? 'block' : 'none') + ';">'
    + (sharedWith.length
        ? sharedWith.map(function(s) {
            return '<div class="shared-id shared-id-with">'
              + '<span>' + s.display_id + '</span>'
              + '<button onclick="resendWorkout(\'' + s.display_id + '\')" class="icon-btn" title="Send again">' + ICON_REFRESH + '</button>'
              + '</div>';
          }).join('')
        : '<div class="shared-id" style="color:var(--muted);">Not shared with anyone yet</div>')
    + '</div>'
    + '</div>';

  if (!byRow && !sharedWith.length) return '';
  return byRow + withRow;
}

function toggleSharedPanel(key) {
  SharedPanels[key] = !SharedPanels[key];
  if (State.openWorkout) {
    document.getElementById('sharedInfoSection').innerHTML = buildSharedInfoHTML(State.openWorkout);
  }
}

async function resendWorkout(displayId) {
  if (!State.openWorkout) return;
  await dbShareWorkout(State.openWorkout, [displayId]);
  alert('Workout sent to ' + displayId + ' again.');
}

/* ── Share menu ──────────────────────────────────────────── */

function openShareMenu() {
  if (!State.openWorkout) return;
  shareRowCount = 1;
  var body = document.getElementById('shareModalBody');
  body.innerHTML =
    '<div style="margin-bottom:16px;color:var(--text);font-size:13px;">' + State.openWorkout.title + '</div>'
    + '<div id="shareInputsWrap">'
    + shareInputRowHTML(0)
    + '</div>'
    + '<button onclick="addShareInputRow()" class="icon-btn-text" style="display:block;margin:4px 0 20px 0;" title="Add another">+ Add another</button>'
    + '<button class="save-btn" id="shareSubmitBtn" onclick="submitShareWorkout()" style="display:block;width:100%;box-sizing:border-box;">Share workout</button>'
    + '<div id="shareMsg" style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-top:10px;"></div>';

  document.getElementById('shareModal').classList.add('open');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('open');
}

function handleShareModalClick(e) {
  if (e.target === document.getElementById('shareModal')) closeShareModal();
}

var shareRowCount = 1;
function shareInputRowHTML(i) {
  return '<input type="text" class="share-input" id="shareInput_' + i + '" placeholder="User ID" '
    + 'style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:16px;padding:8px 10px;border-radius:6px;width:100%;box-sizing:border-box;margin-bottom:8px;" />';
}

function addShareInputRow() {
  var wrap = document.getElementById('shareInputsWrap');
  var div = document.createElement('div');
  div.innerHTML = shareInputRowHTML(shareRowCount);
  wrap.appendChild(div.firstChild);
  shareRowCount++;
}

async function submitShareWorkout() {
  if (!State.openWorkout) return;
  var inputs = document.querySelectorAll('.share-input');
  var ids = Array.prototype.map.call(inputs, function(i){ return i.value.trim(); }).filter(Boolean);
  if (!ids.length) return;

  var btn = document.getElementById('shareSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sharing...'; }

  var results = await dbShareWorkout(State.openWorkout, ids);

  if (btn) { btn.disabled = false; btn.textContent = 'Share workout'; }

  var msg = document.getElementById('shareMsg');
  var okCount = results.filter(function(r){ return r.ok; }).length;
  var failed = results.filter(function(r){ return !r.ok; });
  var text = okCount ? ('Sent to ' + okCount + ' user' + (okCount>1?'s':'') + '.') : '';
  if (failed.length) text += (text?' ':'') + 'Could not send to: ' + failed.map(function(f){return f.id;}).join(', ') + '.';
  if (msg) msg.textContent = text;

  // Update shared_with on the workout record so it shows in Shared With panel
  if (okCount) {
    var sentTo = results.filter(function(r){return r.ok;}).map(function(r){ return { display_id: r.id, sent_at: new Date().toISOString() }; });
    var existing = State.openWorkout.shared_with || [];
    var updated = existing.concat(sentTo);
    await sb.from('workouts').update({ shared_with: updated }).eq('id', State.openWorkout.id).eq('user_id', State.currentUser.id);
    State.openWorkout.shared_with = updated;
  }
}

// Re-render results in workout modal context (passes workoutId to timer)
function buildResultsForModal(data, workoutId) {
  var html = buildResults(data);
  // Inject workoutId into timer toggle calls
  html = html.replace(/toggleTimer\(this,'([^']+)',null\)/g, function(m, fmt) {
    return "toggleTimer(this,'" + fmt + "','" + workoutId + "')";
  });
  return html;
}

function closeModal() {
  document.getElementById('workoutModal').classList.remove('open');
  State.openWorkout = null;
}

async function deleteWorkout() {
  if (!State.openWorkout) return;
  var existing = document.getElementById('deleteConfirmPopup');
  if (existing) return;
  var popup = document.createElement('div');
  popup.id = 'deleteConfirmPopup';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(30,44,53,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:9999;';
  popup.innerHTML =
    '<div style="font-family:var(--mono);font-size:13px;color:var(--text);letter-spacing:0.04em;">Delete workout?</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="cancelDeleteWorkout()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--border);border-radius:20px;background:none;color:var(--muted);cursor:pointer;">Cancel</button>'
    + '<button onclick="confirmDeleteWorkout()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--text);border-radius:20px;background:none;color:var(--text);cursor:pointer;">Delete</button>'
    + '</div>';
  document.body.appendChild(popup);
}

function cancelDeleteWorkout() {
  var p = document.getElementById('deleteConfirmPopup');
  if (p) p.remove();
}

async function confirmDeleteWorkout() {
  var p = document.getElementById('deleteConfirmPopup');
  if (p) p.remove();
  if (!State.openWorkout) return;
  await dbDeleteWorkout(State.openWorkout.id);
  // Remove from local cache immediately
  State.cachedWorkouts = (State.cachedWorkouts || []).filter(function(w){ return w.id !== State.openWorkout.id; });
  closeModal();
  renderWorkoutsFromCache();
  // Also do a fresh load in the background to stay in sync
  loadWorkouts();
}

/* ── Custom workout rendering ──────────────────────────── */

function renderCustomWorkoutResults(data) {
  var html = '<div class="results custom-results">';
  var segs = data.segments || {};

  if (segs.prep && segs.prep.exercises && segs.prep.exercises.length) {
    html += renderCustomSegment(segs.prep, 'Prep', 'ta', 'prep');
    html += '<div class="divider"></div>';
  }

  if (segs.main && segs.main.exercises && segs.main.exercises.length) {
    html += '<div class="results-section"><div class="section-label">Main Workout</div>';
    var mainFmt = (segs.main.formatTicked && segs.main.format) ? segs.main.format : null;
    var wid = (State.openWorkout ? State.openWorkout.id : '');
    if (mainFmt) {
      html += '<div class="timer-btn-row"><div class="format-badge">' + mainFmt + '</div>'
            + '<button class="format-badge timer-toggle-btn" onclick="toggleTimer(this,&quot;' + mainFmt + '&quot;,&quot;' + wid + '&quot;)">Timer</button></div>';
    } else if (segs.main.rounds && segs.main.rounds.toString().trim()) {
      html += '<div class="format-badge">x' + segs.main.rounds + ' rounds</div>';
    }
    html += '<div class="exercise-pair">';
    segs.main.exercises.forEach(function(ex, i) {
      html += renderCustomExCard(ex, i + 1, 'main');
    });
    html += '</div></div>';
  }

  if (segs.mobility && segs.mobility.exercises && segs.mobility.exercises.length) {
    html += '<div class="divider"></div>';
    html += renderCustomSegment(segs.mobility, 'Mobility', 'tz', 'mobility');
  }

  html += '</div>';
  return html;
}

function renderCustomSegment(seg, label, cssClass, segKey) {
  var html = '<div class="results-section"><div class="section-label">' + label + '</div>';
  if (seg.roundsTicked && seg.rounds) {
    html += '<div class="format-badge">' + seg.rounds + ' Rounds</div>';
  }
  html += '<div class="acc-grid">';
  seg.exercises.forEach(function(ex, i) {
    html += renderCustomAccCard(ex, i + 1, cssClass, segKey);
  });
  html += '</div></div>';
  return html;
}

function renderCustomExCard(ex, num, segKey) {
  var repsVal = ex.reps || '—';
  var unit = cwRepLabelForDisplay(ex, segKey);
  var css = num === 1 ? 't1' : num === 2 ? 't2' : 't3';
  var hasMedia = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[ex.name];
  var nameHTML = hasMedia
    ? '<div class="card-exercise card-exercise-link" data-exname="' + ex.name + '" onclick="openExerciseModal(this)">' + ex.name + '</div>'
    : '<div class="card-exercise">' + ex.name + '</div>';
  return '<div class="exercise-card ' + css + '">'
    + '<div class="card-label ' + css + '">Exercise ' + num + '</div>'
    + nameHTML
    + '<div class="card-reps-row"><span class="card-reps">' + repsVal + '</span>'
    + '<span class="card-col" style="margin-left:8px;font-size:12px;">' + unit + '</span></div>'
    + '</div>';
}

function renderCustomAccCard(ex, num, cssClass, segKey) {
  var repsVal = ex.reps || '—';
  var unit = cwRepLabelForDisplay(ex, segKey);
  var label = segKey === 'prep' ? 'Prep ' : 'Mobility ';
  var hasMedia = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[ex.name];
  var nameHTML = hasMedia
    ? '<div class="acc-name card-exercise-link" data-exname="' + ex.name + '" onclick="openExerciseModal(this)">' + ex.name + '</div>'
    : '<div class="acc-name">' + ex.name + '</div>';
  return '<div class="acc-card ' + cssClass + '">'
    + '<div class="card-label ' + cssClass + '">' + label + num + '</div>'
    + nameHTML
    + '<div class="card-reps-row"><span class="acc-reps">' + repsVal + '</span>'
    + '<span class="card-col" style="margin-left:8px;font-size:12px;">' + unit + '</span></div>'
    + '</div>';
}

/* ── Override buildScoreKeys to handle custom workouts ── */
/* scores.js defines buildScoreKeys for generator workouts. */
/* workouts.js overrides it so saveScores, buildScoreHistoryHTML */
/* and buildScoreInputsHTML all work identically for custom workouts. */

var _origBuildScoreKeys = buildScoreKeys; // captures scores.js version before reassignment

// Refresh last session card whenever scores are saved
var _origSaveScores = typeof saveScores === 'function' ? saveScores : null;
if (_origSaveScores) {
  saveScores = function() {
    var result = _origSaveScores.apply(this, arguments);
    // After saving, reload last workout data for generator card
    if (result && typeof result.then === 'function') {
      result.then(function() { if (typeof loadLastWorkout === 'function') loadLastWorkout(); });
    } else {
      setTimeout(function() { if (typeof loadLastWorkout === 'function') loadLastWorkout(); }, 800);
    }
    return result;
  };
}
buildScoreKeys = function(r) {            // expression avoids hoisting issue
  var keys;
  if (r && r.custom) {
    keys = buildCustomScoreKeys(r);
  } else {
    keys = _origBuildScoreKeys(r);
    // Add Difficulty/RPE to every generator workout too
    keys.push({ key:'difficulty', label:'Difficulty', unit:'RPE (1-10)' });
  }
  return keys;
};

function buildCustomScoreKeys(data) {
  var segs = data.segments || {};
  var keys = [];

  // Workout-level score — inline mapping with total time as default fallback
  var fmt = (segs.main && segs.main.formatTicked) ? (segs.main.format || '') : '';
  var fl = fmt.toLowerCase();
  if (fl.indexOf('amrap') !== -1) {
    keys.push({ key:'workout', label:'total rounds', unit:'rounds' });
  } else if (fl.indexOf('emom') !== -1) {
    // EMOM — no workout-level score
  } else {
    // For Time variants OR no format selected → default to total time
    keys.push({ key:'workout', label:'total time', unit:'mm:ss' });
  }

  // Main exercises only — TA/TZ (prep/mobility) not loggable
  var mainExs = (segs.main && segs.main.exercises) || [];
  mainExs.forEach(function(ex, i) {
    var s = getExerciseScoreField(ex.type);
    if (s) keys.push({ key:'ex'+(i+1), label:ex.name, unit:s });
  });

  // Always add Difficulty (RPE) at the bottom
  keys.push({ key:'difficulty', label:'Difficulty', unit:'RPE (1-10)' });

  return keys;
}

function buildCustomScoreInputsHTML(data) {
  var keys = buildCustomScoreKeys(data);
  if (!keys.length) return '<div class="score-empty">No scores to log for this workout type.</div>';
  return keys.map(function(k) {
    var placeholder = k.unit || '';
    return '<div class="score-row">'
      + '<label class="score-label">' + k.label + '</label>'
      + '<input type="text" class="score-input" id="sc_' + k.key + '" placeholder="' + placeholder + '" />'
      + '</div>';
  }).join('');
}

function cwRepLabelForDisplay(ex, segKey) {
  if (segKey === 'mobility') return 'seconds';
  if (ex.isRest || ['recovery','hold'].indexOf((ex.type||'').toLowerCase()) !== -1) return 'seconds';
  if ((ex.type||'').toLowerCase() === 'machine') return 'metres';
  if ((ex.ub||'').toUpperCase() === 'U') return 'reps each side';
  return 'reps';
}
