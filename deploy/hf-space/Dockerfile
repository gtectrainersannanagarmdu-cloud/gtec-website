# ==========================================================================
#   G-TEC AI Server — Hugging Face Docker Space
#   Serves ai_server.py (Flask) on port 7860.
#   The trained weights are pulled from the Hugging Face Model Hub at
#   runtime using the MODEL_ID environment variable.
# ==========================================================================
FROM python:3.11-slim

# --- Runtime environment -----------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache \
    HOST=0.0.0.0 \
    PORT=7860

# MODEL_ID is set on the Space (Settings -> Variables and secrets), e.g.
#   MODEL_ID = your-username/gtec-intent-model
# It is intentionally left empty so a missing variable fails loudly instead of
# silently loading a stranger's repo.
ENV MODEL_ID=""

WORKDIR /app

# --- Dependencies -------------------------------------------------------
# Installed first so code changes do not invalidate the (slow) pip layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Application --------------------------------------------------------
COPY ai_server.py .

EXPOSE 7860

# Single worker keeps one copy of the model in RAM.
# More threads (not workers) handle concurrent chat requests.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 4 --timeout 300 --access-logfile - ai_server:app"]
