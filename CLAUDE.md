# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Car Rental: Angular 22 SPA + FastAPI (Python) API + MySQL. One process serves both in production. Customers rent a car for a date range (exclusive per car per day, max 30 days). Scaffolded from the `build-fullstack-angular-python-app` skill. The `resources` table holds cars.

## Commands (run from the repo root)
```
npm run setup            # backend/.venv + pip + npm install (once)
npm run dev              # API :8000 (reload) + ng serve :4200 (proxies /api). Open http://localhost:4200
npm run build            # production Angular build -> frontend/dist/frontend/browser
npm start                # prod-like: FastAPI serves API + built app on :8000
npm run lint             # ruff
npm test                 # pytest + ng test (no coverage)
npm run test:coverage    # both, with enforced thresholds
npm run check            # lint + coverage + build  (must pass before a PR/deploy)
docker compose up -d db  # local MySQL matching .env.example
```
Single backend test: `backend/.venv/Scripts/python -m pytest -c backend/pyproject.toml backend/tests/test_api.py -k cancel --no-cov` (Windows; `bin/python` on macOS/Linux). Single frontend spec: `npm --prefix frontend test -- --include src/app/core/api.service.spec.ts`.

## Architecture
- `backend/app/`: `main.py` (app factory, error handlers, SPA fallback), `api.py` (routes, validation, `MAX_DAYS`, `WINDOW_DAYS`), `schema.py` (SQLAlchemy tables), `db.py` (engine, `create_all`, seed), `seed.py`, `config.py` (`DATABASE_URL`, `STATIC_DIR`).
- `frontend/src/app/`: `core/` (`api.service.ts`, `booking-store.ts`, `client-id.interceptor.ts`, `models.ts`, `format.ts`), `pages/` (home, resource-detail, bookings, not-found), `app.ts` shell.
- Identity: anonymous. The browser keeps a UUID in `localStorage` and sends `X-Client-Id`; user-owned rows have `client_id` and every such query is scoped by it. That header/column is the seam for real auth.
- Every error response is `{"error": "<msg>"}`; 5xx is always `Internal server error` (real error logged). Never return SQL/driver text.
- Server computes totals, availability, limits. The client never sends a price. Rules duplicated in the UI (change both together): client-side checks in `resource-detail.ts` mirror the server's (return >= pick-up, max days, overlap with unavailable days, email shape). `maxDays` itself comes from the availability endpoint.
- Rental API: `POST /api/bookings {resourceId, from, to, customer}` (inclusive dates). `GET /api/resources/:id/availability?from=YYYY-MM-DD` returns 60 days of `{day, booked}`.

## Database rules
- DDL = SQLAlchemy `Table`s in `schema.py`, `create_all` on every start (idempotent), seed only when `resources` is empty. **No migrations: changing an existing table needs manual `ALTER TABLE` on the database.** Decide columns before the first deploy.
- MySQL: utf8mb4 (emoji), JSON columns instead of arrays, `Numeric` -> `float()` in `shape_*`, days are `date`/`'YYYY-MM-DD'` (never datetimes), `created_at` is naive UTC.
- Double-booking is prevented by the `booking_slots` PRIMARY KEY `(resource_id, day)` (one row per rented day); a duplicate-key `IntegrityError` becomes 409 (`is_duplicate_key`). Multi-step writes run in one `engine.begin()` transaction; translate errors **outside** the `with`.
- Engine uses `pool_pre_ping` + `pool_recycle=280` (managed MySQL drops idle connections) and TLS via `?ssl=true`/`DB_SSL=true`.

## Testing
- Backend: pytest on in-memory SQLite running the real `schema.py` (fresh DB per test, FKs on). `ctl.fail_on = r"<sql regex>"` forces failures to prove rollback and the generic 500. **Races cannot be tested there**: verify manually on MySQL with parallel curls (one 201, rest 409).
- Frontend: Vitest via `ng test`; no network (`HttpClientTesting`), `src/testing.ts` has `expectReq/reply/fail`. Do not use `whenStable()` with unanswered requests (hangs); specs use `settle()`.
- Coverage thresholds: backend 90% (`pyproject.toml`), frontend 90/90/85/80 (`angular.json`). Excluded on purpose: `app.config.ts`, `main.ts` (bootstrap). Don't lower thresholds; add tests.

## Deployment
Docker image (`Dockerfile`) -> Render Blueprint (`render.yaml`, service `carrental-carleaseapp`) or any Docker host. Repo: private `chiragbpatel2000/CarRental-CarLeaseApp` (branch `main`). Env: `DATABASE_URL` (secret, set in the Render dashboard only), `DB_SSL=true`. Health check `/api/health`. Database: TiDB Cloud Serverless, database `carrental`.
- Working URL form: `mysql+pymysql://USER:PASSWORD@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/carrental?ssl=true`. TiDB's copy-paste template uses `mysql://`, a literal `PASSWORD` and database `sys`: all three must be changed (`sys` is a system schema; the app must not create tables there). A literal placeholder password shows up as MySQL error 1045 (access denied).
- TiDB's IP access list must allow Render (free tier has no fixed IP). Free Render services sleep when idle: the first request can take 30-60 s.
- First Render deploy failed (cause not yet diagnosed: need the deploy logs). Do not assume it is live; check `/api/health` first.
- The password was pasted into a chat once: rotate it in TiDB, then update `.env` and Render.

## Status
Only day rentals are built; lease plans (12/24 months) are not. Verified on local Docker MySQL 8.4 and TiDB Cloud (seed with emoji, health, 3-parallel-POST race: one 201, two 409) and `docker build` succeeds. Not yet verified: the deployed Render service.
