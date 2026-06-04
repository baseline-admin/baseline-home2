/* ============================================================
   BASELINE - library.js
   Exercise library with collapsible filter panels.
   AND logic across categories, OR logic within.
   Depends on: app.js
   ============================================================ */

var LibraryState = {
  exercises: [],
  activeFilters: { tennis: [], training: [], equipment: [], focus: [] }
};

// ── Build exercise list from sheetData ────────────────────

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
        source: source,
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

// ── Get all unique values for each filter category ────────

function getLibraryMeta() {
  var d = State.sheetData;
  var modes = [], types = [], ulcs = [], prompts = [];

  LibraryState.exercises.forEach(function(ex) {
    if (ex.mode && modes.indexOf(ex.mode) === -1) modes.push(ex.mode);
    if (ex.type && types.indexOf(ex.type) === -1) types.push(ex.type);
    if (ex.ulc  && ulcs.indexOf(ex.ulc)   === -1) ulcs.push(ex.ulc);
  });

  // Prompts from sheetData
  (d.prompts || []).forEach(function(p) {
    if (p && p.trim() && !p.toLowerCase().startsWith('prompt') && !p.startsWith('Each')) {
      prompts.push(p.trim());
    }
  });

  modes.sort(); types.sort(); ulcs.sort();
  return { modes: modes, types: types, ulcs: ulcs, prompts: prompts };
}

// ── Check if exercise matches a prompt ────────────────────

function exerciseMatchesPrompt(ex, promptName) {
  var d = State.sheetData;
  var rule = (d.promptRules || {})[promptName];
  if (!rule) return false;

  function listMatch(value, ruleStr) {
    if (!ruleStr || !ruleStr.trim()) return true; // blank = all allowed
    var allowed = ruleStr.split(',').map(function(s){ return s.trim().toLowerCase(); });
    var vals = (value||'').split(',').map(function(s){ return s.trim().toLowerCase(); });
    return vals.some(function(v){ return allowed.indexOf(v) !== -1; });
  }

  // Check T1 match
  var t1Match = listMatch(ex.type, rule.t1Types)
             && listMatch(ex.mode, rule.t1Modes)
             && listMatch(ex.ulc,  rule.t1ULC);
  // Check T2 match
  var t2Match = listMatch(ex.type, rule.t2Types)
             && listMatch(ex.mode, rule.t2Modes)
             && listMatch(ex.ulc,  rule.t2ULC);

  return t1Match || t2Match;
}

// ── Render ────────────────────────────────────────────────

function renderLibrary() {
  buildLibrary();
  var meta = getLibraryMeta();
  var af = LibraryState.activeFilters;

  // Filter exercises
  var visible = LibraryState.exercises.filter(function(ex) {
    // Tennis (OR within): must match at least one selected prompt (or none selected)
    if (af.tennis.length > 0) {
      var matchesAnyPrompt = af.tennis.some(function(p){ return exerciseMatchesPrompt(ex, p); });
      if (!matchesAnyPrompt) return false;
    }
    // Training (OR within)
    if (af.training.length > 0 && af.training.indexOf(ex.mode) === -1) return false;
    // Equipment (OR within)
    if (af.equipment.length > 0 && af.equipment.indexOf(ex.type) === -1) return false;
    // Focus (OR within)
    if (af.focus.length > 0 && af.focus.indexOf(ex.ulc) === -1) return false;
    return true;
  });

  var container = document.getElementById('libraryContainer');
  if (!container) return;

  container.innerHTML = renderFilterPanels(meta) + renderExerciseGrid(visible);
}

function renderFilterPanels(meta) {
  var panels = [
    { key:'tennis',    label:'Tennis',    items: meta.prompts,  note:'Show exercises used in each workout type' },
    { key:'training',  label:'Training',  items: meta.modes,    note:'' },
    { key:'equipment', label:'Equipment', items: meta.types,    note:'' },
    { key:'focus',     label:'Focus',     items: meta.ulcs,     note:'' },
  ];

  return '<div class="lib-filters">'
    + panels.map(function(panel) {
        var af = LibraryState.activeFilters[panel.key];
        var activeCount = af.length;
        var isOpen = document.getElementById('libpanel-'+panel.key)
          ? document.getElementById('libpanel-'+panel.key).classList.contains('lib-panel-open')
          : false;

        var tags = panel.items.map(function(item) {
          var isActive = af.indexOf(item) !== -1;
          return '<button class="lib-tag'+(isActive?' lib-tag-active':'')+'" '
            + 'onclick="toggleLibFilter(\''+panel.key+'\',\''+item+'\')">'
            + item + '</button>';
        }).join('');

        return '<div class="lib-panel" id="libpanel-'+panel.key+'">'
          + '<button class="lib-panel-header" onclick="toggleLibPanel(\''+panel.key+'\')">'
          + '<span class="lib-panel-label">'+panel.label+'</span>'
          + (activeCount ? '<span class="lib-panel-count">'+activeCount+'</span>' : '')
          + '<span class="lib-panel-chevron">'+(isOpen?'&#x25B4;':'&#x25BE;')+'</span>'
          + '</button>'
          + '<div class="lib-panel-body'+(isOpen?' lib-panel-open':'')+'">'
          + (panel.note ? '<div class="lib-panel-note">'+panel.note+'</div>' : '')
          + '<div class="lib-tag-row">'+tags+'</div>'
          + '</div></div>';
      }).join('')
    + (hasActiveFilters() ? '<button class="lib-clear-btn" onclick="clearLibFilters()">Clear all filters</button>' : '')
    + '</div>';
}

function renderExerciseGrid(exercises) {
  if (!exercises.length) {
    return '<div class="empty-state">No exercises match the selected filters.</div>';
  }
  return '<div class="library-grid">'
    + exercises.map(function(ex) {
        var tags = [ex.type, ex.mode, ex.ulc].filter(function(t){ return t && t.trim(); });
        return '<div class="library-card '+ex.css+'">'
          + '<div class="library-card-source">'+ex.source+'</div>'
          + '<div class="library-card-name">'+ex.name+'</div>'
          + '<div class="library-tags">'
          + tags.map(function(t){ return '<span class="library-tag">'+t+'</span>'; }).join('')
          + '</div></div>';
      }).join('')
    + '</div>';
}

// ── Filter interactions ───────────────────────────────────

function toggleLibPanel(key) {
  var body = document.querySelector('#libpanel-'+key+' .lib-panel-body');
  if (!body) return;
  body.classList.toggle('lib-panel-open');
  var chev = document.querySelector('#libpanel-'+key+' .lib-panel-chevron');
  if (chev) chev.innerHTML = body.classList.contains('lib-panel-open') ? '&#x25B4;' : '&#x25BE;';
}

function toggleLibFilter(key, value) {
  var af = LibraryState.activeFilters[key];
  var idx = af.indexOf(value);
  if (idx === -1) af.push(value); else af.splice(idx, 1);
  renderLibrary();
  // Re-open the panel that was just interacted with
  var body = document.querySelector('#libpanel-'+key+' .lib-panel-body');
  if (body && !body.classList.contains('lib-panel-open')) {
    body.classList.add('lib-panel-open');
    var chev = document.querySelector('#libpanel-'+key+' .lib-panel-chevron');
    if (chev) chev.innerHTML = '&#x25B4;';
  }
}

function clearLibFilters() {
  LibraryState.activeFilters = { tennis: [], training: [], equipment: [], focus: [] };
  renderLibrary();
}

function hasActiveFilters() {
  var af = LibraryState.activeFilters;
  return af.tennis.length || af.training.length || af.equipment.length || af.focus.length;
}

// renderLibrary() is called from showPage() in app.js

  function listMatch(value, ruleStr) {
    if (!ruleStr || !ruleStr.trim()) return true; // blank = all allowed
    var allowed = ruleStr.split(',').map(function(s){ return s.trim().toLowerCase(); });
    var vals = (value||'').split(',').map(function(s){ return s.trim().toLowerCase(); });
    return vals.some(function(v){ return allowed.indexOf(v) !== -1; });
  }

  // Check T1 match
  var t1Match = listMatch(ex.type, rule.t1Types)
             && listMatch(ex.mode, rule.t1Modes)
             && listMatch(ex.ulc,  rule.t1ULC);
  // Check T2 match
  var t2Match = listMatch(ex.type, rule.t2Types)
             && listMatch(ex.mode, rule.t2Modes)
             && listMatch(ex.ulc,  rule.t2ULC);

  return t1Match || t2Match;
}

// ── Render ────────────────────────────────────────────────

function renderLibrary() {
  buildLibrary();
  var meta = getLibraryMeta();
  var af = LibraryState.activeFilters;

  // Filter exercises
  var visible = LibraryState.exercises.filter(function(ex) {
    // Tennis (OR within): must match at least one selected prompt (or none selected)
    if (af.tennis.length > 0) {
      var matchesAnyPrompt = af.tennis.some(function(p){ return exerciseMatchesPrompt(ex, p); });
      if (!matchesAnyPrompt) return false;
    }
    // Training (OR within)
    if (af.training.length > 0 && af.training.indexOf(ex.mode) === -1) return false;
    // Equipment (OR within)
    if (af.equipment.length > 0 && af.equipment.indexOf(ex.type) === -1) return false;
    // Focus (OR within)
    if (af.focus.length > 0 && af.focus.indexOf(ex.ulc) === -1) return false;
    return true;
  });

  var container = document.getElementById('libraryContainer');
  if (!container) return;

  container.innerHTML = renderFilterPanels(meta) + renderExerciseGrid(visible);
}

function renderFilterPanels(meta) {
  var panels = [
    { key:'tennis',    label:'Tennis',    items: meta.prompts,  note:'Show exercises used in each workout type' },
    { key:'training',  label:'Training',  items: meta.modes,    note:'' },
    { key:'equipment', label:'Equipment', items: meta.types,    note:'' },
    { key:'focus',     label:'Focus',     items: meta.ulcs,     note:'' },
  ];

  return '<div class="lib-filters">'
    + panels.map(function(panel) {
        var af = LibraryState.activeFilters[panel.key];
        var activeCount = af.length;
        var isOpen = document.getElementById('libpanel-'+panel.key)
          ? document.getElementById('libpanel-'+panel.key).classList.contains('lib-panel-open')
          : false;

        var tags = panel.items.map(function(item) {
          var isActive = af.indexOf(item) !== -1;
          return '<button class="lib-tag'+(isActive?' lib-tag-active':'')+'" '
            + 'onclick="toggleLibFilter(\''+panel.key+'\',\''+item+'\')">'
            + item + '</button>';
        }).join('');

        return '<div class="lib-panel" id="libpanel-'+panel.key+'">'
          + '<button class="lib-panel-header" onclick="toggleLibPanel(\''+panel.key+'\')">'
          + '<span class="lib-panel-label">'+panel.label+'</span>'
          + (activeCount ? '<span class="lib-panel-count">'+activeCount+'</span>' : '')
          + '<span class="lib-panel-chevron">'+(isOpen?'&#x25B4;':'&#x25BE;')+'</span>'
          + '</button>'
          + '<div class="lib-panel-body'+(isOpen?' lib-panel-open':'')+'">'
          + (panel.note ? '<div class="lib-panel-note">'+panel.note+'</div>' : '')
          + '<div class="lib-tag-row">'+tags+'</div>'
          + '</div></div>';
      }).join('')
    + (hasActiveFilters() ? '<button class="lib-clear-btn" onclick="clearLibFilters()">Clear all filters</button>' : '')
    + '</div>';
}

function renderExerciseGrid(exercises) {
  if (!exercises.length) {
    return '<div class="empty-state">No exercises match the selected filters.</div>';
  }
  return '<div class="library-grid">'
    + exercises.map(function(ex) {
        var tags = [ex.type, ex.mode, ex.ulc].filter(function(t){ return t && t.trim(); });
        return '<div class="library-card '+ex.css+'">'
          + '<div class="library-card-source">'+ex.source+'</div>'
          + '<div class="library-card-name">'+ex.name+'</div>'
          + '<div class="library-tags">'
          + tags.map(function(t){ return '<span class="library-tag">'+t+'</span>'; }).join('')
          + '</div></div>';
      }).join('')
    + '</div>';
}

// ── Filter interactions ───────────────────────────────────

function toggleLibPanel(key) {
  var body = document.querySelector('#libpanel-'+key+' .lib-panel-body');
  if (!body) return;
  body.classList.toggle('lib-panel-open');
  var chev = document.querySelector('#libpanel-'+key+' .lib-panel-chevron');
  if (chev) chev.innerHTML = body.classList.contains('lib-panel-open') ? '&#x25B4;' : '&#x25BE;';
}

function toggleLibFilter(key, value) {
  var af = LibraryState.activeFilters[key];
  var idx = af.indexOf(value);
  if (idx === -1) af.push(value); else af.splice(idx, 1);
  renderLibrary();
  // Re-open the panel that was just interacted with
  var body = document.querySelector('#libpanel-'+key+' .lib-panel-body');
  if (body && !body.classList.contains('lib-panel-open')) {
    body.classList.add('lib-panel-open');
    var chev = document.querySelector('#libpanel-'+key+' .lib-panel-chevron');
    if (chev) chev.innerHTML = '&#x25B4;';
  }
}

function clearLibFilters() {
  LibraryState.activeFilters = { tennis: [], training: [], equipment: [], focus: [] };
  renderLibrary();
}

function hasActiveFilters() {
  var af = LibraryState.activeFilters;
  return af.tennis.length || af.training.length || af.equipment.length || af.focus.length;
}

// ── Hook into showPage ────────────────────────────────────

function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'myWorkouts') loadWorkouts();
  if (name === 'library') renderLibrary();
}
