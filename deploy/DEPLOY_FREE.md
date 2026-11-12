# Free deployment guide — GitHub + Render ($0/month, no card)

```
GitHub repo ─────► Render: gtec-website  (Node/Express, free)
                           │  server-side proxy /api/predict, /api/chat,
                           │  /api/recommend, /api/courses, /api/navigation
                           ▼
                   Render: gtec-ai      (Flask, free 512 MB)
                           │  downloads from the Hub at startup:
                           │    intent_clf.joblib    (~1 MB)
                           │    course_clf.joblib    (~6 KB)
                           │    course_clf_meta.json
                           │    navigation.json
                           ▼
                   Hugging Face Hub: GtecBuddy/gtec-intent-model
```

Three moving parts, all free:

| Piece | Where | Cost |
| --- | --- | --- |
| Website + Node server | Render free web service | $0 |
| AI intent + course API | Render free web service (`lite` backend) | $0 |
| Model weights + navigation map | Hugging Face Model Hub | $0 |

Why the `lite` backend: the free Render instance has **512 MB RAM**. DistilBERT +
PyTorch needs ~800 MB, so it would be killed with `Out of memory`. The lite
TF-IDF intent model needs ~120 MB and scores **94.0 %** on your validation split
(DistilBERT: 93.9 %), while the full DistilBERT stays available for local demos.
The course recommender is a separate 6 KB categorical model with **100 %**
agreement with the wizard rules on all 3,680 answer combinations.

---

## What is already done

- [x] DistilBERT weights uploaded: `GtecBuddy/gtec-intent-model`
- [x] Lite intent model trained (94.0 % accuracy) and uploaded as `intent_clf.joblib`
- [x] Course model trained (100 % grid agreement) and uploaded as `course_clf.joblib` + `course_clf_meta.json`
- [x] Intent -> page map uploaded as `navigation.json`
- [x] `ai_server.py` downloads all of it from the Hub (`MODEL_BACKEND=lite|torch`)
- [x] `render.yaml` blueprint for both services
- [x] `deploy/render/requirements-ai.txt` (no torch)
- [x] `server.js` normalises `AI_BASE_URL` and proxies every `/api/*` call

---

## Step 1 — Push the code to GitHub

```powershell
cd "F:\Trainer_Thowfic\GTEC Website"

# review what will be committed first
git status --short

git add ai_server.py server.js public/js/buddy.js public/js/recommend.js `
        course_rules.py navigation.json package.json requirements.txt `
        requirements-train.txt train_lite_model.py train_course_model.py `
        render.yaml deploy/ .gitignore .env.example

git commit -m "feat: HF Hub intent + course models, free Render deployment"
git push origin main
```

If the push is rejected because of the old 535 MB `optimizer.pt` blobs in
history, follow **Part 8** of `deploy/HF_DEPLOY.md` (`git filter-repo`).

> `model/`, `node_modules/`, `.venv/`, `.env` are ignored — nothing heavy is
> pushed. The lite model lives on the Hub, not in the repo.

---

## Step 2 — Create both services on Render

1. Sign up at <https://render.com> with GitHub (no card needed for free tier).
2. **New → Blueprint**.
3. Connect the `gtec-website` repository.
4. Render reads `render.yaml` and shows two services: `gtec-ai` and
   `gtec-website`. Click **Apply**.
5. During the first setup it asks for the `sync: false` values:
   - `ADMIN_USER` → your admin username
   - `ADMIN_PASS` → a strong password

Wait for both builds (~3–5 min). The first request to `gtec-ai` may take
30–60 s because the free instance sleeps after 15 minutes of inactivity.

---

## Step 3 — Check the AI service

Open `https://gtec-ai.onrender.com/health` (use the URL Render shows):

```json
{ "status": "ok", "backend": "lite", "model_source": "lite:GtecBuddy/gtec-intent-model" }
```

Then try a prediction:

```powershell
$AI = "https://gtec-ai.onrender.com"
Invoke-RestMethod "$AI/predict" -Method Post -ContentType 'application/json' `
    -Body '{"message":"do you teach tally"}'
# -> intent = TALLY
```

And through the website proxy:

```powershell
Invoke-RestMethod "https://gtec-website.onrender.com/api/predict" -Method Post `
    -ContentType 'application/json' -Body '{"message":"where is the madurai centre"}'
```

Course recommendation (the same call the "Find My Course" wizard makes):

```powershell
$body = '{"background":"commerce","interest":"unsure","goal":"job","previous":"basic"}'
Invoke-RestMethod "https://gtec-website.onrender.com/api/recommend" -Method Post `
    -ContentType 'application/json' -Body $body
# -> course.name = Tally ERP & GST Accounting
```

If both return an intent, the chatbot works — open the site and click the
chat bubble. The badge should read **AI Model Active**.

---

## Step 4 — Frontend (usually nothing to do)

The browser calls `/api/predict` on your own domain and `server.js` forwards it
to `gtec-ai`. So the deployed website needs **no** changes.

Only if you want the browser to call the AI service directly:

```html
<script>window.GTEC_AI_URL = 'https://gtec-ai.onrender.com';</script>
```

placed **before** `js/buddy.js`.

---

## Step 5 — Retraining later

```powershell
# 1. retrain
.\.venv\Scripts\python.exe train_lite_model.py      # intent model (free hosting)
.\.venv\Scripts\python.exe train_course_model.py    # course recommender
.\.venv\Scripts\python.exe train_model.py           # DistilBERT (optional)

# 2. upload all artifacts to the Hub
.\deploy\publish.ps1 -HfUser GtecBuddy -SkipSpace

# 3. restart the AI service
#    Render dashboard -> gtec-ai -> Manual Deploy -> Clear build cache & deploy
```

If you upgrade to Hugging Face PRO later, the full DistilBERT Space is still
wired up — see `deploy/HF_DEPLOY.md`.

---

## Free-tier limits you should know

| Limit | Value | Effect on this project |
| --- | --- | --- |
| RAM per service | 512 MB | lite backend ~120 MB → safe |
| CPU | 0.1 vCPU | ~20–80 ms per prediction, fine |
| Spin down | after 15 min idle | next request takes ~30–60 s |
| Bandwidth | 100 GB/month | plenty |
| Services per account | free plan allows several | 2 used here |
| Disk | ephemeral | see warning below |

> **⚠️ Ephemeral disk:** `server.js` stores admin blog posts in
> `data/blogs.json` and uploads in `public/uploads/`. On Render these are wiped
> on every deploy/restart. If the blog must persist, move posts to a free
> database (Supabase / Neon free tier) or keep the blog admin on your own
> machine.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Out of memory` in gtec-ai logs | `MODEL_BACKEND` not set to `lite`, so torch loaded | Set `MODEL_BACKEND=lite` in the service env |
| `InconsistentVersionWarning` / unpickle error | scikit-learn version differs from the one used to train | Keep `scikit-learn==1.9.1` pinned, or retrain and re-upload |
| `/predict` returns 503 for the first request | AI service was asleep | retry after ~60 s |
| Badge says "Smart Local Engine" | proxy can't reach `AI_BASE_URL` | check the env var on `gtec-website` |
| `Repository Not Found` for the model | wrong `MODEL_ID` | must be `GtecBuddy/gtec-intent-model` |
| Build fails on `pip install` | Python version too new/old | set `PYTHON_VERSION=3.13.5` |

---

## Why not Hugging Face Spaces?

Hugging Face changed its policy in 2026: **Docker and Gradio Spaces require a
PRO plan ($9/mo)**. Only Static Spaces are free, and they cannot run Python.
The Hub (model storage) is still free, which is why the weights live there and
the compute lives on Render.
