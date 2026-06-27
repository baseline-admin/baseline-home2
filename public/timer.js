// ── Workout Timer ─────────────────────────────────────────────────────────────
// Shared timer logic used by both generator tab and workouts tab.

var _timer = {
  mode:       null,   // 'ft' | 'amrap' | 'emom'
  running:    false,
  startMs:    0,      // when current interval started (Date.now())
  elapsed:    0,      // ms elapsed in current interval before last pause
  totalMs:    0,      // countdown start in ms (AMRAP/EMOM)
  interval:   0,      // EMOM interval length in ms
  rounds:     0,      // EMOM total rounds
  roundsDone: 0,      // EMOM rounds completed
  raf:        null,   // requestAnimationFrame handle
  finished:   false,
  workoutId:  null,   // set when opened from workouts tab
  ftFinalTime: null,  // stores final FT time string for auto-log
};

var EMOM_CONFIG = {
  'EMOM 10m':  { intervalMs: 60000,  rounds: 10 },
  'EMOM 12m':  { intervalMs: 60000,  rounds: 12 },
  'E2MOM 16m': { intervalMs: 120000, rounds: 8  },
  'E2MOM 20m': { intervalMs: 120000, rounds: 10 },
  'E3MOM 15m': { intervalMs: 180000, rounds: 5  },
  'E3MOM 18m': { intervalMs: 180000, rounds: 6  },
  'E4MOM 16m': { intervalMs: 240000, rounds: 4  },
  'E4MOM 20m': { intervalMs: 240000, rounds: 5  },
  'E5MOM 15m': { intervalMs: 300000, rounds: 3  },
  'E5MOM 20m': { intervalMs: 300000, rounds: 4  },
};

var AMRAP_CONFIG = {
  'AMRAP 16': 16 * 60000,
  'AMRAP 18': 18 * 60000,
  'AMRAP 20': 20 * 60000,
};

function timerFmtMs(ms) {
  if (ms < 0) ms = 0;
  var totalCs = Math.floor(ms / 10);
  var cs  = totalCs % 100;
  var sec = Math.floor(totalCs / 100) % 60;
  var min = Math.floor(totalCs / 6000);
  return pad2(min) + ':' + pad2(sec) + ':' + pad2(cs);
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function initTimer(fmt, workoutId) {
  // Reset
  _timer.running    = false;
  _timer.elapsed    = 0;
  _timer.roundsDone = 0;
  _timer.finished   = false;
  _timer.workoutId  = workoutId || null;
  _timer.ftFinalTime = null;
  if (_timer.raf) cancelAnimationFrame(_timer.raf);

  if (AMRAP_CONFIG[fmt]) {
    _timer.mode    = 'amrap';
    _timer.totalMs = AMRAP_CONFIG[fmt];
  } else if (EMOM_CONFIG[fmt]) {
    _timer.mode     = 'emom';
    _timer.interval = EMOM_CONFIG[fmt].intervalMs;
    _timer.rounds   = EMOM_CONFIG[fmt].rounds;
    _timer.totalMs  = EMOM_CONFIG[fmt].intervalMs;
  } else {
    _timer.mode    = 'ft';
    _timer.totalMs = 0;
  }

  renderTimerDisplay();
}

function renderTimerDisplay() {
  var el = document.getElementById('timerDisplay');
  if (!el) return;
  var ms;
  if (_timer.mode === 'ft') {
    ms = _timer.elapsed;
    el.textContent = timerFmtMs(ms);
  } else if (_timer.mode === 'amrap') {
    ms = Math.max(0, _timer.totalMs - _timer.elapsed);
    el.textContent = timerFmtMs(ms);
  } else if (_timer.mode === 'emom') {
    ms = Math.max(0, _timer.interval - _timer.elapsed);
    el.textContent = timerFmtMs(ms);
    var roundEl = document.getElementById('timerRound');
    if (roundEl) roundEl.textContent = 'Round ' + (_timer.roundsDone + 1) + ' / ' + _timer.rounds;
  }
}

function timerTick() {
  if (!_timer.running) return;
  var now     = Date.now();
  var elapsed = _timer.elapsed + (now - _timer.startMs);

  if (_timer.mode === 'ft') {
    _timer.elapsed = elapsed;
    renderTimerDisplay();
    _timer.raf = requestAnimationFrame(timerTick);

  } else if (_timer.mode === 'amrap') {
    var remaining = _timer.totalMs - elapsed;
    if (remaining <= 0) {
      _timer.elapsed = _timer.totalMs;
      _timer.running = false;
      _timer.finished = true;
      renderTimerDisplay();
      triggerTimeResponse(true);
      return;
    }
    _timer.elapsed = elapsed;
    renderTimerDisplay();
    _timer.raf = requestAnimationFrame(timerTick);

  } else if (_timer.mode === 'emom') {
    var intervalElapsed = elapsed;
    if (intervalElapsed >= _timer.interval) {
      // Round complete
      _timer.roundsDone++;
      _timer.elapsed = 0;
      _timer.startMs = now;
      var isLast = (_timer.roundsDone >= _timer.rounds);
      if (isLast) {
        _timer.running  = false;
        _timer.finished = true;
        renderTimerDisplay();
        triggerTimeResponse(true);
        return;
      }
      renderTimerDisplay();
      triggerTimeResponse(false);
      _timer.raf = requestAnimationFrame(timerTick);
    } else {
      _timer.elapsed = intervalElapsed;
      renderTimerDisplay();
      _timer.raf = requestAnimationFrame(timerTick);
    }
  }
}

function timerStart() {
  if (_timer.finished) return;
  var countdown = 3;
  var btn = document.getElementById('timerStartBtn');
  if (btn) { btn.disabled = true; btn.textContent = '3'; }

  var iv = setInterval(function() {
    countdown--;
    if (countdown > 0) {
      if (btn) btn.textContent = '' + countdown;
    } else {
      clearInterval(iv);
      if (btn) {
        btn.disabled = false;
        btn.textContent = _timer.mode === 'ft' ? 'FINISH' : 'PAUSE';
        btn.onclick = _timer.mode === 'ft' ? timerFinish : timerPause;
      }
      _timer.running  = true;
      _timer.startMs  = Date.now();
      _timer.raf = requestAnimationFrame(timerTick);
    }
  }, 1000);
}

function timerPause() {
  if (!_timer.running) return;
  _timer.elapsed += Date.now() - _timer.startMs;
  _timer.running  = false;
  if (_timer.raf) cancelAnimationFrame(_timer.raf);
  var btn = document.getElementById('timerStartBtn');
  if (btn) { btn.textContent = 'START'; btn.onclick = timerStart; }
}

function timerFinish() {
  // FT only
  _timer.elapsed += Date.now() - _timer.startMs;
  _timer.running  = false;
  _timer.finished = true;
  if (_timer.raf) cancelAnimationFrame(_timer.raf);
  _timer.ftFinalTime = timerFmtMs(_timer.elapsed);
  renderTimerDisplay();
  triggerTimeResponse(true);
}

function triggerTimeResponse(isFinal) {
  var panel = document.getElementById('timerPanel');
  if (!panel) return;

  // Flash TIME response
  panel.style.transition = 'background 0.15s';
  panel.style.background = '#fff';

  var flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'font-family:var(--mono);font-size:18px;letter-spacing:0.2em;color:#2C3E50;font-weight:600;pointer-events:none;';
  flash.textContent = 'TIME';
  panel.style.position = 'relative';
  panel.appendChild(flash);

  setTimeout(function() {
    panel.style.background = '';
    panel.removeChild(flash);

    if (isFinal) {
      // Show LOG WORKOUT button
      var logBtn = document.getElementById('timerLogBtn');
      if (!logBtn) {
        logBtn = document.createElement('button');
        logBtn.id = 'timerLogBtn';
        logBtn.className = 'save-btn';
        logBtn.style.marginTop = '12px';
        logBtn.textContent = 'LOG WORKOUT';
        logBtn.onclick = timerLog;
        panel.appendChild(logBtn);
      }
      // Hide start button
      var btn = document.getElementById('timerStartBtn');
      if (btn) btn.style.display = 'none';
    }
  }, 600);
}

function timerLog() {
  var isSaved = !!_timer.workoutId;
  var ftTime  = _timer.ftFinalTime;

  function fillAndScroll() {
    // Give DOM time to render score inputs before filling
    setTimeout(function() {
      var si = document.getElementById('scoreInputs');
      if (si) si.scrollIntoView({ behavior: 'smooth' });
      if (ftTime) {
        var ftInput = document.getElementById('sc_workout');
        if (ftInput) ftInput.value = ftTime;
      }
    }, 200);
  }

  if (isSaved) {
    // Already in workout modal — scroll and fill immediately
    fillAndScroll();
  } else {
    // Generator tab — save workout, switch tab, open modal, fill
    saveWorkout(function(savedId) {
      showPage('myWorkouts', document.querySelector('[onclick*="myWorkouts"]'));
      setTimeout(function() {
        openWorkoutModal(savedId);
        setTimeout(fillAndScroll, 500);
      }, 300);
    });
  }
}

function buildTimerPanelHTML(fmt, workoutId) {
  var isEMOM = !!EMOM_CONFIG[fmt];
  var roundHtml = isEMOM
    ? '<div id="timerRound" style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:4px;">Round 1 / ' + (EMOM_CONFIG[fmt] ? EMOM_CONFIG[fmt].rounds : '') + '</div>'
    : '';

  var initDisplay = '';
  if (AMRAP_CONFIG[fmt]) {
    initDisplay = timerFmtMs(AMRAP_CONFIG[fmt]);
  } else if (EMOM_CONFIG[fmt]) {
    initDisplay = timerFmtMs(EMOM_CONFIG[fmt].intervalMs);
  } else {
    initDisplay = '00:00:00';
  }

  return '<div id="timerPanel" class="timer-panel" data-fmt="' + fmt + '" data-wid="' + (workoutId||'') + '">'
    + '<div class="timer-row">'
    + '<button id="timerStartBtn" class="timer-start-btn" onclick="timerStart()">START</button>'
    + '<div class="timer-display-wrap">'
    + roundHtml
    + '<div id="timerDisplay" class="timer-display">' + initDisplay + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function toggleTimer(btn, fmt, workoutId) {
  var existing = document.getElementById('timerPanel');
  if (existing) {
    // Close — stop timer
    if (_timer.raf) cancelAnimationFrame(_timer.raf);
    _timer.running = false;
    existing.remove();
    btn.classList.remove('format-badge-active');
    return;
  }
  // Open
  btn.classList.add('format-badge-active');
  var html = buildTimerPanelHTML(fmt, workoutId);
  var insertAfter = btn.closest('.timer-btn-row') || btn.parentElement;
  var div = document.createElement('div');
  div.innerHTML = html;
  insertAfter.parentNode.insertBefore(div.firstChild, insertAfter.nextSibling);
  initTimer(fmt, workoutId);
}
