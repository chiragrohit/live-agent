"""Routes only: chat SSE, TTS relay, voices, health, static frontend.

Cast/brains/memory live in cast.py, ElevenLabs relay in tts.py. One team turn
never hangs longer than LLM_TIMEOUT per brain attempt; a dead brain falls back
to zen mid-reply; expensive routes are per-IP rate-limited.
"""
import asyncio
import json
import os
import re
import time
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from cast import (API_KEY, BASE_URL, MODEL_ID, OR_API_KEY, BRAINS, CAST, CHARACTERS,
                  VOICE_IDS, brain_chain, make_team, _history_lines, _remember)
from tts import ElError, compact, open_el_stream

load_dotenv()

LLM_TIMEOUT = 150  # seconds per brain attempt, then fallback/error (never hang SSE)

app = FastAPI(title="Live Agent - Max")

@app.middleware("http")
async def no_store_frontend(request, call_next):
    # never let browsers cache the player: stale app.js = stale voice path
    resp = await call_next(request)
    if request.url.path in ("/", "/index.html", "/app.js", "/style.css"):
        resp.headers["Cache-Control"] = "no-store"
    return resp
# ponytail: same-origin frontend, no credentials needed — "*" + credentials=True is rejected by browsers
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

# ponytail: fixed-window per-IP limiter on the expensive routes, no deps
RATE_MAX, RATE_WINDOW = 30, 60.0
_RATE: dict[str, list[float]] = {}

def _limited(ip: str) -> bool:
    now = time.monotonic()
    hits = [t for t in _RATE.get(ip, []) if now - t < RATE_WINDOW]
    hits.append(now)
    _RATE[ip] = hits
    if len(_RATE) > 5000:
        _RATE.clear()
    return len(hits) > RATE_MAX

def _ip(request: Request) -> str:
    return request.client.host if request.client else "?"

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    model: str = "zen"  # zen | nemotron | qwen
    banter: bool = False  # improv mode: msg is a stage direction, cast riffs

TAG_RE = re.compile(r"\[([a-z_]+):([a-z0-9_=\.\-,]+(?::[a-z0-9_=\.\-,]+)*)\]")

def split_chunk(buf: str):
    """Split complete tag/text events from buf. Returns (events, rest).
    events: list of ("token", text) | ("emotion"|"gesture", value) | ("tag:<channel>", payload).
    rest: held incomplete trailing "[" fragment for the next chunk."""
    events: list[tuple[str, str]] = []
    while True:
        m = TAG_RE.search(buf)
        if not m:
            break
        pre = buf[:m.start()]
        if pre:
            events.append(("token", pre))
        channel, payload = m.group(1), m.group(2)
        # dumb pipe: known channels keep their event type, the rest ride as generic tags
        events.append((channel if channel in ("emotion", "gesture") else f"tag:{channel}", payload))
        buf = buf[m.end():]
    rest = ""
    head = buf
    if "[" in buf:
        i = buf.rfind("[")
        if "]" not in buf[i:]:
            head, rest = buf[:i], buf[i:]
    if head:
        events.append(("token", head))
    return events, rest

def _flush_rest(rest: str):
    """Final flush: emit any tags, then remainder as text (nothing held back)."""
    events, held = split_chunk(rest)
    if held:
        events.append(("token", held))
    return events

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_ID, "base_url": BASE_URL,
            "llm_configured": bool(API_KEY), "tts_configured": bool(os.getenv("ELEVENLABS_API_KEY", "")),
            "openrouter_configured": bool(OR_API_KEY),
            "models": {"zen": MODEL_ID, **BRAINS}, "cast": list(CAST)}

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    msg = req.message.strip()
    if not msg:
        return JSONResponse({"error": "message is empty"}, status_code=422)
    if len(msg) > 4000:
        return JSONResponse({"error": "message too long (max 4000 chars)"}, status_code=422)
    sid = (req.session_id or "default")[:64]
    try:
        brains = brain_chain(req.model)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    if _limited(_ip(request)):
        return JSONResponse({"error": "rate limited — slow down a little"}, status_code=429)

    def sse(typ, val, speaker):
        d = {"type": typ, "speaker": speaker}
        d["content" if typ in ("token", "error") else "value"] = val
        return f"data: {json.dumps(d)}\n\n"

    async def gen():
        ok = True
        gone = False
        failed = False
        bufs = {c: "" for c in CAST}
        texts = {c: [] for c in CAST}
        leader_texts = []
        hist = _history_lines(sid)
        if req.banter:
            prompt = (f"Conversation so far:\n{hist}\n\n" if hist else "") + \
                f"Stage direction (improv, no user message): {msg} At most 3 back-and-forth exchanges."
        else:
            prompt = f"Conversation so far:\n{hist}\n\nUser: {msg}" if hist else msg
        for bi, brain in enumerate(brains):
            try:
                team = make_team(brain)
                deadline = time.monotonic() + LLM_TIMEOUT
                async for ev in team.arun(prompt, stream=True, stream_events=True):
                    if time.monotonic() > deadline:
                        raise TimeoutError("llm turn timed out")  # builtin, no CM protocol needed
                    if await request.is_disconnected():
                        gone = True  # viewer left: stop burning LLM tokens
                        break
                    if "Content" not in type(ev).__name__:
                        continue  # Started/Completed events re-emit full text = exact repeats
                    content = getattr(ev, "content", None)
                    if not content or not isinstance(content, str):
                        continue
                    speaker = getattr(ev, "agent_name", "") or ""
                    if speaker in bufs:
                        events, bufs[speaker] = split_chunk(bufs[speaker] + content)
                        for typ, val in events:
                            if typ == "token":
                                texts[speaker].append(val)
                            yield sse(typ, val, speaker)
                    elif getattr(ev, "team_id", None):
                        leader_texts.append(content)  # director synthesis: fallback only, never voiced
                break  # streamed cleanly (or client left) — done with brains
            except Exception:
                import traceback; traceback.print_exc()
                if bi >= len(brains) - 1:
                    failed = True
                # else: brain died mid-stream, next brain continues the same reply
        if gone:
            return
        if failed:
            ok = False
            yield f"data: {json.dumps({'type': 'error', 'content': 'internal error — check backend logs'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        else:
            for speaker in CAST:
                for typ, val in _flush_rest(bufs[speaker]):
                    if typ == "token":
                        texts[speaker].append(val)
                    yield sse(typ, val, speaker)
            if not any(texts.values()) and leader_texts:
                events, _ = split_chunk("".join(leader_texts))
                for typ, val in events:
                    if typ == "token":
                        texts["Max"].append(val)
                    yield sse(typ, val, "Max")
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        if ok:
            line = "; ".join(c + ' said "' + "".join(texts[c]).strip() + '"' for c in CAST if texts[c])
            if line:
                _remember(sid, msg, line[:2000])

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    })

class TTSRequest(BaseModel):
    text: str
    voice_settings: dict | None = None
    voice: str | None = None  # allowlisted ElevenLabs voice id (Liam/Jessica)

@app.post("/tts/el-flow")
async def tts_el_flow(req: TTSRequest, request: Request):
    """Realtime relay: ElevenLabs stream/with-timestamps -> NDJSON {audio, char timings}."""
    text = req.text.strip()
    if not text:
        return JSONResponse({"error": "text is empty"}, status_code=422)
    if not os.getenv("ELEVENLABS_API_KEY", ""):
        return JSONResponse({"error": "ELEVENLABS_API_KEY not set"}, status_code=500)
    if _limited(_ip(request)):
        return JSONResponse({"error": "rate limited — slow down a little"}, status_code=429)
    voice = req.voice if req.voice in VOICE_IDS else CHARACTERS["Max"]["voice"]
    try:
        first, it, cleanup = await open_el_stream(text, voice, req.voice_settings)
    except ElError as e:
        return JSONResponse({"error": str(e)[:300]}, status_code=502)

    async def gen():
        try:
            yield json.dumps(first) + "\n"
            async for line in it:
                if not line.strip():
                    continue
                try:
                    j = json.loads(line)
                except ValueError:
                    continue
                if "audio_base64" in j or "alignment" in j:
                    yield json.dumps(compact(j)) + "\n"
        finally:
            await cleanup()

    return StreamingResponse(gen(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Flow": "elevenlabs"})

@app.get("/tts/voices")
async def tts_voices():
    return {
        "provider": "elevenlabs",
        "default": os.getenv("ELEVENLABS_VOICE", "TX3LPaxmHKxFdv7VOQHJ"),
        "model": os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
        "cast": {n: {"voice": c["voice"], "look": c["look"]} for n, c in CHARACTERS.items()},
        "candidates": {
            "Liam": "TX3LPaxmHKxFdv7VOQHJ",
            "Harry": "SOYHLrjzK2X1ezoPC6cr",
            "Callum": "N2lVS1w4EtoT3dr4eOWO",
            "Jessica": "cgSgspJ2msm6clMCkdW9",
        },
    }

@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    msg = req.message.strip()
    if not msg:
        return JSONResponse({"error": "message is empty"}, status_code=422)
    if len(msg) > 4000:
        return JSONResponse({"error": "message too long (max 4000 chars)"}, status_code=422)
    try:
        brains = brain_chain(req.model)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    if _limited(_ip(request)):
        return JSONResponse({"error": "rate limited — slow down a little"}, status_code=429)
    sid = (req.session_id or "default")[:64]
    hist = _history_lines(sid)
    prompt = f"Conversation so far:\n{hist}\n\nUser: {msg}" if hist else msg
    res = None
    for brain in brains:
        try:
            res = await asyncio.wait_for(make_team(brain).arun(prompt), LLM_TIMEOUT)
            break
        except Exception:
            import traceback; traceback.print_exc()
    if res is None:
        return JSONResponse({"error": "internal error — check backend logs"}, status_code=500)
    text = getattr(res, "content", str(res)) or ""
    if text.strip():
        _remember(sid, msg, text.strip()[:2000])
    return {"content": text}

# Serve frontend static
if os.path.isdir("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend:app", host="0.0.0.0", port=port, reload=True)
