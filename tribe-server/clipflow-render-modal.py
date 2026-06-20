"""
ClipFlow render worker — ffmpeg + yt-dlp on Modal (CPU, no GPU).

Renders one vertical 9:16 clip: downloads only the [start,end] section of a
YouTube video with yt-dlp, reframes it to 1080x1920 with ffmpeg, and burns in
captions — then returns the MP4 (and a thumbnail) as base64 JSON.

This is the off-Vercel home for ClipFlow's rendering step: Vercel's serverless
functions can't run ffmpeg/yt-dlp. It mirrors lib/clipflow/clipper.ts exactly,
so output matches the local path. The Next.js route calls this whenever
CLIPFLOW_RENDER_URL is set and falls back to local rendering otherwise.

Deploy:
    pip install modal
    modal deploy tribe-server/clipflow-render-modal.py

That prints an endpoint URL — put it in CLIPFLOW_RENDER_URL in your env.

Auth (recommended — the endpoint is public, this stops strangers using your worker):
    # pick any random string; use the SAME value in CLIPFLOW_RENDER_SECRET
    modal secret create clipflow-render-secret CLIPFLOW_RENDER_SECRET=$(openssl rand -hex 16)
To run without auth, remove the clipflow-render-secret entry from secrets=[...] below.

Note: YouTube sometimes blocks datacenter IPs. If downloads fail, attach a
cookies file (yt-dlp --cookies) — see the COOKIES note below.
"""

import modal

# CPU-only image: ffmpeg for the cut/reframe/caption-burn, yt-dlp for the
# section download. No GPU — libx264 encoding is CPU-bound.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi[standard]", "yt-dlp")
)

app = modal.App("clipflow-render-server", image=image)

# ASS force_style strings — must match lib/clipflow/clipper.ts so the remote
# render is visually identical to the local one.
CAPTION_STYLES = {
    "opus": "FontName=Arial,Fontsize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=120",
    "karaoke": "FontName=Arial,Fontsize=18,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=120",
    "minimal": "FontName=Arial,Fontsize=14,Bold=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=80",
}


def _srt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    ms = int((seconds % 1) * 1000)
    s = int(seconds) % 60
    m = int(seconds / 60) % 60
    h = int(seconds / 3600)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _build_srt(cues, start: float, end: float) -> str:
    """SRT for the [start,end] window, timed relative to the clip start."""
    out, i = [], 1
    for c in cues:
        cs, ce = float(c.get("start", 0)), float(c.get("end", 0))
        text = (c.get("text") or "").strip()
        if ce > start and cs < end and text:
            frm = max(0.0, cs - start)
            to = min(end - start, ce - start)
            out.append(f"{i}\n{_srt_time(frm)} --> {_srt_time(to)}\n{text}\n")
            i += 1
    return "\n".join(out)


@app.function(
    timeout=900,
    # Keep a container warm 2 min after the last render so a burst of clips from
    # one project doesn't each pay a cold start. Scales to zero when idle.
    scaledown_window=120,
    max_containers=6,
    secrets=[
        modal.Secret.from_name("clipflow-render-secret"),  # CLIPFLOW_RENDER_SECRET (remove to disable auth)
    ],
)
@modal.concurrent(max_inputs=2)
@modal.asgi_app(label="clipflow-render")
def web():
    import os
    import base64
    import tempfile
    import subprocess

    from fastapi import FastAPI, Header, HTTPException

    secret = os.environ.get("CLIPFLOW_RENDER_SECRET", "")
    api = FastAPI()

    def run(cmd: list[str], timeout: int):
        p = subprocess.run(cmd, capture_output=True, timeout=timeout)
        if p.returncode != 0:
            err = p.stderr.decode("utf-8", "ignore")[-600:]
            raise HTTPException(status_code=500, detail=f"{cmd[0]} failed: {err}")

    @api.post("/render")
    async def render(payload: dict, authorization: str | None = Header(default=None)):
        if secret and authorization != f"Bearer {secret}":
            raise HTTPException(status_code=401, detail="Unauthorized")

        youtube_id = (payload.get("youtube_id") or "").strip()
        if not youtube_id:
            raise HTTPException(status_code=400, detail="youtube_id is required")
        start_s = float(payload.get("start", 0))
        end_s = float(payload.get("end", 0))
        if end_s <= start_s:
            raise HTTPException(status_code=400, detail="end must be greater than start")
        caption_style = payload.get("caption_style") or "opus"
        burn = payload.get("burn_captions", True)
        cues = payload.get("cues") or []

        pad = 0.25  # small lead-in so we don't clip the first word
        dl_start = max(0.0, start_s - pad)
        dl_end = end_s + pad

        with tempfile.TemporaryDirectory() as d:
            source = os.path.join(d, "source.mp4")
            clip = os.path.join(d, "clip.mp4")
            thumb = os.path.join(d, "thumb.jpg")

            # 1) Download only the needed section.
            run(
                [
                    "yt-dlp",
                    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
                    "--download-sections", f"*{dl_start:.2f}-{dl_end:.2f}",
                    "--force-keyframes-at-cuts",
                    # COOKIES: if YouTube blocks the datacenter IP, mount a cookies
                    # file as a Modal secret/volume and add: "--cookies", "/path/cookies.txt",
                    "-o", source,
                    f"https://www.youtube.com/watch?v={youtube_id}",
                ],
                timeout=600,
            )

            # 2) Center-crop to 9:16, scale to 1080x1920, optionally burn captions.
            filters = ["crop=ih*9/16:ih", "scale=1080:1920"]
            if burn and cues:
                srt = _build_srt(cues, start_s, end_s)
                if srt.strip():
                    srt_file = os.path.join(d, "captions.srt")
                    with open(srt_file, "w", encoding="utf-8") as fh:
                        fh.write(srt)
                    style = CAPTION_STYLES.get(caption_style, CAPTION_STYLES["opus"])
                    escaped = srt_file.replace("\\", "/").replace(":", "\\:")
                    filters.append(f"subtitles='{escaped}':force_style='{style}'")

            # 3) Re-encode to the final clip.
            run(
                [
                    "ffmpeg", "-y", "-i", source,
                    "-vf", ",".join(filters),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart", clip,
                ],
                timeout=600,
            )

            # 4) Thumbnail from the middle of the clip (best-effort).
            thumb_b64 = None
            mid = max(0.0, (end_s - start_s) / 2)
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", f"{mid:.2f}", "-i", clip,
                     "-frames:v", "1", "-q:v", "3", thumb],
                    check=True, capture_output=True, timeout=60,
                )
                with open(thumb, "rb") as fh:
                    thumb_b64 = base64.b64encode(fh.read()).decode()
            except Exception:
                pass

            with open(clip, "rb") as fh:
                video_b64 = base64.b64encode(fh.read()).decode()

        return {"video_b64": video_b64, "thumb_b64": thumb_b64}

    return api
