# Expression Rig v2 — Spec

## Problem Statement

The on-screen character feels limited: ten fixed facial recipes, a handful of whole-arm gestures, one mouth motion driven only by loudness, and a voice that never matches the acted mood. Viewers notice the puppet strings — text runs on estimates, every gesture fires at sentence start, and between sentences the character goes mannequin-still. The LLM can only "act" through two tag types, so performances are repetitive no matter how good the jokes are.

## Solution

Give the character a real acting instrument: a generic tag grammar (`[channel:payload]`) the LLM directs like a stage director, a frontend handler registry that turns tags into motion, cartoon-physics motion globally, a vowel-shaped mouth driven by the measured speech timeline, mood-matched voice settings, comedic sound effects, and stage emphasis moves. Every new behavior rides the existing word-timestamp clock, so nothing can ever drift from the voice. Ship it as six vertical slices, each demoable live on its own.

## User Stories

1. As a viewer, I want the character's mouth to shape vowels visibly, so that speech looks spoken instead of flapped.
2. As a viewer, I want pupils to follow my cursor, so that the character feels aware of me.
3. As a viewer, I want stronger acting faces (suspicious, scared, proud, bored), so that moods read instantly.
4. As a viewer, I want bigger body comedy (thumbs-up, bow, jump, scratch-head, stomp), so that punchlines land physically.
5. As a viewer, I want motion with squash, stretch, wind-up, and overshoot, so that movement feels cartoony instead of robotic.
6. As a viewer, I want comedic sound stingers (rimshot, record-scratch, boing) on jokes, so that timing feels like a show.
7. As a viewer, I want the voice itself to sound smug/sad/excited with the face, so that acting is audio-visual, not just visual.
8. As a viewer, I want emphasis moves (lean-in, zoom pop, screen shake) on big lines, so that important words hit harder.
9. As a viewer, I want the character to stay alive between sentences (breathing, weight shifts, blinks), so that silence doesn't look broken.
10. As a viewer, I want per-feature acting (one raised brow, sideways glance) instead of only whole-face recipes, so that performances vary.
11. As a viewer, I want gestures with intensity and speed (small wave vs huge wave), so that energy matches the line.
12. As a viewer, I want poses to linger and melt (hold/decay) instead of snapping, so that mood transitions feel natural.
13. As a viewer, I want the voice-off toggle to actually mute the voice while keeping acting, so that I control sound.
14. As a viewer, I want no regressions in text/voice/action sync, so that the ElevenLabs timeline work keeps paying off.
15. As a viewer, I want unknown or malformed direction tags to be ignored safely, so that a weird LLM line never breaks the show.
16. As a director (LLM), I want a documented tag vocabulary with examples, so that I use new channels correctly.
17. As a director (LLM), I want facing and gaze control, so that I can look at things I mention.
18. As a director (LLM), I want comedic pause control, so that I can time a beat before a punchline.
19. As a maintainer, I want each new behavior to be one registry entry plus prompt docs, so that the rig grows without rewrites.
20. As a maintainer, I want conflicting tags to arbitrate deterministically, so that stacked directions never glitch the rig.

## Implementation Decisions

- Tag grammar goes generic: `[channel:payload]` with channels `emotion`, `gesture`, `face`, `stage`, `fx`, `voice`, `sfx`, `pause`. The chat pipeline stays a dumb pipe — it passes any well-formed tag through as a timed event without understanding it.
- The frontend player owns a handler registry mapping channel → behavior function. New factors are added by registering one function; unknown channels are ignored.
- All tag firing stays on the measured speech timeline: each tag records the spoken-word index at arrival and fires when that word sounds. New channels inherit sync for free.
- Arbitration rule: latest-wins within a channel; across channels, body gestures outrank idle motion, and idle always loses. No two handlers fight over the same DOM node in the same tick.
- Cartoon physics (squash/stretch/anticipation/overshoot) is applied as a global motion pass over existing tweens, not per-gesture code.
- Vowel mouth shapes are derived from aligned character groups on the existing timeline — no phoneme model, roughly eight mouth recipes.
- Voice mood matching maps the sentence's acted emotion to per-request voice settings on the existing timestamped voice relay; the relay itself is untouched.
- Sound stingers are synthesized in-browser (no audio assets, no new dependencies, no new backend endpoints).
- The voice-off toggle mutes playback while keeping the timing clock, reveal, and tag firing intact.
- The LLM system prompt gains a director's handbook: channel vocabulary with two to three few-shot examples per channel, plus a tag budget (a few per reply) so performances stay readable.
- No new runtime dependencies, no secret changes, no caching-policy changes. Deployment stays a single container serve.

## Testing Decisions

- Test external behavior only: given a tag in the stream, the rig does the thing on the spoken word; never assert tween internals.
- Seams, highest first: (a) the tag dispatch registry as pure channel→behavior mapping, verifiable in a lightweight harness; (b) the chat pipeline's generic tag passthrough, verifiable with the existing stub-import backend test pattern; (c) end-to-end slice demos verified live against the deployed app per ticket (stream the chat, observe the timed behavior).
- Prior art for tests: the repo's earlier stub-import checks for the tag splitter and history cap, syntax checks for the player script, and live endpoint verification after each deploy.
- A good test here is: tag in → timed visible behavior out, malformed tag in → nothing breaks, voice-off → silence with acting intact.

## Out of Scope

- Legs, locomotion, walk cycles (no targets on a cutout rig).
- Finger-level hand systems (mitten hands; arm rotation carries point/thumb-up).
- Blend-weight emotion mixing (needs a pose-composition layer; deferred).
- A second character or multi-voice dialogue scenes.
- Switching the voice model to a more theatrical tier (separate A/B decision later).
- True phoneme visemes (vowel groups are the agreed approximation).
- Hand-authored absolute timelines (the measured speech clock remains the timing source).
- Any change to the voice relay, LLM provider, secrets, or deployment shape.

## Further Notes

- The `[gesture:idle]` direction the prompt advertises but no handler honors gets a real handler in this work.
- Tag budget guidance keeps the LLM from stacking unreadable performances; arbitration is the backstop, not the plan.
- Later phases (second character, blend weights, model tier A/B) build on the registry without touching it.
