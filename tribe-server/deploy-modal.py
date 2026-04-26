"""
Deploy the Tribe v2 inference server to Modal.com (GPU cloud).

Prerequisites:
  pip install modal
  modal token new

Usage:
  modal deploy deploy-modal.py
  modal serve deploy-modal.py   # for live dev

The web endpoint URL printed after deploy goes into your .env.local as TRIBE_SERVER_URL.
"""

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi",
        "uvicorn",
        "numpy",
        "httpx",
    )
)

app = modal.App("tribe-v2-server", image=image)


@app.function(
    timeout=300,
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
@modal.fastapi_endpoint(method="POST", label="tribe-predict")
def predict(body: dict):
    import os
    import sys
    sys.path.insert(0, "/")
    os.environ["TRIBE_SERVER_SECRET"] = os.environ.get("TRIBE_SERVER_SECRET", "")

    # Lazy import to benefit from Modal's snapshot caching
    from main import predict as _predict, PredictRequest
    from fastapi.security import HTTPAuthorizationCredentials

    req = PredictRequest(**body)
    token = body.get("_auth_token", "")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token) if token else None
    return _predict(req, creds)
