# 06: Stage emphasis plus mood-matched voice

**What to build:** A stage direction channel performs emphasis moves (lean-in, zoom pop, screen shake, backdrop mood, chem-trail caption) on tagged words, and the voice relay request carries per-sentence voice settings mapped from the acted emotion — so big lines hit visually and the voice itself sounds smug, sad, or excited with the face.

**Blocked by:** 01 (needs the registry and channel vocabulary).

**Status:** done (shipped; voice_settings forwarded live, SSE shows angry+furrow+jump:3:fast)

- [ ] A stage direction (e.g. lean-in or shake) performs on the tagged spoken word and restores cleanly
- [ ] The same line acted sad vs excited produces audibly different vocal delivery
- [ ] Stage moves never disturb text reveal, mouth sync, or tag timing
- [ ] The voice relay endpoint contract is unchanged (settings travel inside the existing request)
