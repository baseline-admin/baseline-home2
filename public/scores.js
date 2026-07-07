/* ============================================================
   BASELINE — scores.js
   Score field definitions, save scores, score history.
   Uses Supabase JS directly via db helpers in app.js.
   Depends on: app.js
   ============================================================ */

var SCORE_FIELD_BY_TYPE = {
  barbell:'kg', kettlebell:'kg', dumbbell:'kg', landmine:'kg',
  'medicine ball':'kg',
  plyometric:'height (in)', machine:'pace (mm:ss)'
};
var NO_SCORE_TYPES = ['recovery','bodyweight','hold'];
var AM_FORMATS = ['AMRAP 16','AMRAP 18','AMRAP 20'];
var FT_FORMATS = ['For Time','3 Rounds For Time','4 Rounds For Time','6 Rounds For Time','8 Rounds For Time'];

function getExerciseScoreField(typeStr) {
  var types = (typeStr||'').split(',').map(function(t){ return t.trim().toLowerCase(); });
  for (var i=0;i<types.length;i++) { if (NO_SCORE_TYPES.indexOf(types[i])!==-1) return null; }
  for (var i=0;i<types.length;i++) { if (SCORE_FIELD_BY_TYPE[types[i]]) return SCORE_FIELD_BY_TYPE[types[i]]; }
  return null;
}

function getWorkoutScoreField(fmt) {
  if (AM_FORMATS.indexOf(fmt)!==-1) return 'total rounds';
  if (FT_FORMATS.indexOf(fmt)!==-1) return 'total time';
  return null;
}

function buildScoreKeys(r) {
  var keys = [];
  var ws = getWorkoutScoreField(r.fmt); if (ws) keys.push({ key:'workout', label:ws, unit:null });
  var s1 = getExerciseScoreField(r.t1.type); if (s1) keys.push({ key:'ex1', label:r.t1.row, unit:s1 });
  if (r.t2) { var s2=getExerciseScoreField(r.t2.type); if(s2) keys.push({key:'ex2',label:r.t2.row,unit:s2}); }
  if (r.t3) { var s3=getExerciseScoreField(r.t3.type); if(s3) keys.push({key:'ex3',label:r.t3.row,unit:s3}); }
  // TA and TZ (prep/mobility) — not loggable
  return keys;
}

function buildScoreInputsHTML(r) {
  var keys = buildScoreKeys(r);
  if (!keys.length) return '<div class="state-msg" style="padding:20px 0;font-size:12px;">No scores to log for this workout type.</div>';
  var sh = '';
  var wsField = getWorkoutScoreField(r.fmt);
  var addRow = function(key,label,placeholder){
    sh+='<div class="score-row"><span class="score-label">'+label+'</span><input class="score-input" type="text" id="sc_'+key+'" value="" placeholder="'+placeholder+'" /></div>';
  };
  if (wsField) { addRow('workout',wsField,wsField==='total rounds'?'e.g. 12':'e.g. 14:32'); sh+='<div class="score-divider"></div>'; }
  keys.forEach(function(k){ if(k.key==='workout')return; addRow(k.key,k.label,k.unit); });
  return sh;
}

async function saveScores() {
  if (!State.openWorkout) return;
  var keys = buildScoreKeys(State.openWorkout.workout_data);
  var scores = {};
  keys.forEach(function(k){ var el=document.getElementById('sc_'+k.key); if(el&&el.value.trim()) scores[k.key]=el.value.trim(); });
  if (!Object.keys(scores).length) { document.getElementById('scoresSavedMsg').textContent='Please enter at least one score.'; return; }
  try {
    await dbInsertScore(State.openWorkout.id, scores);
    document.getElementById('scoresSavedMsg').textContent = 'Scores saved!';
    loadWorkouts();
    var id = State.openWorkout.id;
    setTimeout(function(){ openWorkoutModal(id); }, 400);
  } catch(e) {
    document.getElementById('scoresSavedMsg').textContent = 'Could not save scores. Please try again.';
  }
}

function buildScoreHistoryHTML(workout) {
  var scores = workout.scores || []; if (!scores.length) return '';
  var r = workout.workout_data; var keys = buildScoreKeys(r);
  scores.sort(function(a,b){ return new Date(b.completed_at||0)-new Date(a.completed_at||0); });
  return scores.map(function(s,idx){
    var d=s.completed_at;
    var dateStr=d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Unknown date';
    var sd=s.scores_data||{};
    var rows=keys.filter(function(k){return sd[k.key];}).map(function(k){
      var u=k.unit?'<span style="font-size:11px;color:var(--muted)"> · '+k.unit+'</span>':'';
      return'<div class="score-history-row"><span class="score-history-label">'+k.label+u+'</span><span class="score-history-value">'+sd[k.key]+'</span></div>';
    }).join('');
    if(!rows)rows='<div class="score-history-empty">No scores recorded</div>';
    return'<div class="score-entry"><div class="score-entry-header" onclick="toggleScoreEntry('+idx+')">'
      +'<span class="score-entry-date">'+dateStr+'</span><span class="score-entry-chevron" id="chev'+idx+'">&#x25BE;</span></div>'
      +'<div class="score-entry-body" id="body'+idx+'">'+rows
      +'<button class="delete-score-btn" onclick="deleteScore(\''+s.id+'\')">Delete this result</button></div></div>';
  }).join('');
}

function toggleScoreEntry(idx) {
  var body=document.getElementById('body'+idx),chev=document.getElementById('chev'+idx);
  var open=body.classList.contains('open');
  body.classList.toggle('open',!open); chev.classList.toggle('open',!open);
}

async function deleteScore(scoreId) {
  if(!confirm('Delete this result?'))return;
  await dbDeleteScore(scoreId);
  loadWorkouts();
  var id=State.openWorkout.id;
  setTimeout(function(){ openWorkoutModal(id); },400);
}
