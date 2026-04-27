import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.5.1,<2.7",
        "torchvision>=0.20,<0.22",
        "numpy==2.2.6",
        "fastapi",
        "uvicorn",
        "httpx",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .run_commands(
        "apt-get update && apt-get install -y git ffmpeg",
        "pip install git+https://github.com/facebookresearch/tribev2.git",
        "python -m spacy download en_core_web_lg",  # bake into image so it doesn't download at runtime
    )
)

app = modal.App("tribe-v2-server", image=image)
volume = modal.Volume.from_name("tribe-v2-cache", create_if_missing=True)

AUDITORY  = list(range(900,  1100))  + list(range(11142, 11342))
LANGUAGE  = list(range(1300, 2200))  + list(range(11541, 12442))
ATTENTION = list(range(4500, 5000))  + list(range(14742, 15242))
DMN       = list(range(6000, 7500))  + list(range(16000, 17500))

AUDIO_EXTENSIONS = {"mp3", "wav", "flac", "ogg", "m4a", "aac"}


@app.function(
    gpu="T4",
    timeout=900,
    volumes={"/cache": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
@modal.fastapi_endpoint(method="POST", label="tribe-predict")
def predict(body: dict):
    import os
    import tempfile
    import urllib.request
    import numpy as np
    from tribev2 import TribeModel

    token = os.environ.get("HF_TOKEN", "")
    os.environ["HF_TOKEN"] = token

    # Log which HF account the token belongs to so we can diagnose access issues
    try:
        import huggingface_hub
        info = huggingface_hub.whoami(token=token)
        print(f"[INFO] HF account: {info['name']} | token starts: {token[:8]}...")
    except Exception as hf_err:
        print(f"[ERROR] HF token invalid or missing: {hf_err}")

    file_url         = body.get("file_url", "")
    duration_seconds = float(body.get("duration_seconds", 60))

    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/cache")

    suffix   = file_url.split("?")[0].rsplit(".", 1)[-1].lower() if file_url else "mp4"
    is_audio = suffix in AUDIO_EXTENSIONS

    with tempfile.NamedTemporaryFile(suffix=f".{suffix}", delete=False) as tmp:
        urllib.request.urlretrieve(file_url, tmp.name)
        tmp_path = tmp.name

    try:
        if is_audio:
            df = model.get_events_dataframe(audio_path=tmp_path)
        else:
            df = model.get_events_dataframe(video_path=tmp_path)

        preds, _ = model.predict(events=df)
        preds = np.array(preds)
    finally:
        os.unlink(tmp_path)

    aud_arr  = np.array(AUDITORY)
    lang_arr = np.array(LANGUAGE)
    att_arr  = np.array(ATTENTION)
    dmn_arr  = np.array(DMN)

    # Per-second ROI activation (raw)
    aud_t  = preds[:, aud_arr].mean(axis=1)
    lang_t = preds[:, lang_arr].mean(axis=1)
    att_t  = preds[:, att_arr].mean(axis=1)
    dmn_t  = preds[:, dmn_arr].mean(axis=1)

    # Overall engagement score (auditory+language+attention vs DMN)
    eng_t  = (aud_t + lang_t + att_t) / 3
    raw    = eng_t * 0.8 - dmn_t * 0.2
    smoothed = np.convolve(raw, np.ones(3) / 3, mode="same")
    lo, hi = smoothed.min(), smoothed.max()
    scores = ((smoothed - lo) / (hi - lo) * 80 + 10) if hi > lo else np.full_like(smoothed, 55.0)
    scores = scores.clip(0, 100)

    # Normalize each ROI independently to 0-100 for charting
    def norm100(arr):
        lo, hi = float(arr.min()), float(arr.max())
        return ((arr - lo) / (hi - lo) * 100).clip(0, 100) if hi > lo else np.full_like(arr, 50.0)

    aud_n  = norm100(aud_t)
    lang_n = norm100(lang_t)
    att_n  = norm100(att_t)
    dmn_n  = norm100(dmn_t)

    n         = len(scores)
    timeline  = [{"timecode_ms": i * 1000, "score": int(scores[i])} for i in range(n)]
    roi_timeline = [
        {
            "timecode_ms": i * 1000,
            "auditory":    int(aud_n[i]),
            "language":    int(lang_n[i]),
            "attention":   int(att_n[i]),
            "dmn":         int(dmn_n[i]),
        }
        for i in range(n)
    ]

    overall_score        = int(scores.mean())
    cognitive_load_score = int(att_n.mean())
    mind_wandering_score = int(dmn_n.mean())

    # --- Low engagement moments (drops below 55) ---
    THRESHOLD   = 55
    low_moments = []
    in_low      = False; low_start = 0; bucket: list = []

    for i, pt in enumerate(timeline):
        if pt["score"] < THRESHOLD and not in_low:
            in_low, low_start, bucket = True, pt["timecode_ms"], [pt["score"]]
        elif pt["score"] < THRESHOLD:
            bucket.append(pt["score"])
        elif in_low:
            duration_ms = timeline[i - 1]["timecode_ms"] + 1000 - low_start
            if duration_ms >= 2000:
                low_moments.append({
                    "start_ms": low_start,
                    "end_ms":   timeline[i - 1]["timecode_ms"] + 1000,
                    "score":    int(sum(bucket) / len(bucket)),
                })
            in_low = False

    # --- Peak engagement moments (above 70, at least 3 s) ---
    PEAK_THRESHOLD = 70
    peak_moments   = []
    in_peak        = False; peak_start = 0; peak_bucket: list = []

    for i, pt in enumerate(timeline):
        if pt["score"] >= PEAK_THRESHOLD and not in_peak:
            in_peak, peak_start, peak_bucket = True, pt["timecode_ms"], [pt["score"]]
        elif pt["score"] >= PEAK_THRESHOLD:
            peak_bucket.append(pt["score"])
        elif in_peak:
            duration_ms = timeline[i - 1]["timecode_ms"] + 1000 - peak_start
            if duration_ms >= 3000:
                peak_moments.append({
                    "start_ms": peak_start,
                    "end_ms":   timeline[i - 1]["timecode_ms"] + 1000,
                    "score":    int(sum(peak_bucket) / len(peak_bucket)),
                })
            in_peak = False

    # Keep top 5 peaks by average score
    peak_moments.sort(key=lambda x: x["score"], reverse=True)
    peak_moments = peak_moments[:5]

    # --- Brain ROI activations (overall + per low-moment, normalized 0-1) ---
    all_roi = np.concatenate([aud_arr, lang_arr, att_arr, dmn_arr])
    v_min   = float(preds[:, all_roi].min())
    v_max   = float(preds[:, all_roi].max())
    v_rng   = v_max - v_min if v_max > v_min else 1.0

    def norm_act(x: float) -> float:
        return float(np.clip((x - v_min) / v_rng, 0.0, 1.0))

    def roi_act(verts, t0=None, t1=None) -> float:
        p = preds[t0:t1] if t0 is not None else preds
        return norm_act(float(p[:, verts].mean()))

    overall_act = {
        "auditory":  roi_act(aud_arr),
        "language":  roi_act(lang_arr),
        "attention": roi_act(att_arr),
        "dmn":       roi_act(dmn_arr),
    }
    moment_acts = []
    for m in low_moments:
        t0 = m["start_ms"] // 1000
        t1 = (m["end_ms"] // 1000) + 1
        moment_acts.append({
            "auditory":  roi_act(aud_arr,  t0, t1),
            "language":  roi_act(lang_arr, t0, t1),
            "attention": roi_act(att_arr,  t0, t1),
            "dmn":       roi_act(dmn_arr,  t0, t1),
        })

    return {
        "engagement_timeline":    timeline,
        "roi_timeline":           roi_timeline,
        "overall_score":          overall_score,
        "cognitive_load_score":   cognitive_load_score,
        "mind_wandering_score":   mind_wandering_score,
        "low_engagement_moments": low_moments,
        "peak_moments":           peak_moments,
        "brain_activations": {
            "overall": overall_act,
            "moments": moment_acts,
        },
        "is_mock": False,
    }
