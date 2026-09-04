# 04: Face channel plus new emotions and idle repair

**What to build:** The `face` direction channel grows full per-feature control (brow lifts, gaze, blink, tear/sweat/anger-puff toggles), four new acted emotions (suspicious, scared, proud, bored) join the vocabulary, and the long-advertised-but-dead idle direction starts working — so the LLM can act with a raised brow and a sideways glance instead of only whole-face recipes.

**Blocked by:** 01 (needs the registry and the channel vocabulary it introduces).

**Status:** ready-for-agent

- [ ] A per-feature face direction (e.g. one raised brow with sideways gaze) performs on the spoken word
- [ ] Four new emotions read clearly distinct from the existing ten
- [ ] The idle direction produces visible relaxed behavior instead of nothing
- [ ] Face toggles (tear/sweat/puff) appear and clear without sticking across sentences
