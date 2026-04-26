import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "uvicorn", "numpy", "httpx")
)

app = modal.App("tribe-v2-server", image=image)


@app.function(
    timeout=300,
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
@modal.fastapi_endpoint(method="POST", label="tribe-predict")
def predict(body: dict):
    import numpy as np

    duration_seconds = float(body.get("duration_seconds", 60))
    n = max(10, int(duration_seconds))

    rng = np.random.default_rng()
    scores = np.empty(n)
    s = 62.0
    for i in range(n):
        s += (68 - s) * 0.06 + rng.standard_normal() * 10
        scores[i] = np.clip(s, 18, 100)

    THRESHOLD = 55
    timeline = [{"timecode_ms": i * 1000, "score": int(scores[i])} for i in range(n)]
    overall_score = int(scores.mean())

    low_moments = []
    in_low = False
    low_start = 0
    bucket = []

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
                    "end_ms": timeline[i - 1]["timecode_ms"] + 1000,
                    "score": int(sum(bucket) / len(bucket)),
                })
            in_low = False

    return {
        "engagement_timeline": timeline,
        "overall_score": overall_score,
        "low_engagement_moments": low_moments,
    }
