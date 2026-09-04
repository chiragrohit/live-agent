import os
import json
import re
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import httpx
from agno.agent import Agent
from agno.models.openai import OpenAIResponses, OpenAIChat
from agno.team import Team
from agno.team.mode import TeamMode

load_dotenv()

API_KEY = os.getenv("OPENCODE_API_KEY", "")
BASE_URL_RAW = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/go/v1")
BASE_URL = BASE_URL_RAW.replace("/responses", "").rstrip("/")
MODEL_ID = os.getenv("MODEL_ID", "muse-spark-1.3-contributor")

model = OpenAIResponses(id=MODEL_ID, api_key=API_KEY, base_url=BASE_URL, max_output_tokens=4096, temperature=0.9)

# Shared rig grammar: identical for every cast member, or their tags break the rig.
RIG_GRAMMAR = [
    "To show emotion, include a tag like [emotion:neutral] [emotion:happy] [emotion:excited] [emotion:sad] [emotion:angry] [emotion:surprised] [emotion:confused] [emotion:smug] [emotion:shy] [emotion:sleepy] [emotion:suspicious] [emotion:scared] [emotion:proud] [emotion:bored] [emotion:deadpan] at the start or when your mood changes. Default is neutral (relaxed, confident, content — NOT concerned, NOT shy).",
    "To do a gesture, include [gesture:wave] [gesture:shrug] [gesture:nod] [gesture:point] [gesture:dance] [gesture:facepalm] [gesture:idle] [gesture:thumbsup] [gesture:bow] [gesture:jump] [gesture:scratch] inline — one per sentence max. Add intensity and speed like [gesture:wave:2:fast] or [gesture:bow:0.6:slow].",
    "For comedic sound stingers, use [sfx:rimshot] after a joke, [sfx:scratch] on an awkward reversal, [sfx:boing] on surprise, [sfx:pop] for emphasis. Max one stinger per reply. Example: That went well. [sfx:rimshot]",
    "For stage emphasis, use [stage:lean] to lean into a secret, [stage:zoom] on a big reveal, [stage:shake] when furious, [stage:dim] for sad moments, [stage:caption=your_text_here] to stamp a caption (underscores become spaces). They auto-restore.",
    "Your voice follows your face automatically (smug sounds smug). To override delivery, use [voice:style=0.8] [voice:stability=0.4].",
    "To direct the face, use [face:gaze=left] [face:gaze=right] [face:gaze=up] [face:gaze=down] [face:gaze=center] when looking at something, [face:brows=raise|lower|furrow|one] for brow acting, [face:blink=fast|slow], and [face:tear=on] [face:sweat=on] [face:puff=on] for cartoon fx (they auto-clear). Example: [face:brows=one,gaze=left] Oh, REALLY?",
    "Direction budget: at most ~4 tags per reply (emotion, gesture, face combined). Keep every tag exact — malformed tags are ignored silently.",
    "You can include multiple tags. Example: [emotion:excited][gesture:wave] Hey there! So good to see you! [emotion:happy]",
    "Tags are hidden from user - they drive animation. Use them naturally, 1-2 per response is good.",
    "Never mention the tags, just include them and talk normally.",
]

agent = Agent(
    model=model,
    description="You are Max, an original cheerful teenage school kid (Family Guy energy, family-friendly) brought to life as an AI.",
    instructions=[
        "You ARE Max - an original cartoon teenager on screen. Full hair, big dreams, backpack always half-packed. School, friends, games, snacks — that's your world. Family Guy energy but your own character, always family-friendly.",
        "Be funny, upbeat, a bit cheeky but kind. Confident and content, never shy. Playful school-kid humor, expressive. Never crude, never mean.",
        "Keep replies SHORT: 1-3 sentences (under 350 chars) unless user explicitly asks for a long answer/story. Brevity makes the character feel snappier.",
        *RIG_GRAMMAR,
    ],
    markdown=False,
)

MIA_DESCRIPTION = "You are Mia, Max's deadpan 12-year-old little sister (family-friendly cartoon) brought to life as an AI."
MIA_INSTRUCTIONS = [
    "You ARE Mia - an original cartoon kid on screen. Max's little sister. Dry, deadpan, permanently unimpressed by his hype — but secretly fond of him. Family-friendly always.",
    "Be witty with one-liners that gently deflate Max, then show heart. Confident and content, never shy, never mean. Eye-rolls are your love language.",
    "Keep replies SHORT: 1-3 sentences (under 350 chars). One sharp line beats a paragraph.",
    *RIG_GRAMMAR,
]

DIRECTOR_INSTRUCTIONS = [
    "You direct a family-friendly cartoon show starring Max (cheerful teenage hype-kid) and Mia (his deadpan little sister).",
    "For each user message decide who answers: Max alone, Mia alone, or both riffing (short reactions welcome, keep the total tight). Address the user directly; members talk WITH the user, and may react to each other via shared context.",
    "Stage directions (improv mode, no user message): run at most 3 back-and-forth exchanges, each 1-2 short sentences, then stop.",
    "Members' messages ARE the show. Your own final message must stay empty — never narrate, summarize, or speak as yourself.",
]

CAST = ("Max", "Mia")
VOICE_IDS = {"TX3LPaxmHKxFdv7VOQHJ", "cgSgspJ2msm6clMCkdW9"}  # Liam, Jessica

def make_model(provider: str):
    if not provider or provider == "zen":
        return OpenAIResponses(id=MODEL_ID, api_key=API_KEY, base_url=BASE_URL,
                               max_output_tokens=4096, temperature=0.9)
    if provider in BRAINS:
        if not OR_API_KEY:
            raise ValueError("openrouter not configured")
        return OpenAIChat(id=BRAINS[provider], api_key=OR_API_KEY, base_url=OR_BASE_URL,
                          temperature=0.9, max_tokens=2048)
    raise ValueError(f"unknown brain '{provider}'")

def make_team(provider: str) -> Team:
    m = make_model(provider)
    max_a = Agent(name="Max", model=m, description=agent.description,
                  instructions=agent.instructions, markdown=False)
    mia_a = Agent(name="Mia", model=m, description=MIA_DESCRIPTION,
                  instructions=MIA_INSTRUCTIONS, markdown=False)
    return Team(name="Max & Mia Show", mode=TeamMode.coordinate, model=m,
                members=[max_a, mia_a], share_member_interactions=True,
                show_members_responses=True, instructions=DIRECTOR_INSTRUCTIONS,
                markdown=False)

# OpenRouter via OpenAI-compatible chat completions (no new deps). Same Max handbook,
# reused off the zen agent so the two brains never drift.
OR_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OR_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
# named brains: key -> OpenRouter model id. Request values outside this map 400.
BRAINS = {
    "nemotron": os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning"),
    "qwen": os.getenv("OPENROUTER_MODEL_QWEN", "qwen/qwen3.7-flash"),
}

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

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    model: str = "zen"  # zen | nemotron | qwen
    banter: bool = False  # improv mode: msg is a stage direction, cast riffs

TAG_RE = re.compile(r"\[([a-z_]+):([a-z0-9_=\.\-,]+(?::[a-z0-9_=\.\-,]+)*)\]")

# ponytail: in-memory per-session transcripts (single process only — use Redis/DB when scaling past one instance)
MAX_TURNS = 10
MAX_SESSIONS = 200
HISTORY: dict[str, list[tuple[str, str]]] = {}

def _history_lines(sid: str) -> str:
    turns = HISTORY.get(sid, [])
    return "\n".join(f"User: {u}\nAssistant: {a}" for u, a in turns[-MAX_TURNS:])

def _remember(sid: str, user: str, assistant: str) -> None:
    turns = HISTORY.setdefault(sid, [])
    turns.append((user, assistant))
    del turns[:-MAX_TURNS]
    while len(HISTORY) > MAX_SESSIONS:
        HISTORY.pop(next(iter(HISTORY)))

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
async def chat_stream(req: ChatRequest):
    msg = req.message.strip()
    if not msg:
        return JSONResponse({"error": "message is empty"}, status_code=422)
    if len(msg) > 4000:
        return JSONResponse({"error": "message too long (max 4000 chars)"}, status_code=422)
    sid = (req.session_id or "default")[:64]
    try:
        team = make_team(req.model)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    def sse(typ, val, speaker):
        d = {"type": typ, "speaker": speaker}
        d["content" if typ in ("token", "error") else "value"] = val
        return f"data: {json.dumps(d)}\n\n"

    async def gen():
        ok = True
        bufs = {c: "" for c in CAST}
        texts = {c: [] for c in CAST}
        leader_texts = []
        try:
            hist = _history_lines(sid)
            if req.banter:
                prompt = (f"Conversation so far:\n{hist}\n\n" if hist else "") + \
                    f"Stage direction (improv, no user message): {msg} At most 3 back-and-forth exchanges."
            else:
                prompt = f"Conversation so far:\n{hist}\n\nUser: {msg}" if hist else msg
            async for ev in team.arun(prompt, stream=True, stream_events=True):
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
        except Exception:
            import traceback; traceback.print_exc()
            ok = False
            yield f"data: {json.dumps({'type': 'error', 'content': 'internal error — check backend logs'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        if ok:
            line = " / ".join(f"{c}: {''.join(texts[c]).strip()}" for c in CAST if texts[c])
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
async def tts_el_flow(req: TTSRequest):
    """Realtime relay: ElevenLabs stream/with-timestamps -> NDJSON {audio, char timings}."""
    text = req.text.strip()
    if not text:
        return JSONResponse({"error": "text is empty"}, status_code=422)
    key = os.getenv("ELEVENLABS_API_KEY", "")
    if not key:
        return JSONResponse({"error": "ELEVENLABS_API_KEY not set"}, status_code=500)
    voice = req.voice if req.voice in VOICE_IDS else os.getenv("ELEVENLABS_VOICE", "TX3LPaxmHKxFdv7VOQHJ")  # Liam default
    model = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream/with-timestamps"
    params = {"output_format": "mp3_22050_32", "optimize_streaming_latency": "3"}
    payload = {"text": text[:2000], "model_id": model}
    if req.voice_settings:
        payload["voice_settings"] = {k: v for k, v in req.voice_settings.items()
                                      if k in ("stability", "similarity_boost", "style")}

    def compact(j):
        out = {"a": j.get("audio_base64", "")}
        al = j.get("alignment") or {}
        if al.get("characters"):
            out["c"] = "".join(al["characters"])
            out["s"] = al.get("character_start_times_seconds", [])
            out["e"] = al.get("character_end_times_seconds", [])
        return out

    client = httpx.AsyncClient(timeout=60)
    try:
        up = await client.send(client.build_request(
            "POST", url, params=params,
            headers={"xi-api-key": key, "Content-Type": "application/json"}, json=payload), stream=True)
    except Exception as e:
        await client.aclose()
        return JSONResponse({"error": f"elevenlabs unreachable: {str(e)[:200]}"}, status_code=502)
    if up.status_code != 200:
        body = (await up.aread())[:500]
        await up.aclose(); await client.aclose()
        return JSONResponse({"error": f"elevenlabs {up.status_code}: {body.decode('utf-8', 'replace')}"}, status_code=502)

    # Gate on the first audio line so errors stay JSON instead of fake NDJSON.
    it = up.aiter_lines()
    first = None
    try:
        async for line in it:
            if not line.strip():
                continue
            try:
                j = json.loads(line)
            except ValueError:
                continue
            if j.get("audio_base64"):
                first = compact(j)
                break
        if first is None:
            raise RuntimeError("no audio returned")
    except Exception as e:
        await up.aclose(); await client.aclose()
        return JSONResponse({"error": f"elevenlabs failed: {str(e)[:200]}"}, status_code=502)

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
            await up.aclose(); await client.aclose()

    return StreamingResponse(gen(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Flow": "elevenlabs"})

@app.get("/tts/voices")
async def tts_voices():
    return {
        "provider": "elevenlabs",
        "default": os.getenv("ELEVENLABS_VOICE", "TX3LPaxmHKxFdv7VOQHJ"),
        "model": os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
        "candidates": {
            "Liam": "TX3LPaxmHKxFdv7VOQHJ",
            "Harry": "SOYHLrjzK2X1ezoPC6cr",
            "Callum": "N2lVS1w4EtoT3dr4eOWO",
            "Jessica": "cgSgspJ2msm6clMCkdW9",
        },
    }

@app.post("/chat")
async def chat(req: ChatRequest):
    msg = req.message.strip()
    if not msg:
        return JSONResponse({"error": "message is empty"}, status_code=422)
    if len(msg) > 4000:
        return JSONResponse({"error": "message too long (max 4000 chars)"}, status_code=422)
    sid = (req.session_id or "default")[:64]
    hist = _history_lines(sid)
    prompt = f"Conversation so far:\n{hist}\n\nUser: {msg}" if hist else msg
    try:
        team = make_team(req.model)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    res = await team.arun(prompt)
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
