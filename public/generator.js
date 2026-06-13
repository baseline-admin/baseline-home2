/* ============================================================
   BASELINE v12 - generator.js
   New selection logic: prompt > columns > exercise count > exercises
   T1 and T2 filtered by type/mode/ULC. T3 random.
   Depends on: app.js
   ============================================================ */

var FORMAT_MAP = {
  'AM':['AMRAP 16','AMRAP 18','AMRAP 20'],'FT1':['For Time'],'FT3':['3 Rounds For Time'],
  'FT4':['4 Rounds For Time'],'FT6':['6 Rounds For Time'],'FT8':['8 Rounds For Time'],
  'EM1':['EMOM 10m','EMOM 12m'],'EM2':['E2MOM 16m','E2MOM 20m'],
  'EM3':['E3MOM 15m','E3MOM 17m'],'EM4':['E4MOM 16m','E4MOM 20m'],'EM5':['E5MOM 15m','E5MOM 20m']
};
var REFINE_EXCLUDE_TYPES = ['recovery'];
var PersistentExclusions = { exercises: [], types: [] };

function rnd(a){return a[Math.floor(Math.random()*a.length)];}
function pickN(arr,n){var p=arr.slice(),r=[];n=Math.min(n,p.length);for(var i=0;i<n;i++){var x=Math.floor(Math.random()*p.length);r.push(p.splice(x,1)[0]);}return r;}

function parseRange(s){
  if(!s||!s.trim())return null;
  var p=s.split('/');if(p.length!==3)return null;
  var a=parseFloat(p[0]),b=parseFloat(p[1]),c=parseFloat(p[2]);
  if(isNaN(a)||isNaN(b)||isNaN(c)||c<=0||b<a)return null;
  var o=[];for(var n=a;n<=b+0.0001;n+=c)o.push(Math.round(n));
  return rnd(o);
}
function parseList(s){
  if(!s||!s.trim()||s.trim().toUpperCase()==='NONE')return[];
  return s.split(',').map(function(x){return x.trim().toLowerCase();}).filter(function(x){return x!=='';});
}
function matchesFilter(value, allowedList){
  if(!allowedList||!allowedList.length)return true;
  var vals=(value||'').split(',').map(function(v){return v.trim().toLowerCase();});
  for(var i=0;i<vals.length;i++){if(vals[i]&&allowedList.indexOf(vals[i])!==-1)return true;}
  return false;
}
function getFormat(col){var o=FORMAT_MAP[col];return o?rnd(o):col;}
function isUni(ubVal){return(ubVal||'').toString().trim().toUpperCase()==='U';}
function isRecovery(typeStr){
  var types=parseList(typeStr||'');
  return types.indexOf('recovery')!==-1;
}
function repLabel(typeStr,ub){
  if(isRecovery(typeStr))return'seconds';
  var types=parseList(typeStr||'');
  if(types.indexOf('machine')!==-1)return'meters';
  return isUni(ub)?'reps each side':'reps';
}
function typeMatchesExclusion(typeStr,excl){
  var types=parseList(typeStr||'');
  for(var i=0;i<types.length;i++){if(excl.types.indexOf(types[i])!==-1)return true;}
  return false;
}
function isExcluded(name,typeStr,excl){
  if(excl.exercises.indexOf(name)!==-1)return true;
  return typeMatchesExclusion(typeStr,excl);
}

// ── Load sheet data ───────────────────────────────────────

async function loadSheetData(){
  try{
    var r=await fetch('/api/sheet-data');
    if(!r.ok)throw new Error();
    State.sheetData=await r.json();
    var sel=document.getElementById('promptSelect');
    var prompts=State.sheetData.prompts.filter(function(p){
      return p&&p.trim()!==''
        &&p!=='PROMPT RULES'
        &&!p.toLowerCase().startsWith('prompt rules')
        &&!p.startsWith('Controls')
        &&!p.startsWith('Each field');
    });
    sel.innerHTML='<option value="" disabled selected>Choose</option>'+prompts.map(function(p){
      return'<option value="'+p+'">'+p+'</option>';
    }).join('');
    sel.disabled=false;
    document.getElementById('timeSelect').disabled=false;
    document.getElementById('genBtn').disabled=false;
    renderPromptPills(prompts);
    // Re-render library if it's the active page
    var libPage = document.getElementById('pageLibrary');
    if (libPage && libPage.classList.contains('active') && typeof renderLibrary === 'function') {
      renderLibrary();
    }
  }catch(e){
    document.getElementById('output').innerHTML='<div class="state-msg">Could not load workout data. Please refresh.</div>';
  }
}

// ── Generate (fresh) ──────────────────────────────────────

function showGenerating(){
  document.getElementById('output').innerHTML=
    '<div class="generating-state">'
    +'<span class="gen-dot"></span>'
    +'<span class="gen-dot"></span>'
    +'<span class="gen-dot"></span>'
    +'</div>';
}

function renderPromptPills(prompts) {
  var pills = document.getElementById('promptPills');
  if (!pills) return;
  pills.innerHTML = prompts.map(function(p) {
    return '<button class="prompt-pill" data-prompt="' + p + '" onclick="selectPromptPill(this.dataset.prompt)">' + p + '</button>';
  }).join('');
  // Keep pills hidden until loader fully fades
  pills.style.visibility = 'hidden';
  pills.style.display = 'flex';
  var loader = document.getElementById('genLoader');
  if (loader) {
    loader.style.transition = 'opacity 0.5s ease';
    loader.style.opacity = '0';
    setTimeout(function(){
      loader.style.display = 'none';
      pills.style.visibility = 'visible';
      pills.style.opacity = '0';
      pills.style.transition = 'opacity 0.3s ease';
      setTimeout(function(){ pills.style.opacity = '1'; }, 20);
    }, 500);
  } else {
    pills.style.visibility = 'visible';
  }
}

function selectPromptPill(prompt) {
  var pills = document.getElementById('promptPills');
  var panel = document.getElementById('generatorPanel');
  var sel   = document.getElementById('promptSelect');
  if (sel) sel.value = prompt;

  if (pills && panel) {
    // Crossfade: fade pills out, panel in simultaneously
    panel.style.opacity = '0';
    panel.style.display = 'block';
    pills.style.transition  = 'opacity 0.35s ease';
    panel.style.transition  = 'opacity 0.35s ease';
    pills.style.opacity = '0';
    setTimeout(function(){
      panel.style.opacity = '1';
      pills.style.visibility = 'hidden';
    }, 200);
  } else {
    openGeneratorPanel();
  }
}

function generate(){
  PersistentExclusions={exercises:[],types:[]};
  var prompt=document.getElementById('promptSelect').value;
  var ts=document.getElementById('timeSelect').value;
  if(!prompt||!ts)return;
  showGenerating();
  var result=_buildWorkout(prompt,ts,null,PersistentExclusions);
  if(!result)return;
  State.lastResult=result;
  renderOutput(false);
}

// ── Regenerate (refine) ───────────────────────────────────

function regenerate(){
  applyFilterRemovals();
  document.querySelectorAll('.refine-group').forEach(function(group){
    var slot=group.getAttribute('data-slot');
    var exName=group.getAttribute('data-exercise');
    var exType=group.getAttribute('data-type');
    var selVal=group.getAttribute('data-selected');
    if(!selVal)return;
    if(selVal==='exercise'&&PersistentExclusions.exercises.indexOf(exName)===-1)
      PersistentExclusions.exercises.push(exName);
    if(selVal==='type'&&PersistentExclusions.types.indexOf(exType.toLowerCase())===-1)
      PersistentExclusions.types.push(exType.toLowerCase());
  });

  var slotsToReplace={};
  var r=State.lastResult;
  if(r.t1&&isExcluded(r.t1.row,r.t1.type,PersistentExclusions))slotsToReplace['t1']=true;
  if(r.t2&&isExcluded(r.t2.row,r.t2.type,PersistentExclusions))slotsToReplace['t2']=true;
  if(r.t3&&isExcluded(r.t3.row,r.t3.type,PersistentExclusions))slotsToReplace['t3']=true;

  var prompt=document.getElementById('promptSelect').value;
  var ts=document.getElementById('timeSelect').value;
  var newResult=_buildWorkout(prompt,ts,slotsToReplace,PersistentExclusions);
  if(!newResult)return;
  State.lastResult=newResult;
  renderOutput(true);
}

// ── Core workout builder ──────────────────────────────────

function _buildWorkout(prompt,ts,slotsToReplace,excl){
  var keep=slotsToReplace&&State.lastResult?State.lastResult:null;
  var nAZ=ts==='60mins'?3:ts==='45mins'?2:1;
  var d=State.sheetData;
  var pRule=d.promptRules[prompt];
  if(!pRule){alert('No rule for: '+prompt);return null;}

  // Parse prompt filters
  var t1TypesAllow=parseList(pRule.t1Types||'');
  var t1ModesAllow=parseList(pRule.t1Modes||'');
  var t1ULCAllow  =parseList(pRule.t1ULC||'');
  var t2TypesAllow=parseList(pRule.t2Types||'');
  var t2ModesAllow=parseList(pRule.t2Modes||'');
  var t2ULCAllow  =parseList(pRule.t2ULC||'');
  var allowedCols =parseList(pRule.allowedCols||'');

  // Pick column (keep same column on refine)
  var selectedCol, colIdx;
  if(keep&&!slotsToReplace['t1']){
    selectedCol=keep.selectedCol; colIdx=d.t1Cols.indexOf(selectedCol);
  }else{
    var eligCols=d.t1Cols.filter(function(c){return allowedCols.length===0||allowedCols.indexOf(c.toLowerCase())!==-1;});
    if(!eligCols.length){
      document.getElementById('output').innerHTML='<div class="state-msg">No eligible columns for this workout. Check Config_ColumnPairing.</div>';
      return null;
    }
    selectedCol=rnd(eligCols); colIdx=d.t1Cols.indexOf(selectedCol);
  }

  // Get exercise count for this column
  var countRange=(d.colPairingRules||{})[selectedCol]||'2/2/1';
  var exCount=parseRange(countRange)||2;
  exCount=Math.max(1,Math.min(3,exCount));
  // On refine, keep same count unless more slots are being replaced
  if(keep) exCount=keep.exCount;

  var workoutFormat=keep&&!slotsToReplace['t1']?keep.fmt:getFormat(selectedCol);

  // T1
  var t1,t1n;
  if(keep&&!slotsToReplace['t1']){
    t1=keep.t1; t1n=keep.t1n;
  }else{
    var t1e=[];
    (d.t1Rows||[]).forEach(function(row){
      if(isExcluded(row,(d.t1TypeData||{})[row],excl))return;
      if(!matchesFilter((d.t1TypeData||{})[row],t1TypesAllow))return;
      if(!matchesFilter((d.t1ModeData||{})[row],t1ModesAllow))return;
      if(!matchesFilter((d.t1ULCData||{})[row],t1ULCAllow))return;
      var v=(d.t1Data[row]||{})[selectedCol];if(!v||!v.trim())return;
      t1e.push({row:row,col:selectedCol,val:v,type:(d.t1TypeData||{})[row]||'',mode:(d.t1ModeData||{})[row]||'',ulc:(d.t1ULCData||{})[row]||'',ub:(d.t1UBData||{})[row]||'B'});
    });
    if(!t1e.length){
      document.getElementById('output').innerHTML='<div class="state-msg">No T1 exercises available for this workout. Try a different prompt or check sheet filters.</div>';
      return null;
    }
    var t1p=rnd(t1e);
    t1={row:t1p.row,col:selectedCol,val:t1p.val,type:t1p.type,mode:t1p.mode,ulc:t1p.ulc,ub:t1p.ub};
    t1n=parseRange(t1p.val);
  }

  // T2
  var t2=null,t2n=null;
  if(exCount>=2){
    if(keep&&!slotsToReplace['t2']){
      t2=keep.t2; t2n=keep.t2n;
    }else{
      var t2e=[];
      (d.t2Rows||[]).forEach(function(row){
        if(isExcluded(row,(d.t2TypeData||{})[row],excl))return;
        if(!matchesFilter((d.t2TypeData||{})[row],t2TypesAllow))return;
        if(!matchesFilter((d.t2ModeData||{})[row],t2ModesAllow))return;
        if(!matchesFilter((d.t2ULCData||{})[row],t2ULCAllow))return;
        var v=(d.t2Data[row]||{})[selectedCol];if(!v||!v.trim())return;
        t2e.push({row:row,col:selectedCol,val:v,type:(d.t2TypeData||{})[row]||'',mode:(d.t2ModeData||{})[row]||'',ulc:(d.t2ULCData||{})[row]||'',ub:(d.t2UBData||{})[row]||'B'});
      });
      if(t2e.length){var t2p=rnd(t2e);t2={row:t2p.row,col:selectedCol,val:t2p.val,type:t2p.type,mode:t2p.mode,ulc:t2p.ulc,ub:t2p.ub};t2n=parseRange(t2p.val);}
    }
  }

  // T3 — random, no type/mode/ULC filters, only recovery rule
  var t3=null,t3n=null;
  if(exCount>=3){
    if(keep&&!slotsToReplace['t3']){
      t3=keep.t3; t3n=keep.t3n;
    }else{
      var t2IsRecovery=t2&&isRecovery(t2.type);
      var t3e=[];
      (d.t3Rows||[]).forEach(function(row){
        if(isExcluded(row,(d.t3TypeData||{})[row],excl))return;
        if(t2IsRecovery&&isRecovery((d.t3TypeData||{})[row]))return;
        var v=(d.t3Data[row]||{})[selectedCol];if(!v||!v.trim())return;
        t3e.push({row:row,col:selectedCol,val:v,type:(d.t3TypeData||{})[row]||'',ub:(d.t3UBData||{})[row]||'B'});
      });
      if(t3e.length){var t3p=rnd(t3e);t3={row:t3p.row,col:selectedCol,val:t3p.val,type:t3p.type,ub:t3p.ub};t3n=parseRange(t3p.val);}
    }
  }

  // TA / TZ
  var taP,tzP;
  if(keep){
    taP=keep.taP; tzP=keep.tzP;
  }else{
    var taE=(d.taRows||[]).filter(function(ex){var v=(d.taData||{})[ex];return v&&v.trim();}).map(function(ex){return{name:ex,val:d.taData[ex],ub:(d.taUBData||{})[ex]||'B',rounds:(d.taRoundsData||{})[ex]||'2',type:(d.taTypeData||{})[ex]||''};});
    taP=pickN(taE,nAZ);
    var tzE=(d.tzRows||[]).filter(function(ex){var v=(d.tzData||{})[ex];return v&&v.trim();}).map(function(ex){return{name:ex,val:d.tzData[ex],ub:(d.tzUBData||{})[ex]||'B',rounds:(d.tzRoundsData||{})[ex]||'2',type:(d.tzTypeData||{})[ex]||''};});
    tzP=pickN(tzE,nAZ);
  }

  return{t1:t1,t1n:t1n,t2:t2,t2n:t2n,t3:t3,t3n:t3n,fmt:workoutFormat,selectedCol:selectedCol,exCount:exCount,taP:taP,tzP:tzP,prompt:prompt,timeStr:ts};
}

// ── Render ────────────────────────────────────────────────

function renderOutput(isRegen){
  if(typeof openGeneratorPanel==='function') openGeneratorPanel();
  var inst=document.querySelector('.gen-instructions');
  if(inst) inst.style.display='none';
  var r=State.lastResult;
  var h=buildResults(r);
  h+='<div class="save-area">';
  h+='<button class="save-btn" id="saveBtn" onclick="saveWorkout()">Save workout</button>';
  h+='<button class="refine-btn" id="refineBtn" onclick="toggleRefine()">Refine workout</button>';
  h+='<span class="save-msg" id="saveMsg">'+(isRegen?'Refined':'')+'</span>';
  h+='<span class="pro-link" id="proLink" style="display:none;">Need something more personalised? Try <span onclick="showPage(\'pro\',null)" style="text-decoration:underline;cursor:pointer;color:#1E2C35;">Baseline Pro</span></span>';
  h+='</div>';
  h+=buildRefinePanel(r,isRegen);
  document.getElementById('output').innerHTML=h;
}

function buildResults(r){
  var ec=function(csstype,label,name,col,reps,ub,extype){
    var repsVal=reps!==null&&reps!==undefined?reps:'--';
    var unit=repLabel(extype,ub);
    var unitSpan='<span class="card-col" style="margin-left:8px;font-size:12px;">'+unit+'</span>';
    var html='<div class="exercise-card '+csstype+'">';
    html+='<div class="card-label '+csstype+'">'+label+'</div>';
    var hasMedia=State.sheetData&&State.sheetData.exerciseMedia&&State.sheetData.exerciseMedia[name];
    if(hasMedia){
      html+='<div class="card-exercise card-exercise-link" data-exname="'+name+'" onclick="openExerciseModal(this)"><span class="ex-link-dot">&#9654;</span> '+name+'</div>';
    }else{
      html+='<div class="card-exercise">'+name+'</div>';
    }
    if(col)html+='<div class="card-col">'+col+'</div>';
    html+='<div class="card-reps-row"><span class="card-reps">'+repsVal+'</span>'+unitSpan+'</div>';
    html+='</div>';
    return html;
  };
  var ac=function(csstype,label,name,reps,ub,rounds,extype){
    var repsVal=reps!==null&&reps!==undefined?reps:'--';
    var unit=repLabel(extype,ub);
    var unitSpan='<span class="card-col" style="margin-left:8px;font-size:12px;">'+unit+'</span>';
    var roundsStr=rounds&&parseInt(rounds)>1?'<div class="card-col" style="margin-top:4px;">x'+rounds+' rounds</div>':'';
    var html='<div class="acc-card '+csstype+'">';
    html+='<div class="card-label '+csstype+'">'+label+'</div>';
    var hasMediaAcc=State.sheetData&&State.sheetData.exerciseMedia&&State.sheetData.exerciseMedia[name];
    if(hasMediaAcc){
      html+='<div class="acc-name card-exercise-link" data-exname="'+name+'" onclick="openExerciseModal(this)">'+name+'</div>';
    }else{
      html+='<div class="acc-name">'+name+'</div>';
    }
    html+='<div class="card-reps-row"><span class="acc-reps">'+repsVal+'</span>'+unitSpan+'</div>';
    html+=roundsStr+'</div>';
    return html;
  };

  var taC=r.taP.map(function(p,i){return ac('ta','Prep '+(i+1),p.name,parseRange(p.val),p.ub,p.rounds,p.type);}).join('');
  var tzC=r.tzP.map(function(p,i){return ac('tz','Mobility '+(i+1),p.name,parseRange(p.val),p.ub,p.rounds,p.type);}).join('');

  var h='<div class="results">';
  if(r.taP.length)h+='<div class="results-section"><div class="section-label">Prep</div><div class="acc-grid">'+taC+'</div></div><div class="divider"></div>';
  h+='<div class="results-section"><div class="section-label">Main Work</div><div class="format-badge">'+r.fmt+'</div>';
  h+='<div class="exercise-pair">';
  h+=ec('t1','Exercise 1',r.t1.row,r.t1.col,r.t1n,r.t1.ub,r.t1.type);
  if(r.t2){
    h+=ec('t2','Exercise 2',r.t2.row,r.t2.col,r.t2n,r.t2.ub,r.t2.type);
  }else{
    h+='<div class="exercise-card t2"><div class="card-label t2">Exercise 2</div><div class="card-empty">No pair for this selection</div></div>';
  }
  h+='</div>';
  if(r.t3)h+='<div class="exercise-pair" style="margin-top:12px">'+ec('t3','Exercise 3',r.t3.row,r.t3.col,r.t3n,r.t3.ub,r.t3.type)+'<div></div></div>';
  h+='</div>';
  if(r.tzP.length)h+='<div class="divider"></div><div class="results-section"><div class="section-label">Mobility</div><div class="acc-grid">'+tzC+'</div></div>';
  h+='</div>';
  return h;
}

// ── Refine panel ──────────────────────────────────────────

function buildRefinePanel(r,startOpen){
  var d=State.sheetData;
  var exercises=[];
  if(r.t1&&!isRecovery(r.t1.type))exercises.push({slot:'t1',name:r.t1.row,type:r.t1.type});
  if(r.t2&&!isRecovery(r.t2.type))exercises.push({slot:'t2',name:r.t2.row,type:r.t2.type});
  if(r.t3&&!isRecovery(r.t3.type))exercises.push({slot:'t3',name:r.t3.row,type:r.t3.type});
  if(!exercises.length)return'<div id="refinePanel" style="display:none"></div>';

  var pRule=d.promptRules[r.prompt]||{};
  var allowedCols=parseList(pRule.allowedCols||'');
  var t1TypesAllow=parseList(pRule.t1Types||'');
  var t1ModesAllow=parseList(pRule.t1Modes||'');
  var t1ULCAllow  =parseList(pRule.t1ULC||'');
  var t2TypesAllow=parseList(pRule.t2Types||'');
  var t2ModesAllow=parseList(pRule.t2Modes||'');
  var t2ULCAllow  =parseList(pRule.t2ULC||'');

  function hasAltExercise(slot,exName,excl){
    var testExcl={exercises:excl.exercises.concat(exName?[exName]:[]),types:excl.types.slice()};
    var col=r.selectedCol;
    if(slot==='t1'){
      return(d.t1Rows||[]).some(function(row){
        if(isExcluded(row,(d.t1TypeData||{})[row],testExcl))return false;
        if(!matchesFilter((d.t1TypeData||{})[row],t1TypesAllow))return false;
        if(!matchesFilter((d.t1ModeData||{})[row],t1ModesAllow))return false;
        if(!matchesFilter((d.t1ULCData||{})[row],t1ULCAllow))return false;
        var v=(d.t1Data[row]||{})[col];return v&&v.trim();
      });
    }
    if(slot==='t2'){
      return(d.t2Rows||[]).some(function(row){
        if(isExcluded(row,(d.t2TypeData||{})[row],testExcl))return false;
        if(!matchesFilter((d.t2TypeData||{})[row],t2TypesAllow))return false;
        if(!matchesFilter((d.t2ModeData||{})[row],t2ModesAllow))return false;
        if(!matchesFilter((d.t2ULCData||{})[row],t2ULCAllow))return false;
        var v=(d.t2Data[row]||{})[col];return v&&v.trim();
      });
    }
    if(slot==='t3'){
      return(d.t3Rows||[]).some(function(row){
        if(isExcluded(row,(d.t3TypeData||{})[row],testExcl))return false;
        var v=(d.t3Data[row]||{})[col];return v&&v.trim();
      });
    }
    return true;
  }

  function hasAltType(slot,exType,excl){
    var testExcl={exercises:excl.exercises.slice(),types:excl.types.concat([exType.toLowerCase()])};
    return hasAltExercise(slot,'',testExcl);
  }

  var cols=exercises.map(function(ex){
    var typePrimary=parseList(ex.type)[0]||'';
    var alreadyEx=PersistentExclusions.exercises.indexOf(ex.name)!==-1;
    var alreadyType=PersistentExclusions.types.indexOf(typePrimary.toLowerCase())!==-1;
    var canEx=!alreadyEx&&hasAltExercise(ex.slot,ex.name,PersistentExclusions);
    var canType=!alreadyType&&hasAltType(ex.slot,typePrimary,PersistentExclusions);
    var exCls='refine-opt'+(canEx?'':' refine-opt-disabled');
    var tyCls='refine-opt'+(canType?'':' refine-opt-disabled');
    return'<div class="refine-group" data-slot="'+ex.slot+'" data-exercise="'+ex.name+'" data-type="'+typePrimary+'" data-selected="">'
      +'<div class="refine-group-label">'+ex.name+'</div>'
      +'<div class="'+exCls+'" data-val="exercise"'+(canEx?' onclick="selectRefineOpt(this)"':'')+'>'
      +'<span class="refine-opt-text">Exclude this exercise</span>'
      +'<span class="refine-tick">&#10003;</span></div>'
      +'<div class="'+tyCls+'" data-val="type"'+(canType?' onclick="selectRefineOpt(this)"':'')+'>'
      +'<span class="refine-opt-text refine-opt-muted">Exclude '+typePrimary+' exercises</span>'
      +'<span class="refine-tick refine-tick-muted">&#10003;</span></div>'
      +'</div>';
  });

  var prevFilters='';
  if(PersistentExclusions.exercises.length||PersistentExclusions.types.length){
    var items=[];
    PersistentExclusions.exercises.forEach(function(ex){
      items.push('<div class="refine-prev-item" data-remove-exercise="'+ex+'" onclick="removePersistentFilter(this)">'
        +'<span class="refine-opt-text refine-opt-muted refine-prev-text">'+ex+' excluded</span>'
        +'<span class="refine-prev-tick">&#10003;</span></div>');
    });
    PersistentExclusions.types.forEach(function(t){
      items.push('<div class="refine-prev-item" data-remove-type="'+t+'" onclick="removePersistentFilter(this)">'
        +'<span class="refine-opt-text refine-opt-muted refine-prev-text">'+t+' exercises excluded</span>'
        +'<span class="refine-prev-tick">&#10003;</span></div>');
    });
    prevFilters='<div class="refine-prev-filters">'+items.join('')+'</div>';
  }

  var inner=cols.join('<div class="refine-divider"></div>');
  return'<div id="refinePanel" style="display:'+(startOpen?'block':'none')+'">'
    +'<div class="refine-cols">'+inner+'</div>'
    +'<div class="refine-footer">'
    +'<button class="refine-regen-btn" onclick="regenerate()">Regenerate</button>'
    +prevFilters
    +'</div></div>';
}

function toggleRefine(){
  var panel=document.getElementById('refinePanel');
  var btn=document.getElementById('refineBtn');
  var proLink=document.getElementById('proLink');
  var open=panel.style.display==='block';
  panel.style.display=open?'none':'block';
  btn.classList.toggle('refine-btn-active',!open);
  if(proLink) proLink.style.display=open?'none':'inline';
}

function selectRefineOpt(opt){
  var group=opt.closest('.refine-group');
  var selVal=group.getAttribute('data-selected');
  var thisVal=opt.getAttribute('data-val');
  group.querySelectorAll('.refine-opt:not(.refine-opt-disabled)').forEach(function(o){
    o.querySelector('.refine-tick').style.opacity='0';
    o.querySelector('.refine-opt-text').style.opacity='1';
  });
  if(selVal===thisVal){group.setAttribute('data-selected','');}
  else{
    group.setAttribute('data-selected',thisVal);
    opt.querySelector('.refine-tick').style.opacity='1';
    opt.querySelector('.refine-opt-text').style.opacity='0.45';
  }
}

function removePersistentFilter(el){
  var tick=el.querySelector('.refine-prev-tick');
  if(el.classList.contains('refine-prev-removing')){
    el.classList.remove('refine-prev-removing');
    tick.innerHTML='&#10003;';
  }else{
    el.classList.add('refine-prev-removing');
    tick.innerHTML='&#x2715;';
  }
}

function applyFilterRemovals(){
  document.querySelectorAll('.refine-prev-item.refine-prev-removing').forEach(function(el){
    var exName=el.getAttribute('data-remove-exercise');
    var exType=el.getAttribute('data-remove-type');
    if(exName){var idx=PersistentExclusions.exercises.indexOf(exName);if(idx!==-1)PersistentExclusions.exercises.splice(idx,1);}
    if(exType){var idx=PersistentExclusions.types.indexOf(exType);if(idx!==-1)PersistentExclusions.types.splice(idx,1);}
  });
}

// ── Exercise inline panels ───────────────────────────────

function openExerciseModal(el) {
  var name = el.getAttribute('data-exname');
  if (!name) return;

  // Toggle: if panel already open for this exercise, close it
  var panelId = 'expanel-' + name.replace(/[^a-zA-Z0-9]/g, '-');
  var existing = document.getElementById(panelId);
  if (existing) { existing.remove(); return; }

  // Find insertion point
  var insertAfter = el.closest('.library-card')
    || el.closest('.exercise-pair')
    || el.closest('.acc-card')
    || el.closest('.acc-grid')
    || el.parentElement;

  var panel = document.createElement('div');
  panel.id = panelId;
  panel.className = 'ex-inline-panel';

  _renderPanelContent(panel, name, []);
  insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);
}

function _renderPanelContent(panel, name, history) {
  panel.setAttribute('data-current', name);
  panel.setAttribute('data-history', JSON.stringify(history));
  window._exWikiLinks = [];

  var media = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[name];
  if (!media) return;

  var url = media.url || '';
  var isMP4 = url.toLowerCase().indexOf('.mp4') !== -1 || url.indexOf('r2.dev') !== -1;
  var isYT  = url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1;
  var ytId  = '';
  if (isYT) {
    var m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) ytId = m[1];
  }
  var thumbUrl = media.thumbnail || '';
  if (!thumbUrl && ytId) thumbUrl = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';

  // Store for playback — scoped to this panel
  panel._ytId   = ytId;
  panel._isMP4  = isMP4;
  panel._vidUrl = url;

  // Breadcrumb
  var breadcrumbHtml = '';
  if (history.length > 0) {
    var crumbs = history.map(function(n, i) {
      return '<span class="ex-crumb-link" data-panel="' + panel.id + '" data-idx="' + i + '" onclick="var p=document.getElementById(this.dataset.panel);_panelGoTo(p,+this.dataset.idx)">' + n + '</span>';
    });
    crumbs.push('<span class="ex-crumb-current">' + name + '</span>');
    breadcrumbHtml = '<div class="ex-breadcrumb">' + crumbs.join('<span class="ex-crumb-sep"> › </span>') + '</div>';
  }

  // Video
  var videoHtml = '';
  if (url) {
    var thumbInner = thumbUrl
      ? '<img src="' + thumbUrl + '" alt="Play" style="width:100%;height:100%;object-fit:cover;" />'
      : '<div style="width:100%;height:100%;background:#1E2C35;"></div>';
    var thumbId = panel.id + '-thumb';
    videoHtml = '<div class="ex-media-video-col">'
      + '<div class="ex-media-thumb" id="' + thumbId + '" onclick="_playPanelVideo(this)" style="cursor:pointer;">'
      + thumbInner + '</div></div>';
  }

  // Description with wiki links
  var descHtml = '';
  if (media.description) {
    var descResult = '';
    var descStr = media.description;
    var wikiRx = /\[([^\]]+)\]/g;
    var wm; var lastIdx = 0;
    while ((wm = wikiRx.exec(descStr)) !== null) {
      var exName = wm[1];
      var exists = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[exName];
      descResult += descStr.slice(lastIdx, wm.index);
      if (exists) {
        var li = window._exWikiLinks.length;
        window._exWikiLinks.push({panelId: panel.id, name: exName});
        descResult += '<span class="ex-wiki-link" onclick="_openLinkedInPanel(' + li + ')">' + exName + '</span>';
      } else {
        descResult += exName;
      }
      lastIdx = wm.index + wm[0].length;
    }
    descResult += descStr.slice(lastIdx);
    descHtml = '<div class="ex-modal-desc">' + descResult + '</div>';
  }

  var textHtml = '<div class="ex-media-text-col">'
    + '<div class="ex-modal-name">' + name + '</div>'
    + descHtml + '</div>';

  panel.innerHTML = '<div class="ex-panel-header">'
    + breadcrumbHtml
    + '<button class="ex-panel-close" onclick="this.closest(\'.ex-inline-panel\').remove()">&#x2715;</button>'
    + '</div>'
    + '<div class="ex-media-layout">' + videoHtml + textHtml + '</div>';
}

function _playPanelVideo(thumbEl) {
  var panel = thumbEl.closest('.ex-inline-panel');
  if (!panel) return;
  var html = '';
  if (panel._isMP4) {
    html = '<video src="' + panel._vidUrl + '" autoplay playsinline loop '
      + 'style="width:100%;height:100%;object-fit:cover;background:#000;cursor:pointer;" '
      + 'onclick="var v=this;v.paused?v.play():v.pause();"></video>';
  } else if (panel._ytId) {
    html = '<iframe src="https://www.youtube.com/embed/' + panel._ytId
      + '?rel=0&modestbranding=1&autoplay=1" frameborder="0" allowfullscreen allow="autoplay;picture-in-picture" '
      + 'style="width:100%;height:100%;border:none;"></iframe>';
  }
  if (html) { thumbEl.innerHTML = html; thumbEl.style.cursor = 'default'; }
}

function _openLinkedInPanel(linkIdx) {
  var link = window._exWikiLinks && window._exWikiLinks[linkIdx];
  if (!link) return;
  var panel = document.getElementById(link.panelId);
  if (!panel) return;
  var history = JSON.parse(panel.getAttribute('data-history') || '[]');
  var current = panel.getAttribute('data-current');
  history.push(current);
  _renderPanelContent(panel, link.name, history);
}

function _panelGoTo(panel, index) {
  var history = JSON.parse(panel.getAttribute('data-history') || '[]');
  var targetName = history[index];
  var newHistory = history.slice(0, index);
  _renderPanelContent(panel, targetName, newHistory);
}

// Keep closeExerciseModal for any legacy references
function closeExerciseModal() {}
function handleExModalClick() {}
function openLinkedExercise() {}

function makeTitle(r){var p=[r.t1.row];if(r.t2)p.push(r.t2.row);p.push(r.fmt);return p.join(' - ');}
