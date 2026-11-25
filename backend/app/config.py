"""Runtime configuration, read from environment variables (and `.env` in dev via the Makefile/npm scripts)."""
import os
from pathlib import Path

# backend/app/config.py -> project root is two levels up from backend/
ROOT = Path(__file__).resolve().parents[2]
# Built Angular app (served by FastAPI in production). Override with STATIC_DIR if you move it.
STATIC_DIR = Path(os.environ.get("STATIC_DIR") or ROOT / "frontend" / "dist" / "frontend" / "browser")


def database_url() -> str:
    """Return the SQLAlchemy URL. Accepts `mysql://`, `mysql+pymysql://` and `mariadb://` forms.

    Exits with a clear message when DATABASE_URL is missing: that is intentional, and why tests inject
    their own engine instead of needing a database.
    """
    raw = os.environ.get("DATABASE_URL", "").strip()
    if not raw:
        raise SystemExit("DATABASE_URL is not set. Copy .env.example to .env and add your MySQL connection URL.")
    for prefix in ("mysql://", "mariadb://"):
        if raw.startswith(prefix):
            raw = "mysql+pymysql://" + raw[len(prefix):]
    return raw
