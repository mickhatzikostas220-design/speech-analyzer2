"""
Parakeet ASR server — NVIDIA parakeet-tdt-0.6b-v3 on Modal.

Transcribes a short audio clip to word-level timestamps for the script editor's
clip matcher. Replaces the OpenAI Whisper call in /api/transcribe.

Deploy:
    pip install modal
    modal deploy tribe-server/parakeet-modal.py

That prints an endpoint URL — put it in PARAKEET_SERVER_URL in .env.local.

Auth (recommended — the endpoint is public, this stops strangers burning your GPU):
    # pick any random string, use the SAME value in PARAKEET_SERVER_SECRET
    modal secret create parakeet-secret PARAKEET_SERVER_SECRET=$(openssl rand -hex 16)
If you don't want auth, drop the parakeet-secret line from `secrets=[...]` below.

`huggingface-secret` (HF_TOKEN) is reused from the Tribe deploy. Parakeet is a
public model so the token is optional, but referencing the existing secret keeps
this consistent and avoids HF rate limits.
"""

import modal

# NVIDIA's NeMo container ships a NeMo + PyTorch + CUDA stack that's already
# version-matched for Parakeet. Pip-installing nemo_toolkit yourself means
# matching torch/CUDA by hand, which is the fiddly part.
#
# Pip alternative if from_registry gives you trouble:
#   modal.Image.debian_slim(python_version="3.11")
#       .apt_install("ffmpeg", "libsndfile1")
#       .pip_install("nemo_toolkit[asr]", "torch", "fastapi[standard]",
#                    "python-multipart", extra_index_url="https://download.pytorch.org/whl/cu121")
image = (
    modal.Image.from_registry("nvcr.io/nvidia/nemo:25.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi[standard]", "python-multipart", "soundfile")
)

app = modal.App("parakeet-asr-server", image=image)

# Cache model weights on a Volume so only the first cold start downloads them.
volume = modal.Volume.from_name("parakeet-cache", create_if_missing=True)
CACHE_DIR = "/cache"
MODEL_NAME = "nvidia/parakeet-tdt-0.6b-v3"


@app.function(
    gpu="A10G",
    volumes={CACHE_DIR: volume},
    timeout=600,
    # Keep the container (and the loaded model) warm for 5 min after the last
    # request so back-to-back clip transcriptions don't each pay a cold start.
    # Set min_containers=1 instead if you want zero cold starts (costs ~$1/hr idle).
    scaledown_window=300,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("huggingface-secret"),  # HF_TOKEN (optional for this model)
        modal.Secret.from_name("parakeet-secret"),     # PARAKEET_SERVER_SECRET (remove to disable auth)
    ],
)
@modal.concurrent(max_inputs=1)  # one GPU inference per container; Modal scales out under load
@modal.asgi_app(label="parakeet-transcribe")
def web():
    import os
    import tempfile
    import subprocess

    os.environ.setdefault("HF_HOME", CACHE_DIR)
    os.environ.setdefault("HF_HUB_CACHE", f"{CACHE_DIR}/hf")

    import torch
    import nemo.collections.asr as nemo_asr
    from fastapi import FastAPI, UploadFile, File, Header, HTTPException

    model = nemo_asr.models.ASRModel.from_pretrained(model_name=MODEL_NAME)
    if torch.cuda.is_available():
        model = model.cuda().to(torch.bfloat16)
    model.eval()
    volume.commit()  # persist downloaded weights for future cold starts

    secret = os.environ.get("PARAKEET_SERVER_SECRET", "")

    api = FastAPI()

    @api.post("/")
    async def transcribe(
        audio: UploadFile = File(...),
        authorization: str | None = Header(default=None),
    ):
        if secret and authorization != f"Bearer {secret}":
            raise HTTPException(status_code=401, detail="Unauthorized")

        raw = await audio.read()
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "input")
            wav = os.path.join(d, "audio.wav")
            with open(src, "wb") as fh:
                fh.write(raw)

            # Parakeet wants 16kHz mono WAV — normalise whatever the browser sent.
            subprocess.run(
                ["ffmpeg", "-nostdin", "-y", "-i", src, "-ar", "16000", "-ac", "1", wav],
                check=True,
                capture_output=True,
            )

            out = model.transcribe([wav], batch_size=1, timestamps=True)

        hyp = out[0]
        ts = getattr(hyp, "timestamp", None) or {}
        words = [
            {"word": w["word"], "start": float(w["start"]), "end": float(w["end"])}
            for w in ts.get("word", [])
        ]
        return {"text": getattr(hyp, "text", "") or "", "words": words}

    return api
