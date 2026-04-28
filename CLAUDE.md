# Q — Queue Management

Browser-first queue management. Customer scans QR → joins queue → waits anywhere with live updates. Business owns one or more queues from a phone-friendly dashboard.

## Layout

```
backend/    FastAPI + SQLAlchemy + asyncpg + WebSockets
frontend/   Next.js 14 (app router, TS, Tailwind, next-pwa)
docker-compose.yml   postgres + redis + backend + frontend
```

## How the pieces fit

- **Auth**: phone+password → JWT (HS256). Customers are anonymous, no account.
- **Realtime**: per-queue WebSocket channels. `/api/ws/queue/{id}` is public; `/api/ws/dashboard/{id}?token=…` is owner-authed (token in query because browsers can't set Authorization headers on WS upgrades).
- **Notifications**: WhatsApp-first, SMS-fallback, log-only stub if neither configured. Best-effort, fire-and-forget so a slow provider doesn't block `call-next`.
- **PII**: `TicketPublicOut` strips `customer_name`/`customer_phone` because ticket IDs are autoincrement integers. Owner endpoints return the full `TicketOut`.

## Conventions

- **Stacked PRs.** Each major chunk lands as its own branch (`pr/01-...` → `pr/05-...`) targeting the prior one. Review the chain in order.
- **Backend tests**: ad-hoc httpx + uvicorn smoke scripts during development; a committed pytest suite is a near-term follow-up.
- **Frontend**: every dynamic path-param goes through `encodeURIComponent` before being interpolated into a URL. Never bypass this. See `lib/api.ts`.
- **Status codes**: backend prefers `status.HTTP_*` symbols; mixing with bare ints is fine but symbols read better.
- **Models**: relationships default to `lazy="raise"` for collections (tickets, business.queues) so eager-load doesn't fire on every owner-loading auth request. Use `lazy="selectin"` only where you actually traverse.
- **i18n**: 3 locales (`en` / `fr` / `ar`) via `lib/i18n.tsx`. Arabic flips `dir="rtl"` on `<html>`. Tailwind handles direction-aware layout via logical properties.

## Local dev

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env if you don't have postgres running locally yet
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (in a separate terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev   # serves on :3000, proxies /api/* to NEXT_PUBLIC_API_BASE
```

Or all-in-one:

```bash
docker compose up --build
# frontend: http://localhost:3000
# backend:  http://localhost:8000/api/health
# docs:     http://localhost:8000/docs
```

## Routes at a glance

### Backend

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | 409 on duplicate phone |
| POST | `/api/auth/login` | — | constant-time bcrypt |
| POST | `/api/queues` | owner | starts `closed` |
| GET | `/api/queues/mine` | owner | list current biz |
| GET | `/api/queues/{id}` | public | public summary |
| PATCH | `/api/queues/{id}` | owner | partial update |
| POST | `/api/queues/{id}/open` | owner | |
| POST | `/api/queues/{id}/close` | owner | |
| GET | `/api/queues/{id}/qr` | public | PNG QR |
| POST | `/api/queues/{id}/join` | public | returns TicketPublicOut |
| GET | `/api/tickets/{id}` | public | TicketStatusOut + position |
| POST | `/api/queues/{id}/call-next` | owner | sends notify + WS broadcast |
| POST | `/api/tickets/{id}/complete` | owner | status guard |
| POST | `/api/tickets/{id}/no-show` | owner | status guard |
| POST | `/api/queues/{id}/add-walkin` | owner | source=walk_in |
| WS | `/api/ws/queue/{id}` | public | broadcasts queue events |
| WS | `/api/ws/dashboard/{id}?token=…` | owner | dashboard channel |

### Frontend

| Path | Audience |
|---|---|
| `/` | landing |
| `/q/[queueId]` | customer: see + join |
| `/t/[ticketId]` | customer: live position |
| `/login` | business: login or register |
| `/setup` | business: create queue |
| `/dashboard` | business: queue list |
| `/dashboard/[queueId]` | business: live ops + QR |

## Things to watch

- **Backend connection pool on WebSockets.** Each WS handler opens a transient session for the existence/auth check, then releases. Don't reintroduce `Depends(get_db)` on the WS routes — it holds the session for the connection lifetime and drains the pool.
- **In-memory pub/sub.** `services/ws_manager.py` is single-process. For horizontal scale, swap `_broadcast` for Redis pub/sub fan-out (connection state itself stays local).
- **Race in `join_queue`.** Capacity check vs. ticket-number increment is currently best-effort. Postgres `SELECT … FOR UPDATE` on the queue row is the production fix.
