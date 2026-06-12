/* ============================================================
   BASELINE - library.js
   Exercise library with collapsible filter panels.
   AND logic across categories, OR logic within.
   Default: no exercises shown. Filter or View All to browse.
   Depends on: app.js, create-workout.js
   ============================================================ */

var LibraryState = {
  exercises: [],
  viewAll: false,
  activeFilters: { tennis: [], training: [], equipment: [], focus: [] }
};

function buildLibrary() {
  if (!State.sheetData) return;
  var d = State.sheetData;
  var exercises = [];

  function addExercises(rows, typeData, modeData, ulcData, source, cssClass) {
    (rows || []).forEach(function(name) {
      var type = (typeData || {})[name] || '';
      if (type.toLowerCase() === 'recovery') return;
      exercises.push({
        name:   name,
        type:   (type || '').toLowerCase().trim(),
        mode:   ((modeData || {})[name] || '').toLowerCase().trim(),
        ulc:    ((ulcData  || {})[name] || '').toLowerCase().trim(),
        css:    cssClass
      });
    });
  }

  addExercises(d.t1Rows, d.t1TypeData, d.t1ModeData, d.t1ULCData, 'Table 1', 'lc-t1');
  addExercises(d.t2Rows, d.t2TypeData, d.t2ModeData, d.t2ULCData, 'Table 2', 'lc-t2');
  addExercises(d.t3Rows, d.t3TypeData, d.t3ModeData, d.t3ULCData, 'Table 3', 'lc-t3');
  addExercises(d.taRows, d.taTypeData, d.taModeData, d.taULCData, 'Prep',     'lc-ta');
  addExercises(d.tzRows, d.tzTypeData, d.tzModeData, d.tzULCData, 'Mobility', 'lc-tz');

  LibraryState.exercises = exercises;
}

function getLibraryMeta() {
  var d = State.sheetData;
  var modes = [], types = [], ulcs = [], prompts = [];

  LibraryState.exercises.forEach(function(ex) {
    splitVals(ex.mode).forEach(function(v){ if(modes.indexOf(v)===-1) modes.push(v); });
    splitVals(ex.type).forEach(function(v){ if(types.indexOf(v)===-1) types.push(v); });
    splitVals(ex.ulc).forEach(function(v){  if(ulcs.indexOf(v)===-1)  ulcs.push(v);  });
  });

  (d.prompts || []).forEach(function(p) {
    if (p && p.trim() && !p.toLowerCase().startsWith('prompt') && !p.startsWith('Each')) {
      prompts.push(p.trim());
    }
  });

  modes.sort(); types.sort(); ulcs.sort();
  return { modes: modes, types: types, ulcs: ulcs, prompts: prompts };
}

function splitVals(str) {
  return (str || '').split(',').map(function(v){ return v.trim(); }).filter(Boolean);
}

function exerciseMatchesPrompt(ex, promptName) {
  var d = State.sheetData;
  var rule = (d.promptRules || {})[promptName];
  if (!rule) return false;

  function listMatch(value, ruleStr) {
    if (!ruleStr || !ruleStr.trim()) return true;
    var allowed = ruleStr.split(',').map(function(s){ return s.trim().toLowerCase(); });
    return splitVals(value).some(function(v){ return allowed.indexOf(v) !== -1; });
  }

  var t1Match = listMatch(ex.type, rule.t1Types) && listMatch(ex.mode, rule.t1Modes) && listMatch(ex.ulc, rule.t1ULC);
  var t2Match = listMatch(ex.type, rule.t2Types) && listMatch(ex.mode, rule.t2Modes) && listMatch(ex.ulc, rule.t2ULC);
  return t1Match || t2Match;
}

function renderLibrary() {
  buildLibrary();
  var meta = getLibraryMeta();
  var af = LibraryState.activeFilters;
  var noFilters = !af.tennis.length && !af.training.length && !af.equipment.length && !af.focus.length;

  var visible = [];
  if (LibraryState.viewAll && noFilters) {
    visible = LibraryState.exercises.slice();
  } else if (!noFilters) {
    visible = LibraryState.exercises.filter(function(ex) {
      if (af.tennis.length > 0) {
        if (!af.tennis.some(function(p){ return exerciseMatchesPrompt(ex, p); })) return false;
      }
      if (af.training.length > 0) {
        if (!af.training.some(function(t){ return splitVals(ex.mode).indexOf(t) !== -1; })) return false;
      }
      if (af.equipment.length > 0) {
        if (!af.equipment.some(function(t){ return splitVals(ex.type).indexOf(t) !== -1; })) return false;
      }
      if (af.focus.length > 0) {
        if (!af.focus.some(function(t){ return splitVals(ex.ulc).indexOf(t) !== -1; })) return false;
      }
      return true;
    });
  }

  var container = document.getElementById('libraryContainer');
  if (!container) return;

  // Filter panels
  var filterHtml = renderFilterPanels(meta);

  // Create Workout section
  var cwHtml = (typeof renderCreateWorkout === 'function') ? renderCreateWorkout() : '';

  // Exercise grid — use CW grid renderer if segment is active, otherwise standard
  var gridHtml;
  if (typeof renderCWExerciseGrid === 'function' && CWState.activeSegment) {
    gridHtml = renderCWExerciseGrid(visible, noFilters);
  } else {
    gridHtml = renderExerciseGrid(visible, noFilters);
  }

  // Hide container until loader fades out
  container.style.visibility = 'hidden';
  container.innerHTML = filterHtml + cwHtml + gridHtml;
  var loader = document.getElementById('libLoader');
  if (loader && loader.style.display !== 'none') {
    loader.style.transition = 'opacity 0.5s ease';
    loader.style.opacity = '0';
    setTimeout(function(){
      loader.style.display = 'none';
      container.style.visibility = 'visible';
    }, 500);
  } else {
    container.style.visibility = 'visible';
  }
}

function renderFilterPanels(meta) {
  var panels = [
    { key:'tennis',    label:'Tennis',    items: meta.prompts },
    { key:'training',  label:'Training',  items: meta.modes   },
    { key:'equipment', label:'Equipment', items: meta.types   },
    { key:'focus',     label:'Focus',     items: meta.ulcs    },
  ];

  var html = '<div class="lib-filters">';
  panels.forEach(function(panel) {
    var af = LibraryState.activeFilters[panel.key];
    var activeCount = af.length;
    var bodyId = 'libpanel-body-' + panel.key;
    var isOpen = false;
    var existingBody = document.getElementById(bodyId);
    if (existingBody) isOpen = existingBody.classList.contains('lib-panel-open');

    var tags = panel.items.map(function(item) {
      var isActive = af.indexOf(item) !== -1;
      return '<button class="lib-tag' + (isActive ? ' lib-tag-active' : '') + '" '
        + 'onclick="toggleLibFilter(\'' + panel.key + '\',\'' + item + '\')">'
        + item + '</button>';
    }).join('');

    html += '<div class="lib-panel">'
      + '<button class="lib-panel-header" onclick="toggleLibPanel(\'' + bodyId + '\')">'
      + '<span class="lib-panel-label">' + panel.label + '</span>'
      + (activeCount ? '<span class="lib-panel-count">' + activeCount + '</span>' : '')
      + '<span class="lib-panel-chevron" id="chev-' + panel.key + '">' + (isOpen ? '&#x25B4;' : '&#x25BE;') + '</span>'
      + '</button>'
      + '<div class="lib-panel-body' + (isOpen ? ' lib-panel-open' : '') + '" id="' + bodyId + '">'
      + '<div class="lib-tag-row">' + tags + '</div>'
      + '</div></div>';
  });

  html += (hasActiveFilters() ? '<button class="lib-clear-btn" onclick="clearLibFilters()">Clear filters</button>' : '');
  html += '</div>';
  return html;
}

function renderExerciseGrid(exercises, noFilters) {
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
        var hasMedia = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[ex.name];
        var nameHtml = hasMedia
          ? '<div class="library-card-name card-exercise-link" data-exname="' + ex.name + '" onclick="openExerciseModal(this)"><span class="ex-link-dot">&#9654;</span> ' + ex.name + '</div>'
          : '<div class="library-card-name">' + ex.name + '</div>';
        return '<div class="library-card ' + ex.css + '">'
          + nameHtml
          + '<div class="library-tags">'
          + tags.map(function(t){ return '<span class="library-tag">' + t + '</span>'; }).join('')
          + '</div></div>';
      }).join('')
    + '</div>';
}

function toggleLibPanel(bodyId) {
  var body = document.getElementById(bodyId);
  if (!body) return;
  body.classList.toggle('lib-panel-open');
  var key = bodyId.replace('libpanel-body-', '');
  var chev = document.getElementById('chev-' + key);
  if (chev) chev.innerHTML = body.classList.contains('lib-panel-open') ? '&#x25B4;' : '&#x25BE;';
}

function toggleLibFilter(key, value) {
  var af = LibraryState.activeFilters[key];
  var idx = af.indexOf(value);
  // Radio behavior: only one selection per panel
  if (idx === -1) {
    LibraryState.activeFilters[key] = [value]; // replace, don't add
  } else {
    LibraryState.activeFilters[key] = []; // deselect if clicking active
  }
  LibraryState.viewAll = false;
  renderLibrary();
  var bodyId = 'libpanel-body-' + key;
  var body = document.getElementById(bodyId);
  if (body && !body.classList.contains('lib-panel-open')) {
    body.classList.add('lib-panel-open');
    var chev = document.getElementById('chev-' + key);
    if (chev) chev.innerHTML = '&#x25B4;';
  }
}

function viewAllLibrary() {
  LibraryState.viewAll = true;
  renderLibrary();
}

function clearLibFilters() {
  LibraryState.activeFilters = { tennis: [], training: [], equipment: [], focus: [] };
  LibraryState.viewAll = false;
  renderLibrary();
}

function hasActiveFilters() {
  var af = LibraryState.activeFilters;
  return af.tennis.length || af.training.length || af.equipment.length || af.focus.length;
}
