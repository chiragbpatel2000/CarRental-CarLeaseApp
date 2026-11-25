# Car Rental

Browse cars, pick pick-up and return dates, rent. Cars are exclusive per day, so a car can never be double-booked. Angular 22 + FastAPI + MySQL.

## Quick start
```
npm run setup                 # Python venv + dependencies (needs Node 22+, Python 3.11+)
cp .env.example .env          # then set DATABASE_URL (or: docker compose up -d db, and keep the default)
npm run dev                   # http://localhost:4200  (API on :8000)
```
Tables and sample data are created on first start.

## Scripts
`npm run check` runs lint, tests with coverage and the production build. See `CLAUDE.md` for architecture, testing notes and deployment.

## Deploy
Docker image (`Dockerfile`) and a Render Blueprint (`render.yaml`). Set `DATABASE_URL` (and `DB_SSL=true` for managed MySQL) in the host's dashboard.
