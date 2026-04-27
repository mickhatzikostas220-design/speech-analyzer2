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
        "openai",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .run_commands(
        "apt-get update && apt-get install -y git ffmpeg",
        "pip install git+https://github.com/facebookresearch/tribev2.git",
        "python -m spacy download en_core_web_lg",
    )
)

app    = modal.App("tribe-v2-server", image=image)
volume = modal.Volume.from_name("tribe-v2-cache", create_if_missing=True)

AUDITORY  = list(range(900,  1100))  + list(range(11142, 11342))
LANGUAGE  = list(range(1300, 2200))  + list(range(11541, 12442))
ATTENTION = list(range(4500, 5000))  + list(range(14742, 15242))
DMN       = list(range(6000, 7500))  + list(range(16000, 17500))
PROSODY   = list(range(1050, 1300))  + list(range(11200, 11800))  # Right-dominant STG prosody
EMOTIONAL = list(range(3000, 3600))  + list(range(13000, 13600))  # Insula bilateral
MEMORY    = list(range(7500, 8100))  + list(range(17400, 18000))  # Parahippocampal/MTL
AUDIO_EXTENSIONS = {"mp3", "wav", "flac", "ogg", "m4a", "aac"}


@app.function(
    gpu="A10G",
    timeout=1800,          # 30 min — no rush, Vercel is no longer waiting
    volumes={"/cache": volume},
    secrets=[
        modal.Secret.from_name("huggingface-secret"),   # HF_TOKEN
        modal.Secret.from_name("custom-secret"),        # SUPABASE_SERVICE_ROLE_KEY
        modal.Secret.from_name("custom-secret-2"),      # SUPABASE_URL
        modal.Secret.from_name("openai-secret"),        # OPENAI_API_KEY
    ],
)
def process_analysis(body: dict):
    import os, json, tempfile, urllib.request
    import numpy as np
    import httpx
    from tribev2 import TribeModel
    from openai import OpenAI

    hf_token = os.environ.get("HF_TOKEN", "")
    os.environ["HF_TOKEN"] = hf_token

    supabase_url  = os.environ["SUPABASE_URL"].rstrip("/").removesuffix("/rest/v1")
    supabase_key  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    openai_key    = os.environ["OPENAI_API_KEY"]

    analysis_id      = body["analysis_id"]
    file_url         = body.get("file_url", "")
    duration_seconds = float(body.get("duration_seconds", 60))

    sb = {
        "apikey":        supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type":  "application/json",
    }

    def sb_patch(table, data, where):
        r = httpx.patch(f"{supabase_url}/rest/v1/{table}?{where}",
                        headers={**sb, "Prefer": "return=minimal"}, json=data, timeout=30)
        if r.status_code >= 300:
            print(f"[WARN] sb_patch {table} -> {r.status_code}: {r.text[:300]}")

    def sb_insert(table, rows):
        for i in range(0, len(rows), 200):
            r = httpx.post(f"{supabase_url}/rest/v1/{table}",
                           headers={**sb, "Prefer": "return=minimal"}, json=rows[i:i+200], timeout=30)
            if r.status_code >= 300:
                print(f"[WARN] sb_insert {table} -> {r.status_code}: {r.text[:300]}")

    try:
        # ── Tribe v2 ──────────────────────────────────────────────────────────
        model  = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/cache")
        suffix = file_url.split("?")[0].rsplit(".", 1)[-1].lower() if file_url else "mp4"
        is_audio = suffix in AUDIO_EXTENSIONS

        with tempfile.NamedTemporaryFile(suffix=f".{suffix}", delete=False) as tmp:
            urllib.request.urlretrieve(file_url, tmp.name)
            tmp_path = tmp.name

        try:
            df = model.get_events_dataframe(audio_path=tmp_path if is_audio else None,
                                            video_path=None if is_audio else tmp_path)
            preds, _ = model.predict(events=df)
            preds = np.array(preds)
        finally:
            os.unlink(tmp_path)

        # ── Extract transcript from events dataframe ───────────────────────────
        transcript = ""
        words_data = []
        try:
            if "word" in df.columns:
                valid = df.dropna(subset=["word"])
                transcript = " ".join(str(w) for w in valid["word"].tolist())
                for _, row in valid.iterrows():
                    words_data.append({
                        "word":  str(row["word"]),
                        "start": float(row.get("onset",  0)),
                        "end":   float(row.get("offset", row.get("onset", 0))),
                    })
        except Exception as e:
            print(f"[WARN] transcript extraction failed: {e}")

        sb_patch("analyses", {"transcript": transcript, "duration_seconds": duration_seconds},
                 f"id=eq.{analysis_id}")

        # ── ROI arrays ────────────────────────────────────────────────────────
        aud_arr  = np.array(AUDITORY)
        lang_arr = np.array(LANGUAGE)
        att_arr  = np.array(ATTENTION)
        dmn_arr  = np.array(DMN)
        pros_arr = np.array(PROSODY)
        emo_arr  = np.array(EMOTIONAL)
        mem_arr  = np.array(MEMORY)

        aud_t  = preds[:, aud_arr].mean(axis=1)
        lang_t = preds[:, lang_arr].mean(axis=1)
        att_t  = preds[:, att_arr].mean(axis=1)
        dmn_t  = preds[:, dmn_arr].mean(axis=1)
        pros_t = preds[:, pros_arr].mean(axis=1)
        emo_t  = preds[:, emo_arr].mean(axis=1)
        mem_t  = preds[:, mem_arr].mean(axis=1)

        eng_t    = (aud_t + lang_t + att_t) / 3
        raw      = eng_t * 0.8 - dmn_t * 0.2
        smoothed = np.convolve(raw, np.ones(3) / 3, mode="same")
        lo, hi   = smoothed.min(), smoothed.max()
        scores   = ((smoothed - lo) / (hi - lo) * 80 + 10) if hi > lo else np.full_like(smoothed, 55.0)
        scores   = scores.clip(0, 100)

        def norm100(arr):
            lo, hi = float(arr.min()), float(arr.max())
            return ((arr - lo) / (hi - lo) * 100).clip(0, 100) if hi > lo else np.full_like(arr, 50.0)

        aud_n  = norm100(aud_t);  lang_n = norm100(lang_t)
        att_n  = norm100(att_t);  dmn_n  = norm100(dmn_t)
        pros_n = norm100(pros_t); emo_n  = norm100(emo_t)
        mem_n  = norm100(mem_t)

        n = len(scores)
        timeline = [{"timecode_ms": i * 1000, "score": int(scores[i])} for i in range(n)]

        roi_timeline = [
            {"timecode_ms": i * 1000,
             "auditory":    int(aud_n[i]),  "language":  int(lang_n[i]),
             "attention":   int(att_n[i]),  "dmn":       int(dmn_n[i]),
             "prosody":     int(pros_n[i]), "emotional": int(emo_n[i]),
             "memory":      int(mem_n[i])}
            for i in range(n)
        ]

        # ── Per-word neural responses ─────────────────────────────────────────
        word_responses = []
        for w in words_data:
            t = int(w["start"])
            if 0 <= t < len(preds):
                word_responses.append({
                    "word":      w["word"],
                    "start":     w["start"],
                    "end":       w["end"],
                    "score":     int((aud_n[t] + lang_n[t] + att_n[t]) / 3),
                    "emotional": int(emo_n[t]),
                    "memory":    int(mem_n[t]),
                    "prosody":   int(pros_n[t]),
                })

        overall_score        = int(scores.mean())
        cognitive_load_score = int(att_n.mean())
        mind_wandering_score = int(dmn_n.mean())

        # ── Low engagement moments ────────────────────────────────────────────
        THRESHOLD = 55
        low_moments: list = []
        in_low = False; low_start = 0; bucket: list = []
        for i, pt in enumerate(timeline):
            if pt["score"] < THRESHOLD and not in_low:
                in_low, low_start, bucket = True, pt["timecode_ms"], [pt["score"]]
            elif pt["score"] < THRESHOLD:
                bucket.append(pt["score"])
            elif in_low:
                dur = timeline[i - 1]["timecode_ms"] + 1000 - low_start
                if dur >= 2000:
                    low_moments.append({"start_ms": low_start,
                                        "end_ms": timeline[i - 1]["timecode_ms"] + 1000,
                                        "score":  int(sum(bucket) / len(bucket))})
                in_low = False

        # ── Peak moments ──────────────────────────────────────────────────────
        PEAK_THRESHOLD = 70
        peak_moments: list = []
        in_peak = False; peak_start = 0; peak_bucket: list = []
        for i, pt in enumerate(timeline):
            if pt["score"] >= PEAK_THRESHOLD and not in_peak:
                in_peak, peak_start, peak_bucket = True, pt["timecode_ms"], [pt["score"]]
            elif pt["score"] >= PEAK_THRESHOLD:
                peak_bucket.append(pt["score"])
            elif in_peak:
                dur = timeline[i - 1]["timecode_ms"] + 1000 - peak_start
                if dur >= 3000:
                    peak_moments.append({"start_ms": peak_start,
                                         "end_ms": timeline[i - 1]["timecode_ms"] + 1000,
                                         "score":  int(sum(peak_bucket) / len(peak_bucket))})
                in_peak = False
        peak_moments.sort(key=lambda x: x["score"], reverse=True)
        peak_moments = peak_moments[:5]

        # ── Brain ROI activations ─────────────────────────────────────────────
        all_roi = np.concatenate([aud_arr, lang_arr, att_arr, dmn_arr])
        v_min   = float(preds[:, all_roi].min())
        v_max   = float(preds[:, all_roi].max())
        v_rng   = v_max - v_min if v_max > v_min else 1.0

        def norm_act(x):
            return float(np.clip((x - v_min) / v_rng, 0.0, 1.0))

        def roi_act(verts, t0=None, t1=None):
            p = preds[t0:t1] if t0 is not None else preds
            return norm_act(float(p[:, verts].mean()))

        overall_act = {k: roi_act(a) for k, a in
                       [("auditory", aud_arr), ("language", lang_arr),
                        ("attention", att_arr), ("dmn", dmn_arr)]}

        moment_acts = []
        for m in low_moments:
            t0 = m["start_ms"] // 1000;  t1 = (m["end_ms"] // 1000) + 1
            moment_acts.append({k: roi_act(a, t0, t1) for k, a in
                                 [("auditory", aud_arr), ("language", lang_arr),
                                  ("attention", att_arr), ("dmn", dmn_arr)]})

        # ── Store engagement timeline ─────────────────────────────────────────
        sb_insert("engagement_timeline",
                  [{"analysis_id": analysis_id, "timecode_ms": t["timecode_ms"], "score": t["score"]}
                   for t in timeline])

        # ── GPT-4o feedback for each low moment ───────────────────────────────
        oai = OpenAI(api_key=openai_key)
        feedback_rows = []
        for idx, moment in enumerate(low_moments[:8]):
            start_sec = moment["start_ms"] / 1000
            end_sec   = moment["end_ms"]   / 1000
            minutes   = int(start_sec // 60)
            seconds   = int(start_sec % 60)

            segment = " ".join(
                w["word"] for w in words_data
                if w["start"] >= start_sec - 1.5 and w["end"] <= end_sec + 1.5
            ) if words_data else ""

            fb_text   = "Engagement dropped here."
            fb_sugg   = "Vary your tone or add a specific example."

            if transcript:
                try:
                    resp = oai.chat.completions.create(
                        model="gpt-4o",
                        messages=[
                            {"role": "system", "content":
                             "You are a professional speech coach. Neural engagement scores (0–100) represent "
                             "audience brain activation measured via fMRI. Below 55 means the audience's "
                             "attention is dropping.\n\nGive exactly two lines:\n"
                             "Line 1: What specifically caused the engagement drop at this moment (reference the actual words).\n"
                             "Line 2: One concrete fix for this exact moment — not generic advice.\n\n"
                             "Each line must be one sentence, under 20 words."},
                            {"role": "user", "content":
                             f"At {minutes}:{seconds:02d}, neural engagement dropped to {moment['score']}/100.\n\n"
                             f"Speaker said: \"{segment or '[audio section]'}\"\n\n"
                             f"Full speech (first 400 chars): \"{transcript[:400]}\""},
                        ],
                        max_tokens=120,
                        temperature=0.6,
                    )
                    lines = [l for l in (resp.choices[0].message.content or "").strip().split("\n") if l]
                    if lines:     fb_text = lines[0]
                    if len(lines) > 1: fb_sugg = lines[1]
                except Exception as e:
                    print(f"[WARN] feedback generation failed for moment {idx}: {e}")

            feedback_rows.append({
                "analysis_id":          analysis_id,
                "timecode_ms":          moment["start_ms"],
                "timecode_end_ms":      moment["end_ms"],
                "engagement_score":     moment["score"],
                "feedback_text":        fb_text,
                "improvement_suggestion": fb_sugg,
                "severity":             "high" if moment["score"] < 38 else "medium" if moment["score"] < 47 else "low",
                "brain_activations":    moment_acts[idx] if idx < len(moment_acts) else None,
            })

        if feedback_rows:
            sb_insert("feedback_points", feedback_rows)

        # ── Mark analysis complete ─────────────────────────────────────────────
        sb_patch("analyses", {
            "overall_score":             overall_score,
            "cognitive_load_score":      cognitive_load_score,
            "mind_wandering_score":      mind_wandering_score,
            "peak_moments":              peak_moments,
            "roi_timeline":              roi_timeline,
            "overall_brain_activations": overall_act,
            "word_responses":            word_responses,
            "is_mock":                   False,
            "status":                    "complete",
        }, f"id=eq.{analysis_id}")

        print(f"[OK] analysis {analysis_id} complete — score {overall_score}")

    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(f"[ERROR] analysis {analysis_id} failed:\n{err}")
        sb_patch("analyses", {"status": "error", "error_message": str(e)},
                 f"id=eq.{analysis_id}")


# ── HTTP trigger (returns immediately, spawns GPU work async) ─────────────────
@app.function(timeout=30)
@modal.fastapi_endpoint(method="POST", label="tribe-predict")
def trigger(body: dict):
    process_analysis.spawn(body)
    return {"status": "queued"}
