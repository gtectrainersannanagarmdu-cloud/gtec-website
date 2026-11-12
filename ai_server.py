# ==========================================================================
#   G-TEC AI Server — Flask REST API
#   Endpoints:
#     GET  /            — health check
#     GET  /status      — model info
#     GET  /health      — readiness probe
#     POST /predict     — single-turn intent prediction
#     POST /chat        — intent routing for the chat widget
#     GET  /courses     — course catalogue + wizard questions (from the Hub)
#     POST /recommend   — course recommendation (second Hugging Face model)
#     GET  /navigation  — intent -> page map published with the model
#
#   Both models are downloaded from the Hugging Face Hub:
#     intent_clf.joblib    (~1 MB, 18 intents)
#     course_clf.joblib    (~6 KB, 22 courses)
#     navigation.json      (19 intent -> page mappings)
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

# Local course catalogue + decision rules (pure standard library). The model
# is the primary source of recommendations; this module provides the offline
# fallback and the list of answers the model accepts.
try:
    import course_rules
except Exception as _exc:  # pragma: no cover - only if the file is missing
    course_rules = None
    print(f"WARNING: course_rules.py unavailable: {_exc}")

app = Flask(__name__)
CORS(app)

# ------------------------------------------------------------------
# Configuration
#
# Default = LIGHTWEIGHT. The ~1 MB TF-IDF model is downloaded from the
# Hugging Face Hub and runs in ~120 MB of RAM with no PyTorch at all.
#
# Two interchangeable backends are supported:
#
#   lite   TF-IDF + calibrated LinearSVC (~1 MB, ~120 MB RAM, no PyTorch)
#          -> DEFAULT. Weights come from the Hub; the local file in model/
#             is only an offline fallback.
#   torch  DistilBERT (~255 MB, ~800 MB RAM, needs torch + transformers)
#          -> opt-in only. Install with `pip install -r requirements-train.txt`
#             and set MODEL_BACKEND=torch.
#
# Environment variables:
#   MODEL_BACKEND = lite | torch | auto   (default: lite)
#   MODEL_ID      = <user>/gtec-intent-model
#                   (default: GtecBuddy/gtec-intent-model)
#   HF_TOKEN      = optional, only for private Hub repos
#
# Values in .env are loaded automatically when python-dotenv is installed,
# so the Python server and the Node server read the same configuration.
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:  # optional dependency: makes .env apply to the Python server too
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except Exception:
    pass

DEFAULT_MODEL_ID  = "GtecBuddy/gtec-intent-model"
MODEL_ID          = (os.getenv("MODEL_ID") or DEFAULT_MODEL_ID).strip()
MODEL_BACKEND     = (os.getenv("MODEL_BACKEND") or "lite").strip().lower()
HF_TOKEN          = (os.getenv("HF_TOKEN") or "").strip() or None

LITE_FILENAME    = "intent_clf.joblib"
LITE_LOCAL_PATH  = os.path.join(BASE_DIR, "model", "gtec-intent-lite.joblib")
TORCH_LOCAL_PATH = os.path.join(BASE_DIR, "model", "gtec-intent-model-v2")

# Second model: maps the four "Find My Course" answers -> course name.
COURSE_FILENAME        = "course_clf.joblib"
COURSE_META_FILENAME   = "course_clf_meta.json"
COURSE_LOCAL_PATH      = os.path.join(BASE_DIR, "model", "gtec-course-lite.joblib")
COURSE_META_LOCAL_PATH = os.path.join(BASE_DIR, "model", "gtec-course-lite-meta.json")

engine    = None   # "lite" | "torch"
clf       = None   # sklearn pipeline (lite)
tokenizer = None   # transformers tokenizer (torch)
model     = None   # transformers model (torch)
id2label  = {}
label2id  = {}
MODEL_SOURCE = ""

course_clf    = None   # sklearn pipeline (course recommender)
COURSE_META   = {}     # catalogue + question definitions, published with the model
COURSE_SOURCE = ""


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
        # Lightweight first: the lite model is 1 MB / ~120 MB RAM.
        # DistilBERT is only attempted as a last resort.
        order = ["lite"] + (["torch"] if _torch_installed() else [])
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


def _load_course_model():
    """Course recommender (~0.6 MB). Downloaded from the Hub with its metadata."""
    global course_clf, COURSE_META, COURSE_SOURCE

    import json
    import joblib
    from huggingface_hub import hf_hub_download

    clf_path = meta_path = None

    if MODEL_ID:
        try:
            print(f"Fetching {COURSE_FILENAME} from Hub ({MODEL_ID})...")
            clf_path = hf_hub_download(
                repo_id=MODEL_ID, filename=COURSE_FILENAME, token=HF_TOKEN
            )
            try:
                meta_path = hf_hub_download(
                    repo_id=MODEL_ID, filename=COURSE_META_FILENAME, token=HF_TOKEN
                )
            except Exception as exc:
                print(f"WARNING: course metadata unavailable: {exc}")
        except Exception as exc:
            print(f"WARNING: course model not found on Hub: {exc}")

    if not clf_path and os.path.isfile(COURSE_LOCAL_PATH):
        print(f"Loading course model from disk: {COURSE_LOCAL_PATH}")
        clf_path = COURSE_LOCAL_PATH
    if not meta_path and os.path.isfile(COURSE_META_LOCAL_PATH):
        meta_path = COURSE_META_LOCAL_PATH

    if not clf_path:
        print("WARNING: no course model - /recommend falls back to rules.")
        return

    course_clf = joblib.load(clf_path)
    if meta_path:
        with open(meta_path, "r", encoding="utf-8") as f:
            COURSE_META = json.load(f)

    COURSE_SOURCE = (
        f"hf:{MODEL_ID}" if clf_path != COURSE_LOCAL_PATH else f"local:{clf_path}"
    )
    print(f"Course model loaded: {COURSE_SOURCE} "
          f"({len(course_clf.classes_)} courses)")


print("Loading G-TEC course recommender...")
_load_course_model()


# ------------------------------------------------------------------
# Navigation knowledge published with the model on the Hugging Face Hub
# ------------------------------------------------------------------
NAV_FILENAME      = "navigation.json"
NAV_LOCAL_PATH    = os.path.join(BASE_DIR, "navigation.json")
NAVIGATION        = {}
NAVIGATION_SOURCE = ""


def _load_navigation():
    """Fetch intent -> page mappings from the Hub (local file as fallback)."""
    global NAVIGATION, NAVIGATION_SOURCE

    import json
    from huggingface_hub import hf_hub_download

    path = None
    if MODEL_ID:
        try:
            print(f"Fetching {NAV_FILENAME} from Hub ({MODEL_ID})...")
            path = hf_hub_download(
                repo_id=MODEL_ID, filename=NAV_FILENAME, token=HF_TOKEN
            )
        except Exception as exc:
            print(f"WARNING: navigation.json not on Hub: {exc}")

    if path is None and os.path.isfile(NAV_LOCAL_PATH):
        path = NAV_LOCAL_PATH

    if path is None:
        print("WARNING: no navigation.json - buddy.js keeps its built-in map.")
        return

    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    NAVIGATION = payload.get("intents", payload)
    NAVIGATION_SOURCE = (
        f"hf:{MODEL_ID}" if path != NAV_LOCAL_PATH else f"local:{path}"
    )
    print(f"Navigation loaded: {NAVIGATION_SOURCE} ({len(NAVIGATION)} intents)")


print("Loading G-TEC navigation map...")
_load_navigation()


# ------------------------------------------------------------------
# The course wizard questions and decision rules live in course_rules.py
# (and are also published with the model as course_clf_meta.json), so this
# server no longer keeps a second, divergent copy of them.
# ------------------------------------------------------------------


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
        "model": "gtec-intent-lite" if engine == "lite" else "gtec-intent-model-v2",
        "model_source": MODEL_SOURCE,
        "backend": engine,
        "intents": len(id2label),
        "intent_list": [id2label[i] for i in sorted(id2label.keys())],
        "course_model_source": COURSE_SOURCE,
        "courses": len(COURSE_META.get("courses", [])),
        "navigation_source": NAVIGATION_SOURCE,
        "navigation_intents": len(NAVIGATION)
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


# ------------------------------------------------------------------
# Course recommender API (second model, served from the Hub)
#
# The model was trained on CATEGORICAL answers, not prose:
#     [background, interest, goal, previous]
# Sending it free text would produce meaningless output, so /recommend asks
# for the four answers and returns the wizard questions when they are absent.
# ------------------------------------------------------------------
def _catalogue() -> list:
    """Course catalogue, preferring the copy published with the model."""
    courses = COURSE_META.get("courses")
    if courses:
        return courses
    return course_rules.COURSES if course_rules else []


def _questions() -> list:
    """Wizard questions, preferring the copy published with the model."""
    questions = COURSE_META.get("questions")
    if questions:
        return questions
    return course_rules.RECOM_QUESTIONS if course_rules else []


def _accepted_answers() -> dict:
    """Every value the model was trained on (used to validate input)."""
    if course_rules is None:
        return {}
    return {
        "background": list(course_rules.BACKGROUNDS),
        "interest": ["unsure"] + [c["name"] for c in course_rules.COURSES],
        "goal": list(course_rules.GOALS),
        "previous": list(course_rules.PREVIOUS),
    }


def _invalid_fields(background: str, interest: str, goal: str, previous: str) -> dict:
    """Fields whose value the model has never seen, mapped to accepted values."""
    answers = _accepted_answers()
    if not answers:
        return {}
    supplied = {
        "background": background,
        "interest": interest,
        "goal": goal,
        "previous": previous,
    }
    return {
        field: {"got": value, "accepted": answers[field]}
        for field, value in supplied.items()
        if value not in answers[field]
    }


def _course_details(name: str) -> dict:
    """Catalogue entry + the courses.html URL for that category."""
    for course in _catalogue():
        if course.get("name") == name:
            details = dict(course)
            flt = details.get("filter") or "all"
            details["url"] = ("courses.html" if flt == "all"
                              else f"courses.html?filter={flt}")
            return details

    return {"name": name, "category": "all", "filter": "all",
            "url": "courses.html", "level": "", "duration": "", "img": ""}


@app.route("/courses", methods=["GET"])
def courses():
    """Course catalogue + wizard questions, published on the Hub."""
    return jsonify({
        "source": COURSE_SOURCE,
        "accuracy": COURSE_META.get(
            "accuracy_full_grid", COURSE_META.get("accuracy")
        ),
        "accuracy_holdout": COURSE_META.get("accuracy_holdout"),
        "courses": _catalogue(),
        "questions": _questions()
    })


@app.route("/navigation", methods=["GET"])
def navigation():
    """Intent -> page mapping, published with the model on the Hub."""
    return jsonify({
        "source": NAVIGATION_SOURCE,
        "intents": NAVIGATION
    })


@app.route("/recommend", methods=["POST"])
def recommend():
    """
    Course recommendation from the trained model.

    Request body (wizard) - the only form the model understands:
        { "background": "commerce", "interest": "unsure",
          "goal": "job", "previous": "basic" }

    Response:
        { "course": { "name": ..., "url": ... }, "confidence": 0.99,
          "source": "hf:<repo>", "alternatives": [ ... ] }

    If the four answers are missing, a 200 with "needs_answers": true and the
    question list is returned. A categorical model cannot score free text.
    """
    data = request.get_json(silent=True) or {}

    background = str(data.get("background") or "").strip()
    interest   = str(data.get("interest") or "").strip()
    goal       = str(data.get("goal") or "").strip()
    previous   = str(data.get("previous") or "").strip()

    if not all([background, interest, goal, previous]):
        return jsonify({
            "needs_answers": True,
            "source": "needs-answers",
            "message": ("Answer these four questions so the course model can "
                        "pick the right course."),
            "questions": _questions()
        }), 200

    invalid = _invalid_fields(background, interest, goal, previous)
    if invalid:
        return jsonify({
            "error": "One or more answers are not recognised by the model.",
            "invalid": invalid,
            "questions": _questions()
        }), 400

    if course_clf is not None:
        # Categorical input: one row, four columns, in training order.
        proba = course_clf.predict_proba([[background, interest, goal, previous]])[0]
        names = list(course_clf.classes_)
        order = proba.argsort()[::-1]
        best  = int(order[0])
        name  = names[best]

        return jsonify({
            "course": _course_details(name),
            "confidence": round(float(proba[best]), 4),
            "source": COURSE_SOURCE,
            "input": {
                "background": background,
                "interest": interest,
                "goal": goal,
                "previous": previous
            },
            "alternatives": [
                {"name": names[int(i)], "confidence": round(float(proba[int(i)]), 4)}
                for i in order[1:4]
            ]
        })

    if course_rules is not None:
        # Rules-only fallback so the wizard still works without the model.
        name = course_rules.teacher(background, interest, goal, previous)[0]
        return jsonify({
            "course": _course_details(name),
            "confidence": None,
            "source": "rules:fallback",
            "alternatives": []
        })

    return jsonify({
        "error": "No course model and no course_rules.py available."
    }), 503


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
