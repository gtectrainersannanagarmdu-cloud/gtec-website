# ==========================================================================
#   G-TEC AI - Lite Intent Model Trainer
#
#   Trains a TF-IDF + LinearSVC classifier on the same datasets as
#   train_model.py, but produces a ~1 MB artifact that runs in ~120 MB of
#   RAM with no PyTorch, so it fits free hosting tiers (Render 512 MB).
#
#   Accuracy on the held-out 15 % split: ~93 % (DistilBERT: ~94 %).
#
#   Output: model/gtec-intent-lite.joblib
#   Usage : python train_lite_model.py
# ==========================================================================

import os
import json

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MODEL_OUT_DIR = os.path.join(BASE_DIR, "model")
MODEL_OUT     = os.path.join(MODEL_OUT_DIR, "gtec-intent-lite.joblib")
META_OUT      = os.path.join(MODEL_OUT_DIR, "gtec-intent-lite-meta.json")

MAIN_CSV  = os.path.join(DATASET_DIR, "gtec_ai_intent_dataset_850.csv")
RECOM_CSV = os.path.join(DATASET_DIR, "gtec_course_recommendation_dataset.csv")


def load_csv_robust(path):
    """Same loader as train_model.py (handles the extra quoting)."""
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('"') and line.endswith('"'):
            line = line[1:-1]
        if "," in line:
            parts = line.rsplit(",", 1)
            if len(parts) == 2:
                rows.append({"text": parts[0].strip(), "target": parts[1].strip()})
    return pd.DataFrame(rows)


print("=" * 60)
print("  G-TEC AI - Lite Model Trainer (TF-IDF + LinearSVC)")
print("=" * 60)

print("\n[1/4] Loading datasets...")
df_main  = load_csv_robust(MAIN_CSV)
df_recom = load_csv_robust(RECOM_CSV)

df = pd.concat([df_main, df_recom], ignore_index=True)
df = df[df["target"].str.lower() != "target"]
df = df.dropna(subset=["text", "target"])
df["text"]   = df["text"].str.strip().str.lower()
df["target"] = df["target"].str.strip().str.upper()
df = df[df["text"] != ""].reset_index(drop=True)
print(f"   Combined rows : {len(df)}")
print(f"   Intents       : {df['target'].nunique()}")

print("\n[2/4] Splitting...")
train_df, val_df = train_test_split(
    df, test_size=0.15, random_state=42, stratify=df["target"]
)
print(f"   Train : {len(train_df)}   Val : {len(val_df)}")

print("\n[3/4] Training...")
features = FeatureUnion([
    ("word", TfidfVectorizer(
        analyzer="word", ngram_range=(1, 2), sublinear_tf=True
    )),
    ("char", TfidfVectorizer(
        analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True
    )),
])

# CalibratedClassifierCV gives real probabilities, so /predict can report a
# meaningful confidence instead of a raw SVM margin.
model = Pipeline([
    ("features", features),
    ("clf", CalibratedClassifierCV(LinearSVC(C=1.0), cv=3)),
])
model.fit(train_df["text"], train_df["target"])

print("\n[4/4] Validating...")
preds = model.predict(val_df["text"])
acc = accuracy_score(val_df["target"], preds)
f1  = f1_score(val_df["target"], preds, average="macro")
print(f"   accuracy : {acc:.4f}")
print(f"   macro F1 : {f1:.4f}\n")
print(classification_report(val_df["target"], preds, zero_division=0))

# ------------------------------------------------------------------
# Save
# ------------------------------------------------------------------
os.makedirs(MODEL_OUT_DIR, exist_ok=True)
joblib.dump(model, MODEL_OUT, compress=3)

classes = list(model.classes_)
meta = {
    "model_type": "tfidf-calibrated-linearsvc",
    "accuracy": round(float(acc), 4),
    "macro_f1": round(float(f1), 4),
    "trained_rows": int(len(train_df)),
    "labels": classes,
    "label2id": {lbl: i for i, lbl in enumerate(classes)},
    "id2label": {str(i): lbl for i, lbl in enumerate(classes)},
}
with open(META_OUT, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

size_mb = os.path.getsize(MODEL_OUT) / 1024 / 1024
print(f"\nSaved  {MODEL_OUT}  ({size_mb:.2f} MB)")
print(f"Saved  {META_OUT}")
print("\nUpload it to the Hub with:")
print(f"  python -m huggingface_hub.cli.hf upload <user>/gtec-intent-model "
      f"\"{MODEL_OUT}\" intent_clf.joblib --repo-type model")
print(f"  python -m huggingface_hub.cli.hf upload <user>/gtec-intent-model "
      f"\"{META_OUT}\" intent_clf_meta.json --repo-type model")
print("\nDone.")
