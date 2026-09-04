const $ = s => document.querySelector(s);
const log = $('#log'), input = $('#input'), sendBtn = $('#send'), statusEl = $('#status'), ttsToggle=$('#ttsToggle'), voiceSel=$('#voiceSel');
const char = $('#char'), head = $('#head'), mouth = $('#mouth'), mouthInner = $('#mouthInner');
const eyeL = $('#eyeL'), eyeR = $('#eyeR'), lidL = $('#lidL'), lidR = $('#lidR');
const pupilL = $('#pupilL'), pupilR = $('#pupilR');
const browL = $('#browL'), browR = $('#browR');
const armL = $('#armL'), armR = $('#armR');

let talking = false;
let talkTimer = null;
let blinkTimer = null;

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
  blinkTimer = setTimeout(blink, 2200 + Math.random()*2200);
}
gsap.set([lidL,lidR], { y:"-100%" });
blink();

// -- emotions -- ponytail: expanded params so neutral isn't stuck as concerned
const emotions = {
  neutral: ()=>{ gsap.to(browL,{y:-2,rotation:-4,duration:.35}); gsap.to(browR,{y:-2,rotation:4,duration:.35}); gsap.to(mouth,{width:48,height:18,borderRadius:12,duration:.3}); gsap.to('.cheek',{opacity:.35,duration:.3}); gsap.to(head,{rotation:0,y:0,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:1,scaleX:1,duration:.25}); gsap.to([pupilL,pupilR],{y:0,duration:.2}); },
  happy: ()=>{ gsap.to(browL,{y:-7,rotation:-10,duration:.3}); gsap.to(browR,{y:-7,rotation:10,duration:.3}); gsap.to(mouth,{width:68,height:26,borderRadius:14,duration:.3}); gsap.to('.cheek',{opacity:.9,duration:.3}); gsap.to(head,{rotation:1,y:-2,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.92,scaleX:1.04,duration:.25}); },
  excited: ()=>{ gsap.to(browL,{y:-10,rotation:-14,duration:.25}); gsap.to(browR,{y:-10,rotation:14,duration:.25}); gsap.to(mouth,{width:78,height:34,borderRadius:16,duration:.25}); gsap.to('.cheek',{opacity:1,duration:.3}); gsap.to(char,{scale:1.03,y:-6,duration:.2,yoyo:true,repeat:1}); gsap.to([eyeL,eyeR],{scaleY:0.95,duration:.2}); },
  sad: ()=>{ gsap.to(browL,{y:5,rotation:16,duration:.3}); gsap.to(browR,{y:5,rotation:-16,duration:.3}); gsap.to(mouth,{width:44,height:14,borderRadius:8,duration:.3}); gsap.to('.cheek',{opacity:.15,duration:.3}); gsap.to(head,{rotation:-2,y:2,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.96,duration:.3}); },
  angry: ()=>{ gsap.to(browL,{y:3,rotation:-20,duration:.2}); gsap.to(browR,{y:3,rotation:20,duration:.2}); gsap.to(mouth,{width:54,height:20,borderRadius:4,duration:.25}); gsap.to('.cheek',{opacity:.65,duration:.3}); gsap.to(head,{x:-2, duration:.05, yoyo:true, repeat:6}); gsap.to([eyeL,eyeR],{scaleY:0.9,scaleX:1.08,duration:.2}); },
  surprised: ()=>{ gsap.to(browL,{y:-13,rotation:0,duration:.2}); gsap.to(browR,{y:-13,rotation:0,duration:.2}); gsap.to(mouth,{width:40,height:42,borderRadius:50,duration:.2}); gsap.to([eyeL,eyeR],{scale:1.12,scaleY:1.12,duration:.2}); setTimeout(()=>gsap.to([eyeL,eyeR],{scale:1,scaleY:1,duration:.3}),450); },
  confused: ()=>{ gsap.to(browL,{y:-7,rotation:-8,duration:.3}); gsap.to(browR,{y:3,rotation:8,duration:.3}); gsap.to(mouth,{width:46,height:16,borderRadius:8,duration:.3}); gsap.to([eyeL,eyeR],{scale:1,duration:.3}); },
  smug: ()=>{ gsap.to(browL,{y:-3,rotation:-6,duration:.3}); gsap.to(browR,{y:1,rotation:2,duration:.3}); gsap.to(mouth,{width:62,height:14,borderRadius:12,duration:.3}); gsap.to('.cheek',{opacity:.55,duration:.3}); gsap.to(head,{rotation:2,duration:.3}); },
  shy: ()=>{ gsap.to(browL,{y:-1,rotation:-2,duration:.3}); gsap.to(browR,{y:-1,rotation:2,duration:.3}); gsap.to(mouth,{width:36,height:16,borderRadius:10,duration:.3}); gsap.to('.cheek',{opacity:1,duration:.3}); gsap.to(head,{rotation:-3,y:1,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.94,duration:.3}); },
  sleepy: ()=>{ gsap.to(browL,{y:2,rotation:0,duration:.3}); gsap.to(browR,{y:2,rotation:0,duration:.3}); gsap.to([eyeL,eyeR],{scaleY:0.62,duration:.3}); gsap.to(mouth,{width:34,height:22,borderRadius:50,duration:.3}); gsap.to('.cheek',{opacity:.4,duration:.3}); },
}
function setEmotion(e){
  (emotions[e]||emotions.neutral)();
  statusEl.textContent = e + " • " + (talking ? "talking" : "idle");
}

// -- gestures --
function doGesture(g){
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
    gsap.to(head,{y:8, duration:.12, yoyo:true, repeat:3});
  } else if(g==="point"){
    gsap.to(armR,{rotation:-85, duration:.3});
    setTimeout(()=>gsap.to(armR,{rotation:18, duration:.4}), 900);
  } else if(g==="dance"){
    gsap.to(char,{rotation:-4, duration:.18, yoyo:true, repeat:5, ease:"sine.inOut"});
    gsap.to([armL,armR],{rotation:-90, duration:.18, yoyo:true, repeat:5});
    gsap.to(armL,{rotation:-18, duration:.3, delay:1.1});
    gsap.to(armR,{rotation:18, duration:.3, delay:1.1});
  } else if(g==="facepalm"){
    gsap.to(armR,{rotation:-140, duration:.35, ease:"power2.out"});
    setTimeout(()=>gsap.to(armR,{rotation:18, duration:.4}), 900);
  }
}

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
function stopTalking(){
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

// fetch-only: streaming TTS first, REST fallback. Never throws — null means fake-timed fallback.
// --- realtime flow: Sarvam WS relayed as chunked mp3, played progressively via MSE ---
// ponytail: self-tuning word clock — estimate corrected by measured durations (EMA)
let flowRate = 1;
const estMs = (text)=> Math.min(5000, Math.max(900, text.length*28));

function startFlow(text, speaker){
  // handle accumulates chunks even before playback — doubles as prefetch
  const h={chunks:[], idx:0, done:false, error:null};
  (async()=>{
    try{
      const r=await fetch('/tts/flow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text, speaker})});
      if(!r.ok || !r.body) throw new Error('flow '+r.status);
      const reader=r.body.getReader();
      let got=false;
      while(true){
        const {value,done}=await reader.read();
        if(done) break;
        if(value && value.length){ h.chunks.push(value); got=true; }
      }
      if(!got) throw new Error('empty flow audio');
      h.done=true;
    }catch(e){ h.error=e; }
  })();
  return h;
}
const flowNext=(h)=>new Promise((res,rej)=>{
  const poll=()=>{
    if(h.idx<h.chunks.length) return res(h.chunks[h.idx++]);
    if(h.error) return rej(h.error);
    if(h.done) return res(null);
    setTimeout(poll, 25);
  };
  poll();
});

async function playFlow(handle, item, ui){
  if(!window.MediaSource || !MediaSource.isTypeSupported('audio/mpeg')) throw new Error('MSE unsupported');
  const words=item.text.split(/\s+/).filter(Boolean);
  const fireTags=()=>{ if(item.emotion) setEmotion(item.emotion); if(item.gesture) setTimeout(()=>doGesture(item.gesture), 180); };
  const ms=new MediaSource();
  const audio=new Audio();
  audio.src=URL.createObjectURL(ms);
  audioEl=audio;
  if(rafId) cancelAnimationFrame(rafId);
  return await new Promise((resolve,reject)=>{
    let ended=false, revealed=false, started=false, finished=false, sb=null;
    const finish=(ok)=>{
      if(finished) return; finished=true;
      ui.clearReveal();
      try{ audio.pause(); }catch{}
      try{ URL.revokeObjectURL(audio.src); }catch{}
      if(audioEl===audio) audioEl=null;
      if(rafId) cancelAnimationFrame(rafId);
      if(ok && started && isFinite(audio.duration) && audio.duration>0){
        const r=(audio.duration*1000)/estMs(item.text);
        flowRate=Math.min(2, Math.max(0.5, 0.7*flowRate+0.3*r));
      }
      if(!revealed){ revealed=true; ui.commitItem(item.text); }
      if(talking) flapTick();
      ok? resolve() : reject(new Error('flow playback failed'));
    };
    audio.onended=()=>{ ended=true; finish(true); };
    audio.onerror=()=>{ finish(started); };
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
          const c=await flowNext(handle);
          if(c===null) break;
          if(finished) return;
          await appendChunk(c);
          if(!started){
            started=true;
            try{ await audio.play(); }
            catch(e){ finish(false); return; }
            if(!talking) startTalking();
            statusEl.textContent='speaking...'; statusEl.classList.add('talking');
            fireTags();
            startAudioLipSync(audio);
            const per=(estMs(item.text)*flowRate)/Math.max(1,words.length);
            let i=0; ui.renderShown(words[0]||"");
            const step=()=>{ if(ended||finished) return; i++; if(i>=words.length){ revealed=true; ui.commitItem(item.text); return; } ui.renderShown(words.slice(0,i+1).join(" ")); ui.armReveal(setTimeout(step, per)); };
            ui.armReveal(setTimeout(step, per));
          }
        }
        try{ if(ms.readyState==="open") ms.endOfStream(); }catch{}
        // safety: resolve even if 'ended' misfires on MSE duration quirks
        setTimeout(()=>{ if(!finished){ ended=true; finish(true); } }, Math.max(6000, ((isFinite(audio.duration)?audio.duration:0)*1000)+3000));
      }catch(e){
        if(!started){ reject(e); return; }
        // mid-play failure: play out what's buffered, then resolve via onended
        try{ if(ms.readyState==="open") ms.endOfStream(); }catch{}
      }
    };
    ms.addEventListener('sourceopen', ()=>{ try{ sb=ms.addSourceBuffer('audio/mpeg'); }catch(e){ reject(e); return; } pump(); }, {once:true});
    setTimeout(()=>{ if(!sb && !finished) reject(new Error('MSE open timeout')); }, 8000);
  });
}
async function fetchAudio(text, speaker){
  if(!ttsToggle?.checked) return null;
  try{
    const r = await fetch('/tts/stream', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text, speaker})});
    if(!r.ok) throw new Error(`stream ${r.status}`);
    const blob = await r.blob();
    if(blob.size<200) throw new Error('empty stream audio');
    return blob;
  }catch(e){ console.warn('stream TTS failed, fallback REST', e.message); }
  try{
    const r = await fetch('/tts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text, speaker})});
    const j = await r.json();
    if(j.error || !j.audio_b64) throw new Error(j.error || 'no audio');
    return await fetch(`data:audio/wav;base64,${j.audio_b64}`).then(r=>r.blob());
  }catch(e2){ console.warn('REST TTS fallback failed', e2.message); return null; }
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

  let queue=[], processing=false, streamDone=false, sentenceBuf="", pendingEmotion=null, pendingGesture=null, displayed="", started=false;
  const SENT_RE = /^[^.!?]*[.!?]+/;
  const speaker = ()=> voiceSel?.value || 'sunny';
  const spk = speaker(); // lock voice for the whole reply so prefetched audio matches
  let revealTimer=null;
  const clearReveal=()=>{ if(revealTimer){ clearTimeout(revealTimer); revealTimer=null; } };
  const armReveal=(id)=>{ revealTimer=id; };
  const renderShown=(shown)=>{ botBubble.textContent=(displayed? displayed+" " : "")+shown; log.scrollTop=log.scrollHeight; };
  const commitItem=(text)=>{ displayed=displayed? displayed+" "+text : text; botBubble.textContent=displayed; log.scrollTop=log.scrollHeight; };
  const ui={renderShown, commitItem, clearReveal, armReveal};
  const speak=async(item)=>{
    const words=item.text.split(/\s+/).filter(Boolean);
    const fireTags=()=>{ if(item.emotion) setEmotion(item.emotion); if(item.gesture) setTimeout(()=>doGesture(item.gesture), 180); };
    const fakeSpeak=(totalMs)=>new Promise((res)=>{
      fireTags(); if(!talking) startTalking();
      let i=0; renderShown(words[0]||"");
      const step=()=>{ i++; if(i>=words.length){ clearReveal(); commitItem(item.text); res(); return; } renderShown(words.slice(0,i+1).join(" ")); revealTimer=setTimeout(step, totalMs/Math.max(1,words.length)); };
      revealTimer=setTimeout(step, totalMs/Math.max(1,words.length));
    });
    // realtime first: progressive WS playback (also serves prefetch); blob + fake fallbacks below
    const handle=item.flow ?? startFlow(item.text, spk);
    try{ await playFlow(handle, item, ui); return; }
    catch(e){ console.warn('flow playback failed, blob fallback', e.message); }
    const blob=await fetchAudio(item.text, spk);
    if(!blob){ await fakeSpeak(Math.min(5000, Math.max(900, item.text.length*28))); return; }
    const url=URL.createObjectURL(blob);
    const audio=new Audio(url);
    audioEl=audio;
    if(rafId) cancelAnimationFrame(rafId);
    await new Promise((resolve)=>{
      let revealed=false, ended=false;
      const finish=()=>{ clearReveal(); URL.revokeObjectURL(url); if(audioEl===audio) audioEl=null; if(rafId) cancelAnimationFrame(rafId); if(!revealed){ revealed=true; commitItem(item.text); } if(talking) flapTick(); resolve(); };
      audio.onended=()=>{ ended=true; finish(); };
      audio.onerror=()=>{ finish(); };
      audio.play().then(()=>{
        if(!talking) startTalking();
        statusEl.textContent='speaking...'; statusEl.classList.add('talking');
        fireTags();
        startAudioLipSync(audio);
        const dur=(isFinite(audio.duration) && audio.duration>0)? audio.duration*1000 : Math.min(5000, Math.max(900, item.text.length*28));
        const per=dur/Math.max(1,words.length);
        let i=0; renderShown(words[0]||"");
        const step=()=>{ if(ended) return; i++; if(i>=words.length){ revealed=true; commitItem(item.text); return; } renderShown(words.slice(0,i+1).join(" ")); revealTimer=setTimeout(step, per); };
        revealTimer=setTimeout(step, per);
      }).catch(()=>{ if(audioEl===audio) audioEl=null; fakeSpeak(Math.min(5000, Math.max(900, item.text.length*28))).then(resolve); });
    });
  };
  const enqueue=(text)=>{
    if(!text.trim()) return;
    queue.push({text: text.trim(), emotion: pendingEmotion, gesture: pendingGesture});
    pendingEmotion=null; pendingGesture=null;
    if(!processing) drain();
  };
  const drain=async()=>{
    if(processing) return; processing=true;
    while(queue.length>0){
      const item=queue.shift();
      if(!started){ started=true; statusEl.classList.remove('thinking'); botBubble.textContent=""; displayed=""; setEmotion('neutral'); }
      // one-ahead prefetch: start next sentence flow while current speaks
      if(queue.length>0){ const nx=queue[0]; if(!nx.flow) nx.flow=startFlow(nx.text, spk); }
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
        } else if(j.type==="emotion") pendingEmotion=j.value;
        else if(j.type==="gesture") pendingGesture=j.value;
        else if(j.type==="error"){ if(!started){ botBubble.textContent=""; started=true; } displayed+=(displayed?" ":"")+"[error: "+j.content+"]"; botBubble.textContent=displayed; }
      }
    }
    // flush any leftover buf as token
    if(buf.startsWith("data: ")){ try{ const j=JSON.parse(buf.slice(6)); if(j.type==="token") sentenceBuf+=j.content; }catch{} }
    streamDone=true;
    if(sentenceBuf.trim()) enqueue(sentenceBuf.trim());
    sentenceBuf="";
    // trailing tags (arrived after the last text) previously died silently —
    // merge into the final queued sentence, or fire live if audio is already playing
    if(pendingEmotion || pendingGesture){
      const tail=queue[queue.length-1];
      if(tail){ if(pendingEmotion) tail.emotion=pendingEmotion; if(pendingGesture) tail.gesture=pendingGesture; }
      else { if(pendingEmotion) setEmotion(pendingEmotion); if(pendingGesture){ const g=pendingGesture; setTimeout(()=>doGesture(g), 150); } }
      pendingEmotion=pendingGesture=null;
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
