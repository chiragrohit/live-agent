# 02: Cartoon physics pass

**What to build:** All character motion gets classic cartoon deformation: wind-up anticipation before big moves, squash-and-stretch through jumps and bounces, overshoot on stops, and follow-through on arms and head — applied globally so every existing and future gesture gets funnier with no per-gesture code.

**Blocked by:** 01 (needs the registry so physics helpers compose with tag handlers instead of fighting them).

**Status:** ready-for-agent

- [ ] Jumps and excited moves visibly squash before, stretch through, and overshoot-settle on landing
- [ ] Big gestures wind up briefly before firing rather than starting cold
- [ ] Existing gestures still complete and restore cleanly (no stuck limbs or tilts)
- [ ] Motion never desyncs from the voice timeline (physics only reshapes, never delays)
