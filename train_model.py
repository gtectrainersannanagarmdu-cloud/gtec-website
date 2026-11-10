# ==========================================================================
#   G-TEC AI — Intent Classification Model Trainer
#   Trains a DistilBERT model on the combined intent + course-recommendation
#   datasets and saves it to model/gtec-intent-model-v2
# ==========================================================================
# pyrefly: ignore [missing-import]

import os
import json
import shutil

# pyrefly: ignore [missing-import]
import pandas as pd
# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
from sklearn.model_selection import train_test_split
# pyrefly: ignore [missing-import]
from sklearn.metrics import classification_report
# pyrefly: ignore [missing-import]
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    EarlyStoppingCallback
)
# pyrefly: ignore [missing-import]
from datasets import Dataset

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
BASE_DIR       = os.path.dirname(__file__)
DATASET_DIR    = os.path.join(BASE_DIR, "dataset")
MODEL_OUT      = os.path.join(BASE_DIR, "model", "gtec-intent-model-v2")
LABEL_MAP_PATH = os.path.join(MODEL_OUT, "label_map.json")

MAIN_CSV   = os.path.join(DATASET_DIR, "gtec_ai_intent_dataset_850.csv")
RECOM_CSV  = os.path.join(DATASET_DIR, "gtec_course_recommendation_dataset.csv")

BASE_MODEL = "distilbert-base-uncased"


# ------------------------------------------------------------------
# 1. Load & merge datasets
# ------------------------------------------------------------------
print("=" * 60)
print("  G-TEC AI — Model Trainer")
print("=" * 60)
print("\n[1/6] Loading datasets...")


def load_csv_robust(path):
    """Load a CSV that may have extra quoting (like the recommendation file)."""
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    # Strip outer quotes from each line if present
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        # Some rows are wrapped in extra double-quotes: "text,TARGET"
        if line.startswith('"') and line.endswith('"'):
            line = line[1:-1]
        if "," in line:
            # Split only on the LAST comma so multi-word text stays intact
            parts = line.rsplit(",", 1)
            if len(parts) == 2:
                rows.append({"text": parts[0].strip(), "target": parts[1].strip()})
    return pd.DataFrame(rows)


df_main  = load_csv_robust(MAIN_CSV)
df_recom = load_csv_robust(RECOM_CSV)

# Drop header rows that snuck in
df_main  = df_main[df_main["target"] != "target"].reset_index(drop=True)
df_recom = df_recom[df_recom["target"] != "target"].reset_index(drop=True)

df = pd.concat([df_main, df_recom], ignore_index=True)
df.dropna(subset=["text", "target"], inplace=True)
df["text"]   = df["text"].str.strip().str.lower()
df["target"] = df["target"].str.strip().str.upper()
df = df[df["text"] != ""].reset_index(drop=True)

print(f"   Main dataset rows   : {len(df_main)}")
print(f"   Recom dataset rows  : {len(df_recom)}")
print(f"   Combined total rows : {len(df)}")


# ------------------------------------------------------------------
# 2. Build label mappings
# ------------------------------------------------------------------
print("\n[2/6] Building label mappings...")

labels_sorted = sorted(df["target"].unique().tolist())
label2id      = {lbl: idx for idx, lbl in enumerate(labels_sorted)}
id2label      = {idx: lbl for lbl, idx in label2id.items()}

print(f"   Total intents ({len(labels_sorted)}): {labels_sorted}")

# Save label map alongside model
os.makedirs(MODEL_OUT, exist_ok=True)
with open(LABEL_MAP_PATH, "w") as f:
    json.dump(
        {"id2label": {str(k): v for k, v in id2label.items()},
         "label2id": label2id},
        f, indent=2
    )
print(f"   Label map saved → {LABEL_MAP_PATH}")


# ------------------------------------------------------------------
# 3. Tokenize
# ------------------------------------------------------------------
print(f"\n[3/6] Loading tokenizer from '{BASE_MODEL}'...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

df["label"] = df["target"].map(label2id)

train_df, val_df = train_test_split(
    df, test_size=0.15, random_state=42, stratify=df["label"]
)
print(f"   Train samples : {len(train_df)}")
print(f"   Val   samples : {len(val_df)}")


def tokenize_batch(batch):
    return tokenizer(
        batch["text"],
        padding="max_length",
        truncation=True,
        max_length=64
    )


train_ds = Dataset.from_pandas(train_df[["text", "label"]].reset_index(drop=True))
val_ds   = Dataset.from_pandas(val_df[["text",  "label"]].reset_index(drop=True))

train_ds = train_ds.map(tokenize_batch, batched=True)
val_ds   = val_ds.map(tokenize_batch,   batched=True)

train_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "label"])
val_ds.set_format(  type="torch", columns=["input_ids", "attention_mask", "label"])


# ------------------------------------------------------------------
# 4. Load model
# ------------------------------------------------------------------
print(f"\n[4/6] Loading base model '{BASE_MODEL}'...")
model = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL,
    num_labels=len(labels_sorted),
    id2label=id2label,
    label2id=label2id
)


# ------------------------------------------------------------------
# 5. Train
# ------------------------------------------------------------------
print("\n[5/6] Training...")

CHECKPOINT_DIR = os.path.join(
    BASE_DIR,
    "model",
    "checkpoints"
)

LOG_DIR = os.path.join(
    BASE_DIR,
    "model",
    "logs"
)

os.makedirs(CHECKPOINT_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)


training_args = TrainingArguments(
    output_dir=CHECKPOINT_DIR,

    # Training
    num_train_epochs=12,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,

    # Optimization
    learning_rate=3e-5,
    warmup_steps=100,
    weight_decay=0.01,

    # Evaluation
    eval_strategy="epoch",

    # Checkpoint saving
    save_strategy="epoch",
    save_total_limit=2,

    # Best model
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    greater_is_better=False,

    # Logging
    logging_strategy="steps",
    logging_steps=50,

    # Disable external logging
    report_to="none",

    # GPU
    fp16=torch.cuda.is_available(),
)


trainer = Trainer(
    model=model,
    args=training_args,

    train_dataset=train_ds,
    eval_dataset=val_ds,

    callbacks=[
        EarlyStoppingCallback(
            early_stopping_patience=3
        )
    ]
)


print("\nStarting model training...\n")

trainer.train()


# ------------------------------------------------------------------
# 6. Save final model
# ------------------------------------------------------------------
print(f"\n[6/6] Saving model to '{MODEL_OUT}'...")

# Remove stale checkpoint sub-folders inside the model output dir
if os.path.isdir(MODEL_OUT):
    for item in os.listdir(MODEL_OUT):
        item_path = os.path.join(MODEL_OUT, item)
        if os.path.isdir(item_path) and item.startswith("checkpoint"):
            shutil.rmtree(item_path)

trainer.save_model(MODEL_OUT)
tokenizer.save_pretrained(MODEL_OUT)

# ------------------------------------------------------------------
# Validation report
# ------------------------------------------------------------------
print("\n--- Validation Classification Report ---")
preds_output = trainer.predict(val_ds)
preds        = preds_output.predictions.argmax(axis=1)
true_labels  = val_df["label"].tolist()
print(classification_report(true_labels, preds, target_names=labels_sorted))

print("\n✅ Training complete!")
print(f"   Model saved to: {MODEL_OUT}")
