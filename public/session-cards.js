/* ============================================================
   BASELINE - session-cards.js
   "Previous session" cards on the Generator home screen — loading,
   rendering, repeat-workout confirmation, and score summaries.
   Depends on: app.js, generator.js (uses _pillsReady, ICON_REPLAY)
   ============================================================ */

// ── Last Workout Card ─────────────────────────────────────

function timeAgo(dateStr) {
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = Math.floor((now - then) / 1000);
  if (diff < 60)          return 'just now';
  if (diff < 3600)        return Math.floor(diff/60) + ' min ago';
  if (diff < 86400)       return Math.floor(diff/3600) + ' hr ago';
  if (diff < 172800)      return 'yesterday';
  if (diff < 604800)      return Math.floor(diff/86400) + ' days ago';
  if (diff < 1209600)     return 'last week';
  if (diff < 2592000)     return Math.floor(diff/604800) + ' weeks ago';
  return Math.floor(diff/2592000) + ' months ago';
}

// Metric labels for score display — mirrors scores.js SCORE_FIELD_BY_TYPE
var SCORE_METRIC_MAP = {
  'barbell':       'kg',
  'kettlebell':    'kg',
  'dumbbell':      'kg',
  'landmine':      'kg',
  'medicine ball': 'kg',
  'plyometric':    'in',
  'machine':       'pace (mm:ss)',
  'workout':       '',
  'difficulty':    'RPE'
};

function getScoreMetric(key, workoutData) {
  if (key === 'workout') return '';
  if (key === 'difficulty') return 'RPE';
  if (!workoutData) return '';

  // Look up the exercise type from workout_data to get the right metric
  var r = workoutData;
  var typeStr = '';

  if (key === 'ex1' && r.t1) typeStr = r.t1.type || '';
  else if (key === 'ex2' && r.t2) typeStr = r.t2.type || '';
  else if (key === 'ex3' && r.t3) typeStr = r.t3.type || '';
  else if (key.indexOf('ex') === 0 && r.segments) {
    // Custom workout
    var idx = parseInt(key.replace('ex',''), 10) - 1;
    var exs = r.segments.main && r.segments.main.exercises;
    if (exs && exs[idx]) typeStr = exs[idx].type || '';
  }
  // TA/TZ not loggable — skip
  if (key.indexOf('ta') === 0 || key.indexOf('tz') === 0) return '';

  var types = typeStr.split(',').map(function(t){ return t.trim().toLowerCase(); });
  for (var i = 0; i < types.length; i++) {
    if (SCORE_METRIC_MAP[types[i]] !== undefined) return SCORE_METRIC_MAP[types[i]];
  }
  return '';
}

function getLastScoreSummary(w) {
  if (!w.scores || !w.scores.length) return null;
  var latest = w.scores[w.scores.length - 1];
  if (!latest) return null;
  var data = latest.scores_data;
  if (!data || typeof data !== 'object') return null;

  var workoutData = w.workout_data || {};

  // Get all non-empty score fields with correct metric labels
  var lines = Object.keys(data)
    .filter(function(k) { return data[k] !== null && data[k] !== '' && data[k] !== undefined; })
    .map(function(k) {
      var val = String(data[k]);
      var metric = getScoreMetric(k, workoutData);
      return metric ? val + ' ' + metric : val;
    });

  if (!lines.length) return null;
  return lines.join(' &nbsp;·&nbsp; ');
}

async function loadLastWorkout() {
  try {
    var ws = await dbGetWorkouts();
    if (ws && ws.length) {
      // Sort: workouts with scores by most recent completed_at, workouts without scores by generated_at
      ws.sort(function(a, b) {
        var aTime = (a.scores && a.scores.length && a.scores[a.scores.length-1].completed_at)
          ? new Date(a.scores[a.scores.length-1].completed_at).getTime()
          : new Date(a.generated_at).getTime();
        var bTime = (b.scores && b.scores.length && b.scores[b.scores.length-1].completed_at)
          ? new Date(b.scores[b.scores.length-1].completed_at).getTime()
          : new Date(b.generated_at).getTime();
        return bTime - aTime;
      });
      State.lastWorkout  = ws[0] || null;
      State.lastWorkout2 = ws[1] || null;
      State.lastWorkout3 = ws[2] || null;
    } else {
      State.lastWorkout = State.lastWorkout2 = State.lastWorkout3 = null;
    }
  } catch(e) {
    console.error('loadLastWorkout error:', e);
    State.lastWorkout = State.lastWorkout2 = State.lastWorkout3 = null;
  }
  // Always re-render after data loads — don't check display state
  // (checkAndRender in pills sequence may still be waiting on this data)
  renderLastWorkoutCard();
  renderPrevWorkoutCard('lastWorkoutCard2', State.lastWorkout2, false);
  renderPrevWorkoutCard('lastWorkoutCard3', State.lastWorkout3, false);
}

function renderLastWorkoutCard() {
  if (!_pillsReady) return; // don't render before pills have appeared
  var el = document.getElementById('lastWorkoutCard');
  if (!el) return;
  var w = State.lastWorkout;
  if (!w) { el.style.display = 'none'; return; }

  var prompt = w.prompt || '';
  var time   = w.time_selection || '';
  var score  = getLastScoreSummary(w);
  var isCollapsed = el.getAttribute('data-collapsed') === 'true';

  var dateStr = '';
  if (w.scores && w.scores.length && w.scores[w.scores.length-1] && w.scores[w.scores.length-1].completed_at) {
    dateStr = new Date(w.scores[w.scores.length-1].completed_at)
      .toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  el.innerHTML =
    '<div class="lw-header" onclick="toggleLastWorkoutPanel()" style="cursor:pointer;">'
    + '<span class="lw-label">Previous session'
    + (dateStr ? ' <span class="lw-header-date">' + dateStr + '</span>' : '')
    + '</span>'
    + '</div>'
    + '<div class="lw-body" style="display:' + (isCollapsed ? 'none' : 'block') + ';cursor:pointer;" onclick="openLastWorkoutModal()">'
    + '<div class="lw-title">' + w.title + '</div>'
    + '<div class="lw-meta">'
    + (prompt ? prompt : '')
    + (time   ? (prompt ? ' &nbsp;&middot;&nbsp; ' : '') + time   : '')
    + (score  ? ((prompt||time) ? '<br><span class="lw-score">' : '<span class="lw-score">') + score + '</span>' : '')
    + '</div>'
    + '<div class="lw-replay-row">'
    + '<button class="icon-btn lw-repeat-btn" onclick="event.stopPropagation();confirmRepeatWorkout()" title="Repeat workout">' + ICON_REPLAY + '</button>'
    + '</div>'
    + '</div>';

  var alreadyVisible = el.style.display === 'block';
  el.style.display = 'block';
  if (!alreadyVisible) {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { el.style.opacity = '1'; });
    });
  } else {
    el.style.opacity = '1';
  }
}

function toggleLastWorkoutPanel() {
  var el = document.getElementById('lastWorkoutCard');
  if (!el) return;
  var isCollapsed = el.getAttribute('data-collapsed') === 'true';
  el.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
  var body = el.querySelector('.lw-body');
  if (body) body.style.display = isCollapsed ? 'block' : 'none';
}

function renderPrevWorkoutCard(cardId, w, openByDefault) {
  if (!_pillsReady) return;
  var el = document.getElementById(cardId);
  if (!el) return;
  if (!w) { el.style.display = 'none'; el.style.opacity = '0'; return; }

  var prompt = w.prompt || '';
  var time   = w.time_selection || '';
  var score  = getLastScoreSummary(w);
  var isCollapsed = openByDefault === false; // second/third cards collapsed by default

  el.removeAttribute('onclick');
  el.style.cursor = 'default';
  el.setAttribute('data-collapsed', isCollapsed ? 'true' : 'false');

  var dateStr = '';
  if (w.scores && w.scores.length && w.scores[w.scores.length-1].completed_at) {
    dateStr = new Date(w.scores[w.scores.length-1].completed_at)
      .toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  el.innerHTML =
    '<div class="lw-header" style="cursor:pointer;" data-card="' + cardId + '">'
    + '<span class="lw-label">Previous session'
    + (dateStr ? ' <span class="lw-header-date">' + dateStr + '</span>' : '')
    + '</span>'
     + '</div>'
     + '<div class="lw-body"' + ' style="display:' + (isCollapsed ? 'none' : 'block') + ';cursor:pointer;" data-wid="' + w.id + '">'
    + '<div class="lw-title">' + w.title + '</div>'
    + '<div class="lw-meta">'
    + (prompt ? prompt : '')
    + (time   ? (prompt ? ' &nbsp;·&nbsp; ' : '') + time   : '')
    + (score  ? ((prompt||time) ? '<br><span class="lw-score">' : '<span class="lw-score">') + score + '</span>' : '')
    + '</div>'
    + '<div class="lw-replay-row"><button class="icon-btn lw-repeat-btn" data-replay="1" title="Repeat workout">' + ICON_REPLAY + '</button></div>'
    + '</div>';

  // Wire up click handlers via data attributes (avoids quote escaping issues)
  var header = el.querySelector('.lw-header');
  if (header) header.addEventListener('click', function() { togglePrevWorkoutPanel(cardId); });
  var repeatBtn = el.querySelector('[data-replay]');
  if (repeatBtn) repeatBtn.addEventListener('click', function(e) { e.stopPropagation(); confirmRepeatWorkoutById(w.id); });
  var body = el.querySelector('.lw-body');
  if (body) body.addEventListener('click', function() { openWorkoutModalById(w.id); });

  el.style.display = 'block';
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.4s ease';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.style.opacity = '1'; });
  });
}

function togglePrevWorkoutPanel(cardId) {
  var el = document.getElementById(cardId);
  if (!el) return;
  var isCollapsed = el.getAttribute('data-collapsed') === 'true';
  el.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
  var body = el.querySelector('.lw-body');
  if (body) body.style.display = isCollapsed ? 'block' : 'none';
}

function openWorkoutModalById(id) {
  var tab = document.querySelector('.nav-tab[onclick*="myWorkouts"]');
  showPage('myWorkouts', tab);
  setTimeout(function() { openWorkoutModal(id); }, 300);
}

function confirmRepeatWorkoutById(id) {
  State._repeatTargetId = id;
  var el = document.getElementById('lastWorkoutCard') || document.body;
  var existing = document.getElementById('repeatConfirmPopup');
  if (existing) return;
  var popup = document.createElement('div');
  popup.id = 'repeatConfirmPopup';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(30,44,53,0.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:9999;';
  popup.innerHTML =
    '<div style="font-family:var(--mono);font-size:13px;color:var(--text);letter-spacing:0.04em;">Repeat workout?</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="cancelRepeatWorkout()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--border);border-radius:20px;background:none;color:var(--muted);cursor:pointer;">Cancel</button>'
    + '<button onclick="doRepeatWorkoutById()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--text);border-radius:20px;background:none;color:var(--text);cursor:pointer;">Repeat</button>'
    + '</div>';
  document.body.appendChild(popup);
}

async function doRepeatWorkoutById() {
  cancelRepeatWorkout();
  var id = State._repeatTargetId;
  if (!id) return;
  var tab = document.querySelector('.nav-tab[onclick*="myWorkouts"]');
  showPage('myWorkouts', tab);
  setTimeout(function() { openWorkoutModal(id); }, 300);
}

function openLastWorkoutModal() {
  var w = State.lastWorkout;
  if (!w) return;
  var tab = document.querySelector('.nav-tab[onclick*="myWorkouts"]');
  showPage('myWorkouts', tab);
  setTimeout(function() { openWorkoutModal(w.id); }, 300);
}

function confirmRepeatWorkout() {
  var w = State.lastWorkout;
  if (!w) return;
  var el = document.getElementById('lastWorkoutCard');
  if (!el) return;

  // Are You Sure popup anchored to the card
  var existing = document.getElementById('repeatConfirmPopup');
  if (existing) return;

  var popup = document.createElement('div');
  popup.id = 'repeatConfirmPopup';
  popup.style.cssText = 'position:absolute;inset:0;background:rgba(30,44,53,0.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border-radius:inherit;z-index:10;';
  popup.innerHTML =
    '<div style="font-family:var(--mono);font-size:13px;color:var(--text);letter-spacing:0.04em;">Repeat workout?</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="cancelRepeatWorkout()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--border);border-radius:20px;background:none;color:var(--muted);cursor:pointer;">Cancel</button>'
    + '<button onclick="doRepeatWorkout()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--text);border-radius:20px;background:none;color:var(--text);cursor:pointer;">Repeat</button>'
    + '</div>';

  el.style.position = 'relative';
  el.appendChild(popup);
}

function cancelRepeatWorkout() {
  var p = document.getElementById('repeatConfirmPopup');
  if (p) p.remove();
}

async function doRepeatWorkout() {
  cancelRepeatWorkout();
  var w = State.lastWorkout;
  if (!w) return;
  // Switch to workouts tab and open the workout modal
  var tab = document.querySelector('.nav-tab[onclick*="myWorkouts"]');
  showPage('myWorkouts', tab);
  setTimeout(function() {
    openWorkoutModal(w.id);
  }, 300);
}
