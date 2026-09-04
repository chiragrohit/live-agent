# 01: Grammar-v2 plumbing with first live channel

**What to build:** The director-to-rig pipeline goes generic end to end: the chat stream passes any well-formed direction tag through as a timed event, the player dispatches tags through a handler registry instead of hardcoded branches, the LLM prompt documents the channel vocabulary, and one brand-new channel (`face`, starting with gaze) performs live on the spoken word — proving every future channel rides free.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] LLM can emit a non-emotion/non-gesture tag and it arrives as a timed player event on the correct spoken word
- [ ] Existing emotion and gesture tags behave exactly as before (same faces, same moves, same timing)
- [ ] A `face` direction moves the pupils to the directed gaze on the spoken word
- [ ] The prompt documents the channel vocabulary with examples per channel
- [ ] Malformed tags are ignored without breaking the stream, reveal, or playback
- [ ] Voice-off toggle mutes spoken audio while text reveal and tag acting continue
