const $ = s => document.querySelector(s);
const log = $('#log'), input = $('#input'), sendBtn = $('#send'), statusEl = $('#status'), ttsToggle=$('#ttsToggle');
const char = $('#char'), head = $('#head'), mouth = $('#mouth'), mouthInner = $('#mouthInner');
const eyeL = $('#eyeL'), eyeR = $('#eyeR'), lidL = $('#lidL'), lidR = $('#lidR');
const pupilL = $('#pupilL'), pupilR = $('#pupilR');
const browL = $('#browL'), browR = $('#browR');
const armL = $('#armL'), armR = $('#armR');

let talking = false;
let talkTimer = null;
let blinkTimer = null;
let blinkDelay = 2600, gazeHoldUntil = 0;

// -- idle ---
gsap.to(char, { y: -4, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });

// eye dart
setInterval(()=>{
  if(talking) return;
  const x = (Math.random()-0.5)*10;
  const y = (Math.random()-0.5)*4;
  gsap.to([pupilL,pupilR], { x, y, duration: 0.35, ease: "power2.out" });
}, 1800);

// blink loop
function blink(){
  gsap.to([lidL,lidR], { y: "0%", duration: 0.06, ease:"power2.in" });
  gsap.to([lidL,lidR], { y: "-100%", duration: 0.08, delay: 0.09, ease:"power2.out" });
  blinkTimer = setTimeout(blink, blinkDelay + Math.random()*1200);
}
gsap.set([lidL,lidR], { y:"-100%" });
blink();

// -- emotions -- ponytail: expanded params so neutral isn't stuck as concerned
const emotions = {
  neutral: ()=>{ gsap.to(browL,{y:-2,rotation:-4,duration:.35}); gsap.to(browR,{y:-2,rotation:4,duration:.35}); gsap.to(mouth,{width:48,height:18,borderRadius:12,duration:.3}); gsap.to('.cheek',{opacity:.35,duration:.3}); gsap.to(head,{rotation:0,y:0,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:1,scaleX:1,duration:.25}); gsap.to([pupilL,pupilR],{y:0,duration:.2}); },
  happy: ()=>{ gsap.to(browL,{y:-7,rotation:-10,duration:.3}); gsap.to(browR,{y:-7,rotation:10,duration:.3}); gsap.to(mouth,{width:68,height:26,borderRadius:14,duration:.3}); gsap.to('.cheek',{opacity:.9,duration:.3}); gsap.to(head,{rotation:1,y:-2,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.92,scaleX:1.04,duration:.25}); },
  excited: ()=>{ gsap.to(browL,{y:-10,rotation:-14,duration:.25}); gsap.to(browR,{y:-10,rotation:14,duration:.25}); gsap.to(mouth,{width:78,height:34,borderRadius:16,duration:.25}); gsap.to('.cheek',{opacity:1,duration:.3}); windUp(.12); setTimeout(()=>popUp(8),130); gsap.to([eyeL,eyeR],{scaleY:0.95,duration:.2}); },
  sad: ()=>{ gsap.to(browL,{y:5,rotation:16,duration:.3}); gsap.to(browR,{y:5,rotation:-16,duration:.3}); gsap.to(mouth,{width:44,height:14,borderRadius:8,duration:.3}); gsap.to('.cheek',{opacity:.15,duration:.3}); gsap.to(head,{rotation:-2,y:2,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.96,duration:.3}); },
  angry: ()=>{ gsap.to(browL,{y:3,rotation:-20,duration:.2}); gsap.to(browR,{y:3,rotation:20,duration:.2}); gsap.to(mouth,{width:54,height:20,borderRadius:4,duration:.25}); gsap.to('.cheek',{opacity:.65,duration:.3}); gsap.to(head,{x:-2, duration:.05, yoyo:true, repeat:6}); gsap.to([eyeL,eyeR],{scaleY:0.9,scaleX:1.08,duration:.2}); },
  surprised: ()=>{ gsap.to(browL,{y:-13,rotation:0,duration:.2}); gsap.to(browR,{y:-13,rotation:0,duration:.2}); gsap.to(mouth,{width:40,height:42,borderRadius:50,duration:.2}); headBoing(); gsap.to([eyeL,eyeR],{scale:1.12,scaleY:1.12,duration:.2}); setTimeout(()=>gsap.to([eyeL,eyeR],{scale:1,scaleY:1,duration:.3}),450); },
  confused: ()=>{ gsap.to(browL,{y:-7,rotation:-8,duration:.3}); gsap.to(browR,{y:3,rotation:8,duration:.3}); gsap.to(mouth,{width:46,height:16,borderRadius:8,duration:.3}); gsap.to([eyeL,eyeR],{scale:1,duration:.3}); },
  smug: ()=>{ gsap.to(browL,{y:-3,rotation:-6,duration:.3}); gsap.to(browR,{y:1,rotation:2,duration:.3}); gsap.to(mouth,{width:62,height:14,borderRadius:12,duration:.3}); gsap.to('.cheek',{opacity:.55,duration:.3}); gsap.to(head,{rotation:2,duration:.3}); },
  shy: ()=>{ gsap.to(browL,{y:-1,rotation:-2,duration:.3}); gsap.to(browR,{y:-1,rotation:2,duration:.3}); gsap.to(mouth,{width:36,height:16,borderRadius:10,duration:.3}); gsap.to('.cheek',{opacity:1,duration:.3}); gsap.to(head,{rotation:-3,y:1,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.94,duration:.3}); },
  sleepy: ()=>{ gsap.to(browL,{y:2,rotation:0,duration:.3}); gsap.to(browR,{y:2,rotation:0,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.62,duration:.3}); gsap.to(mouth,{width:34,height:22,borderRadius:50,duration:.3}); gsap.to('.cheek',{opacity:.4,duration:.3}); },
  suspicious: ()=>{ gsap.to(browL,{y:-10,rotation:-10,duration:.25}); gsap.to(browR,{y:2,rotation:2,duration:.25}); gsap.to([pupilL,pupilR],{x:7,duration:.25}); gsap.to(mouth,{width:50,height:12,borderRadius:8,duration:.25}); gsap.to(head,{rotation:2,duration:.3}); gsap.to('.cheek',{opacity:.3,duration:.3}); },
  scared: ()=>{ gsap.to(browL,{y:-12,rotation:0,duration:.2}); gsap.to(browR,{y:-12,rotation:0,duration:.2}); gsap.to([eyeL,eyeR],{scale:1.15,scaleY:1.15,duration:.2}); gsap.to(mouth,{width:36,height:30,borderRadius:50,duration:.2}); gsap.to('.cheek',{opacity:.2,duration:.3}); gsap.to(head,{x:-2,duration:.06,yoyo:true,repeat:5}); setTimeout(()=>gsap.to([eyeL,eyeR],{scale:1,scaleY:1,duration:.3}),600); },
  proud: ()=>{ gsap.to(browL,{y:-6,rotation:-6,duration:.3}); gsap.to(browR,{y:-6,rotation:6,duration:.3}); gsap.to(mouth,{width:66,height:18,borderRadius:12,duration:.3}); gsap.to('.cheek',{opacity:.6,duration:.3}); gsap.to(head,{rotation:-1,y:-3,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:1,duration:.25}); },
  bored: ()=>{ gsap.to(browL,{y:0,rotation:0,duration:.3}); gsap.to(browR,{y:0,rotation:0,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.7,duration:.3}); gsap.to(mouth,{width:44,height:10,borderRadius:8,duration:.3}); gsap.to(head,{rotation:4,y:2,duration:.3}); gsap.to('.cheek',{opacity:.25,duration:.3}); },
}
function setEmotion(e){
  (emotions[e]||emotions.neutral)();
  blinkDelay=blinkMood[e]||2600;
  statusEl.textContent = e + " • " + (talking ? "talking" : "idle");
}

// -- cartoon physics: anticipation, squash/stretch, overshoot. Global pass — reshapes
// tweens only, never delays the audio clock. Short bursts so the idle bob reasserts after.
function windUp(dur=0.14){ gsap.to(char,{scaleY:.9,scaleX:1.07,duration:dur,ease:"power2.in"}); return dur; }
function popUp(h=8){ gsap.timeline().to(char,{scaleY:1.08,scaleX:.94,y:-h,duration:.16,ease:"power2.out"}).to(char,{scaleY:1,scaleX:1,y:0,duration:.4,ease:"elastic.out(1,0.45)"}); }
function headBoing(){ gsap.timeline().to(head,{scaleY:.88,scaleX:1.1,duration:.1,ease:"power2.in"}).to(head,{scaleY:1.06,scaleX:.95,duration:.14}).to(head,{scaleY:1,scaleX:1,duration:.35,ease:"elastic.out(1,0.4)"}); }

// -- sfx: synthesized comedic stingers, no assets. Fired from the sfx: channel. --
function sfxCtx(){
  try{
    if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
    return audioCtx;
  }catch{ return null; }
}
function sfxPlay(name){
  const ctx=sfxCtx(); if(!ctx) return;
  try{
    const t=ctx.currentTime;
    const tone=(f0,f1,dur,type="sine",vol=.25)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type=type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
      g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+dur+.02);
    };
    const noise=(dur=.12,vol=.3,ff=2000)=>{
      const n=Math.floor(ctx.sampleRate*dur), b=ctx.createBuffer(1,n,ctx.sampleRate), d=b.getChannelData(0);
      for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
      const s=ctx.createBufferSource(); s.buffer=b;
      const f=ctx.createBiquadFilter(); f.type="bandpass"; f.frequency.value=ff;
      const g=ctx.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t);
    };
    if(name==="pop") tone(600,200,.09,"sine",.3);
    else if(name==="boing"){ tone(300,80,.28,"triangle",.3); tone(150,320,.2,"sine",.15); }
    else if(name==="rimshot"){ noise(.1,.35,2500); tone(800,700,.06,"square",.12); setTimeout(()=>{ try{ noise(.14,.4,1800); tone(500,400,.09,"square",.15); }catch{} },140); }
    else if(name==="scratch"){ tone(400,100,.18,"sawtooth",.2); setTimeout(()=>sfxPlay("scratch2"),180); }
    else if(name==="scratch2"){ const o=ctx.createOscillator(), g=ctx.createGain(), t2=ctx.currentTime; o.type="sawtooth"; o.frequency.setValueAtTime(100,t2); o.frequency.exponentialRampToValueAtTime(350,t2+.2); g.gain.setValueAtTime(.2,t2); g.gain.exponentialRampToValueAtTime(.001,t2+.22); o.connect(g); g.connect(ctx.destination); o.start(t2); o.stop(t2+.25); }
  }catch(e){ console.warn('sfx failed',name,e); }
}

// -- gestures --
// gesture player: name[:intensity[:speed]] — intensity scales amplitude, speed scales time
function gesturePlay(payload){
  const parts=String(payload||"").split(":");
  const name=parts[0];
  const k=Math.max(.4,Math.min(2.5,parseFloat(parts[1])||1));
  const tm=parts[2]==="fast"?.55:parts[2]==="slow"?1.7:1;
  const D=(d)=>d*tm, A=(deg)=>deg*k;
  if(name==="thumbsup"){
    gsap.to(armR,{rotation:-A(150), duration:D(.3), ease:"back.out(1.5)"});
    gsap.to(head,{y:5, duration:D(.14), yoyo:true, repeat:1, delay:D(.3)});
    setTimeout(()=>gsap.to(armR,{rotation:18, duration:D(.4)}), D(800));
  } else if(name==="bow"){
    gsap.to(head,{y:14, duration:D(.35), ease:"power2.in"});
    gsap.to(armL,{rotation:-30, duration:D(.35)}); gsap.to(armR,{rotation:30, duration:D(.35)});
    setTimeout(()=>{ gsap.to(head,{y:0,duration:D(.4),ease:"elastic.out(1,0.5)"}); gsap.to(armL,{rotation:-18,duration:D(.4)}); gsap.to(armR,{rotation:18,duration:D(.4)}); }, D(650));
  } else if(name==="jump"){
    windUp(D(.12)); setTimeout(()=>popUp(6+8*k), D(130));
  } else if(name==="scratch"){
    gsap.to(armR,{rotation:-A(120), duration:D(.3)});
    gsap.to(head,{rotation:6, duration:D(.25)});
    gsap.to(head,{x:3, duration:D(.09), yoyo:true, repeat:5, delay:D(.3)});
    setTimeout(()=>{ gsap.to(armR,{rotation:18,duration:D(.4)}); gsap.to(head,{rotation:0,x:0,duration:D(.3)}); }, D(900));
  } else {
    doGesture(name);
  }
}
function doGesture(g){
  if(g==="idle"){
    gsap.to(armL,{rotation:-18,y:0,duration:.5,ease:"sine.out"});
    gsap.to(armR,{rotation:18,y:0,duration:.5,ease:"sine.out"});
    gsap.to(head,{rotation:0,y:0,x:0,duration:.5,ease:"sine.out"});
    setEmotion('neutral');
    clearTimeout(blinkTimer); blink();
    return;
  }
  if(g==="wave"){
    gsap.to(armR,{rotation:-110, duration:.35, ease:"back.out(1.5)"});
    gsap.to(armR,{rotation:-60, duration:.25, delay:.35});
    gsap.to(armR,{rotation:-110, duration:.25, delay:.6});
    gsap.to(armR,{rotation:18, duration:.4, delay:1});
  } else if(g==="shrug"){
    gsap.to(armL,{rotation:-70, y:-10, duration:.25});
    gsap.to(armR,{rotation:70, y:-10, duration:.25});
    gsap.to(armL,{rotation:-18, y:0, duration:.4, delay:.6, ease:"back.out(1.2)"});
    gsap.to(armR,{rotation:18, y:0, duration:.4, delay:.6, ease:"back.out(1.2)"});
  } else if(g==="nod"){
    gsap.to(head,{y:10, duration:.12, yoyo:true, repeat:3});
    setTimeout(()=>gsap.to(head,{y:0,duration:.3,ease:"elastic.out(1,0.5)"}),550);
  } else if(g==="point"){
    gsap.to(armR,{rotation:-85, duration:.3});
    setTimeout(()=>gsap.to(armR,{rotation:18, duration:.4}), 900);
  } else if(g==="dance"){
    windUp(.15);
    gsap.to(char,{rotation:-4, duration:.18, yoyo:true, repeat:5, ease:"sine.inOut", delay:.15});
    gsap.to([armL,armR],{rotation:-90, duration:.18, yoyo:true, repeat:5, delay:.15});
    gsap.to(armL,{rotation:-18, duration:.3, delay:1.25});
    gsap.to(armR,{rotation:18, duration:.3, delay:1.25});
    setTimeout(()=>popUp(6),1250);
  } else if(g==="facepalm"){
    gsap.to(armR,{rotation:-140, duration:.35, ease:"power2.out"});
    setTimeout(()=>gsap.to(armR,{rotation:18, duration:.4}), 900);
    setTimeout(()=>gsap.to(head,{y:4,duration:.14,yoyo:true,repeat:1}), 950); // follow-through
  }
}

// -- tag handler registry: grammar v2 dispatch (emotion|gesture legacy + new channels) --
function setGaze(dir){
  const P={left:[-9,0],right:[9,0],up:[0,-5],down:[0,4],center:[0,0],camera:[0,0]};
  const p=P[dir]||P.center;
  gazeHoldUntil=Date.now()+3000;
  gsap.to([pupilL,pupilR],{x:p[0],y:p[1],duration:.25,ease:"power2.out"});
}
const fxTear=$('#fxTear'), fxSweat=$('#fxSweat'), fxPuff=$('#fxPuff');
let fxTimer=null;
function fxShow(el,on,ms=2600){
  gsap.to(el,{opacity:on?1:0,duration:.2});
  if(on&&el===fxTear) gsap.fromTo(el,{y:-4},{y:12,duration:ms/1000,ease:"power1.in"});
  if(on&&el===fxPuff) gsap.fromTo(el,{scale:.5},{scale:1.15,duration:.25,ease:"back.out(2)"});
  clearTimeout(fxTimer);
  if(on) fxTimer=setTimeout(()=>gsap.to([fxTear,fxSweat,fxPuff],{opacity:0,duration:.3}),ms);
}
function faceBrows(v){
  if(v==="raise"){ gsap.to(browL,{y:-11,rotation:-8,duration:.25}); gsap.to(browR,{y:-11,rotation:8,duration:.25}); }
  else if(v==="lower"){ gsap.to(browL,{y:4,rotation:-4,duration:.25}); gsap.to(browR,{y:4,rotation:4,duration:.25}); }
  else if(v==="furrow"){ gsap.to(browL,{y:3,rotation:-18,duration:.2}); gsap.to(browR,{y:3,rotation:18,duration:.2}); }
  else if(v==="one"){ gsap.to(browL,{y:-10,rotation:-10,duration:.25}); gsap.to(browR,{y:2,rotation:2,duration:.25}); }
}
const stage=$('#stage'), chemTrail=$('.chem-trail');
let stageTimer=null;
function stageRestore(ms=2500){
  clearTimeout(stageTimer);
  stageTimer=setTimeout(()=>{
    gsap.to(char,{scale:1,x:0,duration:.4,ease:"sine.out"});
    if(stage) gsap.to(stage,{scale:1,x:0,duration:.4,ease:"sine.out"});
    if(stage) gsap.to(stage,{filter:"brightness(1)",duration:.4});
    if(chemTrail) chemTrail.textContent="SOUTH PARK AGENT";
  },ms);
}
const tagHandlers={
  stage:(payload)=>{ for(const part of String(payload).split(",")){ const kv=part.split("="); const k=kv[0], v=kv[1];
    if(k==="lean"&&v!=="off") gsap.to(char,{scale:1.12,duration:.35,ease:"power2.out"});
    else if(k==="zoom"&&v!=="off"){ if(stage) gsap.to(stage,{scale:1.07,duration:.35,ease:"power2.out"}); }
    else if(k==="shake") gsap.to(char,{x:6,duration:.05,yoyo:true,repeat:9,onComplete:()=>gsap.set(char,{x:0})});
    else if(k==="dim"){ if(stage) gsap.to(stage,{filter:"brightness(.82)",duration:.4}); }
    else if(k==="caption"&&v&&chemTrail) chemTrail.textContent=v.replace(/_/g," ").slice(0,40);
    stageRestore();
  } },
  face:(payload)=>{ for(const part of String(payload).split(",")){ const kv=part.split("="); const k=kv[0], v=kv[1];
    if(k==="gaze"&&v) setGaze(v);
    else if(k==="brows"&&v) faceBrows(v);
    else if(k==="blink"&&v){ if(v==="fast") blinkDelay=900; else if(v==="slow") blinkDelay=4200; }
    else if(k==="tear") fxShow(fxTear, v!=="off");
    else if(k==="sweat") fxShow(fxSweat, v!=="off");
    else if(k==="puff") fxShow(fxPuff, v!=="off");
  } },
  sfx:(name)=>sfxPlay(String(name||"").split(",")[0]),
};
function fireSlot(s){
  if(!s||s.fired) return; s.fired=true;
  if(s.type==="emotion") setEmotion(s.value);
  else if(s.type==="gesture") setTimeout(()=>gesturePlay(s.value),120);
  else if(s.type==="tag"){ const fn=tagHandlers[s.channel]; if(fn){ try{fn(s.value);}catch(e){console.warn('tag handler failed',s.channel,e);} } }
}

// -- living eyes: cursor tracking when idle, mood-driven blink rate --
const blinkMood={surprised:900, excited:1600, sleepy:4200, sad:3200, scared:850, bored:3600};
window.addEventListener('mousemove',(e)=>{
  if(talking || Date.now()<gazeHoldUntil) return;
  try{
    const r=char.getBoundingClientRect();
    const dx=Math.max(-9,Math.min(9,(e.clientX-(r.left+r.width/2))/28));
    const dy=Math.max(-5,Math.min(5,(e.clientY-(r.top+r.height/3))/34));
    gsap.to([pupilL,pupilR],{x:dx,y:dy,duration:.3,ease:"power2.out"});
  }catch{}
});

// -- lip sync (fake + audio-driven) --
let audioEl=null, audioCtx=null, analyser=null, audioSrc=null, rafId=null;
function flapTick(){
  if(!talking || audioEl) return; // audio drives mouth when active
  const open = Math.random() > 0.35;
  const h = open ? 18 + Math.random()*22 : 10 + Math.random()*8;
  const w = open ? 54 + Math.random()*18 : 64;
  gsap.to(mouth,{ height:h, width:w, duration:0.07, ease:"power1.out" });
  if(Math.random()>0.85) gsap.to([pupilL,pupilR],{ y: (Math.random()-0.5)*2, duration:0.06 });
  talkTimer = setTimeout(flapTick, 70 + Math.random()*90);
}
function startTalking(){
  if(talking) return;
  talking = true;
  statusEl.classList.add('talking');
  statusEl.textContent = "talking";
  flapTick();
}
function startAudioLipSync(audio){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
    try{ audioSrc?.disconnect(); }catch{}
    try{ analyser?.disconnect(); }catch{}
    analyser = audioCtx.createAnalyser(); analyser.fftSize=256;
    audioSrc = audioCtx.createMediaElementSource(audio);
    audioSrc.connect(analyser); analyser.connect(audioCtx.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick=()=>{
      if(!talking || audio.paused) return;
      if(vowelClock) return; // measured mouth shapes own the mouth when timing exists
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a,b)=>a+b,0)/data.length; // 0-255
      const norm = Math.min(1, avg/90); // sensitivity
      const h = 14 + norm*30 + Math.random()*4;
      const w = 68 - norm*10;
      gsap.to(mouth,{ height:h, width:w, duration:0.06, overwrite:true });
      if(norm>0.45) gsap.to([pupilL,pupilR],{ y: (Math.random()-0.5)*1.5, duration:0.05 });
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }catch(e){ console.warn('audio analyser failed',e); }
}
// vowel mouth: aligned chars drive shapes; analyser yields whenever timing exists
let vowelClock=false;
const mouthShape=(ch)=>{
  const c=String(ch||"").toLowerCase();
  if("ae".includes(c)) return [70,30];
  if("ou".includes(c)) return [46,30];
  if("iy".includes(c)) return [60,14];
  if("mbp".includes(c)) return [48,8];
  if("fv".includes(c)) return [54,12];
  if("sz".includes(c)) return [52,10];
  if("tdnlrkgcjxqh".includes(c)) return [58,16];
  return [56,14];
};
function stopTalking(){
  vowelClock=false;
  talking = false;
  clearTimeout(talkTimer);
  if(rafId) cancelAnimationFrame(rafId);
  if(audioEl && !audioEl.paused) { try{ audioEl.pause(); }catch{} }
  statusEl.classList.remove('talking');
  gsap.to(mouth,{ height:28, width:64, duration:.22 });
  statusEl.textContent = "idle \u2022 blinking";
}
// -- chat ---
function addBubble(text, who){
  const d = document.createElement('div');
  d.className = `bubble ${who}`;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

let sessionId = localStorage.getItem('sessionId') || (Math.random().toString(36).slice(2) + Date.now().toString(36));
localStorage.setItem('sessionId', sessionId);

// --- elevenlabs flow: NDJSON {audio b64, char timings}, reveal + tags driven by REAL timestamps ---
// voice mood: sentence emotion -> elevenlabs voice settings, explicit voice: tags override
const voiceMood={
  smug:{stability:.6,style:.7}, sad:{stability:.8,style:.3}, excited:{stability:.4,style:.8},
  angry:{stability:.35,style:.9}, happy:{stability:.5,style:.6}, surprised:{stability:.45,style:.75},
  sleepy:{stability:.85,style:.2}, shy:{stability:.7,style:.35}, scared:{stability:.4,style:.8},
  proud:{stability:.6,style:.65}, bored:{stability:.8,style:.25}, confused:{stability:.6,style:.4},
};
function voiceSettingsFor(item){
  const out={...(voiceMood[item.emotion]||{})};
  for(const s of (item.tagSlots||[])){
    if(s.type==="tag"&&s.channel==="voice"){
      for(const part of String(s.value).split(",")){ const kv=part.split("="); const f=parseFloat(kv[1]);
        if((kv[0]==="style"||kv[0]==="stability"||kv[0]==="similarity")&&isFinite(f)) out[kv[0]==="similarity"?"similarity_boost":kv[0]]=Math.max(0,Math.min(1,f)); }
    }
  }
  return Object.keys(out).length?out:null;
}
function startElFlow(text, settings){
  const h={events:[], idx:0, done:false, error:null};
  (async()=>{
    try{
      const r=await fetch('/tts/el-flow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings?{text, voice_settings:settings}:{text})});
      if(!r.ok || !r.body) throw new Error('el-flow '+r.status);
      const reader=r.body.getReader(); const dec=new TextDecoder(); let buf=""; let got=false;
      const push=(line)=>{
        let j; try{ j=JSON.parse(line); }catch{ return; }
        h.events.push(j); if(j.a) got=true;
      };
      while(true){
        const {value,done}=await reader.read();
        if(done) break;
        buf+=dec.decode(value,{stream:true});
        const parts=buf.split("\n"); buf=parts.pop();
        for(const p of parts){ if(p.trim()) push(p); }
      }
      if(buf.trim()) push(buf);
      if(!got) throw new Error('empty el audio');
      h.done=true;
    }catch(e){ h.error=e; }
  })();
  return h;
}
const elNext=(h)=>new Promise((res,rej)=>{
  const poll=()=>{
    if(h.idx<h.events.length) return res(h.events[h.idx++]);
    if(h.error) return rej(h.error);
    if(h.done) return res(null);
    setTimeout(poll, 25);
  };
  poll();
});
const b64ToBytes=(b)=>{ const s=atob(b); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; };

async function playElFlow(handle, item, ui){
  const slots=(item.tagSlots||[]).map(s=>({...s, fired:false}));
  const words=[]; const cseq=[]; let cur=null; vowelClock=false;
  const ingest=(chars, starts, ends)=>{
    for(let k=0;k<chars.length;k++){
      const ch=chars[k];
      if(ch===" "||ch==="\n"||ch==="\t"){ if(cur){ words.push(cur); cur=null; } continue; }
      if(!cur) cur={t:"", start:starts[k], end:ends[k]};
      cur.end=ends[k]; cur.t+=ch;
      cseq.push({ch, start:starts[k], end:ends[k]}); vowelClock=true;
    }
  };
  const ms=new MediaSource();
  const audio=new Audio();
  audio.src=URL.createObjectURL(ms);
  audioEl=audio;
  if(rafId) cancelAnimationFrame(rafId);
  return await new Promise((resolve,reject)=>{
    let ended=false, finished=false, started=false, shown=0, sb=null, mi=0;
    const finish=(ok)=>{
      if(finished) return; finished=true;
      ui.clearReveal();
      try{ audio.pause(); }catch{}
      try{ URL.revokeObjectURL(audio.src); }catch{}
      if(audioEl===audio) audioEl=null;
      if(rafId) cancelAnimationFrame(rafId);
      if(!ok){ reject(new Error('el playback failed')); return; }
      for(const s of slots){ if(!s.fired) fireSlot(s); }
      if(cur){ words.push(cur); cur=null; }
      ui.commitItem(item.text);
      if(talking) flapTick();
      resolve();
    };
    audio.onended=()=>{ ended=true; finish(true); };
    audio.onerror=()=>{ finish(started); };
    const fireDue=(t)=>{
      for(const s of slots){
        if(s.fired || !words.length) continue;
        const w = s.w===Infinity? words.length-1 : Math.min(s.w, words.length-1);
        if(w<0 || words[w].start===undefined || words[w].start>t) continue;
        fireSlot(s);
      }
    };
    const renderDue=(t)=>{
      let n=0;
      while(n<words.length && words[n].start!==undefined && words[n].start<=t) n++;
      if(n>shown){ shown=n; ui.renderShown(words.slice(0,n).map(w=>w.t).join(" ")); }
    };
    const mouthDue=(t)=>{
      while(mi<cseq.length && cseq[mi].end!==undefined && cseq[mi].end<t) mi++;
      const c=cseq[mi];
      const [w,h]=(!c||c.start===undefined||t<c.start)?mouthShape(" "):mouthShape(c.ch);
      gsap.to(mouth,{width:w,height:h,duration:.05,overwrite:true});
    };
    const tick=()=>{
      if(ended||finished) return;
      const t=audio.currentTime||0;
      renderDue(t); fireDue(t); mouthDue(t);
      ui.armReveal(setTimeout(tick, 30));
    };
    const appendChunk=(c)=>new Promise((res,rej)=>{
      const done=()=>{ sb.removeEventListener('updateend', done); res(); };
      try{
        if(sb.updating){ sb.addEventListener('updateend', function w(){ sb.removeEventListener('updateend', w); try{ sb.appendBuffer(c); sb.addEventListener('updateend', done); }catch(e){ rej(e); } }); }
        else { sb.appendBuffer(c); sb.addEventListener('updateend', done); }
      }catch(e){ rej(e); }
    });
    const pump=async()=>{
      try{
        while(true){
          if(finished) return;
          const ev=await elNext(handle);
          if(ev===null) break;
          if(finished) return;
          if(ev.a) await appendChunk(b64ToBytes(ev.a));
          if(ev.c && ev.s && ev.e) ingest(ev.c, ev.s, ev.e);
          if(!started){
            started=true;
            try{ await audio.play(); }
            catch(e){ finish(false); return; }
            audio.muted = !(ttsToggle?.checked ?? true); // voice-off keeps clock, reveal, acting
            if(!talking) startTalking();
            statusEl.textContent='speaking...'; statusEl.classList.add('talking');
            startAudioLipSync(audio);
            tick();
          }
        }
        if(cur){ words.push(cur); cur=null; }
        try{ if(ms.readyState==="open") ms.endOfStream(); }catch{}
        setTimeout(()=>{ if(!finished){ ended=true; finish(true); } }, Math.max(6000, ((isFinite(audio.duration)?audio.duration:0)*1000)+3000));
      }catch(e){
        if(!started){ reject(e); return; }
        try{ if(ms.readyState==="open") ms.endOfStream(); }catch{}
      }
    };
    try{
      if(!window.MediaSource || !MediaSource.isTypeSupported('audio/mpeg')) throw new Error('MSE unsupported');
    }catch(e){ reject(e); return; }
    ms.addEventListener('sourceopen', ()=>{ try{ sb=ms.addSourceBuffer('audio/mpeg'); }catch(e){ reject(e); return; } pump(); }, {once:true});
    setTimeout(()=>{ if(!sb && !finished) reject(new Error('MSE open timeout')); }, 8000);
  });
}

let busy = false;
async function send(){
  const msg = input.value.trim();
  if(!msg || busy) return;
  busy = true; sendBtn.disabled = true; input.value="";
  addBubble(msg, "user");
  const botBubble = addBubble("…", "bot");
  botBubble.classList.add('stream');
  statusEl.textContent = "thinking";
  statusEl.classList.add('thinking');
  gsap.to([pupilL,pupilR], { x: 8, duration:.4 });
  setTimeout(()=>gsap.to([pupilL,pupilR], { x: -8, duration:.5 }), 500);
  setTimeout(()=>gsap.to([pupilL,pupilR], { x: 0, duration:.4 }), 1100);

  let queue=[], processing=false, streamDone=false, sentenceBuf="", pendingEmotion=null, pendingGesture=null, pendingSlots=[], displayed="", started=false;
  const SENT_RE = /^[^.!?]*[.!?]+/;
  let revealTimer=null;
  const clearReveal=()=>{ if(revealTimer){ clearTimeout(revealTimer); revealTimer=null; } };
  const armReveal=(id)=>{ revealTimer=id; };
  const renderShown=(shown)=>{ botBubble.textContent=(displayed? displayed+" " : "")+shown; log.scrollTop=log.scrollHeight; };
  const commitItem=(text)=>{ displayed=displayed? displayed+" "+text : text; botBubble.textContent=displayed; log.scrollTop=log.scrollHeight; };
  const ui={renderShown, commitItem, clearReveal, armReveal};
  const speak=async(item)=>{
    const words=item.text.split(/\s+/).filter(Boolean);
    const fireTags=()=>{ if(item.emotion) setEmotion(item.emotion); if(item.gesture) setTimeout(()=>gesturePlay(item.gesture), 180); };
    const fakeSpeak=(totalMs)=>new Promise((res)=>{
      fireTags(); for(const s of (item.tagSlots||[])) if(s.type==="tag") fireSlot({...s});
      if(!talking) startTalking();
      let i=0; renderShown(words[0]||"");
      const step=()=>{ i++; if(i>=words.length){ clearReveal(); commitItem(item.text); res(); return; } renderShown(words.slice(0,i+1).join(" ")); revealTimer=setTimeout(step, totalMs/Math.max(1,words.length)); };
      revealTimer=setTimeout(step, totalMs/Math.max(1,words.length));
    });
    // elevenlabs only: timestamp-driven playback, estimated silent fallback
    const elHandle=item.elFlow ?? startElFlow(item.text, voiceSettingsFor(item));
    try{ await playElFlow(elHandle, item, ui); return; }
    catch(e){ console.warn('el flow failed, silent fallback', e.message); }
    await fakeSpeak(Math.min(5000, Math.max(900, item.text.length*28)));
  };
  const enqueue=(text)=>{
    if(!text.trim()) return;
    queue.push({text: text.trim(), emotion: pendingEmotion, gesture: pendingGesture, tagSlots: pendingSlots});
    pendingEmotion=null; pendingGesture=null; pendingSlots=[];
    if(!processing) drain();
  };
  const drain=async()=>{
    if(processing) return; processing=true;
    while(queue.length>0){
      const item=queue.shift();
      if(!started){ started=true; statusEl.classList.remove('thinking'); botBubble.textContent=""; displayed=""; setEmotion('neutral'); }
      // one-ahead prefetch: start next sentence el-flow while current speaks
      if(queue.length>0){ const nx=queue[0]; if(!nx.elFlow) nx.elFlow=startElFlow(nx.text, voiceSettingsFor(nx)); }
      if(!talking) startTalking();
      await speak(item);
      if(queue.length>0) await new Promise(r=> setTimeout(r, 120));
    }
    processing=false;
    if(streamDone && queue.length===0 && sentenceBuf.trim()){
      enqueue(sentenceBuf); sentenceBuf="";
      if(queue.length>0) drain();
      else finalize();
    } else if(streamDone && queue.length===0){
      finalize();
    }
  };
  let finished=false;
  const finalize=()=>{
    if(finished) return; finished=true;
    clearReveal();
    botBubble.classList.remove('stream');
    stopTalking();
    statusEl.textContent='idle \u2022 blinking';
    statusEl.classList.remove('talking','thinking');
    setTimeout(()=>setEmotion('neutral'), 900);
  };

  try{
    const res = await fetch('/chat/stream', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: msg, session_id: sessionId })});
    if(!res.ok || !res.body) throw new Error("no stream");
    const reader=res.body.getReader(); const decoder=new TextDecoder();
    let buf="";
    while(true){
      const {value, done} = await reader.read();
      if(done) break;
      buf+=decoder.decode(value,{stream:true});
      const parts=buf.split("\n\n"); buf=parts.pop();
      for(const part of parts){
        if(!part.startsWith("data: ")) continue;
        let j; try{ j=JSON.parse(part.slice(6)); }catch{ continue; }
        if(j.type==="token"){
          sentenceBuf+=j.content;
          // extract complete sentences
          let m;
          while((m=sentenceBuf.match(SENT_RE))){
            const sentence=m[0];
            enqueue(sentence);
            sentenceBuf=sentenceBuf.slice(sentence.length);
          }
          // if buffer grows very long without punctuation (e.g., 180 chars), force chunk
          if(sentenceBuf.length>220){
            const cut=sentenceBuf.lastIndexOf(' ');
            if(cut>80){ enqueue(sentenceBuf.slice(0,cut)); sentenceBuf=sentenceBuf.slice(cut); }
          }
        } else if(j.type==="emotion" || j.type==="gesture" || (j.type||"").startsWith("tag:")){
          // word index at arrival => exact firing position on the el timestamp clock
          const w=sentenceBuf.split(/\s+/).filter(Boolean).length;
          if((j.type||"").startsWith("tag:")){
            pendingSlots.push({w, type:"tag", channel:j.type.slice(4), value:j.value});
          } else {
            pendingSlots.push({w, type:j.type, value:j.value});
            if(j.type==="emotion") pendingEmotion=j.value; else pendingGesture=j.value;
          }
        }
        else if(j.type==="error"){ if(!started){ botBubble.textContent=""; started=true; } displayed+=(displayed?" ":"")+"[error: "+j.content+"]"; botBubble.textContent=displayed; }
      }
    }
    // flush any leftover buf as token
    if(buf.startsWith("data: ")){ try{ const j=JSON.parse(buf.slice(6)); if(j.type==="token") sentenceBuf+=j.content; }catch{} }
    streamDone=true;
    if(sentenceBuf.trim()) enqueue(sentenceBuf.trim());
    sentenceBuf="";
    // trailing tags (arrived after the last text) previously died silently —
    // merge into the final queued sentence (w=Infinity fires at its last word), or live if playing
    if(pendingEmotion || pendingGesture || pendingSlots.length){
      const tail=queue[queue.length-1];
      if(tail){
        if(pendingEmotion) tail.emotion=pendingEmotion;
        if(pendingGesture) tail.gesture=pendingGesture;
        for(const s of pendingSlots) tail.tagSlots.push({...s, w:Infinity});
      }
      else {
        if(pendingEmotion) setEmotion(pendingEmotion);
        if(pendingGesture){ const g=pendingGesture; setTimeout(()=>doGesture(g), 150); }
        for(const s of pendingSlots) fireSlot({...s});
      }
      pendingEmotion=pendingGesture=null; pendingSlots=[];
    }
    // if nothing ever enqueued (e.g., very short without punctuation), ensure drain
    if(queue.length===0 && !displayed){
      botBubble.textContent="(no reply — check backend logs)";
      finalize();
    } else if(!processing && queue.length===0){
      // drained already, finalize
      if(!talking) finalize();
      // else finalize will be called after last audio
    }
    // wait until queue drains
    while(processing || queue.length>0) await new Promise(r=> setTimeout(r, 120));
  }catch(e){
    botBubble.textContent = "Failed to reach agent: " + e.message;
    botBubble.style.background="#ffdddd";
    stopTalking();
    statusEl.classList.remove('thinking');
  }finally{
    busy=false; sendBtn.disabled=false; input.focus();
    // final safety
    setTimeout(()=>{ if(!processing && !talking) { statusEl.classList.remove('thinking'); } }, 1000);
  }
}

sendBtn.onclick = send;
input.addEventListener('keydown', e=>{ if(e.key==="Enter") send(); });

// demo greeting
setTimeout(()=>addBubble("Hey! I'm your South Park agent — talk to me and watch me move. Try 'be super excited and wave!'","bot"), 400);
