const $ = s => document.querySelector(s);
const log = $('#log'), input = $('#input'), sendBtn = $('#send'), statusEl = $('#status'), ttsToggle=$('#ttsToggle');
import { Character } from './character.js';
// Max: the base character, instantiated with defaults. A variant is one
// constructor call away — see character.js header for the params.
let VOICE = { Max: "TX3LPaxmHKxFdv7VOQHJ", Mia: "cgSgspJ2msm6clMCkdW9" }; // fallback; refreshed from backend below
// Roster: one row per cast member. A 3rd character = 1 row here + 1 backend CHARACTERS entry.
// Extra rigs clone the #char template; Character queries are root-scoped so duplicate IDs stay contained.
const ROSTER = [
  { name: "Max", scale: 1,   palette: {},                                    look: "male" },
  { name: "Mia", scale: .86, palette: { shirt: '#7c5cd6', hair: '#241d18' }, look: "female" },
];
const cast = {}, order = [];
{
  const tpl = $('#char');
  const showName = 'THE ' + ROSTER.map(r => r.name).join(' & ').toUpperCase() + ' SHOW';
  document.querySelector('.chem-trail').textContent = showName;
  ROSTER.forEach((r, i) => {
    let root = tpl;
    if (i > 0) {
      root = tpl.cloneNode(true);
      root.id = 'char' + r.name;
      const spot = document.createElement('div');
      spot.style.transform = `scale(${r.scale})`;
      $('#cast').appendChild(spot);
      spot.appendChild(root);
    }
    if (r.look === "female") root.classList.add('is-girl');
    cast[r.name] = new Character(root, { palette: r.palette, showName });
    order.push(r.name);
  });
}
fetch('/tts/voices').then(r => r.json()).then(j => { if (j.cast) for (const [n, c] of Object.entries(j.cast)) VOICE[n] = c.voice; }).catch(() => {});
const max = cast.Max, mia = cast.Mia;
const wireStatus = (name, ch) => { ch.onStatus = (text, m) => { statusEl.textContent = name + ': ' + text; statusEl.classList.toggle('talking', !!m?.talking); }; };
wireStatus('Max', max); wireStatus('Mia', mia);

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
const modelSel=$('#modelSel');
modelSel.value=localStorage.getItem('brain')||'nemotron';
modelSel.addEventListener('change',()=>localStorage.setItem('brain',modelSel.value));

// voice mood lives on the character (per-variant delivery); explicit voice: tags override
function voiceSettingsFor(item, C){
  const out={...((C||max).voiceMood[item.emotion]||{})};
  for(const s of (item.tagSlots||[])){
    if(s.type==="tag"&&s.channel==="voice"){
      for(const part of String(s.value).split(",")){ const kv=part.split("="); const f=parseFloat(kv[1]);
        if((kv[0]==="style"||kv[0]==="stability"||kv[0]==="similarity")&&isFinite(f)) out[kv[0]==="similarity"?"similarity_boost":kv[0]]=Math.max(0,Math.min(1,f)); }
    }
  }
  return Object.keys(out).length?out:null;
}
function startElFlow(text, settings, voice){
  const h={events:[], idx:0, done:false, error:null};
  (async()=>{
    try{
      const r=await fetch('/tts/el-flow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text, voice_settings:settings||undefined, voice:voice||undefined})});
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

async function playElFlow(handle, item, ui, C){
  const slots=(item.tagSlots||[]).map(s=>({...s, fired:false}));
  const words=[]; const cseq=[]; let cur=null; C.vowelClock=false;
  const ingest=(chars, starts, ends)=>{
    for(let k=0;k<chars.length;k++){
      const ch=chars[k];
      if(ch===" "||ch==="\n"||ch==="\t"){ if(cur){ words.push(cur); cur=null; } continue; }
      if(!cur) cur={t:"", start:starts[k], end:ends[k]};
      cur.end=ends[k]; cur.t+=ch;
      cseq.push({ch, start:starts[k], end:ends[k]}); C.vowelClock=true;
    }
  };
  const ms=new MediaSource();
  const audio=new Audio();
  audio.src=URL.createObjectURL(ms);
  C.audioEl=audio;
  if(C.rafId) cancelAnimationFrame(C.rafId);
  return await new Promise((resolve,reject)=>{
    let ended=false, finished=false, started=false, shown=0, sb=null, mi=0;
    const finish=(ok)=>{
      if(finished) return; finished=true;
      ui.clearReveal();
      try{ audio.pause(); }catch{}
      try{ URL.revokeObjectURL(audio.src); }catch{}
      if(C.audioEl===audio) C.audioEl=null;
      if(C.rafId) cancelAnimationFrame(C.rafId);
      if(!ok){ reject(new Error('el playback failed')); return; }
      for(const s of slots){ if(!s.fired) C.fireSlot(s); }
      if(cur){ words.push(cur); cur=null; }
      ui.commitItem(item.text, item.speaker);
      if(C.talking) C.flapTick();
      resolve();
    };
    audio.onended=()=>{ ended=true; finish(true); };
    audio.onerror=()=>{ finish(started); };
    const fireDue=(t)=>{
      for(const s of slots){
        if(s.fired || !words.length) continue;
        const w = s.w===Infinity? words.length-1 : Math.min(s.w, words.length-1);
        if(w<0 || words[w].start===undefined || words[w].start>t) continue;
        C.fireSlot(s);
      }
    };
    const renderDue=(t)=>{
      let n=0;
      while(n<words.length && words[n].start!==undefined && words[n].start<=t) n++;
      if(n>shown){ shown=n; ui.renderShown(words.slice(0,n).map(w=>w.t).join(" "), item.speaker); }
    };
    const mouthDue=(t)=>{
      while(mi<cseq.length && cseq[mi].end!==undefined && cseq[mi].end<t) mi++;
      const c=cseq[mi];
      const [w,h]=(!c||c.start===undefined||t<c.start)?C.mouthShape(" "):C.mouthShape(c.ch);
      C.setMouth(w,h,.05);
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
            if(!C.talking) C.startTalking();
            statusEl.textContent='speaking...'; statusEl.classList.add('talking');
            C.startAudioLipSync(audio);
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
  const isBanter=banterMode; banterMode=false;
  busy = true; sendBtn.disabled = true; input.value="";
  addBubble(isBanter?("\uD83C\uDFB2 "+msg):msg, "user");
  statusEl.textContent = "thinking";
  statusEl.classList.add('thinking');
  for(const n of order) cast[n].think();

  let queue=[], processing=false, streamDone=false, sentenceBuf="", bufSpeaker="Max", pendingEmotion=null, pendingGesture=null, pendingSlots=[], pendingSp=null, started=false;
  const SENT_RE = /^[^.!?]*[.!?]+/;
  let revealTimer=null;
  const clearReveal=()=>{ if(revealTimer){ clearTimeout(revealTimer); revealTimer=null; } };
  const armReveal=(id)=>{ revealTimer=id; };
  const speakerBubbles={};
  const bubbleFor=(sp)=>{
    sp=(sp==="Mia")?"Mia":"Max";
    if(!speakerBubbles[sp]){
      const el=addBubble("", "bot sp-"+sp);
      el.classList.add('stream');
      const nm=document.createElement("b"); nm.textContent=sp+":"; nm.className="sp-name";
      const tx=document.createTextNode("");
      el.append(nm, tx);
      speakerBubbles[sp]={el, tx, displayed:""};
    }
    return speakerBubbles[sp];
  };
  const renderShown=(shown, sp)=>{ const B=bubbleFor(sp); B.tx.textContent=(B.displayed? B.displayed+" " : "")+shown; log.scrollTop=log.scrollHeight; };
  const commitItem=(text, sp)=>{ const B=bubbleFor(sp); B.displayed=B.displayed? B.displayed+" "+text : text; B.tx.textContent=B.displayed; log.scrollTop=log.scrollHeight; };
  const ui={renderShown, commitItem, clearReveal, armReveal};
  const speak=async(item)=>{
    const C=cast[item.speaker]||max;
    for(const n of order){ const ch=cast[n]; if(ch!==C && ch.talking) ch.stopTalking(); } // only the speaker's mouth moves
    const words=item.text.split(/\s+/).filter(Boolean);
    const fireTags=()=>{ if(item.emotion) C.setEmotion(item.emotion); if(item.gesture) setTimeout(()=>C.gesturePlay(item.gesture), 180); };
    const fakeSpeak=(totalMs)=>new Promise((res)=>{
      fireTags(); for(const s of (item.tagSlots||[])) if(s.type==="tag") C.fireSlot({...s});
      if(!C.talking) C.startTalking();
      let i=0; renderShown(words[0]||"", item.speaker);
      const step=()=>{ i++; if(i>=words.length){ clearReveal(); commitItem(item.text, item.speaker); res(); return; } renderShown(words.slice(0,i+1).join(" "), item.speaker); revealTimer=setTimeout(step, totalMs/Math.max(1,words.length)); };
      revealTimer=setTimeout(step, totalMs/Math.max(1,words.length));
    });
    // elevenlabs only: timestamp-driven playback, estimated silent fallback
    // voice-off skips the fetch entirely (no wasted credits) and mimes the line
    if(!(ttsToggle?.checked ?? true)){ await fakeSpeak(Math.min(5000, Math.max(900, item.text.length*28))); return; }
    const elHandle=item.elFlow ?? startElFlow(item.text, voiceSettingsFor(item, C), VOICE[item.speaker]);
    try{ await playElFlow(elHandle, item, ui, C); return; }
    catch(e){ console.warn('el flow failed, silent fallback', e.message); }
    await fakeSpeak(Math.min(5000, Math.max(900, item.text.length*28)));
  };
  const enqueue=(text)=>{
    if(!text.trim()) return;
    queue.push({text: text.trim(), speaker: pendingSp ?? bufSpeaker, emotion: pendingEmotion, gesture: pendingGesture, tagSlots: pendingSlots});
    pendingEmotion=null; pendingGesture=null; pendingSlots=[]; pendingSp=null;
    if(!processing) drain();
  };
  const drain=async()=>{
    if(processing) return; processing=true;
    while(queue.length>0){
      const item=queue.shift();
      if(!started){ started=true; statusEl.classList.remove('thinking'); for(const n of order) cast[n].setEmotion('neutral'); }
      // one-ahead prefetch: start next sentence el-flow while current speaks (skipped when muted)
      if(queue.length>0 && (ttsToggle?.checked ?? true)){ const nx=queue[0]; if(!nx.elFlow) nx.elFlow=startElFlow(nx.text, voiceSettingsFor(nx, cast[nx.speaker]||max), VOICE[nx.speaker]); }
      const C=cast[item.speaker]||max;
      if(!C.talking) C.startTalking();
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
    for(const k in speakerBubbles) speakerBubbles[k].el.classList.remove('stream');
    for(const n of order) cast[n].stopTalking();
    statusEl.textContent='idle \u2022 blinking';
    statusEl.classList.remove('talking','thinking');
    setTimeout(()=>{ for(const n of order) cast[n].setEmotion('neutral'); }, 900);
  };

  try{
    const res = await fetch('/chat/stream', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: msg, session_id: sessionId, model: modelSel.value, banter: isBanter })});
    if(!res.ok || !res.body) throw new Error("no stream");
    const reader=res.body.getReader(); const decoder=new TextDecoder();
    let lastData=Date.now();
    const watchdog=setInterval(()=>{ if(Date.now()-lastData>45000){ try{ reader.cancel(); }catch{} } }, 5000); // stalled provider can't hang the chat
    let buf="";
    while(true){
      const {value, done} = await reader.read();
      if(done) break;
      buf+=decoder.decode(value,{stream:true});
      lastData=Date.now();
      const parts=buf.split("\n\n"); buf=parts.pop();
      for(const part of parts){
        if(!part.startsWith("data: ")) continue;
        let j; try{ j=JSON.parse(part.slice(6)); }catch{ continue; }
        if(j.type==="token"){
          const sp=(j.speaker==="Mia")?"Mia":"Max";
          if(sentenceBuf && sp!==bufSpeaker){ enqueue(sentenceBuf); sentenceBuf=""; }
          if(!sentenceBuf) bufSpeaker=sp;
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
          pendingSp=(j.speaker==="Mia")?"Mia":"Max";
          if((j.type||"").startsWith("tag:")){
            pendingSlots.push({w, type:"tag", channel:j.type.slice(4), value:j.value});
          } else {
            pendingSlots.push({w, type:j.type, value:j.value});
            if(j.type==="emotion") pendingEmotion=j.value; else pendingGesture=j.value;
          }
        }
        else if(j.type==="error"){ started=true; const B=bubbleFor(bufSpeaker); B.displayed+=(B.displayed?" ":"")+"[error: "+j.content+"]"; B.tx.textContent=B.displayed; }
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
        const C=cast[bufSpeaker]||max;
        if(pendingEmotion) C.setEmotion(pendingEmotion);
        if(pendingGesture){ const g=pendingGesture; setTimeout(()=>C.gesturePlay(g), 150); }
        for(const s of pendingSlots) C.fireSlot({...s});
      }
      pendingEmotion=pendingGesture=null; pendingSlots=[];
    }
    // if nothing ever enqueued (e.g., very short without punctuation), ensure drain
    if(queue.length===0 && Object.keys(speakerBubbles).length===0){
      bubbleFor(bufSpeaker).tx.textContent="(no reply — check backend logs)";
      finalize();
    } else if(!processing && queue.length===0){
      // drained already, finalize
      if(order.every(n=>!cast[n].talking)) finalize();
      // else finalize will be called after last audio
    }
    // wait until queue drains
    while(processing || queue.length>0) await new Promise(r=> setTimeout(r, 120));
  }catch(e){
    const B=bubbleFor("Max"); B.tx.textContent="Failed to reach agent: "+e.message; B.el.style.background="#ffdddd";
    for(const n of order) cast[n].stopTalking();
    statusEl.classList.remove('thinking');
  }finally{
    try{ clearInterval(watchdog); }catch{} // TDZ-safe: throws only if fetch failed first
    busy=false; sendBtn.disabled=false; input.focus();
    // final safety
    setTimeout(()=>{ if(!processing && order.every(n=>!cast[n].talking)) { statusEl.classList.remove('thinking'); } }, 1000);
  }
}

const BANTERS=[
  "Max brags about his new high score, Mia roasts him for it",
  "Mia lost the TV remote, Max 'helps' her find it",
  "Debate the best after-school snack",
  "Plan a weekend adventure together",
  "Mia teaches Max how to be cool. It backfires",
];
let banterMode=false;
$('#banterBtn').onclick=()=>{ if(busy) return; banterMode=true; input.value=BANTERS[Math.floor(Math.random()*BANTERS.length)]; send(); };

sendBtn.onclick = send;
input.addEventListener('keydown', e=>{ if(e.key==="Enter") send(); });

// demo greeting
setTimeout(()=>addBubble("Hey! We're "+order.join(" & ")+" — talk to us, or hit \uD83C\uDFB2 for improv!","bot"), 400);
