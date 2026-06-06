/* ============================================================
   BASELINE - workouts_custom_patch.js
   Patch to add to the END of workouts.js.
   Handles rendering of custom (user-created) workouts.
   ============================================================ */

// Override renderWorkoutResults to handle custom workouts
var _origRenderWorkoutResults = typeof renderWorkoutResults === 'function' ? renderWorkoutResults : null;

function renderWorkoutResults(workoutData) {
  if (workoutData && workoutData.custom) {
    return renderCustomWorkoutResults(workoutData);
  }
  if (_origRenderWorkoutResults) return _origRenderWorkoutResults(workoutData);
  return '';
}

function renderCustomWorkoutResults(data) {
  var html = '<div class="results custom-results">';
  var segs = data.segments || {};

  // Prep
  if (segs.prep && segs.prep.exercises && segs.prep.exercises.length) {
    html += renderCustomSegment(segs.prep, 'Prep', 'ta', 'prep');
    html += '<div class="divider"></div>';
  }

  // Main
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

  // Mobility
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
  return '<div class="exercise-card t' + (num <= 2 ? num : '3') + '">'
    + '<div class="card-label t' + (num <= 2 ? num : '3') + '">Exercise ' + num + '</div>'
    + '<div class="card-exercise">' + ex.name + '</div>'
    + '<div class="card-reps-row"><span class="card-reps">' + repsVal + '</span>'
    + '<span class="card-col" style="margin-left:8px;font-size:12px;">' + unit + '</span></div>'
    + '</div>';
}

function renderCustomAccCard(ex, num, cssClass, segKey) {
  var repsVal = ex.reps || '—';
  var unit = cwRepLabelForDisplay(ex, segKey);
  return '<div class="acc-card ' + cssClass + '">'
    + '<div class="card-label ' + cssClass + '">' + (segKey === 'prep' ? 'Prep' : 'Mobility') + ' ' + num + '</div>'
    + '<div class="acc-name">' + ex.name + '</div>'
    + '<div class="card-reps-row"><span class="acc-reps">' + repsVal + '</span>'
    + '<span class="card-col" style="margin-left:8px;font-size:12px;">' + unit + '</span></div>'
    + '</div>';
}

function cwRepLabelForDisplay(ex, segKey) {
  if (segKey === 'mobility') return 'seconds';
  if (ex.isRest || (ex.type||'').toLowerCase() === 'recovery') return 'seconds';
  if ((ex.type||'').toLowerCase() === 'machine') return 'metres';
  if ((ex.ub||'').toUpperCase() === 'U') return 'reps each side';
  return 'reps';
}
