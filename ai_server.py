# ==========================================================================
#   G-TEC AI Server — Flask REST API
#   Endpoints:
#     GET  /           — health check
#     GET  /status     — model info
#     POST /predict    — single-turn intent prediction
#     POST /chat       — multi-turn course recommendation conversation
#
#   Supports 18 intents from the combined dataset:
#     ABOUT, CENTRE_INFO, CONTACT, COURSES, COURSE_RECOMMENDATION,
#     DIGITAL_MARKETING, GALLERY, GRAPHIC_DESIGN, GREETING, GTEC_FACTS,
#     HARDWARE_NETWORKING, HOME, LEADERSHIP, MS_OFFICE, PLACEMENT_SUPPORT,
#     TALLY, TRAINERS, WEB_DEVELOPMENT
# ==========================================================================

# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re

app = Flask(__name__)
CORS(app)

# ------------------------------------------------------------------
# Configuration
#
# Two interchangeable backends are supported:
#
#   lite   TF-IDF + calibrated LinearSVC (~1 MB, ~120 MB RAM, no PyTorch)
#          -> free hosting (Render 512 MB, Cloud Run, GitHub Actions, ...)
#   torch  DistilBERT pulled from the Hugging Face Hub (~255 MB, ~800 MB RAM)
#          -> local development, or any host with >= 1 GB of RAM
#
# Environment variables:
#   MODEL_BACKEND = lite | torch | auto     (auto = torch when installed, else lite)
#   MODEL_ID      = <user>/gtec-intent-model
#   HF_TOKEN      = optional, only for private Hub repos
# ------------------------------------------------------------------
BASE_DIR         = os.path.dirname(os.path.abspath(__file__))
MODEL_ID         = os.getenv("MODEL_ID", "").strip()
MODEL_BACKEND    = os.getenv("MODEL_BACKEND", "auto").strip().lower()
HF_TOKEN         = os.getenv("HF_TOKEN", "").strip() or None

LITE_FILENAME    = "intent_clf.joblib"
LITE_LOCAL_PATH  = os.path.join(BASE_DIR, "model", "gtec-intent-lite.joblib")
TORCH_LOCAL_PATH = os.path.join(BASE_DIR, "model", "gtec-intent-model-v2")

engine    = None   # "lite" | "torch"
clf       = None   # sklearn pipeline (lite)
tokenizer = None   # transformers tokenizer (torch)
model     = None   # transformers model (torch)
id2label  = {}
label2id  = {}
MODEL_SOURCE = ""


def _load_lite():
    """TF-IDF + LinearSVC. No torch, ~1 MB on disk."""
    import joblib
    from huggingface_hub import hf_hub_download

    path = None
    if MODEL_ID:
        try:
            print(f"Fetching {LITE_FILENAME} from Hub ({MODEL_ID})...")
            path = hf_hub_download(
                repo_id=MODEL_ID, filename=LITE_FILENAME, token=HF_TOKEN
            )
        except Exception as exc:
            print(f"WARNING: Hub download failed: {exc}")

    if not path and os.path.isfile(LITE_LOCAL_PATH):
        print(f"Loading lite model from disk: {LITE_LOCAL_PATH}")
        path = LITE_LOCAL_PATH

    if not path:
        raise RuntimeError(
            f"Neither {LITE_FILENAME} on the Hub nor {LITE_LOCAL_PATH} exists. "
            "Run train_lite_model.py first."
        )

    pipeline = joblib.load(path)
    classes = list(pipeline.classes_)
    return pipeline, classes, f"lite:{MODEL_ID or path}"


def _load_torch():
    """DistilBERT from the Hub (or the local folder)."""
    from transformers import AutoTokenizer, AutoModelForSequenceClassification

    errors = []

    if MODEL_ID:
        try:
            print(f"Loading DistilBERT from Hub: {MODEL_ID}")
            tok = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
            mdl = AutoModelForSequenceClassification.from_pretrained(
                MODEL_ID, token=HF_TOKEN
            )
            return tok, mdl, f"torch:{MODEL_ID}"
        except Exception as exc:
            errors.append(f"  - Hub ({MODEL_ID}): {exc}")
            print(f"WARNING: could not load from Hub: {exc}")

    if os.path.isdir(TORCH_LOCAL_PATH):
        try:
            print(f"Loading DistilBERT from disk: {TORCH_LOCAL_PATH}")
            tok = AutoTokenizer.from_pretrained(TORCH_LOCAL_PATH)
            mdl = AutoModelForSequenceClassification.from_pretrained(TORCH_LOCAL_PATH)
            return tok, mdl, "torch:local"
        except Exception as exc:
            errors.append(f"  - Local ({TORCH_LOCAL_PATH}): {exc}")
            print(f"WARNING: could not load local model: {exc}")

    raise RuntimeError("DistilBERT not available:\n" + "\n".join(errors))


def _torch_installed() -> bool:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        return True
    except Exception:
        return False


def _load_model():
    global engine, clf, tokenizer, model, id2label, label2id, MODEL_SOURCE

    errors = []

    if MODEL_BACKEND in ("auto", ""):
        # Locally torch is installed -> use the full DistilBERT.
        # On free hosts torch is absent -> use the 1 MB lite model.
        order = (["torch"] if _torch_installed() else []) + ["lite"]
    else:
        order = [MODEL_BACKEND]

    for name in order:
        try:
            if name == "lite":
                pipeline, classes, source = _load_lite()
                clf      = pipeline
                engine   = "lite"
                id2label = {i: c for i, c in enumerate(classes)}
                label2id = {c: i for i, c in enumerate(classes)}
            elif name == "torch":
                tok, mdl, source = _load_torch()
                mdl.eval()
                tokenizer = tok
                model     = mdl
                engine    = "torch"
                id2label  = mdl.config.id2label
                label2id  = mdl.config.label2id
            else:
                raise ValueError(f"Unknown MODEL_BACKEND '{name}'")
            MODEL_SOURCE = source
            return
        except Exception as exc:
            errors.append(f"  - {name}: {exc}")
            print(f"WARNING: backend '{name}' unavailable: {exc}")

    raise RuntimeError(
        "No usable model backend. Set MODEL_ID to your Hugging Face repo and/or "
        "run train_lite_model.py. Tried:\n" + ("\n".join(errors) or "  - nothing")
    )


print("Loading G-TEC AI model...")
_load_model()

print(f"Model loaded successfully from {MODEL_SOURCE} (backend: {engine})")
print(f"Total intents: {len(id2label)}")
for key, value in sorted(id2label.items()):
    print(f"  {key} -> {value}")


# ------------------------------------------------------------------
# Multi-turn session store  {session_id: ConversationState}
# Each state tracks which question we are on and collected answers.
# ------------------------------------------------------------------
_sessions: dict[str, dict] = {}

# Questions asked during the COURSE_RECOMMENDATION flow
RECOM_QUESTIONS = [
    {
        "key": "background",
        "question": "What is your educational background?",
        "options": ["10th / 12th", "Diploma", "Degree (Arts/Science/Commerce/Engg)", "Postgraduate", "Working professional"]
    },
    {
        "key": "interest",
        "question": "Which area interests you the most?",
        "options": ["Computers / Coding", "Accounts / Finance", "Design / Creative", "Networking / Hardware", "Marketing / Social Media", "Data / Analytics", "Not sure yet"]
    },
    {
        "key": "goal",
        "question": "What is your primary goal after the course?",
        "options": ["Get a job quickly", "Start my own business", "Upgrade my skills", "Work from home / freelance", "Just exploring"]
    },
    {
        "key": "previous",
        "question": "Have you completed any computer course before?",
        "options": [
            "No, I'm a complete beginner",
            "Yes, a basic computer course",
            "Yes, a technical course (Tally / programming / networking)",
            "I have some self-taught skills"
        ]
    }
]

# ------------------------------------------------------------------
# Recommendation logic — returns best course name based on answers
# ------------------------------------------------------------------
def _recommend_course(background: str, interest: str, goal: str, previous: str = "") -> str:
    interest_lower = interest.lower()
    goal_lower     = goal.lower()
    bg_lower       = background.lower()

    # 1) Always honour the area the user chose.
    if "data" in interest_lower or "analytics" in interest_lower:
        return "Certificate Course in Data Analytics (CCDA)"
    if "account" in interest_lower or "finance" in interest_lower:
        return "Tally Prime with GST & Financial Accounting"
    if "design" in interest_lower or "creative" in interest_lower:
        if "business" in goal_lower or "marketing" in goal_lower:
            return "Digital Marketing Master"
        return "Graphic Design & UI/UX"
    if "network" in interest_lower or "hardware" in interest_lower:
        return "Hardware & Networking (CCNA + CCTV)"
    if "marketing" in interest_lower or "social" in interest_lower:
        return "Digital Marketing Master"
    if ("coding" in interest_lower or "programming" in interest_lower
            or "computer" in interest_lower or "software" in interest_lower):
        return "Web & Full Stack Development"

    # 2) "Not sure yet" or no clear interest → fall back to background + goal.
    if "commerce" in bg_lower or "arts" in bg_lower:
        if "business" in goal_lower:
            return "Tally Prime with GST & Financial Accounting"
        return "MS Office & Computer Basics (DCA)"
    if "science" in bg_lower or "engineering" in bg_lower:
        return "Web & Full Stack Development"
    if "job" in goal_lower:
        return "MS Office & Computer Basics (DCA)"
    return "MS Office & Computer Basics (DCA)"


# ------------------------------------------------------------------
# Intent prediction helper (works with both backends)
# ------------------------------------------------------------------
def predict_intent(text: str) -> tuple[str, float]:
    if engine == "lite":
        # The lite model was trained on lower-cased text.
        proba = clf.predict_proba([text.lower()])[0]
        idx = int(proba.argmax())
        return id2label[idx], float(proba[idx])

    # DistilBERT
    import torch

    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=64
    )

    with torch.no_grad():
        outputs = model(**inputs)

    probs        = torch.softmax(outputs.logits, dim=1)
    predicted_id = torch.argmax(probs, dim=1).item()

    return id2label[predicted_id], float(probs[0][predicted_id].item())


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@app.route("/")
def home():
    return jsonify({
        "status": "success",
        "message": "G-TEC AI Server is running"
    })


@app.route("/status")
def status():
    return jsonify({
        "status": "ok",
        "model": "gtec-intent-model-v2",
        "model_source": MODEL_SOURCE,
        "backend": engine,
        "intents": len(id2label),
        "intent_list": [id2label[i] for i in sorted(id2label.keys())]
    })


@app.route("/health")
def health():
    """Lightweight readiness probe used by hosting platforms."""
    return jsonify({
        "status": "ok",
        "backend": engine,
        "model_source": MODEL_SOURCE
    }), 200


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()

    if not data or "message" not in data:
        return jsonify({"error": "Message is required"}), 400

    message            = data["message"]
    intent, confidence = predict_intent(message)

    return jsonify({
        "message":    message,
        "intent":     intent,
        "confidence": round(confidence, 4)
    })


@app.route("/chat", methods=["POST"])
def chat():
    """
    Multi-turn conversational endpoint used by buddy.js.

    Request body:
        { "session_id": "...", "message": "..." }

    Response variants:
      1. Standard intent routing (non-COURSE_RECOMMENDATION):
            { "intent": "WEB_DEVELOPMENT", "confidence": 0.97 }

      2. Asking next recommendation question:
            { "reply": "...", "options": [...] }

      3. Final recommendation:
            { "reply": "...", "done": true, "recommended_course": "..." }
    """
    data = request.get_json()
    if not data or "message" not in data:
        return jsonify({"error": "message is required"}), 400

    session_id = data.get("session_id", "default")
    message    = data["message"].strip()

    # ----------------------------------------------------------
    # Classify intent. The chatbot no longer runs its own question
    # wizard — recommendation phrases are handled by buddy.js, which
    # sends the visitor to the "Find My Course" page (recommend.html).
    # ----------------------------------------------------------
    intent, confidence = predict_intent(message)

    RECOM_TRIGGERS = re.compile(
        r"recommend|suggest|which course|what course should|find my course|"
        r"pick a course|choose.*course|confused|not sure what to|"
        r"course should i|suits me|best for me|no idea what to study|help me choose|"
        r"want to (learn|study|do|join)|wish to (learn|study)|"
        r"like to (learn|study)|interested in (learning|studying|doing|joining)",
        re.IGNORECASE
    )
    if intent != "COURSE_RECOMMENDATION" and RECOM_TRIGGERS.search(message):
        intent = "COURSE_RECOMMENDATION"

    # Return the intent so buddy.js routes it through its INTENT_MAP.
    return jsonify({
        "intent":     intent,
        "confidence": round(confidence, 4)
    })


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
if __name__ == "__main__":
    # debug=False + reloader off keeps ONE stable process when this server
    # is auto-started by Antigravity / VS Code as a background task.
    # (The default debug=True reloader spawns a second process and can make
    #  the auto-start task look like it failed.)
    #
    # HOST/PORT default to local-only so nothing is exposed on your LAN.
    # Inside a container (Hugging Face Space) set HOST=0.0.0.0 and PORT=7860.
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "5001"))

    app.run(
        host=HOST,
        port=PORT,
        debug=False,
        use_reloader=False
    )
