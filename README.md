# Q

Simple, free, browser-first queue management.

Scan a QR at the door → join the queue → wait anywhere. Live position updates over WebSocket. Optional WhatsApp/SMS ping when it's your turn. No app, no account.

## Quickstart

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8000/docs
- Database: postgres on 5432, redis on 6379

## Stack

- **Backend** — FastAPI · SQLAlchemy 2 (async) · PostgreSQL · WebSockets · JWT
- **Frontend** — Next.js 14 (app router) · TypeScript · Tailwind · next-pwa
- **i18n** — English, French, Arabic (RTL)
- **Notifications** — WhatsApp Business API → SMS fallback → log-only stub

## Layout

```
backend/   FastAPI app, models, services, alembic
frontend/  Next.js app router (customer flow + business dashboard)
docker-compose.yml
CLAUDE.md  context for AI assistants and contributors
```

See [CLAUDE.md](./CLAUDE.md) for routes, conventions, and operational gotchas.

## Customer flow

1. Scan the QR sticker at the door → opens `/q/{queueId}` in the browser.
2. (Optional) name + phone. Anonymous works.
3. Tap **Take my spot**. Live position updates via WebSocket.
4. Get a WhatsApp/SMS ping when called (if you gave a phone).

## Business flow

1. Sign up on `/login` (phone + password).
2. **Setup** → create a queue (name, optional max capacity, optional auto-close).
3. **Dashboard** → open the queue, print the QR code, call the next person, add walk-ins.
4. From a phone. The dashboard is mobile-first.
