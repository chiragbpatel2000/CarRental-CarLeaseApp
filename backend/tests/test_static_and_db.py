"""SPA serving, DB bootstrap and engine construction (no live MySQL needed)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.pool import StaticPool

from app import config, db
from app.main import create_app
from app.schema import resources
from app.seed import RESOURCES


@pytest.fixture
def web(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>spa</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    monkeypatch.setattr(config, "STATIC_DIR", tmp_path)
    return TestClient(create_app(run_init=False), raise_server_exceptions=False)


def test_serves_built_files_and_falls_back_to_index_for_client_routes(web):
    assert web.get("/assets/app.js").text == "console.log(1)"
    assert "spa" in web.get("/").text
    assert "spa" in web.get("/bookings").text  # refresh on a client route must not 404


def test_never_serves_files_outside_the_build_dir(web):
    assert "nope" not in web.get("/..%2Fsecret.txt").text
    assert "nope" not in web.get("/../secret.txt").text


def test_api_404s_are_json_not_the_spa(web):
    res = web.get("/api/missing")
    assert res.status_code == 404 and res.json() == {"error": "Not found"}


def test_missing_build_gives_a_helpful_404(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATIC_DIR", tmp_path / "nope")
    res = TestClient(create_app(run_init=False)).get("/")
    assert res.status_code == 404 and "not built" in res.json()["error"]


def test_init_db_creates_tables_and_seeds_once():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    db.set_engine(eng)
    try:
        db.init_db()
        db.init_db()  # idempotent: no duplicate seed, no error
        with eng.connect() as conn:
            assert conn.execute(select(func.count()).select_from(resources)).scalar_one() == len(RESOURCES)
    finally:
        db.set_engine(None)


def test_database_url_normalises_and_requires_a_value(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "mysql://u:p@host:3306/app")
    assert config.database_url() == "mysql+pymysql://u:p@host:3306/app"
    monkeypatch.setenv("DATABASE_URL", "mariadb://u:p@host/app")
    assert config.database_url().startswith("mysql+pymysql://")
    monkeypatch.delenv("DATABASE_URL")
    with pytest.raises(SystemExit):
        config.database_url()


def test_build_engine_sets_mysql_options(monkeypatch):
    seen = {}
    monkeypatch.setattr(db, "create_engine", lambda url, **kw: seen.update(url=url, **kw) or "engine")
    assert db.build_engine("mysql+pymysql://u:p@h/app?ssl=true") == "engine"
    assert seen["connect_args"]["charset"] == "utf8mb4" and "ca" in seen["connect_args"]["ssl"]
    assert seen["pool_pre_ping"] is True and "ssl" not in dict(seen["url"].query)
    db.build_engine("mysql+pymysql://u:p@h/app")
    assert "ssl" not in seen["connect_args"]


def test_get_engine_builds_once_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "mysql://u:p@h/app")
    monkeypatch.setattr(db, "build_engine", lambda url: ("engine", url))
    db.set_engine(None)
    try:
        assert db.get_engine() == ("engine", "mysql+pymysql://u:p@h/app")
        assert db.get_engine() is db.get_engine()
    finally:
        db.set_engine(None)


def test_startup_runs_init_db_via_lifespan():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    db.set_engine(eng)
    try:
        with TestClient(create_app(run_init=True)) as c:  # entering the context runs the lifespan
            assert c.get("/api/resources").json()[0]["id"] == RESOURCES[0]["id"]
    finally:
        db.set_engine(None)
