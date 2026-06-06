/* ============================================================
   BASELINE — workouts.js
   Save, load, display and delete workouts. Workout modal.
   Uses Supabase JS directly via db helpers in app.js.
   Depends on: app.js, generator.js, scores.js
   ============================================================ */
async function saveWorkout() {
  if (!State.lastResult) return;
  var btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await dbInsertWorkout(makeTitle(State.lastResult), State.lastResult.prompt, State.lastResult.timeStr, State.lastResult);
    btn.textContent = 'Saved';
    btn.classList.add('saved');
    document.getElementById('saveMsg').textContent = 'Added to My Workouts';
    loadWorkouts();
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Save workout';
    document.getElementById('saveMsg').textContent = 'Could not save. Please try again.';
  }
}

async function loadWorkouts() {
  var ws = await dbGetWorkouts();
  var c = document.getElementById('workoutsContainer');
  if (!ws || !ws.length) {
    c.innerHTML = '<div class="empty-state">No saved workouts yet. Generate one and hit Save!</div>';
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
    document.getElementById('modalResults').innerHTML = buildResults(w.workout_data);
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
    if (segs.main.formatTicked && segs.main.format) {
      html += '<div class="format-badge">' + segs.main.format + '</div>';
    } else if (segs.main.roundsTicked && segs.main.rounds) {
      html += '<div class="format-badge">' + segs.main.rounds + ' Rounds</div>';
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

function buildCustomScoreInputsHTML(data) {
  var segs = data.segments || {};
  var allExercises = [];

  // Collect all exercises across segments with their labels
  var segDefs = [
    { key:'main',     label:'Main Workout' },
    { key:'prep',     label:'Prep'         },
    { key:'mobility', label:'Mobility'     }
  ];

  segDefs.forEach(function(sd) {
    var seg = segs[sd.key];
    if (!seg || !seg.exercises || !seg.exercises.length) return;
    seg.exercises.forEach(function(ex) {
      allExercises.push({ ex:ex, segKey:sd.key, segLabel:sd.label });
    });
  });

  if (!allExercises.length) return '';

  return allExercises.map(function(item) {
    var ex = item.ex;
    var unit = cwRepLabelForDisplay(ex, item.segKey);
    var fieldId = 'score_custom_' + ex.name.replace(/[^a-zA-Z0-9]/g,'_');
    return '<div class="score-field">'
      + '<label class="score-label">' + ex.name + '</label>'
      + '<div class="score-input-wrap">'
      + '<input class="score-input" type="text" id="' + fieldId + '" placeholder="—" />'
      + '<span class="score-unit">' + unit + '</span>'
      + '</div></div>';
  }).join('');
}

function cwRepLabelForDisplay(ex, segKey) {
  if (segKey === 'mobility') return 'seconds';
  if (ex.isRest || (ex.type||'').toLowerCase() === 'recovery') return 'seconds';
  if ((ex.type||'').toLowerCase() === 'machine') return 'metres';
  if ((ex.ub||'').toUpperCase() === 'U') return 'reps each side';
  return 'reps';
}
