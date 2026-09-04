const $ = s => document.querySelector(s);
const log = $('#log'), input = $('#input'), sendBtn = $('#send'), statusEl = $('#status'), ttsToggle=$('#ttsToggle');
import { Character } from './character.js';
// Max: the base character, instantiated with defaults. A variant is one
// constructor call away — see character.js header for the params.
const max = new Character($('#char'));
max.onStatus = (text, m) => { statusEl.textContent = text; statusEl.classList.toggle('talking', !!m?.talking); };

// idle life, blinking, eye dart, cursor tracking: owned by Character

// emotions, physics, sfx, gestures, tag registry, face/stage channels: Character
// (moved to Character)
// (moved to Character)

// (moved to Character)
// (moved to Character)

// (moved to Character)

// (moved to Character)

// (moved to Character)
// (moved to Character)
// lip-sync, mouth shapes, talking state: owned by Character
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

// voice mood lives on the character (per-variant delivery); explicit voice: tags override
function voiceSettingsFor(item){
  const out={...(max.voiceMood[item.emotion]||{})};
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
  const words=[]; const cseq=[]; let cur=null; max.vowelClock=false;
  const ingest=(chars, starts, ends)=>{
    for(let k=0;k<chars.length;k++){
      const ch=chars[k];
      if(ch===" "||ch==="\n"||ch==="\t"){ if(cur){ words.push(cur); cur=null; } continue; }
      if(!cur) cur={t:"", start:starts[k], end:ends[k]};
      cur.end=ends[k]; cur.t+=ch;
      cseq.push({ch, start:starts[k], end:ends[k]}); max.vowelClock=true;
    }
  };
  const ms=new MediaSource();
  const audio=new Audio();
  audio.src=URL.createObjectURL(ms);
  max.audioEl=audio;
  if(max.rafId) cancelAnimationFrame(max.rafId);
  return await new Promise((resolve,reject)=>{
    let ended=false, finished=false, started=false, shown=0, sb=null, mi=0;
    const finish=(ok)=>{
      if(finished) return; finished=true;
      ui.clearReveal();
      try{ audio.pause(); }catch{}
      try{ URL.revokeObjectURL(audio.src); }catch{}
      if(max.audioEl===audio) max.audioEl=null;
      if(max.rafId) cancelAnimationFrame(max.rafId);
      if(!ok){ reject(new Error('el playback failed')); return; }
      for(const s of slots){ if(!s.fired) max.fireSlot(s); }
      if(cur){ words.push(cur); cur=null; }
      ui.commitItem(item.text);
      if(max.talking) max.flapTick();
      resolve();
    };
    audio.onended=()=>{ ended=true; finish(true); };
    audio.onerror=()=>{ finish(started); };
    const fireDue=(t)=>{
      for(const s of slots){
        if(s.fired || !words.length) continue;
        const w = s.w===Infinity? words.length-1 : Math.min(s.w, words.length-1);
        if(w<0 || words[w].start===undefined || words[w].start>t) continue;
        max.fireSlot(s);
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
      const [w,h]=(!c||c.start===undefined||t<c.start)?max.mouthShape(" "):max.mouthShape(c.ch);
      max.setMouth(w,h,.05);
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
            if(!max.talking) max.startTalking();
            statusEl.textContent='speaking...'; statusEl.classList.add('talking');
            max.startAudioLipSync(audio);
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
  max.think();

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
    const fireTags=()=>{ if(item.emotion) max.setEmotion(item.emotion); if(item.gesture) setTimeout(()=>max.gesturePlay(item.gesture), 180); };
    const fakeSpeak=(totalMs)=>new Promise((res)=>{
      fireTags(); for(const s of (item.tagSlots||[])) if(s.type==="tag") max.fireSlot({...s});
      if(!max.talking) max.startTalking();
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
      if(!started){ started=true; statusEl.classList.remove('thinking'); botBubble.textContent=""; displayed=""; max.setEmotion('neutral'); }
      // one-ahead prefetch: start next sentence el-flow while current speaks
      if(queue.length>0){ const nx=queue[0]; if(!nx.elFlow) nx.elFlow=startElFlow(nx.text, voiceSettingsFor(nx)); }
      if(!max.talking) max.startTalking();
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
    max.stopTalking();
    statusEl.textContent='idle \u2022 blinking';
    statusEl.classList.remove('talking','thinking');
    setTimeout(()=>max.setEmotion('neutral'), 900);
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
        if(pendingEmotion) max.setEmotion(pendingEmotion);
        if(pendingGesture){ const g=pendingGesture; setTimeout(()=>max.gesturePlay(g), 150); }
        for(const s of pendingSlots) max.fireSlot({...s});
      }
      pendingEmotion=pendingGesture=null; pendingSlots=[];
    }
    // if nothing ever enqueued (e.g., very short without punctuation), ensure drain
    if(queue.length===0 && !displayed){
      botBubble.textContent="(no reply — check backend logs)";
      finalize();
    } else if(!processing && queue.length===0){
      // drained already, finalize
      if(!max.talking) finalize();
      // else finalize will be called after last audio
    }
    // wait until queue drains
    while(processing || queue.length>0) await new Promise(r=> setTimeout(r, 120));
  }catch(e){
    botBubble.textContent = "Failed to reach agent: " + e.message;
    botBubble.style.background="#ffdddd";
    max.stopTalking();
    statusEl.classList.remove('thinking');
  }finally{
    busy=false; sendBtn.disabled=false; input.focus();
    // final safety
    setTimeout(()=>{ if(!processing && !max.talking) { statusEl.classList.remove('thinking'); } }, 1000);
  }
}

sendBtn.onclick = send;
input.addEventListener('keydown', e=>{ if(e.key==="Enter") send(); });

// demo greeting
setTimeout(()=>addBubble("Hey! I'm Max — talk to me and watch me move. Try 'be super excited and wave!'","bot"), 400);
