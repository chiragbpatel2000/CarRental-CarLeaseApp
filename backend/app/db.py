"""Engine factory + startup (create tables, seed). Tests never call get_engine(): they inject an SQLite engine
with `set_engine()`, so no DATABASE_URL is needed (see tests/conftest.py)."""
import logging

from sqlalchemy import create_engine, func, insert, select
from sqlalchemy.engine import Engine, make_url

from . import config
from .schema import metadata, resources
from .seed import RESOURCES

log = logging.getLogger("app.db")
_engine: Engine | None = None


def build_engine(url: str) -> Engine:
    """Pooled engine for MySQL.

    - pool_pre_ping / pool_recycle: managed MySQL (and proxies) silently drop idle connections; without these the
      first request after a quiet period fails with "MySQL server has gone away" (the MySQL analogue of Neon's idle
      suspend). Recycle below the typical 5-minute proxy idle timeout.
    - utf8mb4: required for emoji; MySQL's plain `utf8` is 3-byte and would reject them.
    - TLS: managed providers (TiDB Cloud, Aiven, PlanetScale, Azure, RDS with require_secure_transport) need it.
      Add `?ssl=true` to the URL (or DB_SSL=true) and we use the certifi CA bundle.
    """
    parsed = make_url(url)
    query = dict(parsed.query)
    use_ssl = str(query.pop("ssl", "")).lower() in ("1", "true", "yes") or config_flag("DB_SSL")
    parsed = parsed.set(query=query)
    connect_args: dict = {"charset": "utf8mb4"} if parsed.get_backend_name() == "mysql" else {}
    if use_ssl and parsed.get_backend_name() == "mysql":
        import certifi
        connect_args["ssl"] = {"ca": certifi.where()}
    return create_engine(parsed, pool_pre_ping=True, pool_recycle=280, pool_size=5, max_overflow=5,
                         connect_args=connect_args)


def config_flag(name: str) -> bool:
    import os
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = build_engine(config.database_url())
    return _engine


def set_engine(engine: Engine | None) -> None:
    """Used by tests (inject SQLite) and by nothing else."""
    global _engine
    _engine = engine


def init_db() -> None:
    """Create missing tables (idempotent) and seed the catalog when empty."""
    engine = get_engine()
    metadata.create_all(engine)
    with engine.begin() as conn:
        if conn.execute(select(func.count()).select_from(resources)).scalar_one() == 0:
            conn.execute(insert(resources), RESOURCES)
            log.info("Seeded %d resources", len(RESOURCES))
