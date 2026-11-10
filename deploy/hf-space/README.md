---
title: G-TEC AI Server
emoji: 🎓
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Intent classifier API for the G-TEC website chatbot
---

# G-TEC AI Server

Flask REST API that serves the fine-tuned DistilBERT intent classifier used by the
G-TEC website chatbot (`public/js/buddy.js`).

The model weights are **not** stored in this Space. They are downloaded from the
Hugging Face Model Hub on startup, using the `MODEL_ID` variable
(Settings → Variables and secrets).

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/` | Health check |
| GET | `/health` | Lightweight readiness probe |
| GET | `/status` | Model source + list of intents |
| POST | `/predict` | `{ "message": "..." }` → `{ intent, confidence }` |
| POST | `/chat` | Multi-turn chat used by the website |

## Variables

| Name | Example | Required |
| ---- | ------- | -------- |
| `MODEL_ID` | `gtec-trainers/gtec-intent-model` | yes |
| `HF_TOKEN` | `hf_xxx` | only for private model repos |

## Notes

- `MODEL_ID` must point to a repository created with `AutoModelForSequenceClassification` /
  `Trainer.save_model()` so that `config.json`, the weights and the tokenizer are present.
- First request after the Space wakes up can take 30–90 s while the weights download
  and PyTorch warms up.
