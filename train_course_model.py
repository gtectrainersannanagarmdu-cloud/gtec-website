# ==========================================================================
#   G-TEC AI - Course Recommender Trainer
#
#   Trains a small model that predicts WHICH COURSE a visitor should take
#   from the four answers collected by the "Find My Course" wizard:
#       background, interest, goal, previous
#
#   Input is categorical (4 fields), not free text. That makes the model
#   learn EVERY combination exactly - including rare ones such as
#   "engineering + upgrade + technical -> Advanced Python", which a text
#   model cannot pick up because it appears in only 2 of 3,840 rows.
#
#   Labels come from course_rules.teacher(), the same logic the live site
#   uses, so no counsellor behaviour is invented.
#
#   Output:
#       model/gtec-course-lite.joblib      (~0.1 MB)
#       model/gtec-course-lite-meta.json   (catalogue + questions + metrics)
#
#   Usage:  python train_course_model.py
# ==========================================================================

import os
import json
import itertools

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from course_rules import (
    COURSES, BACKGROUNDS, GOALS, PREVIOUS,
    BACKGROUND_TEXT, GOAL_TEXT, PREVIOUS_TEXT,
    RECOM_QUESTIONS, BEGINNER_COURSE, teacher,
)

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
MODEL_OUT_DIR = os.path.join(BASE_DIR, "model")
MODEL_OUT     = os.path.join(MODEL_OUT_DIR, "gtec-course-lite.joblib")
META_OUT      = os.path.join(MODEL_OUT_DIR, "gtec-course-lite-meta.json")

FIELDS = ["background", "interest", "goal", "previous"]


def build_grid():
    """Every answer combination the wizard can produce."""
    rows, labels = [], []
    for bg, it, gl, pv in itertools.product(
        BACKGROUNDS,
        ["unsure"] + [c["name"] for c in COURSES],
        GOALS,
        PREVIOUS,
    ):
        course, _, _ = teacher(bg, it, gl, pv)
        rows.append([bg, it, gl, pv])
        labels.append(course)
    return rows, labels


def make_pipeline():
    return Pipeline([
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ("clf", LogisticRegression(max_iter=5000, C=100.0)),
    ])


print("=" * 64)
print("  G-TEC AI - Course Recommender Trainer")
print("=" * 64)

print("\n[1/4] Generating every wizard combination...")
X, y = build_grid()
print(f"   combinations : {len(X):,}")
print(f"   courses      : {len(set(y))}")

print("\n[2/4] Splitting...")
X_tr, X_va, y_tr, y_va = train_test_split(X, y, test_size=0.15, random_state=42)
print(f"   train : {len(X_tr):,}   val : {len(X_va):,}")

print("\n[3/4] Training...")
holdout = make_pipeline()
holdout.fit(X_tr, y_tr)
preds = holdout.predict(X_va)
acc_holdout = accuracy_score(y_va, preds)
print(f"   held-out accuracy : {acc_holdout:.4f}")

# Final artifact trains on the full grid so no combination is unknown.
print("\n[4/4] Refitting on all combinations...")
model = make_pipeline()
model.fit(X, y)

full_preds = model.predict(X)
acc_full = accuracy_score(y, full_preds)
print(f"   full-grid agreement : {acc_full:.4f}")

errors = [(X[i], y[i], full_preds[i]) for i in range(len(y)) if y[i] != full_preds[i]]
if errors:
    print(f"\n   {len(errors)} mismatches against the rules:")
    for row, want, got in errors[:10]:
        print(f"     {row} -> want {want}, got {got}")
else:
    print("   Model reproduces the rule engine on all combinations.")

print("\nPer-course report (held-out split):")
print(classification_report(y_va, preds, zero_division=0))

# --------------------------------------------------------------------------
# Save model + metadata. The catalogue and question wording travel with the
# model, so the website reads them from the Hub instead of hardcoded JS.
# --------------------------------------------------------------------------
os.makedirs(MODEL_OUT_DIR, exist_ok=True)
joblib.dump(model, MODEL_OUT, compress=3)

meta = {
    "model_type": "onehot-logisticregression-course",
    "accuracy_holdout": round(float(acc_holdout), 4),
    "accuracy_full_grid": round(float(acc_full), 4),
    "combinations": int(len(X)),
    "fields": FIELDS,
    "labels": list(model.classes_),
    "courses": COURSES,
    "questions": RECOM_QUESTIONS,
    "beginner_course": BEGINNER_COURSE,
    "background_text": BACKGROUND_TEXT,
    "goal_text": GOAL_TEXT,
    "previous_text": PREVIOUS_TEXT,
    "generated_from": "public/js/recommend.js (via course_rules.py)",
}
with open(META_OUT, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)

size_kb = os.path.getsize(MODEL_OUT) / 1024
print(f"\nSaved  {MODEL_OUT}  ({size_kb:.0f} KB)")
print(f"Saved  {META_OUT}")
print("\nUpload both with:")
print("  python -m huggingface_hub.cli.hf upload GtecBuddy/gtec-intent-model "
      "model/gtec-course-lite.joblib course_clf.joblib --repo-type model")
print("  python -m huggingface_hub.cli.hf upload GtecBuddy/gtec-intent-model "
      "model/gtec-course-lite-meta.json course_clf_meta.json --repo-type model")
print("\nDone.")
