# Deploying the G-TEC AI server to Hugging Face

> **Heads-up (2026):** Docker/Gradio Spaces now require a paid HF plan.
> If you want a **$0 deployment**, follow [`deploy/DEPLOY_FREE.md`](./DEPLOY_FREE.md)
> instead — it uses Render's free tier with the lite model backend.
> This document remains valid for the model upload (Parts 1–3, free) and for the
> Space itself if you subscribe to PRO.

Architecture after this change:

```
GitHub  ─────────►  Website (Express + static)      →  Render / Netlify / Vercel
                     public/js/buddy.js  ─────┐
                                              │  HTTPS (CORS)
Hugging Face Model Hub  ──►  Hugging Face Space ──► ai_server.py (Flask + DistilBERT)
   gtec-intent-model            gtec-ai-server
```

- **Weights** live in a **Model Hub** repo (free, versioned, ~255 MB).
- **AI server** lives in a **Docker Space** (free CPU, ~16 GB RAM).
- **Website** repo stays small and pushes to GitHub normally.

Files already prepared for you:

| File | Purpose |
| --- | --- |
| `ai_server.py` | Loads `MODEL_ID` from the Hub, falls back to the local folder |
| `deploy/hf-space/Dockerfile` | Container for the Space |
| `deploy/hf-space/requirements.txt` | CPU-only deps for the Space |
| `deploy/hf-space/README.md` | Space card + endpoint docs |
| `deploy/publish.ps1` | One-shot upload of model + Space |
| `server.js` | `AI_BASE_URL` env var for the Express proxy |
| `public/js/buddy.js` | `AI_BASE_URL` constant + `window.GTEC_AI_URL` override |

---

## Part 1 — Create a Hugging Face account and token

1. Sign up at <https://huggingface.co/join> (free).
2. Click your avatar → **Settings** → **Access Tokens** → **Create new token**.
3. Type: **Write**. Name: `gtec-deploy`.
4. Copy the token (`hf_...`) — it is shown once.

Install the CLI and log in (once):

```powershell
python -m pip install -U "huggingface_hub[cli]"
python -m huggingface_hub.cli.hf auth login
```

> **Windows tip:** if `hf` fails with
> `Fatal error in launcher: Unable to create process using ... python313 ...`,
> your `hf.exe` is a leftover shim from an older Python. The `python -m ...`
> form above always works, and `deploy/publish.ps1` uses it automatically.
> To fix `hf` globally, remove the dead `...\Python313\Scripts` and
> `...\Python313\` entries from your user `PATH` (Windows Settings → Environment
> Variables → Path), then reopen the terminal.

Paste the token when asked. Verify:

```powershell
python -m huggingface_hub.cli.hf auth whoami
```

---

## Part 2 — Pick and check the model folder

Your trainer saves to `model/gtec-intent-model-v2`. Confirm it is complete:

```powershell
Get-ChildItem .\model\gtec-intent-model-v2 | Format-Table Name, Length
```

You must see at least:

```
config.json
model.safetensors        (~255 MB)
tokenizer.json
tokenizer_config.json
special_tokens_map.json
vocab.txt
```

If any of these is missing, re-run `python train_model.py` first — `save_pretrained()`
writes all of them.

> **Never upload `model/checkpoints/`.** Those are training snapshots with
> `optimizer.pt` (535 MB each) and are useless for inference.

---

## Part 3 — Upload the weights to the Model Hub

### Option A — one command (recommended)

```powershell
# Result: https://huggingface.co/<your-username>/gtec-intent-model
.\deploy\publish.ps1 -HfUser <your-username>
```

The script creates the model repo, uploads the folder (excluding trainer leftovers),
creates the Docker Space, stages the server files and uploads them.

### Option B — manual

```powershell
python -m huggingface_hub.cli.hf repos create <your-username>/gtec-intent-model --repo-type model --exist-ok
python -m huggingface_hub.cli.hf upload <your-username>/gtec-intent-model .\model\gtec-intent-model-v2 --repo-type model `
    --exclude "training_args.bin" "trainer_state.json"
```

### Option C — no CLI at all

<https://huggingface.co/new> → **Model** → name it `gtec-intent-model` → create.
Then **Files → Add file → Upload files** and drag the **contents** of
`model/gtec-intent-model-v2` (not the folder itself, and not `checkpoints/`).

Verify the repo page shows `model.safetensors`, `config.json`, `tokenizer.json`.

---

## Part 4 — Create the Docker Space

> **⚠️ 2026 policy change:** Hugging Face now requires a **PRO plan ($9/mo)** to
> create **Docker or Gradio Spaces**. Only **Static Spaces** are free, and they
> cannot run a Python/Flask server. Free personal accounts get 2 **ZeroGPU
> Gradio** Spaces, but ZeroGPU is GPU-only, queue-based and rate-limited — not
> suitable for a public website chatbot.
>
> So: the model upload (Parts 2–3) is always free. This part needs PRO, or skip
> to [Hosting the AI server elsewhere](#hosting-the-ai-server-without-a-space).

The Space is its own repository, so it needs `ai_server.py` plus the three files in
`deploy/hf-space/`. Both options below produce that exact layout.

### Option A — one command

```powershell
.\deploy\publish.ps1 -HfUser <your-username> -SkipModel
```

Creates the Space (if missing), stages `ai_server.py` + `Dockerfile` +
`requirements.txt` + `README.md` in a temp folder, and uploads everything.

### Option B — manual

1. <https://huggingface.co/new-space>
2. Name: `gtec-ai-server`
3. **SDK: Docker** → Blank
4. Hardware: **CPU basic · 2 vCPU · 16 GB · FREE**
5. Visibility: **Public** → **Create Space**
6. Upload the staged files:

```powershell
$stage = "$env:TEMP\gtec-space"
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item .\ai_server.py $stage
Copy-Item .\deploy\hf-space\Dockerfile, .\deploy\hf-space\requirements.txt, .\deploy\hf-space\README.md $stage
hf upload <your-username>/gtec-ai-server $stage --repo-type space
```

> **Consistency tip:** `ai_server.py` now exists in two places. After editing it in
> the website repo, re-run `.\deploy\publish.ps1 -HfUser <your-username> -SkipModel`
> so the Space picks up the change.

---

## Part 5 — Point the Space at the model

1. Open <https://huggingface.co/spaces/&lt;your-username&gt;/gtec-ai-server>
2. **Settings** → **Variables and secrets** → **New variable**
3. Name: `MODEL_ID` · Value: `<your-username>/gtec-intent-model`
4. Save. The Space restarts automatically.

Watch the **Logs** tab. A healthy boot looks like:

```
Loading G-TEC AI model...
Loading model from Hugging Face Hub: <user>/gtec-intent-model
Model loaded successfully from hf:<user>/gtec-intent-model
Total intents: 18
Booting worker with pid: ...
```

The first build takes ~5–8 minutes (PyTorch + model download).

---

## Part 6 — Verify the API

Your Space URL is `https://<username>-gtec-ai-server.hf.space`
(underscores become dashes, lowercase).

```powershell
$AI = "https://<username>-gtec-ai-server.hf.space"

Invoke-RestMethod "$AI/health"
Invoke-RestMethod "$AI/status"

Invoke-RestMethod "$AI/predict" -Method Post -ContentType 'application/json' `
    -Body '{"message":"do you teach tally"}'
```

Expected:

```json
{ "message": "do you teach tally", "intent": "TALLY", "confidence": 0.9812 }
```

If you get `503` with "Space is sleeping", open the Space page to wake it and retry.

---

## Part 7 — Point the website at the Space

Pick **one** of these.

### 7a. Edit the constant (simplest)

`public/js/buddy.js`, line ~15:

```js
const AI_BASE_URL = (window.GTEC_AI_URL || 'https://<username>-gtec-ai-server.hf.space')
  .replace(/\/+$/, '');
```

### 7b. Override per environment, no code edit

Add this **before** the `buddy.js` `<script>` tag in each HTML page
(`index.html`, `about.html`, `courses.html`, …):

```html
<script>window.GTEC_AI_URL = 'https://<username>-gtec-ai-server.hf.space';</script>
```

Useful if you keep local dev on `127.0.0.1:5001`.

### 7c. Server-side proxy (keeps the Space URL private)

In `.env` / hosting dashboard:

```
AI_BASE_URL=https://<username>-gtec-ai-server.hf.space
```

`server.js` forwards `/api/predict` and `/api/chat` there. The browser then only
talks to your own domain.

> CORS is already wide open in `ai_server.py` (`CORS(app)`), so direct browser
> calls from the deployed site work.

---

## Part 8 — Unblock the GitHub push

The old commits still contain `optimizer.pt` (535 MB each), which is why the push fails.

**Step 8.1 — stop tracking weights (keeps files on disk):**

```powershell
git rm -r --cached model/ | Out-Null
git status --short
```

`.gitignore` already ignores `*.safetensors`, `*.pt`, `*.bin`; add the whole model
folder so nothing sneaks back in:

```gitignore
# Trained model artefacts (weights live on the Hugging Face Hub)
model/
```

**Step 8.2 — commit:**

```powershell
git add .gitignore ai_server.py server.js public/js/buddy.js requirements.txt deploy/
git commit -m "feat: serve AI model from Hugging Face Hub + deploy server as HF Space"
```

**Step 8.3 — push.** If it still fails with `File ... is 535.82 MB; this exceeds
GitHub's maximum allowed file size`, the blobs are in history and must be purged:

```powershell
pip install git-filter-repo
git filter-repo --path model/ --path-glob "*.safetensors" --path-glob "*.pt" --path-glob "*.bin" --invert-paths --force

# filter-repo removes the remote, so re-add it
git remote add origin https://github.com/gtectrainersannanagarmdu-cloud/gtec-website.git
git push --force-with-lease origin main
```

> `git filter-repo` rewrites history. It is safe here because you are the only
> contributor; it is destructive if others have clones.

**Alternative if `filter-repo` is unavailable** — BFG Repo-Cleaner:

```powershell
java -jar bfg.jar --delete-folders model --delete-files "*.pt" --no-blob-protection .git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

---

## Hosting the AI server without a Space

The model on the Hub is portable — anything that can run `ai_server.py` works.
Just set `MODEL_ID=<user>/gtec-intent-model` and the app downloads the weights.

| Host | Free tier | Verdict for this app |
| --- | --- | --- |
| **Render** | 512 MB RAM, sleeps after 15 min idle | ⚠️ Tight. torch + DistilBERT needs ~700–900 MB → usually OOM. |
| **Railway** | ~$5 trial credit, then paid | ✅ Works, not free forever. |
| **Fly.io** | pay-as-you-go (no free allowance) | ✅ Works, needs a card. |
| **Google Cloud Run** | 180k vCPU-s + 360k GiB-s/month, 1–2 GB RAM | ✅ Best free option; requires a billing account. |
| **Oracle Cloud Always Free** | ARM VM, 4 cores / 24 GB | ✅ Free forever, most setup work. |
| **Your own PC / college LAN** | free | ✅ Simplest for demos (`start_ai.bat`). |
| **Hugging Face PRO Space** | $9/mo | ✅ Zero code changes, already scripted. |

### Render free tier — only if you shrink the model

512 MB is not enough for `torch` + `transformers`. Two ways to fit:

1. **ONNX Runtime** with a quantised DistilBERT (~67 MB, ~200 MB RAM):
   ```python
   from optimum.onnxruntime import ORTModelForSequenceClassification
   model = ORTModelForSequenceClassification.from_pretrained(MODEL_ID)
   ```
2. **Embeddings + LogisticRegression** (no torch at all, ~90 MB):
   `sentence-transformers/all-MiniLM-L6-v2` + `sklearn`, as described in
   [the deployment plan](#).

### Cloud Run (free, keeps torch)

```powershell
# one-time
gcloud auth login
gcloud run deploy gtec-ai ^
  --source . ^
  --region asia-south1 ^
  --memory 1Gi ^
  --cpu 1 ^
  --allow-unauthenticated ^
  --set-env-vars MODEL_ID=GtecBuddy/gtec-intent-model
```

Then set `AI_BASE_URL` / `window.GTEC_AI_URL` to the printed service URL.

---

## Part 9 - Deploy the website itself

The website no longer needs Python. Any static/Node host works.

**Render (free):**

1. New → **Web Service** → connect the GitHub repo
2. Build: `npm install` · Start: `npm start`
3. Environment:
   - `AI_BASE_URL=https://<username>-gtec-ai-server.hf.space`
   - `ADMIN_USER`, `ADMIN_PASS`
4. Deploy.

**Netlify / Vercel:** the site is Express-based, so use the Express preset or move
to their serverless adapter; `AI_BASE_URL` goes in the environment variables.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Fatal error in launcher: Unable to create process using ... python313 ...` | dead `hf.exe` shim left by an old Python install | use `python -m huggingface_hub.cli.hf ...`, or remove the old `Python313` entries from `PATH` |
| `RuntimeError: No usable model found` | `MODEL_ID` not set on the Space | Add the variable, restart |
| `401 / Repository not found` | private model repo | Add `HF_TOKEN` secret to the Space |
| Space builds, then `504` | cold start, model still downloading | wait 60–90 s, retry |
| Browser blocks the call (`CORS`) | wrong URL, or Space offline | check address bar URL in Network tab |
| `503 AI Server is currently unavailable` | Express can't reach `AI_BASE_URL` | verify the env var has no trailing `/` |
| Chatbot answers but badge says "Smart Local Engine" | probe ran before Space woke | it retries 20× every 3 s |
| Very slow replies on free tier | 2 vCPU CPU-only inference | normal: 100–400 ms after warm-up |

### Free-tier facts

| Limit | Value |
| --- | --- |
| Space hardware | 2 vCPU, 16 GB RAM, CPU only |
| Sleep after inactivity | 48 h (wakes on request, ~30–90 s) |
| Public model repo storage | generous (LFS backed, no practical cost at 255 MB) |
| Persistent disk | not included — weights re-download on restart (cached per run) |

To remove the cold start, either upgrade the Space, or bake the weights into the image:

```dockerfile
RUN python -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification as M; \
    m='gtec-trainers/gtec-intent-model'; \
    AutoTokenizer.from_pretrained(m).save_pretrained('/app/model_cache'); \
    M.from_pretrained(m).save_pretrained('/app/model_cache')"
ENV MODEL_ID=/app/model_cache
```

---

## Checklist

- [ ] HF account + write token created
- [ ] `hf auth login` works (`python -m huggingface_hub.cli.hf auth whoami`)
- [ ] `model/gtec-intent-model-v2` contains config + weights + tokenizer
- [ ] Model repo uploaded and visible in the browser
- [ ] Docker Space created (public, CPU basic)
- [ ] `MODEL_ID` variable set on the Space
- [ ] Space logs show `Model loaded successfully from hf:...`
- [ ] `/predict` returns `TALLY` for "do you teach tally"
- [ ] `buddy.js` (or `window.GTEC_AI_URL`) points at the Space
- [ ] `model/` untracked in git; `.gitignore` updated
- [ ] `git push` to GitHub succeeds
- [ ] Website deployed with `AI_BASE_URL` set
- [ ] Chatbot badge shows **AI Model Active (Hub)**
