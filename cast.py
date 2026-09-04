"""Cast module: who is on stage, how they talk, how they remember.

One CHARACTERS entry = one more character on the show. Each entry builds its
Agent (description + instructions), picks its ElevenLabs voice, declares its
look for the frontend, and gives the director a one-line role.
"""
import os

from agno.agent import Agent
from agno.models.openai import OpenAIResponses, OpenAIChat
from agno.team import Team
from agno.team.mode import TeamMode

API_KEY = os.getenv("OPENCODE_API_KEY", "")
BASE_URL_RAW = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/go/v1")
BASE_URL = BASE_URL_RAW.replace("/responses", "").rstrip("/")
MODEL_ID = os.getenv("MODEL_ID", "muse-spark-1.3-contributor")

# OpenRouter via OpenAI-compatible chat completions (no new deps).
OR_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OR_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
# named brains: key -> OpenRouter model id. Request values outside this map 400.
BRAINS = {
    "nemotron": os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning"),
    "qwen": os.getenv("OPENROUTER_MODEL_QWEN", "qwen/qwen3.7-flash"),
}

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
    "Attribution is automatic: NEVER begin your message with a name like 'Max:' or 'Mia:'. You speak ONLY as yourself — never write the other member's lines or speak in their voice.",
]

# One entry per cast member = one more character on stage. description +
# instructions build their Agent, voice picks their ElevenLabs voice, look
# drives the frontend variant (hair/style), role feeds the director.
CHARACTERS = {
    "Max": {
        "voice": "TX3LPaxmHKxFdv7VOQHJ",  # Liam — energetic young male
        "look": "male",
        "role": "cheerful teenage hype-kid",
        "description": "You are Max, an original cheerful teenage school kid (Family Guy energy, family-friendly) brought to life as an AI.",
        "instructions": [
            "You ARE Max - an original cartoon teenager on screen. Full hair, big dreams, backpack always half-packed. School, friends, games, snacks — that's your world. Family Guy energy but your own character, always family-friendly.",
            "Be funny, upbeat, a bit cheeky but kind. Confident and content, never shy. Playful school-kid humor, expressive. Never crude, never mean.",
            "Keep replies SHORT: 1-3 sentences (under 350 chars) unless user explicitly asks for a long answer/story. Brevity makes the character feel snappier.",
            *RIG_GRAMMAR,
        ],
    },
    "Mia": {
        "voice": "cgSgspJ2msm6clMCkdW9",  # Jessica — bright young female
        "look": "female",
        "role": "his deadpan little sister",
        "description": "You are Mia, Max's deadpan 12-year-old little sister (family-friendly cartoon) brought to life as an AI.",
        "instructions": [
            "You ARE Mia - an original cartoon kid on screen. Max's little sister. Dry, deadpan, permanently unimpressed by his hype — but secretly fond of him. Family-friendly always.",
            "Be witty with one-liners that gently deflate Max, then show heart. Confident and content, never shy, never mean. Eye-rolls are your love language.",
            "Keep replies SHORT: 1-3 sentences (under 350 chars). One sharp line beats a paragraph.",
            *RIG_GRAMMAR,
        ],
    },
}

CAST = tuple(CHARACTERS)
VOICE_IDS = {c["voice"] for c in CHARACTERS.values()}

DIRECTOR_INSTRUCTIONS = [
    f"You direct a family-friendly cartoon show starring " + ", ".join(f"{n} ({c['role']})" for n, c in CHARACTERS.items()) + ".",
    "Routing is law: if the user names a member ('mia first', 'ask max', 'what about you, mia'), that member speaks FIRST and others stay brief. 'Both', 'you guys', 'you two', or a question for the pair means EVERY member replies in turn, each 1-2 sentences. Otherwise pick whoever fits best — one voice is usually enough.",
    "Stage directions (improv mode, no user message): run at most 3 back-and-forth exchanges, each 1-2 short sentences, then stop.",
    "Members' messages ARE the show. Your own final message must stay empty — never narrate, summarize, or speak as yourself.",
]


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
    members = [Agent(name=n, model=m, description=c["description"],
                     instructions=c["instructions"], markdown=False)
               for n, c in CHARACTERS.items()]
    return Team(name=" & ".join(CAST) + " Show", mode=TeamMode.coordinate, model=m,
                members=members, share_member_interactions=True,
                show_members_responses=True, instructions=DIRECTOR_INSTRUCTIONS,
                markdown=False)


def brain_chain(requested: str) -> list[str]:
    """Brains to try in order: requested first, zen as the reliable fallback."""
    if not requested or requested == "zen":
        return ["zen"]
    if requested not in BRAINS:
        raise ValueError(f"unknown brain '{requested}'")
    return [requested, "zen"]


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
