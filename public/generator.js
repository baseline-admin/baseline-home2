/* ============================================================
   BASELINE — generator.js
   Workout generation and result rendering.
   Depends on: app.js
   ============================================================ */

var FORMAT_MAP = {
  'AM':['AMRAP 16','AMRAP 18','AMRAP 20'],'FT1':['For Time'],'FT3':['3 Rounds For Time'],
  'FT4':['4 Rounds For Time'],'FT6':['6 Rounds For Time'],'FT8':['8 Rounds For Time'],
  'EM1':['EMOM 10m','EMOM 12m'],'EM2':['E2MOM 16m','E2MOM 20m'],
  'EM3':['E3MOM 15m','E3MOM 17m'],'EM4':['E4MOM 16m','E4MOM 20m'],'EM5':['E5MOM 15m','E5MOM 20m']
};
var T3_TRIGGER_COLS = ['AM','FT3','FT4','EM4','EM5'];

function rnd(a){return a[Math.floor(Math.random()*a.length)];}
function pickN(arr,n){var p=arr.slice(),r=[];n=Math.min(n,p.length);for(var i=0;i<n;i++){var x=Math.floor(Math.random()*p.length);r.push(p.splice(x,1)[0]);}return r;}
function parseRange(s){if(!s||!s.trim())return null;var p=s.split('/');if(p.length!==3)return null;var a=parseFloat(p[0]),b=parseFloat(p[1]),c=parseFloat(p[2]);if(isNaN(a)||isNaN(b)||isNaN(c)||c<=0||b<a)return null;var o=[];for(var n=a;n<=b+0.0001;n+=c)o.push(Math.round(n));return rnd(o);}
function parseList(s){if(!s||!s.trim()||s.trim().toUpperCase()==='NONE')return[];return s.split(',').map(function(x){return x.trim();}).filter(function(x){return x!=='';});}
function anyMatch(et,al){if(!al.length)return true;for(var i=0;i<al.length;i++){if(et.indexOf(al[i])!==-1)return true;}return false;}
function getFormat(col){var o=FORMAT_MAP[col];return o?rnd(o):col;}
function isUni(ubVal){return(ubVal||'').toString().trim().toUpperCase()==='U';}

async function loadSheetData(){
  try{
    var r=await fetch('/api/sheet-data');
    if(!r.ok)throw new Error();
    State.sheetData=await r.json();
    var sel=document.getElementById('promptSelect');
    sel.innerHTML=State.sheetData.prompts.map(function(p){return'<option value="'+p+'">'+p+'</option>';}).join('');
    sel.disabled=false;document.getElementById('timeSelect').disabled=false;document.getElementById('genBtn').disabled=false;
  }catch(e){
    document.getElementById('output').innerHTML='<div class="state-msg">Could not load workout data. Please refresh.</div>';
  }
}

function generate(){
  var prompt=document.getElementById('promptSelect').value;
  var ts=document.getElementById('timeSelect').value;
  var nAZ=ts==='60mins'?3:ts==='45mins'?2:1;
  var d=State.sheetData,pRule=d.promptRules[prompt];
  if(!pRule){alert('No rule for: '+prompt);return;}
  var t1RL=parseList(pRule.allowedRows),t1CL=parseList(pRule.allowedCols),elig=[];
  d.t1Rows.forEach(function(row){
    if(t1RL.length&&t1RL.indexOf(row)===-1)return;
    d.t1Cols.forEach(function(col){
      if(t1CL.length&&t1CL.indexOf(col)===-1)return;
      var v=(d.t1Data[row]||{})[col];if(!v||!v.trim())return;
      elig.push({row:row,col:col,val:v});
    });
  });
  if(!elig.length){alert('No eligible cells for: '+prompt);return;}
  var t1=rnd(elig),t1n=parseRange(t1.val),f=getFormat(t1.col);
  var t1Type=(d.t1TypeData||{})[t1.row]||'',t1UB=(d.t1UBData||{})[t1.row]||'B';
  var t1T=parseList(t1Type),aT2=[],hasT2=false;
  t1T.forEach(function(t){if(d.typePairingRules&&d.typePairingRules[t]!==undefined){hasT2=true;parseList(d.typePairingRules[t]).forEach(function(r){if(aT2.indexOf(r)===-1)aT2.push(r);});}});
  var t2=null,t2n=null,t2type='',t2ub='B';
  if(hasT2&&aT2.length){
    var t2e=[];
    (d.t2Rows||[]).forEach(function(row){var et=parseList((d.t2TypeData||{})[row]||'');if(!anyMatch(et,aT2))return;var v=(d.t2Data[row]||{})[t1.col];if(!v||!v.trim())return;t2e.push({row:row,col:t1.col,val:v,types:(d.t2TypeData||{})[row]||'',ub:(d.t2UBData||{})[row]||'B'});});
    if(t2e.length){t2=rnd(t2e);t2n=parseRange(t2.val);t2type=t2.types;t2ub=t2.ub;}
  }
  var t3=null,t3n=null,t3type='',t3ub='B';
  if(T3_TRIGGER_COLS.indexOf(t1.col)!==-1&&t2&&d.t3Rows&&d.t3Rows.length){
    var t2T=parseList(t2type),aT3=[];
    t2T.forEach(function(t){if(d.t3PairingRules&&d.t3PairingRules[t]!==undefined){parseList(d.t3PairingRules[t]).forEach(function(r){if(aT3.indexOf(r)===-1)aT3.push(r);});}});
    var t3e=[];
    (d.t3Rows||[]).forEach(function(row){var et=parseList((d.t3TypeData||{})[row]||'');if(aT3.length&&!anyMatch(et,aT3))return;var v=(d.t3Data&&d.t3Data[row])?d.t3Data[row][t1.col]:'';if(!v||!v.trim())return;t3e.push({row:row,col:t1.col,val:v,types:(d.t3TypeData||{})[row]||'',ub:(d.t3UBData||{})[row]||'B'});});
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
  var h=buildResults(State.lastResult);
  h+='<div class="save-area"><button class="save-btn" id="saveBtn" onclick="saveWorkout()">Save workout</button><span class="save-msg" id="saveMsg"></span></div>';
  document.getElementById('output').innerHTML=h;
}

function buildResults(r){
  var ec=function(type,label,name,col,reps,ub){var es=isUni(ub)?'<div class="card-each-side">each side</div>':'';return'<div class="exercise-card '+type+'"><div class="card-label '+type+'">'+label+'</div><div class="card-exercise">'+name+'</div>'+(col?'<div class="card-col">'+col+'</div>':'')+'<div class="card-reps">'+(reps!==null&&reps!==undefined?reps:'—')+'</div>'+es+'</div>';};
  var ac=function(type,label,name,reps,ub,rounds){var es=isUni(ub)?'<div class="acc-each-side">each side</div>':'';var rs=rounds&&parseInt(rounds)>1?'<div class="acc-rounds">x'+rounds+' rounds</div>':'';return'<div class="acc-card '+type+'"><div class="card-label '+type+'">'+label+'</div><div class="acc-name">'+name+'</div><div class="acc-reps">'+(reps!==null&&reps!==undefined?reps:'—')+'</div>'+es+rs+'</div>';};
  var taC=r.taP.map(function(p,i){return ac('ta','Conditioning '+(i+1),p.name,parseRange(p.val),p.ub,p.rounds);}).join('');
  var tzC=r.tzP.map(function(p,i){return ac('tz','Mobility '+(i+1),p.name,parseRange(p.val),p.ub,p.rounds);}).join('');
  var h='<div class="results">';
  if(r.taP.length)h+='<div class="results-section"><div class="section-label">Conditioning</div><div class="acc-grid">'+taC+'</div></div><div class="divider"></div>';
  h+='<div class="results-section"><div class="section-label">Main Work</div><div class="format-badge">'+r.fmt+'</div><div class="exercise-pair">'+ec('t1','Exercise 1',r.t1.row,r.t1.col,r.t1n,r.t1.ub)+(r.t2?ec('t2','Exercise 2',r.t2.row,r.t2.col,r.t2n,r.t2.ub):'<div class="exercise-card t2"><div class="card-label t2">Exercise 2</div><div class="card-empty">No pair for this selection</div></div>')+'</div>'+(r.t3?'<div class="exercise-pair" style="margin-top:12px">'+ec('t3','Exercise 3',r.t3.row,r.t3.col,r.t3n,r.t3.ub)+'<div></div></div>':'')+'</div>';
  if(r.tzP.length)h+='<div class="divider"></div><div class="results-section"><div class="section-label">Mobility</div><div class="acc-grid">'+tzC+'</div></div>';
  h+='</div>';return h;
}

function makeTitle(r){var p=[r.t1.row];if(r.t2)p.push(r.t2.row);p.push(r.fmt);return p.join(' — ');}
