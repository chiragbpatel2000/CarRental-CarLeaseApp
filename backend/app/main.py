"""One process serves everything: FastAPI mounts /api, then the built Angular app with an SPA fallback.
One service, one port, no CORS in production. In dev, `ng serve` proxies /api to this server (see
frontend/proxy.conf.json), so the browser still sees a single origin.

Run:  uvicorn app.main:app --reload --port 8000      (from backend/)
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .api import HttpError, router
from .db import init_db

log = logging.getLogger("app")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()  # create tables + seed; exits early with a clear message if DATABASE_URL is missing
    yield


def create_app(run_init: bool = True) -> FastAPI:
    app = FastAPI(title="Car Rental", lifespan=lifespan if run_init else None,
                  docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")

    def err(status: int, message: str) -> JSONResponse:
        return JSONResponse({"error": message}, status_code=status)

    @app.exception_handler(HttpError)
    async def _http_error(_req: Request, e: HttpError):
        return err(e.status, e.message)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_req: Request, _e: RequestValidationError):
        return err(400, "Invalid JSON")  # malformed or non-object body

    @app.exception_handler(StarletteHTTPException)
    async def _starlette(_req: Request, e: StarletteHTTPException):
        return err(e.status_code, "Not found" if e.status_code == 404 else str(e.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_req: Request, e: Exception):
        # Never leak SQL/driver errors: 5xx always returns a generic message; log the real one.
        log.error("Unhandled error", exc_info=e)
        return err(500, "Internal server error")

    app.include_router(router, prefix="/api")

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    async def _unknown_api(rest: str):
        raise HttpError(404, "Not found")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        """Serve a built file if it exists, else index.html so client routes (e.g. /bookings) survive a refresh."""
        root = config.STATIC_DIR.resolve()
        if not (root / "index.html").is_file():
            raise HttpError(404, "Frontend not built. Run `npm run build` (or use `ng serve` in dev).")
        target = (root / path).resolve()
        if path and target.is_file() and root in target.parents:  # no path traversal outside the build dir
            return FileResponse(target)
        return FileResponse(root / "index.html")

    return app


app = create_app(run_init=os.environ.get("SKIP_DB_INIT") != "1")
