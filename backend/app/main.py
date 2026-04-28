from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api import auth, queues, tickets, ws
from app.config import get_settings
from app.limiter import limiter
from app.services.notify import aclose_clients

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Yield to serve requests, then drain the shared httpx client on shutdown
    # so we don't leak sockets / leave 'unclosed connection' warnings under
    # uvicorn graceful shutdown.
    yield
    await aclose_clients()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
    # slowapi's default returns text/plain; emit JSON so the frontend's
    # ApiError parser surfaces a useful message.
    return JSONResponse(
        status_code=429,
        content={"detail": f"Too many requests: {exc.detail}"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    # Tightened from "*". Wildcard with credentials=True is the CORS
    # equivalent of chmod 777 — broaden only if a new endpoint needs it.
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(queues.router)
app.include_router(tickets.router)
app.include_router(ws.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
