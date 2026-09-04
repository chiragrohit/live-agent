"""TTS module: ElevenLabs stream/with-timestamps relay with one retry.

open_el_stream() gates on the first audio line so upstream failures stay JSON
instead of fake audio bytes. Raises ElError on any failure; the route maps it
to a 502.
"""
import asyncio
import json
import os

import httpx

EL_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")


class ElError(Exception):
    pass


def compact(j: dict) -> dict:
    out = {"a": j.get("audio_base64", "")}
    al = j.get("alignment") or {}
    if al.get("characters"):
        out["c"] = "".join(al["characters"])
        out["s"] = al.get("character_start_times_seconds", [])
        out["e"] = al.get("character_end_times_seconds", [])
    return out


async def open_el_stream(text: str, voice: str, voice_settings: dict | None):
    """Returns (first_compacted_line, line_iterator, cleanup). Retries once."""
    key = os.getenv("ELEVENLABS_API_KEY", "")
    if not key:
        raise ElError("ELEVENLABS_API_KEY not set")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream/with-timestamps"
    params = {"output_format": "mp3_22050_32", "optimize_streaming_latency": "3"}
    payload = {"text": text[:2000], "model_id": EL_MODEL}
    if voice_settings:
        payload["voice_settings"] = {k: v for k, v in voice_settings.items()
                                      if k in ("stability", "similarity_boost", "style")}
    last: Exception | None = None
    for _ in range(2):  # one retry: most EL failures are transient 5xx/rate blips
        client = httpx.AsyncClient(timeout=60)
        up = None
        try:
            up = await client.send(client.build_request(
                "POST", url, params=params,
                headers={"xi-api-key": key, "Content-Type": "application/json"}, json=payload), stream=True)
            if up.status_code != 200:
                body = (await up.aread())[:300]
                raise ElError(f"elevenlabs {up.status_code}: {body.decode('utf-8', 'replace')}")
            it = up.aiter_lines()
            async for line in it:
                if not line.strip():
                    continue
                try:
                    j = json.loads(line)
                except ValueError:
                    continue
                if j.get("audio_base64"):
                    first = compact(j)

                    async def cleanup(u=up, c=client):
                        try:
                            await u.aclose()
                        finally:
                            await c.aclose()

                    return first, it, cleanup
            raise ElError("elevenlabs returned no audio")
        except ElError as e:
            last = e
        except Exception as e:
            last = ElError(f"elevenlabs unreachable: {str(e)[:150]}")
        if up is not None:
            try:
                await up.aclose()
            except Exception:
                pass
        await client.aclose()
        await asyncio.sleep(0.5)
    raise last or ElError("elevenlabs failed")
