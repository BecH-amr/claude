# Stage 1: build the venv. Has uv + headers needed if any dep falls back
# to a source build (none should — psycopg2-binary and asyncpg ship wheels).
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

WORKDIR /app

# uv pulls in only what's needed; no system build-essential / libpq-dev
# required because all our deps publish manylinux wheels for 3.13.
RUN pip install --no-cache-dir uv==0.7.3

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Stage 2: runtime. Just python-slim + the venv from builder. No uv, no
# pip cache, no apt build tools — drops image from ~456MB to ~180MB.
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Non-root user (defense-in-depth; the FastAPI app shouldn't write anywhere).
RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /app/.venv /app/.venv
COPY --chown=app:app . .

USER app

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
