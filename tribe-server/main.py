"""
Tribe v2 Inference Server
FastAPI wrapper around the Tribe v2 PyTorch model.

Run locally:  uvicorn main:app --host 0.0.0.0 --port 8000
Deploy:       see deploy-modal.py for Modal.com deployment

If the Tribe v2 model cannot be loaded (no GPU / missing weights),
the server falls back to mock data so the Next.js app can still be tested.

License note: Tribe v2 is CC-BY-NC-4.0 — non-commercial use only.
"""

import os
import tempfile
import urllib.request
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

app = FastAPI(title="Tribe v2 Inference Server", version="1.0.0")
security = HTTPBearer(auto_error=False)

SECRET = os.getenv("TRIBE_SERVER_SECRET", "")

# ---------------------------------------------------------------------------
# Model loading (lazy, at first request)
# ---------------------------------------------------------------------------

_model = None
_model_loaded = False

def get_model():
    global _model, _model_loaded
    if _model_loaded:
        return _model
    try:
        from tribev2 import TribeModel  # noqa: F401
        _model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")
        print("Tribe v2 model loaded.")
    except Exception as e:
        print(f"[warn] Could not load Tribe v2 model ({e}). Running in mock mode.")
        _model = None
    _model_loaded = True
    return _model


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class PredictRequest(BaseModel):
    file_url: str          # signed URL — server downloads the file
    duration_seconds: float = 60.0


class TimelinePoint(BaseModel):
    timecode_ms: int
    score: int


class LowMoment(BaseModel):
    start_ms: int
    end_ms: int
    score: int


class PredictResponse(BaseModel):
    engagement_timeline: list[TimelinePoint]
    overall_score: int
    low_engagement_moments: list[LowMoment]


# ---------------------------------------------------------------------------
# Engagement score calculation from raw fMRI predictions
# Vertices are approximate fsaverage5 ROI indices; replace with atlas-derived
# indices (e.g. Glasser 360-parcel) for production accuracy.
# ---------------------------------------------------------------------------

# Bilateral auditory cortex (superior temporal gyrus)
_AUDITORY = list(range(900, 1100)) + list(range(11142, 11342))
# Language areas: IFG (Broca) + MTG
_LANGUAGE = list(range(1300, 2200)) + list(range(11541, 12442))
# Dorsolateral prefrontal cortex (sustained attention)
_ATTENTION = list(range(4500, 5000)) + list(range(14742, 15242))
# Default mode network (mind-wandering → negative engagement)
_DMN = list(range(6000, 7500)) + list(range(16000, 17500))

_ENGAGEMENT_VERTS = np.array(_AUDITORY + _LANGUAGE + _ATTENTION)
_DMN_VERTS = np.array(_DMN)
_THRESHOLD = 55


def preds_to_engagement(preds: np.ndarray) -> np.ndarray:
    """Convert raw Tribe v2 preds (n_seconds, 20484) → normalized 0–100 scores."""
    eng = preds[:, _ENGAGEMENT_VERTS].mean(axis=1)
    dmn = preds[:, _DMN_VERTS].mean(axis=1)
    raw = eng * 0.8 - dmn * 0.2

    # 3-point moving average
    smoothed = np.convolve(raw, np.ones(3) / 3, mode="same")

    lo, hi = smoothed.min(), smoothed.max()
    if hi > lo:
        normalized = (smoothed - lo) / (hi - lo) * 80 + 10
    else:
        normalized = np.full_like(smoothed, 55.0)
    return normalized.clip(0, 100)


def scores_to_response(scores: np.ndarray) -> PredictResponse:
    n = len(scores)
    timeline = [TimelinePoint(timecode_ms=i * 1000, score=int(scores[i])) for i in range(n)]
    overall = int(scores.mean())

    low_moments: list[LowMoment] = []
    in_low = False
    low_start = 0
    bucket: list[int] = []

    for i, pt in enumerate(timeline):
        if pt.score < _THRESHOLD and not in_low:
            in_low, low_start, bucket = True, pt.timecode_ms, [pt.score]
        elif pt.score < _THRESHOLD:
            bucket.append(pt.score)
        elif in_low:
            duration_ms = timeline[i - 1].timecode_ms + 1000 - low_start
            if duration_ms >= 2000:
                low_moments.append(
                    LowMoment(start_ms=low_start, end_ms=timeline[i - 1].timecode_ms + 1000,
                              score=int(sum(bucket) / len(bucket)))
                )
            in_low = False

    return PredictResponse(engagement_timeline=timeline, overall_score=overall, low_engagement_moments=low_moments)


def mock_response(duration_seconds: float) -> PredictResponse:
    rng = np.random.default_rng()
    n = max(10, int(duration_seconds))
    scores = np.empty(n)
    s = 62.0
    for i in range(n):
        s += (68 - s) * 0.06 + rng.standard_normal() * 10
        scores[i] = np.clip(s, 18, 100)
    return scores_to_response(scores)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def _check_auth(credentials: Optional[HTTPAuthorizationCredentials]):
    if not SECRET:
        return
    if credentials is None or credentials.credentials != SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None, "mock_mode": _model is None}


@app.post("/predict", response_model=PredictResponse)
def predict(
    req: PredictRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
):
    _check_auth(credentials)
    model = get_model()

    if model is None:
        return mock_response(req.duration_seconds)

    # Download file from signed URL to a temp path
    suffix = req.file_url.split("?")[0].rsplit(".", 1)[-1]
    with tempfile.NamedTemporaryFile(suffix=f".{suffix}", delete=False) as tmp:
        urllib.request.urlretrieve(req.file_url, tmp.name)
        tmp_path = tmp.name

    try:
        df = model.get_events_dataframe(video_path=tmp_path)
        preds, _ = model.predict(events=df)
        scores = preds_to_engagement(np.array(preds))
    finally:
        os.unlink(tmp_path)

    return scores_to_response(scores)
