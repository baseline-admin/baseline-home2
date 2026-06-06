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
  if (type === 'recovery') return 'seconds';
  if ((ex.ub||'').toUpperCase() === 'U') return 'reps each side';
  return 'reps';
}

// ── Toggle panel ──────────────────────────────────────────

function toggleCreateWorkout() {
  CWState.open = !CWState.open;
  if (!CWState.open) CWState.activeSegment = null;
  renderLibrary();
}

// ── Segment activation ────────────────────────────────────

function cwActivateSegment(key) {
  CWState.activeSegment = CWState.activeSegment === key ? null : key;
  renderLibrary();
}

// ── Add exercise from library ─────────────────────────────

function cwAddExercise(name) {
  var seg = CWState.activeSegment;
  if (!seg) return;
  var d = State.sheetData || {};
  var exercises = CWState.segments[seg].exercises;

  // Already in list — toggle ticked
  var existing = exercises.filter(function(e){ return e.name === name && !e.isRest; })[0];
  if (existing) {
    existing.ticked = !existing.ticked;
    renderLibrary();
    return;
  }

  // Count ticked — max 5
  var tickedCount = exercises.filter(function(e){ return e.ticked; }).length;
  if (tickedCount >= MAX_TICKED) return;

  // Look up exercise UB and type from sheetData
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

// ── Toggle exercise ticked state in panel ─────────────────

function cwToggleExercise(segKey, idx) {
  var ex = CWState.segments[segKey].exercises[idx];
  if (!ex) return;
  var seg = CWState.segments[segKey];
  var tickedCount = seg.exercises.filter(function(e){ return e.ticked; }).length;
  if (!ex.ticked && tickedCount >= MAX_TICKED) return; // can't tick if at max
  ex.ticked = !ex.ticked;
  renderLibrary();
}

// ── Reps input ────────────────────────────────────────────

function cwSetReps(segKey, idx, val) {
  var ex = CWState.segments[segKey].exercises[idx];
  if (ex) ex.reps = val;
}

// ── Add rest to main ──────────────────────────────────────

function cwAddRest() {
  var seg = CWState.segments.main;
  var tickedCount = seg.exercises.filter(function(e){ return e.ticked; }).length;
  if (tickedCount >= MAX_TICKED) return;
  seg.exercises.push({ name:'Rest', reps:'', ub:'B', type:'recovery', ticked:true, isRest:true });
  renderLibrary();
}

// ── Workout format ────────────────────────────────────────

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

// ── Rounds ────────────────────────────────────────────────

function cwToggleRounds(segKey) {
  var seg = CWState.segments[segKey];
  seg.roundsTicked = !seg.roundsTicked;
  renderLibrary();
}

function cwSetRounds(segKey, val) {
  CWState.segments[segKey].rounds = val;
}

// ── Validate: at least 1 ticked main exercise ─────────────

function cwCanSave() {
  return CWState.segments.main.exercises.filter(function(e){ return e.ticked; }).length >= 1;
}

// ── Save workout ──────────────────────────────────────────

async function saveCustomWorkout() {
  if (!cwCanSave()) return;
  var btn = document.getElementById('cwSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  // Build clean workout data — only ticked exercises
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

  // Generate title from main exercises
  var mainNames = workoutData.segments.main.exercises.map(function(e){ return e.name; });
  var fmt = workoutData.segments.main.formatTicked ? workoutData.segments.main.format : (workoutData.segments.main.roundsTicked ? workoutData.segments.main.rounds + ' Rounds' : '');
  var title = mainNames.slice(0,2).join(' + ') + (fmt ? ' | ' + fmt : '');
  workoutData.title = title;

  try {
    await dbInsertWorkout(title, 'Custom', null, workoutData);
    // Reset state
    CWState = {
      open: false, activeSegment: null,
      segments: {
        main:     { exercises:[], format:null, formatTicked:false, rounds:'', roundsTicked:false },
        prep:     { exercises:[], rounds:'', roundsTicked:false },
        mobility: { exercises:[], rounds:'', roundsTicked:false }
      }
    };
    renderLibrary();
    // Flash confirmation
    var msg = document.getElementById('cwSaveMsg');
    if (msg) { msg.textContent = 'Saved to My Workouts'; setTimeout(function(){ if(msg) msg.textContent=''; }, 3000); }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save workout'; }
    var msg = document.getElementById('cwSaveMsg');
    if (msg) msg.textContent = 'Could not save. Try again.';
  }
}

// ── Render Create Workout button + panel ──────────────────

function renderCreateWorkout() {
  var seg = CWState.segments;
  var isOpen = CWState.open;
  var canSave = cwCanSave();

  var btnHtml = '<div class="cw-btn-row">'
    + '<button class="refine-btn'+(isOpen?' refine-btn-active':'')+'" onclick="toggleCreateWorkout()">'
    + 'Create workout</button>'
    + '<span class="save-msg" id="cwSaveMsg"></span>'
    + '</div>';

  if (!isOpen) return btnHtml;

  // Panel
  var segKeys = ['main','prep','mobility'];
  var colsHtml = segKeys.map(function(key) {
    var s = seg[key];
    var label = SEGMENT_LABELS[key];
    var isActive = CWState.activeSegment === key;
    var tickedCount = s.exercises.filter(function(e){ return e.ticked; }).length;

    var exHtml = s.exercises.map(function(ex, i) {
      var label2 = cwRepLabel(ex, key);
      return '<div class="cw-ex-item'+(ex.ticked?'':' cw-ex-crossed')+'">'
        + '<div class="cw-ex-row">'
        + '<span class="cw-ex-name" onclick="cwToggleExercise(\''+key+'\','+i+')">'
        + '<span class="refine-prev-tick">'+(ex.ticked?'&#10003;':'&#x2715;')+'</span>'
        + ' '+ex.name+'</span>'
        + (ex.ticked
          ? '<div class="cw-reps-wrap"><input class="cw-reps-input" type="number" min="1" placeholder="—" value="'+ex.reps+'" oninput="cwSetReps(\''+key+'\','+i+',this.value)" /><span class="cw-reps-label">'+label2+'</span></div>'
          : '')
        + '</div></div>';
    }).join('');

    // Main-only extras
    var extrasHtml = '';
    if (key === 'main') {
      var restDisabled = tickedCount >= MAX_TICKED ? ' disabled' : '';
      extrasHtml += '<div class="cw-extras">'
        + '<button class="cw-extra-btn"'+restDisabled+' onclick="cwAddRest()">+ Add rest</button>'
        + '<button class="cw-extra-btn'+(s.formatTicked?' cw-extra-active':'')+'" onclick="cwToggleFormat()">'
        + (s.formatTicked ? '&#10003; ' : '') + 'Workout format</button>'
        + '</div>';

      if (s.formatTicked) {
        extrasHtml += '<div class="cw-format-wrap">'
          + '<select class="cw-format-select" onchange="cwSetFormat(this.value)">'
          + '<option value="">Choose format...</option>'
          + CW_FORMATS.map(function(f){
              return '<option value="'+f+'"'+(s.format===f?' selected':'')+'>'+f+'</option>';
            }).join('')
          + '</select></div>';
      }
    }

    // Rounds
    var roundsDisabled = key==='main' && s.formatTicked ? ' cw-rounds-disabled' : '';
    var roundsHtml = '<div class="cw-rounds-row'+roundsDisabled+'">'
      + '<span class="cw-rounds-label'+(s.roundsTicked?' cw-rounds-ticked':'')+'" onclick="cwToggleRounds(\''+key+'\')">'
      + (s.roundsTicked ? '<span class="refine-prev-tick">&#10003;</span>' : '') + ' Total rounds</span>'
      + '<input class="cw-rounds-input'+(key==='main'&&s.formatTicked?' cw-input-disabled':'')+'" type="number" min="1" placeholder="—" value="'+s.rounds+'" '
      + (key==='main'&&s.formatTicked ? 'disabled ' : '')
      + 'oninput="cwSetRounds(\''+key+'\',this.value)" /></div>';

    return '<div class="refine-group cw-segment'+(isActive?' cw-segment-active':'')+'">'
      + '<div class="refine-group-label cw-seg-header" onclick="cwActivateSegment(\''+key+'\')">'
      + label
      + (tickedCount > 0 ? ' <span class="lib-panel-count">'+tickedCount+'</span>' : '')
      + (isActive ? ' <span style="opacity:0.5;font-size:10px;">&#x25B4;</span>' : ' <span style="opacity:0.5;font-size:10px;">&#x25BE;</span>')
      + '</div>'
      + (isActive || s.exercises.length > 0
          ? '<div class="cw-seg-body">' + exHtml + extrasHtml + roundsHtml + '</div>'
          : '')
      + '</div>';
  }).join('<div class="refine-divider"></div>');

  var panelHtml = '<div class="cw-panel">'
    + '<div class="refine-cols">' + colsHtml + '</div>'
    + '<div class="refine-footer">'
    + '<button class="save-btn" id="cwSaveBtn" '+(canSave?'onclick="saveCustomWorkout()"':'disabled')+'>Save workout</button>'
    + '</div></div>';

  return btnHtml + panelHtml;
}

// ── Render exercise grid with selection overlay ───────────

function renderCWExerciseGrid(exercises) {
  var activeSeg = CWState.activeSegment;
  if (!exercises.length) {
    return '<div class="empty-state" style="padding:40px 0;">No exercises match the selected filters.</div>';
  }
  return '<div class="library-grid">'
    + exercises.map(function(ex) {
        var tags = splitVals(ex.type).concat(splitVals(ex.mode)).concat(splitVals(ex.ulc))
          .filter(function(t){ return t; });

        // Check if exercise is in the active segment
        var inSeg = false, isTicked = false;
        if (activeSeg) {
          var found = CWState.segments[activeSeg].exercises.filter(function(e){ return e.name===ex.name&&!e.isRest; })[0];
          if (found) { inSeg = true; isTicked = found.ticked; }
        }

        var tickedInSeg = activeSeg ? CWState.segments[activeSeg].exercises.filter(function(e){ return e.ticked; }).length : 0;
        var atMax = tickedInSeg >= MAX_TICKED && !isTicked;

        var checkboxHtml = activeSeg
          ? '<div class="cw-card-check'+(inSeg?(isTicked?' cw-check-ticked':' cw-check-crossed'):'')+(atMax&&!inSeg?' cw-check-disabled':'')+'">'
            + (inSeg ? (isTicked?'&#10003;':'&#x2715;') : '+')
            + '</div>'
          : '';

        var clickable = activeSeg && (!atMax || inSeg);

        return '<div class="library-card '+ex.css+(activeSeg?' cw-selectable':'')+(clickable?' cw-clickable':'')+'" '
          + (clickable ? 'onclick="cwAddExercise(\''+ex.name.replace(/'/g,"\\'")+'\')"' : '')
          + '>'
          + checkboxHtml
          + '<div class="library-card-name">'+ex.name+'</div>'
          + '<div class="library-tags">'
          + tags.map(function(t){ return '<span class="library-tag">'+t+'</span>'; }).join('')
          + '</div></div>';
      }).join('')
    + '</div>';
}
