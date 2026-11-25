"""Server tests run the REAL SQL and the REAL schema against in-memory SQLite (no MySQL needed).

- Every test gets a fresh database, so tests do not share state (no "distinct day per test" trick needed).
- `control.fail_on` makes statements matching a regex raise: use it to prove rollback and the generic-500 body.
- SQLite is a single connection here, so true concurrency/double-book RACES cannot be tested. Verify those by hand
  against real MySQL (two parallel curls for the same slot: exactly one 201, one 409) and say that is how it was verified.
"""
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, insert
from sqlalchemy.pool import StaticPool

from app import db
from app.main import create_app
from app.schema import metadata, resources
from app.seed import RESOURCES

control = SimpleNamespace(fail_on=None)


@pytest.fixture
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _rec):  # SQLite ignores foreign keys unless asked; MySQL enforces them
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    @event.listens_for(eng, "before_cursor_execute")
    def _maybe_fail(_conn, _cursor, statement, _params, _ctx, _many):
        if control.fail_on and re.search(control.fail_on, statement):
            raise RuntimeError("simulated db failure: secret-driver-detail")

    metadata.create_all(eng)
    with eng.begin() as conn:
        conn.execute(insert(resources), RESOURCES)
    db.set_engine(eng)
    yield eng
    control.fail_on = None
    db.set_engine(None)
    eng.dispose()


@pytest.fixture
def client(engine):
    # raise_server_exceptions=False so the generic-500 handler's response is what we assert on.
    with TestClient(create_app(run_init=False), raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def ctl():
    return control
