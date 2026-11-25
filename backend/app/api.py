"""JSON API under /api. The server is the source of truth: prices, totals, availability and limits are recomputed
here; the client never sends a total. Validation lives at the boundary and returns 400 with a UI-ready message
(404 missing, 409 conflict). 5xx is always the generic message (see errors in main.py)."""
import re
import secrets
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, Body, Depends, Header, Query
from sqlalchemy import delete, insert, select, text, update
from sqlalchemy.exc import IntegrityError

from .db import get_engine
from .schema import booking_slots, bookings, resources

router = APIRouter()

# Rental rules. The client reads maxDays/window from /resources/{id}/availability instead of hardcoding them.
MAX_DAYS = 30  # longest single rental
WINDOW_DAYS = 60  # how far ahead availability is reported

CUSTOMER_FIELDS = ("name", "email")
EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def round2(n: float) -> float:
    return round(n * 100) / 100


def parse_id(v: Any) -> int:
    try:
        n = int(str(v))
    except (TypeError, ValueError):
        raise HttpError(400, "Invalid id") from None
    if n <= 0:
        raise HttpError(400, "Invalid id")
    return n


def parse_day(v: Any) -> date:
    """Days are plain 'YYYY-MM-DD' strings on the wire and `date` in Python: never datetimes (timezone shifts)."""
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        raise HttpError(400, "Invalid date")
    try:
        return date.fromisoformat(v)  # round-trips, so 2030-02-31 fails
    except ValueError:
        raise HttpError(400, "Invalid date") from None


def assert_not_past(day: date) -> None:
    """Reject past days, with one day of slack for timezones."""
    if day < (datetime.now(UTC) - timedelta(days=1)).date():
        raise HttpError(400, "Date is in the past")


def is_duplicate_key(e: IntegrityError) -> bool:
    """MySQL error 1062 (duplicate entry) or SQLite's UNIQUE/PRIMARY KEY failure. FK/CHECK violations are NOT conflicts."""
    orig = e.orig
    code = orig.args[0] if getattr(orig, "args", None) else None
    return code == 1062 or "UNIQUE constraint failed" in str(orig)


def client_id(x_client_id: str | None = Header(default=None)) -> str:
    """Identify the user. Anonymous browser id for now; replace with the authenticated user later.
    Every user-owned query is scoped by it (a user gets 404 for someone else's booking)."""
    if not x_client_id or not re.fullmatch(r"[\w-]{8,64}", x_client_id):
        raise HttpError(400, "Missing or invalid X-Client-Id header")
    return x_client_id


def shape_resource(r) -> dict:
    return {"id": r.id, "name": r.name, "category": r.category, "price": float(r.price), "emoji": r.emoji,
            "color": r.color, "rating": float(r.rating), "description": r.description, "seats": r.seats,
            "transmission": r.transmission}


def shape_booking(b) -> dict:
    return {
        "id": b.id,
        "resource": {"id": b.resource_id, "name": b.resource_name, "emoji": b.resource_emoji},
        "from": b.start_day.isoformat(),
        "to": b.end_day.isoformat(),
        "days": b.days,
        "total": float(b.total),
        "customer": b.customer,
        "status": b.status,
        "createdAt": b.created_at.isoformat() + "Z",
    }


@router.get("/health")
def health():
    """Also the hosting health check; keeps the database connection warm."""
    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"ok": True}


# ---------- resources ----------
@router.get("/resources")
def list_resources():
    with get_engine().connect() as conn:
        return [shape_resource(r) for r in conn.execute(select(resources).order_by(resources.c.id))]


@router.get("/resources/{resource_id}")
def get_resource(resource_id: str):
    rid = parse_id(resource_id)
    with get_engine().connect() as conn:
        row = conn.execute(select(resources).where(resources.c.id == rid)).first()
    if not row:
        raise HttpError(404, "Resource not found")
    return shape_resource(row)


@router.get("/resources/{resource_id}/availability")
def availability(resource_id: str, start: str | None = Query(default=None, alias="from")):
    """Day-by-day availability for WINDOW_DAYS starting at `from`."""
    rid = parse_id(resource_id)
    d = parse_day(start)
    end = d + timedelta(days=WINDOW_DAYS - 1)
    with get_engine().connect() as conn:
        row = conn.execute(select(resources.c.price).where(resources.c.id == rid)).first()
        if not row:
            raise HttpError(404, "Resource not found")
        taken = {x for (x,) in conn.execute(
            select(booking_slots.c.day).where(booking_slots.c.resource_id == rid, booking_slots.c.day >= d,
                                              booking_slots.c.day <= end))}
    return {"from": d.isoformat(), "price": float(row.price), "maxDays": MAX_DAYS,
            "days": [{"day": x.isoformat(), "booked": x in taken}
                     for x in (d + timedelta(days=i) for i in range(WINDOW_DAYS))]}


# ---------- bookings ----------
@router.get("/bookings")
def list_bookings(cid: str = Depends(client_id)):
    with get_engine().connect() as conn:
        rows = conn.execute(select(bookings).where(bookings.c.client_id == cid)
                            .order_by(bookings.c.created_at.desc(), bookings.c.id))
        return [shape_booking(b) for b in rows]


def validate_booking(body: dict) -> tuple[int, date, date, dict]:
    rid = parse_id(body.get("resourceId"))
    start = parse_day(body.get("from"))
    end = parse_day(body.get("to"))
    assert_not_past(start)
    if end < start:
        raise HttpError(400, "Return date must be on or after pick-up date")
    if (end - start).days + 1 > MAX_DAYS:
        raise HttpError(400, f"Rentals are limited to {MAX_DAYS} days")

    raw = body.get("customer") if isinstance(body.get("customer"), dict) else {}
    customer = {}
    for f in CUSTOMER_FIELDS:
        v = raw.get(f)
        if not isinstance(v, str) or not v.strip() or len(v) > 200:
            raise HttpError(400, f"Customer {f} is required")
        customer[f] = v.strip()
    if not EMAIL_RE.match(customer["email"]):
        raise HttpError(400, "Enter a valid email")
    return rid, start, end, customer


@router.post("/bookings", status_code=201)
def create_booking(body: dict = Body(...), cid: str = Depends(client_id)):
    """One transaction: validate, insert booking, insert one row per rented day. The booking_slots PRIMARY KEY is the real
    guard against double-booking; we translate its duplicate-key error into a friendly 409 (rolled back)."""
    rid, start, end, customer = validate_booking(body)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    booking_id = "BKG-" + secrets.token_hex(4).upper()
    try:
        with get_engine().begin() as conn:  # commits on success, rolls back on any exception
            res = conn.execute(select(resources).where(resources.c.id == rid)).first()
            if not res:
                raise HttpError(404, "Resource not found")
            total = round2(float(res.price) * len(days))  # price is always recomputed server-side
            row = {
                "id": booking_id, "client_id": cid, "resource_id": res.id, "resource_name": res.name,
                "resource_emoji": res.emoji, "start_day": start, "end_day": end, "days": len(days), "total": total,
                "customer": customer,
                "status": "confirmed", "created_at": datetime.now(UTC).replace(tzinfo=None, microsecond=0),
            }
            conn.execute(insert(bookings), row)
            conn.execute(insert(booking_slots), [
                {"booking_id": booking_id, "resource_id": res.id, "day": d} for d in days])
    except IntegrityError as e:
        if is_duplicate_key(e):
            raise HttpError(409, "Sorry, one of those days was just booked. Pick other dates.") from None
        raise
    return shape_booking(SimpleNamespace(**row))


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str, cid: str = Depends(client_id)):
    """Frees the days (deletes booking_slots rows) and keeps the booking as history."""
    with get_engine().begin() as conn:
        done = conn.execute(update(bookings).where(
            bookings.c.id == booking_id, bookings.c.client_id == cid, bookings.c.status == "confirmed",
        ).values(status="cancelled"))
        if done.rowcount == 0:
            raise HttpError(404, "Booking not found or already cancelled")
        conn.execute(delete(booking_slots).where(booking_slots.c.booking_id == booking_id))
        row = conn.execute(select(bookings).where(bookings.c.id == booking_id)).one()
    return shape_booking(row)
