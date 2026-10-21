FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY index.html ./index.html
COPY static/ ./static/
COPY brand-assets/ ./brand-assets/
COPY manifest.webmanifest favicon.ico ./

# Non-privileged runtime user; /data is the only writable path (bind-mounted volume).
RUN mkdir -p /data \
    && useradd --system --uid 1000 --create-home --shell /usr/sbin/nologin app \
    && chown -R app:app /data

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
