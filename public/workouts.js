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
    return '<div class="workout-card" onclick="openWorkoutModal(\''+w.id+'\')"><div class="wc-date">'+date+'</div>'
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
  document.getElementById('modalResults').innerHTML = buildResults(w.workout_data);
  document.getElementById('scoreInputs').innerHTML  = buildScoreInputsHTML(w.workout_data);
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
