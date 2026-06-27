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
    if (typeof callback === 'function') {
      // Find the saved workout id — get latest
      var ws = await dbGetWorkouts();
      if (ws && ws.length) callback(ws[0].id);
    }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save workout'; }
    var msg = document.getElementById('saveMsg');
    if (msg) msg.textContent = 'Could not save. Please try again.';
  }
}

async function loadWorkouts() {
  var ws = await dbGetWorkouts();
  var c = document.getElementById('workoutsContainer');
  if (!ws || !ws.length) {
    c.innerHTML = '<div class="empty-state">No saved workouts yet.</div>';
    return;
  }
  c.innerHTML = '<div class="workouts-grid">' + ws.map(function(w) {
    var date = new Date(w.generated_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    var sc = w.scores ? w.scores.length : 0;
    var isCustom = w.workout_data && w.workout_data.custom;
    return '<div class="workout-card'+(isCustom?' workout-card-custom':'')+'" onclick="openWorkoutModal(\''+w.id+'\')">'
      + '<div class="wc-date">'+date+'</div>'
      + '<div class="wc-title">'+w.title+'</div>'
      + '<div class="wc-meta">'+(w.prompt||'')+' &middot; '+(w.time_selection||'')+'</div>'
      + (sc ? '<div class="wc-score-badge">'+sc+' result'+(sc>1?'s':'')+'</div>' : '')
      + '</div>';
  }).join('') + '</div>';
}

async function openWorkoutModal(id) {
  var ws = await dbGetWorkouts();
  var w = ws.find(function(x){ return x.id === id; }); if (!w) return;
  State.openWorkout = w;
  var date = new Date(w.generated_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  document.getElementById('modalTitle').textContent = w.title;
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
  document.getElementById('workoutModal').classList.add('open');
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
  if (!State.openWorkout || !confirm('Delete this workout?')) return;
  await dbDeleteWorkout(State.openWorkout.id);
  closeModal(); loadWorkouts();
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
            + '<button class="format-badge timer-toggle-btn" onclick="toggleTimer(this,&quot;' + mainFmt + '&quot;,&quot;' + wid + '&quot;)">TIMER</button></div>';
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
  return '<div class="exercise-card ' + css + '">'
    + '<div class="card-label ' + css + '">Exercise ' + num + '</div>'
    + '<div class="card-exercise">' + ex.name + '</div>'
    + '<div class="card-reps-row"><span class="card-reps">' + repsVal + '</span>'
    + '<span class="card-col" style="margin-left:8px;font-size:12px;">' + unit + '</span></div>'
    + '</div>';
}

function renderCustomAccCard(ex, num, cssClass, segKey) {
  var repsVal = ex.reps || '—';
  var unit = cwRepLabelForDisplay(ex, segKey);
  var label = segKey === 'prep' ? 'Prep ' : 'Mobility ';
  return '<div class="acc-card ' + cssClass + '">'
    + '<div class="card-label ' + cssClass + '">' + label + num + '</div>'
    + '<div class="acc-name">' + ex.name + '</div>'
    + '<div class="card-reps-row"><span class="acc-reps">' + repsVal + '</span>'
    + '<span class="card-col" style="margin-left:8px;font-size:12px;">' + unit + '</span></div>'
    + '</div>';
}

/* ── Override buildScoreKeys to handle custom workouts ── */
/* scores.js defines buildScoreKeys for generator workouts. */
/* workouts.js overrides it so saveScores, buildScoreHistoryHTML */
/* and buildScoreInputsHTML all work identically for custom workouts. */

var _origBuildScoreKeys = buildScoreKeys; // captures scores.js version before reassignment
buildScoreKeys = function(r) {            // expression avoids hoisting issue
  if (r && r.custom) return buildCustomScoreKeys(r);
  return _origBuildScoreKeys(r);
};

function buildCustomScoreKeys(data) {
  var segs = data.segments || {};
  var keys = [];

  // Workout-level score (format)
  var fmt = (segs.main && segs.main.formatTicked) ? segs.main.format : null;
  var ws = getWorkoutScoreField(fmt);
  if (ws) keys.push({ key:'workout', label:ws, unit:null });

  // Main exercises
  var mainExs = (segs.main && segs.main.exercises) || [];
  mainExs.forEach(function(ex, i) {
    var s = getExerciseScoreField(ex.type);
    if (s) keys.push({ key:'ex'+(i+1), label:ex.name, unit:s });
  });

  // Prep exercises
  var prepExs = (segs.prep && segs.prep.exercises) || [];
  prepExs.forEach(function(ex, i) {
    var s = getExerciseScoreField(ex.type);
    if (s) keys.push({ key:'ta'+i, label:ex.name, unit:s });
  });

  // Mobility exercises
  var mobExs = (segs.mobility && segs.mobility.exercises) || [];
  mobExs.forEach(function(ex, i) {
    var s = getExerciseScoreField(ex.type);
    if (s) keys.push({ key:'tz'+i, label:ex.name, unit:s });
  });

  return keys;
}

function buildCustomScoreInputsHTML(data) {
  return buildScoreInputsHTML(data);
}

function cwRepLabelForDisplay(ex, segKey) {
  if (segKey === 'mobility') return 'seconds';
  if (ex.isRest || ['recovery','hold'].indexOf((ex.type||'').toLowerCase()) !== -1) return 'seconds';
  if ((ex.type||'').toLowerCase() === 'machine') return 'metres';
  if ((ex.ub||'').toUpperCase() === 'U') return 'reps each side';
  return 'reps';
}
