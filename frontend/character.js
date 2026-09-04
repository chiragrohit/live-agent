// Character — reusable cartoon rig. Owns all acting: emotions, gestures, face/stage/
// sfx channels, lip-sync, idle life, physics. The player (app.js) only feeds it
// timed tag slots and audio; it never touches chat, SSE, or TTS.
//
// New character = new params, no rig rewrite:
//   const max = new Character(document.querySelector('#char'));
//   const frank = new Character(document.querySelector('#char'), {
//     palette: { skin:'#e8b07d', shirt:'#2e9e8f', hair:'#5a3a1e' },
//     showName: 'THE FRANK SHOW',
//     blinkMood: { sleepy: 5000 },
//     emotions: { neutral: (ch)=>{ /* custom recipe */ } },
//   });
export class Character {
  constructor(root, opts = {}) {
    this.root = root;
    const q = (s) => root.querySelector(s);
    // parts (queried under root so multiple characters could coexist)
    this.char = root;
    this.head = q('#head'); this.mouth = q('#mouth'); this.tongue = q('#mouth .tongue') || q('#tongue');
    this.eyeL = q('#eyeL'); this.eyeR = q('#eyeR');
    this.lidL = q('#lidL'); this.lidR = q('#lidR');
    this.pupilL = q('#pupilL'); this.pupilR = q('#pupilR');
    this.browL = q('#browL'); this.browR = q('#browR');
    this.armL = q('#armL'); this.armR = q('#armR');
    this.jaw = q('#jaw');
    this.stage = document.querySelector('#stage');
    this.chemTrail = document.querySelector('.chem-trail');
    this.fx = { tear: q('#fxTear'), sweat: q('#fxSweat'), puff: q('#fxPuff') };
    this.cheeks = root.querySelectorAll('.cheek');

    // ---- params (override per character) ----
    const p = opts.palette || {};
    // palette keys map onto the stylesheet's existing custom properties
    for (const [k, v] of Object.entries({ skin: '#ffcf9e', shirt: '#e8563f', hair: '#3a2a18', cheek: '#ff8a8a', ...p })) {
      const cssVar = { skin: '--skin', shirt: '--jacket', hair: '--hair', cheek: '--cheek' }[k];
      if (cssVar) root.style.setProperty(cssVar, v);
    }
    this.showName = opts.showName || 'THE MAX SHOW';
    this.blinkMood = { surprised: 900, excited: 1600, sleepy: 4200, sad: 3200, scared: 850, bored: 3600, ...(opts.blinkMood || {}) };
    this.jawPose = { surprised: 12, scared: 10, excited: 5, angry: 4, happy: 3, sad: 2, proud: 2, ...(opts.jawPose || {}) };
    this.mouthOpenPose = { surprised: 42, scared: 30, excited: 34, happy: 26, sleepy: 22, proud: 18, shy: 16, ...(opts.mouthOpenPose || {}) };
    this.voiceMood = {
      smug: { stability: .6, style: .7 }, sad: { stability: .8, style: .3 }, excited: { stability: .4, style: .8 },
      angry: { stability: .35, style: .9 }, happy: { stability: .5, style: .6 }, surprised: { stability: .45, style: .75 },
      sleepy: { stability: .85, style: .2 }, shy: { stability: .7, style: .35 }, scared: { stability: .4, style: .8 },
      proud: { stability: .6, style: .65 }, bored: { stability: .8, style: .25 }, confused: { stability: .6, style: .4 },
      ...(opts.voiceMood || {}),
    };
    this.emotions = { ...Character.EMOTIONS, ...(opts.emotions || {}) };

    // ---- state ----
    this.talking = false; this.vowelClock = false;
    this.talkTimer = null; this.blinkTimer = null; this.fxTimer = null; this.stageTimer = null;
    this.blinkDelay = 2600; this.gazeHoldUntil = 0;
    this.audioEl = null; this.audioCtx = null; this.analyser = null; this.audioSrc = null; this.rafId = null;
    this.onStatus = null; // player wires: (text, {talking}) => {...}

    this._startIdle();
  }

  // ---------- idle life ----------
  _startIdle() {
    gsap.to(this.char, { y: -4, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });
    setInterval(() => {
      if (this.talking) return;
      gsap.to([this.pupilL, this.pupilR], { x: (Math.random() - .5) * 10, y: (Math.random() - .5) * 4, duration: .35, ease: "power2.out" });
    }, 1800);
    window.addEventListener('mousemove', (e) => {
      if (this.talking || Date.now() < this.gazeHoldUntil) return;
      try {
        const r = this.char.getBoundingClientRect();
        gsap.to([this.pupilL, this.pupilR], {
          x: Math.max(-9, Math.min(9, (e.clientX - (r.left + r.width / 2)) / 28)),
          y: Math.max(-5, Math.min(5, (e.clientY - (r.top + r.height / 3)) / 34)),
          duration: .3, ease: "power2.out",
        });
      } catch {}
    });
    gsap.set([this.lidL, this.lidR], { y: "-100%" });
    this.blink();
  }
  blink() {
    gsap.to([this.lidL, this.lidR], { y: "0%", duration: .06, ease: "power2.in" });
    gsap.to([this.lidL, this.lidR], { y: "-100%", duration: .08, delay: .09, ease: "power2.out" });
    this.blinkTimer = setTimeout(() => this.blink(), this.blinkDelay + Math.random() * 1200);
  }
  think() { // player calls while waiting for the LLM
    gsap.to([this.pupilL, this.pupilR], { x: 8, duration: .4 });
    setTimeout(() => gsap.to([this.pupilL, this.pupilR], { x: -8, duration: .5 }), 500);
    setTimeout(() => gsap.to([this.pupilL, this.pupilR], { x: 0, duration: .4 }), 1100);
  }

  // ---------- emotions ----------
  setEmotion(e) {
    if (e === 'deadpan') e = 'unimpressed';
    (this.emotions[e] || this.emotions.neutral)(this);
    this.blinkDelay = this.blinkMood[e] || 2600;
    gsap.to(this.jaw, { y: this.jawPose[e] || 0, duration: .3, ease: "power2.out" });
    this.mouthInterior(this.mouthOpenPose[e] || 12);
    this.onStatus?.(`${e} • ${this.talking ? "talking" : "idle"}`, { talking: this.talking });
  }

  // ---------- cartoon physics (reshape only, never delay audio) ----------
  windUp(dur = .14) { gsap.to(this.char, { scaleY: .9, scaleX: 1.07, duration: dur, ease: "power2.in" }); return dur; }
  popUp(h = 8) {
    gsap.timeline().to(this.char, { scaleY: 1.08, scaleX: .94, y: -h, duration: .16, ease: "power2.out" })
      .to(this.char, { scaleY: 1, scaleX: 1, y: 0, duration: .4, ease: "elastic.out(1,0.45)" });
  }
  headBoing() {
    gsap.timeline().to(this.head, { scaleY: .88, scaleX: 1.1, duration: .1, ease: "power2.in" })
      .to(this.head, { scaleY: 1.06, scaleX: .95, duration: .14 })
      .to(this.head, { scaleY: 1, scaleX: 1, duration: .35, ease: "elastic.out(1,0.4)" });
  }

  // ---------- gestures: name[:intensity[:speed]] ----------
  gesturePlay(payload) {
    const parts = String(payload || "").split(":");
    let name = parts[0];
    if (name === "thumbup") name = "thumbsup"; // model's favorite typo
    const k = Math.max(.4, Math.min(2.5, parseFloat(parts[1]) || 1));
    const tm = parts[2] === "fast" ? .55 : parts[2] === "slow" ? 1.7 : 1;
    const D = (d) => d * tm, A = (deg) => deg * k;
    const { armL, armR, head } = this;
    if (name === "thumbsup") {
      gsap.to(armR, { rotation: -A(150), duration: D(.3), ease: "back.out(1.5)" });
      gsap.to(head, { y: 5, duration: D(.14), yoyo: true, repeat: 1, delay: D(.3) });
      setTimeout(() => gsap.to(armR, { rotation: 18, duration: D(.4) }), D(800));
    } else if (name === "bow") {
      gsap.to(head, { y: 14, duration: D(.35), ease: "power2.in" });
      gsap.to(armL, { rotation: -30, duration: D(.35) }); gsap.to(armR, { rotation: 30, duration: D(.35) });
      setTimeout(() => { gsap.to(head, { y: 0, duration: D(.4), ease: "elastic.out(1,0.5)" }); gsap.to(armL, { rotation: -18, duration: D(.4) }); gsap.to(armR, { rotation: 18, duration: D(.4) }); }, D(650));
    } else if (name === "jump") {
      this.windUp(D(.12)); setTimeout(() => this.popUp(6 + 8 * k), D(130));
    } else if (name === "scratch") {
      gsap.to(armR, { rotation: -A(120), duration: D(.3) });
      gsap.to(head, { rotation: 6, duration: D(.25) });
      gsap.to(head, { x: 3, duration: D(.09), yoyo: true, repeat: 5, delay: D(.3) });
      setTimeout(() => { gsap.to(armR, { rotation: 18, duration: D(.4) }); gsap.to(head, { rotation: 0, x: 0, duration: D(.3) }); }, D(900));
    } else {
      this.plainGesture(name);
    }
  }
  plainGesture(g) {
    const { armL, armR, head, char } = this;
    if (g === "idle") {
      gsap.to(armL, { rotation: -18, y: 0, duration: .5, ease: "sine.out" });
      gsap.to(armR, { rotation: 18, y: 0, duration: .5, ease: "sine.out" });
      gsap.to(head, { rotation: 0, y: 0, x: 0, duration: .5, ease: "sine.out" });
      this.setEmotion('neutral');
      clearTimeout(this.blinkTimer); this.blink();
      return;
    }
    if (g === "wave") {
      gsap.to(armR, { rotation: -110, duration: .35, ease: "back.out(1.5)" });
      gsap.to(armR, { rotation: -60, duration: .25, delay: .35 });
      gsap.to(armR, { rotation: -110, duration: .25, delay: .6 });
      gsap.to(armR, { rotation: 18, duration: .4, delay: 1 });
    } else if (g === "shrug") {
      gsap.to(armL, { rotation: -70, y: -10, duration: .25 });
      gsap.to(armR, { rotation: 70, y: -10, duration: .25 });
      gsap.to(armL, { rotation: -18, y: 0, duration: .4, delay: .6, ease: "back.out(1.2)" });
      gsap.to(armR, { rotation: 18, y: 0, duration: .4, delay: .6, ease: "back.out(1.2)" });
    } else if (g === "nod") {
      gsap.to(head, { y: 10, duration: .12, yoyo: true, repeat: 3 });
      setTimeout(() => gsap.to(head, { y: 0, duration: .3, ease: "elastic.out(1,0.5)" }), 550);
    } else if (g === "point") {
      gsap.to(armR, { rotation: -85, duration: .3 });
      setTimeout(() => gsap.to(armR, { rotation: 18, duration: .4 }), 900);
    } else if (g === "dance") {
      this.windUp(.15);
      gsap.to(char, { rotation: -4, duration: .18, yoyo: true, repeat: 5, ease: "sine.inOut", delay: .15 });
      gsap.to([armL, armR], { rotation: -90, duration: .18, yoyo: true, repeat: 5, delay: .15 });
      gsap.to(armL, { rotation: -18, duration: .3, delay: 1.25 });
      gsap.to(armR, { rotation: 18, duration: .3, delay: 1.25 });
      setTimeout(() => this.popUp(6), 1250);
    } else if (g === "facepalm") {
      gsap.to(armR, { rotation: -140, duration: .35, ease: "power2.out" });
      setTimeout(() => gsap.to(armR, { rotation: 18, duration: .4 }), 900);
      setTimeout(() => gsap.to(head, { y: 4, duration: .14, yoyo: true, repeat: 1 }), 950);
    }
  }

  // ---------- face channel ----------
  gaze(dir) {
    const P = { left: [-9, 0], right: [9, 0], up: [0, -5], down: [0, 4], center: [0, 0], camera: [0, 0] };
    const p = P[dir] || P.center;
    this.gazeHoldUntil = Date.now() + 3000;
    gsap.to([this.pupilL, this.pupilR], { x: p[0], y: p[1], duration: .25, ease: "power2.out" });
  }
  brows(v) {
    const { browL, browR } = this;
    if (v === "raise") { gsap.to(browL, { y: -11, rotation: -8, duration: .25 }); gsap.to(browR, { y: -11, rotation: 8, duration: .25 }); }
    else if (v === "lower") { gsap.to(browL, { y: 4, rotation: -4, duration: .25 }); gsap.to(browR, { y: 4, rotation: 4, duration: .25 }); }
    else if (v === "furrow") { gsap.to(browL, { y: 3, rotation: -18, duration: .2 }); gsap.to(browR, { y: 3, rotation: 18, duration: .2 }); }
    else if (v === "one") { gsap.to(browL, { y: -10, rotation: -10, duration: .25 }); gsap.to(browR, { y: 2, rotation: 2, duration: .25 }); }
  }
  fxShow(el, on, ms = 2600) {
    gsap.to(el, { opacity: on ? 1 : 0, duration: .2 });
    if (on && el === this.fx.tear) gsap.fromTo(el, { y: -4 }, { y: 12, duration: ms / 1000, ease: "power1.in" });
    if (on && el === this.fx.puff) gsap.fromTo(el, { scale: .5 }, { scale: 1.15, duration: .25, ease: "back.out(2)" });
    clearTimeout(this.fxTimer);
    if (on) this.fxTimer = setTimeout(() => gsap.to([this.fx.tear, this.fx.sweat, this.fx.puff], { opacity: 0, duration: .3 }), ms);
  }

  // ---------- stage channel ----------
  stageFx(payload) {
    for (const part of String(payload).split(",")) {
      const [k, v] = part.split("=");
      if (k === "lean" && v !== "off") gsap.to(this.char, { scale: 1.12, duration: .35, ease: "power2.out" });
      else if (k === "zoom" && v !== "off") { if (this.stage) gsap.to(this.stage, { scale: 1.07, duration: .35, ease: "power2.out" }); }
      else if (k === "shake") gsap.to(this.char, { x: 6, duration: .05, yoyo: true, repeat: 9, onComplete: () => gsap.set(this.char, { x: 0 }) });
      else if (k === "dim") { if (this.stage) gsap.to(this.stage, { filter: "brightness(.82)", duration: .4 }); }
      else if (k === "caption" && v && this.chemTrail) this.chemTrail.textContent = v.replace(/_/g, " ").slice(0, 40);
      this._stageRestore();
    }
  }
  _stageRestore(ms = 2500) {
    clearTimeout(this.stageTimer);
    this.stageTimer = setTimeout(() => {
      gsap.to(this.char, { scale: 1, x: 0, duration: .4, ease: "sine.out" });
      if (this.stage) gsap.to(this.stage, { scale: 1, x: 0, filter: "brightness(1)", duration: .4 });
      if (this.chemTrail) this.chemTrail.textContent = this.showName;
    }, ms);
  }

  // ---------- sfx channel (synthesized, no assets) ----------
  sfxCtx() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume().catch(() => {});
      return this.audioCtx;
    } catch { return null; }
  }
  sfx(name) {
    name = String(name || "").split(",")[0];
    const ctx = this.sfxCtx(); if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const tone = (f0, f1, dur, type = "sine", vol = .25) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + .02);
      };
      const noise = (dur = .12, vol = .3, ff = 2000) => {
        const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = ctx.createBufferSource(); s.buffer = b;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = ff;
        const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
        s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t);
      };
      if (name === "pop") tone(600, 200, .09, "sine", .3);
      else if (name === "boing") { tone(300, 80, .28, "triangle", .3); tone(150, 320, .2, "sine", .15); }
      else if (name === "rimshot") { noise(.1, .35, 2500); tone(800, 700, .06, "square", .12); setTimeout(() => { try { noise(.14, .4, 1800); tone(500, 400, .09, "square", .15); } catch {} }, 140); }
      else if (name === "scratch") { tone(400, 100, .18, "sawtooth", .2); setTimeout(() => this.sfx("scratch2"), 180); }
      else if (name === "scratch2") { const o = ctx.createOscillator(), g = ctx.createGain(), t2 = ctx.currentTime; o.type = "sawtooth"; o.frequency.setValueAtTime(100, t2); o.frequency.exponentialRampToValueAtTime(350, t2 + .2); g.gain.setValueAtTime(.2, t2); g.gain.exponentialRampToValueAtTime(.001, t2 + .22); o.connect(g); g.connect(ctx.destination); o.start(t2); o.stop(t2 + .25); }
    } catch (e) { console.warn('sfx failed', name, e); }
  }

  // ---------- tag dispatch (grammar v2) ----------
  fireSlot(s) {
    if (!s || s.fired) return; s.fired = true;
    if (s.type === "emotion") this.setEmotion(s.value);
    else if (s.type === "gesture") setTimeout(() => this.gesturePlay(s.value), 120);
    else if (s.type === "tag") {
      try {
        if (s.channel === "face") {
          for (const part of String(s.value).split(",")) {
            const [k, v] = part.split("=");
            if (k === "gaze" && v) this.gaze(v);
            else if (k === "brows" && v) this.brows(v);
            else if (k === "blink" && v) { if (v === "fast") this.blinkDelay = 900; else if (v === "slow") this.blinkDelay = 4200; }
            else if (k === "tear") this.fxShow(this.fx.tear, v !== "off");
            else if (k === "sweat") this.fxShow(this.fx.sweat, v !== "off");
            else if (k === "puff") this.fxShow(this.fx.puff, v !== "off");
          }
        }
        else if (s.channel === "stage") this.stageFx(s.value);
        else if (s.channel === "sfx") this.sfx(s.value);
      } catch (e) { console.warn('tag handler failed', s.channel, e); }
    }
  }

  // ---------- mouth ----------
  mouthInterior(h) {
    gsap.set(this.tongue, { opacity: h > 22 ? 1 : 0 });
    gsap.set(this.root.querySelectorAll('.teeth'), { opacity: h > 14 ? 1 : 0 });
  }
  mouthShape(ch) {
    const c = String(ch || "").toLowerCase();
    if ("ae".includes(c)) return [70, 30];
    if ("ou".includes(c)) return [46, 30];
    if ("iy".includes(c)) return [60, 14];
    if ("mbp".includes(c)) return [48, 8];
    if ("fv".includes(c)) return [54, 12];
    if ("sz".includes(c)) return [52, 10];
    if ("tdnlrkgcjxqh".includes(c)) return [58, 16];
    return [56, 14];
  }
  setMouth(w, h, dur = .06) { gsap.to(this.mouth, { width: w, height: h, duration: dur, overwrite: true }); this.mouthInterior(h); }
  flapTick() {
    if (!this.talking || this.audioEl) return;
    const open = Math.random() > .35;
    const h = open ? 18 + Math.random() * 22 : 10 + Math.random() * 8;
    const w = open ? 54 + Math.random() * 18 : 64;
    gsap.to(this.mouth, { height: h, width: w, duration: .07, ease: "power1.out" });
    this.mouthInterior(h);
    if (Math.random() > .85) gsap.to([this.pupilL, this.pupilR], { y: (Math.random() - .5) * 2, duration: .06 });
    this.talkTimer = setTimeout(() => this.flapTick(), 70 + Math.random() * 90);
  }
  startTalking() {
    if (this.talking) return;
    this.talking = true;
    this.onStatus?.("talking", { talking: true });
    this.flapTick();
  }
  stopTalking() {
    this.vowelClock = false;
    this.talking = false;
    clearTimeout(this.talkTimer);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.audioEl && !this.audioEl.paused) { try { this.audioEl.pause(); } catch {} }
    this.onStatus?.("idle • blinking", { talking: false });
    gsap.to(this.mouth, { height: 28, width: 64, duration: .22 });
  }
  startAudioLipSync(audio) {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume().catch(() => {});
      try { this.audioSrc?.disconnect(); } catch {}
      try { this.analyser?.disconnect(); } catch {}
      this.analyser = this.audioCtx.createAnalyser(); this.analyser.fftSize = 256;
      this.audioSrc = this.audioCtx.createMediaElementSource(audio);
      this.audioSrc.connect(this.analyser); this.analyser.connect(this.audioCtx.destination);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.talking || audio.paused) return;
        if (this.vowelClock) return; // measured mouth shapes own the mouth when timing exists
        this.analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const norm = Math.min(1, avg / 90);
        const h = 14 + norm * 30 + Math.random() * 4;
        this.setMouth(68 - norm * 10, h);
        if (norm > .45) gsap.to([this.pupilL, this.pupilR], { y: (Math.random() - .5) * 1.5, duration: .05 });
        this.rafId = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { console.warn('audio analyser failed', e); }
  }
}

// Base expression set. Recipes take the character (ch) so overrides compose:
// a variant keeps every recipe except the ones it replaces.
Character.EMOTIONS = {
  neutral: (ch) => { gsap.to(ch.browL, { y: -2, rotation: -4, duration: .35 }); gsap.to(ch.browR, { y: -2, rotation: 4, duration: .35 }); gsap.to(ch.mouth, { width: 44, height: 12, borderRadius: 12, duration: .3 }); ch.mouthInterior(12); gsap.to(ch.cheeks, { opacity: .35, duration: .3 }); gsap.to(ch.head, { rotation: 0, y: 0, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: 1, scaleX: 1, duration: .25 }); gsap.to([ch.pupilL, ch.pupilR], { y: 0, duration: .2 }); gsap.to(ch.armL, { rotation: -24, x: -5, y: 0, duration: .4, ease: "sine.out" }); gsap.to(ch.armR, { rotation: 24, x: 5, y: 0, duration: .4, ease: "sine.out" }); },
  happy: (ch) => { gsap.to(ch.browL, { y: -7, rotation: -10, duration: .3 }); gsap.to(ch.browR, { y: -7, rotation: 10, duration: .3 }); gsap.to(ch.mouth, { width: 68, height: 26, borderRadius: 14, duration: .3 }); gsap.to(ch.cheeks, { opacity: .9, duration: .3 }); gsap.to(ch.head, { rotation: 1, y: -2, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .92, scaleX: 1.04, duration: .25 }); },
  excited: (ch) => { gsap.to(ch.browL, { y: -10, rotation: -14, duration: .25 }); gsap.to(ch.browR, { y: -10, rotation: 14, duration: .25 }); gsap.to(ch.mouth, { width: 78, height: 34, borderRadius: 16, duration: .25 }); gsap.to(ch.cheeks, { opacity: 1, duration: .3 }); ch.windUp(.12); setTimeout(() => ch.popUp(8), 130); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .95, duration: .2 }); },
  sad: (ch) => { gsap.to(ch.browL, { y: 5, rotation: 16, duration: .3 }); gsap.to(ch.browR, { y: 5, rotation: -16, duration: .3 }); gsap.to(ch.mouth, { width: 44, height: 14, borderRadius: 8, duration: .3 }); gsap.to(ch.cheeks, { opacity: .15, duration: .3 }); gsap.to(ch.head, { rotation: -2, y: 2, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .96, duration: .3 }); },
  angry: (ch) => { gsap.to(ch.browL, { y: 3, rotation: -20, duration: .2 }); gsap.to(ch.browR, { y: 3, rotation: 20, duration: .2 }); gsap.to(ch.mouth, { width: 54, height: 20, borderRadius: 4, duration: .25 }); gsap.to(ch.cheeks, { opacity: .65, duration: .3 }); gsap.to(ch.head, { x: -2, duration: .05, yoyo: true, repeat: 6 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .9, scaleX: 1.08, duration: .2 }); },
  surprised: (ch) => { gsap.to(ch.browL, { y: -13, rotation: 0, duration: .2 }); gsap.to(ch.browR, { y: -13, rotation: 0, duration: .2 }); gsap.to(ch.mouth, { width: 40, height: 42, borderRadius: 50, duration: .2 }); ch.headBoing(); gsap.to([ch.eyeL, ch.eyeR], { scale: 1.12, scaleY: 1.12, duration: .2 }); setTimeout(() => gsap.to([ch.eyeL, ch.eyeR], { scale: 1, scaleY: 1, duration: .3 }), 450); },
  confused: (ch) => { gsap.to(ch.browL, { y: -7, rotation: -8, duration: .3 }); gsap.to(ch.browR, { y: 3, rotation: 8, duration: .3 }); gsap.to(ch.mouth, { width: 46, height: 16, borderRadius: 8, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scale: 1, duration: .3 }); },
  smug: (ch) => { gsap.to(ch.browL, { y: -3, rotation: -6, duration: .3 }); gsap.to(ch.browR, { y: 1, rotation: 2, duration: .3 }); gsap.to(ch.mouth, { width: 62, height: 14, borderRadius: 12, duration: .3 }); gsap.to(ch.cheeks, { opacity: .55, duration: .3 }); gsap.to(ch.head, { rotation: 2, duration: .3 }); },
  shy: (ch) => { gsap.to(ch.browL, { y: -1, rotation: -2, duration: .3 }); gsap.to(ch.browR, { y: -1, rotation: 2, duration: .3 }); gsap.to(ch.mouth, { width: 36, height: 16, borderRadius: 10, duration: .3 }); gsap.to(ch.cheeks, { opacity: 1, duration: .3 }); gsap.to(ch.head, { rotation: -3, y: 1, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .94, duration: .3 }); },
  sleepy: (ch) => { gsap.to(ch.browL, { y: 2, rotation: 0, duration: .3 }); gsap.to(ch.browR, { y: 2, rotation: 0, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .62, duration: .3 }); gsap.to(ch.mouth, { width: 34, height: 22, borderRadius: 50, duration: .3 }); gsap.to(ch.cheeks, { opacity: .4, duration: .3 }); },
  suspicious: (ch) => { gsap.to(ch.browL, { y: -10, rotation: -10, duration: .25 }); gsap.to(ch.browR, { y: 2, rotation: 2, duration: .25 }); gsap.to([ch.pupilL, ch.pupilR], { x: 7, duration: .25 }); gsap.to(ch.mouth, { width: 50, height: 12, borderRadius: 8, duration: .25 }); gsap.to(ch.head, { rotation: 2, duration: .3 }); gsap.to(ch.cheeks, { opacity: .3, duration: .3 }); },
  scared: (ch) => { gsap.to(ch.browL, { y: -12, rotation: 0, duration: .2 }); gsap.to(ch.browR, { y: -12, rotation: 0, duration: .2 }); gsap.to([ch.eyeL, ch.eyeR], { scale: 1.15, scaleY: 1.15, duration: .2 }); gsap.to(ch.mouth, { width: 36, height: 30, borderRadius: 50, duration: .2 }); gsap.to(ch.cheeks, { opacity: .2, duration: .3 }); gsap.to(ch.head, { x: -2, duration: .06, yoyo: true, repeat: 5 }); setTimeout(() => gsap.to([ch.eyeL, ch.eyeR], { scale: 1, scaleY: 1, duration: .3 }), 600); },
  proud: (ch) => { gsap.to(ch.browL, { y: -6, rotation: -6, duration: .3 }); gsap.to(ch.browR, { y: -6, rotation: 6, duration: .3 }); gsap.to(ch.mouth, { width: 66, height: 18, borderRadius: 12, duration: .3 }); gsap.to(ch.cheeks, { opacity: .6, duration: .3 }); gsap.to(ch.head, { rotation: -1, y: -3, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: 1, scaleX: 1, duration: .25 }); },
  bored: (ch) => { gsap.to(ch.browL, { y: 0, rotation: 0, duration: .3 }); gsap.to(ch.browR, { y: 0, rotation: 0, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .7, duration: .3 }); gsap.to(ch.mouth, { width: 44, height: 10, borderRadius: 8, duration: .3 }); gsap.to(ch.head, { rotation: 4, y: 2, duration: .3 }); gsap.to(ch.cheeks, { opacity: .25, duration: .3 }); },
  unimpressed: (ch) => { gsap.to(ch.browL, { y: -4, rotation: -4, duration: .3 }); gsap.to(ch.browR, { y: 2, rotation: 0, duration: .3 }); gsap.to([ch.eyeL, ch.eyeR], { scaleY: .85, duration: .3 }); gsap.to(ch.mouth, { width: 52, height: 10, borderRadius: 8, duration: .3 }); gsap.to(ch.head, { rotation: 3, duration: .3 }); gsap.to(ch.cheeks, { opacity: .3, duration: .3 }); },
};
