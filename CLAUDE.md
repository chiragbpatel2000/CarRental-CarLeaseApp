# CLAUDE.md

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
Docker image (`Dockerfile`) -> Render Blueprint (`render.yaml`) or any Docker host. Env: `DATABASE_URL` (secret, dashboard only), `DB_SSL=true` for managed MySQL. Health check `/api/health`. Never commit `.env`. Not deployed yet; no GitHub repo yet (the `gh` CLI was not installed when this was built).


## Status
Lease plans (12/24 months) were not built: only day rentals. Verified on local Docker MySQL 8.4 and on TiDB Cloud Serverless (database `carrental`, TLS): seed (emoji), health, and a 3-parallel-POST race (one 201, two 409). `docker build` succeeds.
