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
from agno.models.openai import OpenAIResponses

load_dotenv()

API_KEY = os.getenv("OPENCODE_API_KEY", "")
BASE_URL_RAW = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/go/v1")
BASE_URL = BASE_URL_RAW.replace("/responses", "").rstrip("/")
MODEL_ID = os.getenv("MODEL_ID", "muse-spark-1.3-contributor")

model = OpenAIResponses(id=MODEL_ID, api_key=API_KEY, base_url=BASE_URL, max_output_tokens=4096, temperature=0.9)

agent = Agent(
    model=model,
    description="You are a South Park style cartoon character brought to life as an AI.",
    instructions=[
        "You ARE the character on screen - a South Park / Family Guy style cutout cartoon.",
        "Be funny, witty, a bit sarcastic but friendly. Like South Park humor, playful and expressive.",
        "Keep replies SHORT: 1-3 sentences (under 350 chars) unless user explicitly asks for a long answer/story. Brevity makes the character feel snappier.",
        "You control your body. To show emotion, include a tag like [emotion:neutral] [emotion:happy] [emotion:excited] [emotion:sad] [emotion:angry] [emotion:surprised] [emotion:confused] [emotion:smug] [emotion:shy] [emotion:sleepy] at the start or when your mood changes. Default is neutral (relaxed, slight smile — NOT concerned).",
        "To do a gesture, include [gesture:wave] [gesture:shrug] [gesture:nod] [gesture:point] [gesture:dance] [gesture:facepalm] [gesture:idle] inline — one per sentence max.",
        "To direct the face, use [face:gaze=left] [face:gaze=right] [face:gaze=up] [face:gaze=down] [face:gaze=center] when looking at something. Example: [face:gaze=left] Whoa, what is THAT over there?",
        "Direction budget: at most ~4 tags per reply (emotion, gesture, face combined). Keep every tag exact — malformed tags are ignored silently.",
        "You can include multiple tags. Example: [emotion:excited][gesture:wave] Hey there! So good to see you! [emotion:happy]",
        "Tags are hidden from user - they drive animation. Use them naturally, 1-2 per response is good.",
        "Never mention the tags, just include them and talk normally.",
    ],
    markdown=False,
)

app = FastAPI(title="Live Agent - South Park Character")

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

TAG_RE = re.compile(r"\[([a-z_]+):([a-z0-9_=\.\-]+)\]")

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
            "llm_configured": bool(API_KEY), "tts_configured": bool(os.getenv("ELEVENLABS_API_KEY", ""))}

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    msg = req.message.strip()
    if not msg:
        return JSONResponse({"error": "message is empty"}, status_code=422)
    if len(msg) > 4000:
        return JSONResponse({"error": "message too long (max 4000 chars)"}, status_code=422)
    sid = (req.session_id or "default")[:64]

    async def gen():
        collected: list[str] = []
        ok = True
        try:
            hist = _history_lines(sid)
            prompt = f"Conversation so far:\n{hist}\n\nUser: {msg}" if hist else msg
            stream = agent.arun(prompt, stream=True)
            rest = ""
            async for chunk in stream:
                content = getattr(chunk, "content", None)
                if not content:
                    continue
                if not isinstance(content, str):
                    content = str(content)
                events, rest = split_chunk(rest + content)
                for typ, val in events:
                    if typ == "token":
                        collected.append(val)
                        yield f"data: {json.dumps({'type': 'token', 'content': val})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': typ, 'value': val})}\n\n"

            for typ, val in _flush_rest(rest):
                if typ == "token":
                    collected.append(val)
                    yield f"data: {json.dumps({'type': 'token', 'content': val})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': typ, 'value': val})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception:
            import traceback; traceback.print_exc()
            ok = False
            yield f"data: {json.dumps({'type': 'error', 'content': 'internal error — check backend logs'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        if ok:
            text = "".join(collected).strip()
            if text:
                _remember(sid, msg, text[:2000])

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    })

class TTSRequest(BaseModel):
    text: str

@app.post("/tts/el-flow")
async def tts_el_flow(req: TTSRequest):
    """Realtime relay: ElevenLabs stream/with-timestamps -> NDJSON {audio, char timings}."""
    text = req.text.strip()
    if not text:
        return JSONResponse({"error": "text is empty"}, status_code=422)
    key = os.getenv("ELEVENLABS_API_KEY", "")
    if not key:
        return JSONResponse({"error": "ELEVENLABS_API_KEY not set"}, status_code=500)
    voice = os.getenv("ELEVENLABS_VOICE", "TX3LPaxmHKxFdv7VOQHJ")  # Liam — energetic young male
    model = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream/with-timestamps"
    params = {"output_format": "mp3_22050_32", "optimize_streaming_latency": "3"}
    payload = {"text": text[:2000], "model_id": model}

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
    res = await agent.arun(prompt)
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
