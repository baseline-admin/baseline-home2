/* ============================================================
   BASELINE - create-workout.js
   Manual workout builder on the Exercise Library page.
   Depends on: app.js, library.js
   ============================================================ */

var CWState = {
  open: false,
  activeSegment: null,
  segments: {
    main:     { exercises:[], format:null, formatTicked:false, rounds:'', roundsTicked:false },
    prep:     { exercises:[], rounds:'', roundsTicked:false },
    mobility: { exercises:[], rounds:'', roundsTicked:false }
  }
};

var SEGMENT_LABELS = { main:'Main Workout', prep:'Prep Movements', mobility:'Mobility' };
var MAX_TICKED = 5;

var CW_FORMATS = [
  'AMRAP 16','AMRAP 18','AMRAP 20',
  'For Time',
  '3 Rounds For Time','4 Rounds For Time','6 Rounds For Time','8 Rounds For Time',
  'EMOM 10m','EMOM 12m',
  'E2MOM 16m','E2MOM 20m',
  'E3MOM 15m','E3MOM 17m',
  'E4MOM 16m','E4MOM 20m',
  'E5MOM 15m','E5MOM 20m'
];

// ── Rep label ─────────────────────────────────────────────

function cwRepLabel(ex, segmentKey) {
  if (segmentKey === 'mobility') return 'seconds';
  if (ex.isRest) return 'seconds rest';
  var type = (ex.type||'').toLowerCase();
  if (type === 'machine') return 'metres';
  if (type === 'recovery' || type === 'hold') return 'seconds';
  if ((ex.ub||'').toUpperCase() === 'U') return 'reps each side';
  return 'reps';
}

// ── Toggle panel ──────────────────────────────────────────

function toggleCreateWorkout() {
  CWState.open = !CWState.open;
  if (CWState.open) {
    // Auto-activate main segment so exercises are immediately selectable
    if (!CWState.activeSegment) CWState.activeSegment = 'main';
  } else {
    CWState.activeSegment = null;
  }
  renderLibrary();
}

// ── Segment activation ────────────────────────────────────

function cwActivateSegment(key) {
  CWState.activeSegment = CWState.activeSegment === key ? null : key;
  renderLibrary();
}

// ── Add exercise from library ─────────────────────────────

function cwAddExercise(name) {
  // Auto-determine segment from active library filter
  var af = (typeof LibraryState !== 'undefined') ? LibraryState.activeFilters : {};
  var seg = af.prep && af.prep.length ? 'prep'
          : af.mobility && af.mobility.length ? 'mobility'
          : 'main';
  CWState.activeSegment = seg;
  var d = State.sheetData || {};
  var exercises = CWState.segments[seg].exercises;

  var existing = exercises.filter(function(e){ return e.name === name && !e.isRest; })[0];
  if (existing) {
    existing.ticked = !existing.ticked;
    renderLibrary();
    return;
  }

  var tickedCount = exercises.filter(function(e){ return e.ticked; }).length;
  if (tickedCount >= MAX_TICKED) return;

  var ub = '', type = '';
  var tables = [
    {rows: d.t1Rows, ub: d.t1UBData, type: d.t1TypeData},
    {rows: d.t2Rows, ub: d.t2UBData, type: d.t2TypeData},
    {rows: d.t3Rows, ub: d.t3UBData, type: d.t3TypeData},
    {rows: d.taRows, ub: d.taUBData, type: d.taTypeData},
    {rows: d.tzRows, ub: d.tzUBData, type: d.tzTypeData}
  ];
  for (var t = 0; t < tables.length; t++) {
    if ((tables[t].rows||[]).indexOf(name) !== -1) {
      ub   = (tables[t].ub  ||{})[name] || '';
      type = (tables[t].type||{})[name] || '';
      break;
    }
  }

  exercises.push({ name:name, reps:'', ub:ub, type:type, ticked:true, isRest:false });
  renderLibrary();
}

// ── Toggle exercise ticked state ──────────────────────────

function cwToggleExercise(segKey, idx) {
  var ex = CWState.segments[segKey].exercises[idx];
  if (!ex) return;
  var seg = CWState.segments[segKey];
  var tickedCount = seg.exercises.filter(function(e){ return e.ticked; }).length;
  if (!ex.ticked && tickedCount >= MAX_TICKED) return;
  ex.ticked = !ex.ticked;
  renderLibrary();
}

// ── Inputs ────────────────────────────────────────────────

function cwSetReps(segKey, idx, val) {
  var ex = CWState.segments[segKey].exercises[idx];
  if (ex) ex.reps = val;
}

function cwAddRest() {
  var seg = CWState.segments.main;
  var tickedCount = seg.exercises.filter(function(e){ return e.ticked; }).length;
  if (tickedCount >= MAX_TICKED) return;
  seg.exercises.push({ name:'Rest', reps:'', ub:'B', type:'recovery', ticked:true, isRest:true });
  renderLibrary();
}

function cwToggleFormat() {
  var seg = CWState.segments.main;
  seg.formatTicked = !seg.formatTicked;
  if (!seg.formatTicked) seg.format = null;
  renderLibrary();
}

function cwSetFormat(val) {
  CWState.segments.main.format = val;
  CWState.segments.main.formatTicked = !!val;
  renderLibrary();
}

function cwToggleRounds(segKey) {
  var seg = CWState.segments[segKey];
  seg.roundsTicked = !seg.roundsTicked;
  renderLibrary();
}

function cwSetRounds(segKey, val) {
  CWState.segments[segKey].rounds = val;
  if (val && val.trim()) CWState.segments[segKey].roundsTicked = true;
}

// ── Validate ──────────────────────────────────────────────

function cwCanSave() {
  return CWState.segments.main.exercises.filter(function(e){ return e.ticked; }).length >= 1;
}

// ── Save workout ──────────────────────────────────────────

async function saveCustomWorkout() {
  if (!cwCanSave()) return;
  var btn = document.getElementById('cwSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  var workoutData = { custom: true, segments: {} };
  ['main','prep','mobility'].forEach(function(key) {
    var seg = CWState.segments[key];
    var tickedEx = seg.exercises.filter(function(e){ return e.ticked; });
    workoutData.segments[key] = {
      exercises: tickedEx.map(function(e){ return { name:e.name, reps:e.reps, ub:e.ub, type:e.type, isRest:e.isRest||false }; }),
      rounds:       seg.rounds,
      roundsTicked: seg.roundsTicked,
      format:       key==='main' ? seg.format      : null,
      formatTicked: key==='main' ? seg.formatTicked : false
    };
  });

  var mainNames = workoutData.segments.main.exercises.map(function(e){ return e.name; });
  var fmt = workoutData.segments.main.formatTicked ? workoutData.segments.main.format : (workoutData.segments.main.roundsTicked ? workoutData.segments.main.rounds + ' Rounds' : '');
  var title = mainNames.slice(0,2).join(' + ') + (fmt ? ' | ' + fmt : '');
  workoutData.title = title;

  try {
    await dbInsertWorkout(title, 'Custom', null, workoutData);
    CWState = {
      open: false, activeSegment: null,
      segments: {
        main:     { exercises:[], format:null, formatTicked:false, rounds:'', roundsTicked:false },
        prep:     { exercises:[], rounds:'', roundsTicked:false },
        mobility: { exercises:[], rounds:'', roundsTicked:false }
      }
    };
    renderLibrary();
    var msg = document.getElementById('cwSaveMsg');
    if (msg) { msg.textContent = 'Saved to Custom Workouts'; setTimeout(function(){ if(msg) msg.textContent=''; }, 3000); }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save workout'; }
    var msg = document.getElementById('cwSaveMsg');
    if (msg) msg.textContent = 'Could not save. Try again.';
  }
}

// ── Render Create Workout button + panel (vertical layout) ─

function renderCreateWorkout() {
  var seg = CWState.segments;
  var isOpen = CWState.open;
  var canSave = cwCanSave();

  var proHtml = '<span class="pro-link" style="'+(isOpen?'':'display:none;')
    + '">Need something more personalised? Try '
    + '<span onclick="showPage(\'pro\',null)" style="text-decoration:underline;cursor:pointer;color:#1E2C35;">Baseline Pro</span></span>';

  var btnHtml = '<div class="cw-btn-row">'
    + '<button class="refine-btn'+(isOpen?' refine-btn-active':'')+'" onclick="toggleCreateWorkout()">Create workout</button>'
    + '<span class="save-msg" id="cwSaveMsg"></span>'
    + proHtml
    + '</div>';

  if (!isOpen) return btnHtml;

  var segKeys = ['main','prep','mobility'];
  var segsHtml = '';

  segKeys.forEach(function(key) {
    var s = seg[key];
    var label = SEGMENT_LABELS[key];
    var isActive = CWState.activeSegment === key;
    var hasEx = s.exercises.length > 0;
    var isExpanded = isActive || hasEx;
    var tickedCount = s.exercises.filter(function(e){ return e.ticked; }).length;

    // Exercise rows
    var exHtml = '';
    s.exercises.forEach(function(ex, i) {
      var unit = cwRepLabel(ex, key);
      var crossed = !ex.ticked;
      exHtml += '<div class="cw-score-row' + (crossed ? ' cw-score-row-crossed' : '') + '">'
        + '<span class="cw-score-name" onclick="cwToggleExercise(\'' + key + '\',' + i + ')">'
        + '<span class="cw-row-tick' + (crossed ? ' cw-row-cross' : '') + '">' + (ex.ticked ? '&#10003;' : '&#x2715;') + '</span>'
        + ex.name + '</span>'
        + (ex.ticked
          ? '<div class="cw-score-right">'
            + '<input class="cw-score-input" type="text" inputmode="numeric" placeholder="&mdash;" value="' + ex.reps + '" oninput="cwSetReps(\'' + key + '\',' + i + ',this.value)" />'
            + '<span class="cw-score-unit">' + unit + '</span>'
            + '</div>'
          : '')
        + '</div>';
    });

    // Main-only extras
    var extrasHtml = '';
    if (key === 'main') {
      var restDis = tickedCount >= MAX_TICKED ? ' disabled' : '';
      extrasHtml = '<div class="cw-extras">'
        + '<button class="cw-extra-btn"' + restDis + ' onclick="cwAddRest()">+ Add rest</button>'
        + '<button class="cw-extra-btn' + (s.formatTicked ? ' cw-extra-active' : '') + '" onclick="cwToggleFormat()">'
        + (s.formatTicked ? '&#10003; ' : '') + 'Workout format</button>'
        + '</div>';
      if (s.formatTicked) {
        var opts = CW_FORMATS.map(function(f) {
          return '<option value="' + f + '"' + (s.format === f ? ' selected' : '') + '>' + f + '</option>';
        }).join('');
        extrasHtml += '<select class="cw-format-select" onchange="cwSetFormat(this.value)">'
          + '<option value="">Choose format...</option>' + opts + '</select>';
      }
    }

    // Rounds
    var roundsDis = (key === 'main') && s.formatTicked;
    var roundsHtml = '<div class="cw-score-row cw-rounds-row' + (roundsDis ? ' cw-rounds-disabled' : '') + '">'
      + '<span class="cw-score-name cw-rounds-label' + (s.roundsTicked ? ' cw-rounds-ticked' : '') + '" onclick="cwToggleRounds(\'' + key + '\')">'
      + '<span class="cw-row-tick" style="opacity:' + (s.roundsTicked ? '1' : '0.25') + ';">&#10003;</span>'
      + 'Total rounds</span>'
      + '<div class="cw-score-right">'
      + '<input class="cw-score-input" type="text" inputmode="numeric" placeholder="&mdash;" value="' + s.rounds + '" '
      + (roundsDis ? 'disabled ' : '')
      + 'oninput="cwSetRounds(\'' + key + '\',this.value)" />'
      + '</div></div>';

    segsHtml += '<div class="cw-segment-v' + (isExpanded ? ' cw-segment-v-open' : '') + '">'
      + '<button class="cw-seg-header-v" onclick="cwActivateSegment(\'' + key + '\')">'
      + '<span class="cw-seg-v-label">' + label + '</span>'
      + (tickedCount ? '<span class="lib-panel-count">' + tickedCount + '</span>' : '')
      + '<span class="cw-seg-chevron">' + (isExpanded ? '&#x25B4;' : '&#x25BE;') + '</span>'
      + '</button>'
      + (isExpanded
        ? '<div class="cw-seg-body-v">' + exHtml + extrasHtml + roundsHtml + '</div>'
        : '')
      + '</div>';
  });

  return btnHtml
    + '<div class="cw-panel-v">'
    + segsHtml
    + '<div class="cw-panel-footer">'
    + '<button class="save-btn" id="cwSaveBtn" ' + (canSave ? 'onclick="saveCustomWorkout()"' : 'disabled') + '>Save workout</button>'
    + '</div></div>';
}

// ── Render exercise grid with selection overlay ───────────

function renderCWExerciseGrid(exercises, noFilters) {
  var activeSeg = CWState.activeSegment;

  if (noFilters && !LibraryState.viewAll) {
    return '<div class="empty-state" style="padding:40px 0;">'
      + 'Select a filter above to browse, or '
      + '<button class="lib-view-all-btn" onclick="viewAllLibrary()">view all exercises</button>'
      + '</div>';
  }
  if (!exercises.length) {
    return '<div class="empty-state">No exercises match the selected filters.</div>';
  }

  return '<div class="library-grid">'
    + exercises.map(function(ex) {
        var tags = splitVals(ex.type).concat(splitVals(ex.mode)).concat(splitVals(ex.ulc))
          .filter(function(t){ return t; });

        var inSeg = false, isTicked = false;
        var af = (typeof LibraryState !== 'undefined') ? LibraryState.activeFilters : {};
        var checkSegForTick = activeSeg || (CWState.open
          ? ((af.prep && af.prep.length) ? 'prep' : (af.mobility && af.mobility.length) ? 'mobility' : 'main')
          : null);
        if (checkSegForTick) {
          var found = CWState.segments[checkSegForTick].exercises.filter(function(e){ return e.name===ex.name&&!e.isRest; })[0];
          if (found) { inSeg = true; isTicked = found.ticked; }
        }

        // Segment is auto-determined from filter, always allow clicking when CW open
        var autoSeg = (af && af.prep && af.prep.length) ? 'prep'
                    : (af && af.mobility && af.mobility.length) ? 'mobility'
                    : 'main';
        var checkSeg = activeSeg || (CWState.open ? autoSeg : null);
        var tickedInSeg = checkSeg ? CWState.segments[checkSeg].exercises.filter(function(e){ return e.ticked; }).length : 0;
        var atMax = tickedInSeg >= MAX_TICKED && !isTicked;
        var clickable = CWState.open && (!atMax || inSeg);

        var checkHtml = activeSeg
          ? '<div class="cw-card-check'
            + (inSeg ? (isTicked ? ' cw-check-ticked' : ' cw-check-crossed') : '')
            + (atMax && !inSeg ? ' cw-check-disabled' : '') + '">'
            + (inSeg ? (isTicked ? '&#10003;' : '&#x2715;') : '+')
            + '</div>'
          : '';

        return '<div class="library-card ' + ex.css + (activeSeg ? ' cw-selectable' : '') + (clickable ? ' cw-clickable' : '') + '"'
          + (clickable ? ' onclick="cwAddExercise(\'' + ex.name.replace(/'/g, '\\\'') + '\')"' : '')
          + '>'
          + checkHtml
          + '<div class="library-card-name">' + ex.name + '</div>'
          + '<div class="library-tags">'
          + tags.map(function(t){ return '<span class="library-tag">' + t + '</span>'; }).join('')
          + '</div></div>';
      }).join('')
    + '</div>';
}
