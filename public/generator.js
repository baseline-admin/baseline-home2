/* ============================================================
   BASELINE - generator.js
   Workout generation, result rendering, refine/regenerate.
   Depends on: app.js
   ============================================================ */

var FORMAT_MAP = {
  'AM':['AMRAP 16','AMRAP 18','AMRAP 20'],'FT1':['For Time'],'FT3':['3 Rounds For Time'],
  'FT4':['4 Rounds For Time'],'FT6':['6 Rounds For Time'],'FT8':['8 Rounds For Time'],
  'EM1':['EMOM 10m','EMOM 12m'],'EM2':['E2MOM 16m','E2MOM 20m'],
  'EM3':['E3MOM 15m','E3MOM 17m'],'EM4':['E4MOM 16m','E4MOM 20m'],'EM5':['E5MOM 15m','E5MOM 20m']
};
var T3_TRIGGER_COLS = ['AM','FT3','FT4','EM4','EM5'];
var REFINE_EXCLUDE_TYPES = ['recovery'];
var Exclusions = { exercises: [], types: [] };

function rnd(a){return a[Math.floor(Math.random()*a.length)];}
function pickN(arr,n){var p=arr.slice(),r=[];n=Math.min(n,p.length);for(var i=0;i<n;i++){var x=Math.floor(Math.random()*p.length);r.push(p.splice(x,1)[0]);}return r;}
function parseRange(s){if(!s||!s.trim())return null;var p=s.split('/');if(p.length!==3)return null;var a=parseFloat(p[0]),b=parseFloat(p[1]),c=parseFloat(p[2]);if(isNaN(a)||isNaN(b)||isNaN(c)||c<=0||b<a)return null;var o=[];for(var n=a;n<=b+0.0001;n+=c)o.push(Math.round(n));return rnd(o);}
function parseList(s){if(!s||!s.trim()||s.trim().toUpperCase()==='NONE')return[];return s.split(',').map(function(x){return x.trim();}).filter(function(x){return x!=='';});}
function anyMatch(et,al){if(!al.length)return true;for(var i=0;i<al.length;i++){if(et.indexOf(al[i])!==-1)return true;}return false;}
function getFormat(col){var o=FORMAT_MAP[col];return o?rnd(o):col;}
function isUni(ubVal){return(ubVal||'').toString().trim().toUpperCase()==='U';}
function isRecovery(typeStr){
  var types=parseList(typeStr||'');
  for(var i=0;i<types.length;i++){if(REFINE_EXCLUDE_TYPES.indexOf(types[i].toLowerCase())!==-1)return true;}
  return false;
}
function repLabel(typeStr, ub){
  if(isRecovery(typeStr)) return 'seconds';
  return isUni(ub) ? 'reps each side' : 'reps';
}
function isExcluded(name, typeStr){
  if(Exclusions.exercises.indexOf(name)!==-1)return true;
  var types=parseList(typeStr||'');
  for(var i=0;i<types.length;i++){if(Exclusions.types.indexOf(types[i].toLowerCase())!==-1)return true;}
  return false;
}

async function loadSheetData(){
  try{
    var r=await fetch('/api/sheet-data');
    if(!r.ok)throw new Error();
    State.sheetData=await r.json();
    var sel=document.getElementById('promptSelect');
    var prompts=State.sheetData.prompts.filter(function(p){
      return p&&p.trim()!==''&&p!=='PROMPT RULES'&&!p.startsWith('Controls');
    });
    sel.innerHTML='<option value="" disabled selected>Choose</option>'+prompts.map(function(p){
      return '<option value="'+p+'">'+p+'</option>';
    }).join('');
    sel.disabled=false;
    document.getElementById('timeSelect').disabled=false;
    document.getElementById('genBtn').disabled=false;
  }catch(e){
    document.getElementById('output').innerHTML='<div class="state-msg">Could not load workout data. Please refresh.</div>';
  }
}

function generate(){
  Exclusions={exercises:[],types:[]};
  _doGenerate(false);
}

function regenerate(){
  Exclusions={exercises:[],types:[]};
  document.querySelectorAll('.refine-group').forEach(function(group){
    var exName=group.getAttribute('data-exercise');
    var exType=group.getAttribute('data-type');
    var selVal=group.getAttribute('data-selected');
    if(selVal==='exercise')Exclusions.exercises.push(exName);
    if(selVal==='type')Exclusions.types.push(exType.toLowerCase());
  });
  _doGenerate(true);
}

function _doGenerate(isRegen){
  var prompt=document.getElementById('promptSelect').value;
  var ts=document.getElementById('timeSelect').value;
  if(!prompt)return;
  var nAZ=ts==='60mins'?3:ts==='45mins'?2:1;
  var d=State.sheetData,pRule=d.promptRules[prompt];
  if(!pRule){alert('No rule for: '+prompt);return;}

  var t1RL=parseList(pRule.allowedRows),t1CL=parseList(pRule.allowedCols),elig=[];
  d.t1Rows.forEach(function(row){
    if(t1RL.length&&t1RL.indexOf(row)===-1)return;
    if(isExcluded(row,(d.t1TypeData||{})[row]))return;
    d.t1Cols.forEach(function(col){
      if(t1CL.length&&t1CL.indexOf(col)===-1)return;
      var v=(d.t1Data[row]||{})[col];if(!v||!v.trim())return;
      elig.push({row:row,col:col,val:v});
    });
  });
  if(!elig.length){
    document.getElementById('output').innerHTML='<div class="state-msg">No exercises available with current exclusions. Try removing some filters.</div>';
    return;
  }

  var t1=rnd(elig),t1n=parseRange(t1.val),f=getFormat(t1.col);
  var t1Type=(d.t1TypeData||{})[t1.row]||'',t1UB=(d.t1UBData||{})[t1.row]||'B';
  var t1T=parseList(t1Type),aT2=[],hasT2=false;
  t1T.forEach(function(t){if(d.typePairingRules&&d.typePairingRules[t]!==undefined){hasT2=true;parseList(d.typePairingRules[t]).forEach(function(r){if(aT2.indexOf(r)===-1)aT2.push(r);});}});

  var t2=null,t2n=null,t2type='',t2ub='B';
  if(hasT2&&aT2.length){
    var t2e=[];
    (d.t2Rows||[]).forEach(function(row){
      if(isExcluded(row,(d.t2TypeData||{})[row]))return;
      var et=parseList((d.t2TypeData||{})[row]||'');if(!anyMatch(et,aT2))return;
      var v=(d.t2Data[row]||{})[t1.col];if(!v||!v.trim())return;
      t2e.push({row:row,col:t1.col,val:v,types:(d.t2TypeData||{})[row]||'',ub:(d.t2UBData||{})[row]||'B'});
    });
    if(t2e.length){t2=rnd(t2e);t2n=parseRange(t2.val);t2type=t2.types;t2ub=t2.ub;}
  }

  var t3=null,t3n=null,t3type='',t3ub='B';
  if(T3_TRIGGER_COLS.indexOf(t1.col)!==-1&&t2&&d.t3Rows&&d.t3Rows.length){
    var t2T=parseList(t2type),aT3=[];
    t2T.forEach(function(t){if(d.t3PairingRules&&d.t3PairingRules[t]!==undefined){parseList(d.t3PairingRules[t]).forEach(function(r){if(aT3.indexOf(r)===-1)aT3.push(r);});}});
    var t3e=[];
    (d.t3Rows||[]).forEach(function(row){
      if(isExcluded(row,(d.t3TypeData||{})[row]))return;
      var et=parseList((d.t3TypeData||{})[row]||'');if(aT3.length&&!anyMatch(et,aT3))return;
      var v=(d.t3Data&&d.t3Data[row])?d.t3Data[row][t1.col]:'';if(!v||!v.trim())return;
      t3e.push({row:row,col:t1.col,val:v,types:(d.t3TypeData||{})[row]||'',ub:(d.t3UBData||{})[row]||'B'});
    });
    if(t3e.length){t3=rnd(t3e);t3n=parseRange(t3.val);t3type=t3.types;t3ub=t3.ub;}
  }

  var taAL=parseList((d.taPairingRules||{})[t1.row]||'');
  var taE=(d.taRows||[]).filter(function(ex){var v=(d.taData||{})[ex];if(!v||!v.trim())return false;return!taAL.length||taAL.indexOf(ex)!==-1;}).map(function(ex){return{name:ex,val:d.taData[ex],ub:(d.taUBData||{})[ex]||'B',rounds:(d.taRoundsData||{})[ex]||'2',type:(d.taTypeData||{})[ex]||''};});
  var taP=pickN(taE,nAZ);
  var tzAL=parseList((d.tzPairingRules||{})[t1.row]||'');
  var tzE=(d.tzRows||[]).filter(function(ex){var v=(d.tzData||{})[ex];if(!v||!v.trim())return false;return!tzAL.length||tzAL.indexOf(ex)!==-1;}).map(function(ex){return{name:ex,val:d.tzData[ex],ub:(d.tzUBData||{})[ex]||'B',rounds:(d.tzRoundsData||{})[ex]||'2',type:(d.tzTypeData||{})[ex]||''};});
  var tzP=pickN(tzE,nAZ);

  State.lastResult={
    t1:{row:t1.row,col:t1.col,val:t1.val,type:t1Type,ub:t1UB},t1n:t1n,
    t2:t2?{row:t2.row,col:t2.col,val:t2.val,type:t2type,ub:t2ub}:null,t2n:t2n,
    t3:t3?{row:t3.row,col:t3.col,val:t3.val,type:t3type,ub:t3ub}:null,t3n:t3n,
    fmt:f,taP:taP,tzP:tzP,prompt:prompt,timeStr:ts
  };
  renderOutput(isRegen);
}

function renderOutput(isRegen){
  var r=State.lastResult;
  var h=buildResults(r);
  h+='<div class="save-area">';
  h+='<button class="save-btn" id="saveBtn" onclick="saveWorkout()">Save workout</button>';
  h+='<button class="refine-btn" id="refineBtn" onclick="toggleRefine()">Refine workout</button>';
  h+='<span class="save-msg" id="saveMsg">'+(isRegen?'Regenerated':'')+'</span>';
  if(isRegen){
    h+='<span class="pro-link">Need something more personalised? Try <span onclick="showPage(\'pro\',null)" style="text-decoration:underline;cursor:pointer;color:#1E2C35;">Baseline Pro</span></span>';
  }
  h+='</div>';
  h+=buildRefinePanel(r);
  document.getElementById('output').innerHTML=h;
}

function buildResults(r){
  var ec=function(csstype,label,name,col,reps,ub,extype){
    var repsVal=reps!==null&&reps!==undefined?reps:'--';
    var unit=repLabel(extype,ub);
    var unitSpan='<span class="card-col" style="margin-left:8px;font-size:12px;">'+unit+'</span>';
    var html='<div class="exercise-card '+csstype+'">';
    html+='<div class="card-label '+csstype+'">'+label+'</div>';
    html+='<div class="card-exercise">'+name+'</div>';
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
    html+='<div class="acc-name">'+name+'</div>';
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

function buildRefinePanel(r){
  var exercises=[];
  if(r.t1&&!isRecovery(r.t1.type))exercises.push({name:r.t1.row,type:r.t1.type});
  if(r.t2&&!isRecovery(r.t2.type))exercises.push({name:r.t2.row,type:r.t2.type});
  if(r.t3&&!isRecovery(r.t3.type))exercises.push({name:r.t3.row,type:r.t3.type});
  if(!exercises.length)return'<div id="refinePanel" style="display:none"></div>';

  var cols=exercises.map(function(ex){
    var typePrimary=parseList(ex.type)[0]||'';
    return'<div class="refine-group" data-exercise="'+ex.name+'" data-type="'+typePrimary+'" data-selected="">'
      +'<div class="refine-group-label">'+ex.name+'</div>'
      +'<div class="refine-opt" data-val="exercise" onclick="selectRefineOpt(this)">'
      +'<span class="refine-opt-text">Exclude this exercise</span>'
      +'<span class="refine-tick">&#10003;</span>'
      +'</div>'
      +'<div class="refine-opt" data-val="type" onclick="selectRefineOpt(this)">'
      +'<span class="refine-opt-text refine-opt-muted">Exclude '+typePrimary+' exercises</span>'
      +'<span class="refine-tick refine-tick-muted">&#10003;</span>'
      +'</div>'
      +'</div>';
  });

  var inner=cols.join('<div class="refine-divider"></div>');
  return'<div id="refinePanel" style="display:none">'
    +'<div class="refine-cols">'+inner+'</div>'
    +'<div class="refine-footer">'
    +'<button class="refine-regen-btn" onclick="regenerate()">Regenerate</button>'
    +'</div>'
    +'</div>';
}

function toggleRefine(){
  var panel=document.getElementById('refinePanel');
  var btn=document.getElementById('refineBtn');
  var open=panel.style.display==='block';
  panel.style.display=open?'none':'block';
  btn.classList.toggle('refine-btn-active',!open);
}

function selectRefineOpt(opt){
  var group=opt.closest('.refine-group');
  var selVal=group.getAttribute('data-selected');
  var thisVal=opt.getAttribute('data-val');
  group.querySelectorAll('.refine-opt').forEach(function(o){
    o.querySelector('.refine-tick').style.opacity='0';
    o.querySelector('.refine-opt-text').style.opacity='1';
  });
  if(selVal===thisVal){
    group.setAttribute('data-selected','');
  }else{
    group.setAttribute('data-selected',thisVal);
    opt.querySelector('.refine-tick').style.opacity='1';
    opt.querySelector('.refine-opt-text').style.opacity='0.45';
  }
}

function makeTitle(r){var p=[r.t1.row];if(r.t2)p.push(r.t2.row);p.push(r.fmt);return p.join(' - ');}
