"""Table definitions (SQLAlchemy Core). Dialect-neutral on purpose: production runs MySQL, tests run the very
same definitions on in-memory SQLite, so the REAL constraints (primary keys, CHECKs, foreign keys) are exercised.

`metadata.create_all()` is idempotent (it skips existing tables) and runs on every start. There is no migration
tool: changing an EXISTING table needs manual `ALTER TABLE` on the database, so get the columns right up front.
MySQL notes: every VARCHAR needs a length; use utf8mb4 (emoji!) -- set on every table via `_MYSQL` and on the
connection in db.py; there are no array columns, so lists are stored as JSON.
"""
from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Table,
    Text,
)

metadata = MetaData()
_MYSQL = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

# The rentable thing: a car. price is PER DAY.
resources = Table(
    "resources", metadata,
    Column("id", Integer, primary_key=True, autoincrement=False),
    Column("name", String(120), nullable=False),
    Column("category", String(60), nullable=False),
    Column("price", Numeric(10, 2), nullable=False),
    Column("emoji", String(16), nullable=False),
    Column("color", String(16), nullable=False),
    Column("rating", Numeric(2, 1), nullable=False),
    Column("description", Text, nullable=False),
    Column("seats", Integer, nullable=False),
    Column("transmission", String(16), nullable=False),
    CheckConstraint("price >= 0", name="resources_price_nonneg"),
    **_MYSQL,
)

# client_id is an anonymous browser id for now; swap for a user id when auth is added.
# resource_name/emoji and total are snapshots so history survives catalog edits.
bookings = Table(
    "bookings", metadata,
    Column("id", String(32), primary_key=True),
    Column("client_id", String(64), nullable=False),
    Column("resource_id", Integer, ForeignKey("resources.id"), nullable=False),
    Column("resource_name", String(120), nullable=False),
    Column("resource_emoji", String(16), nullable=False),
    Column("start_day", Date, nullable=False),
    Column("end_day", Date, nullable=False),  # inclusive
    Column("days", Integer, nullable=False),
    Column("total", Numeric(10, 2), nullable=False),
    Column("customer", JSON, nullable=False),
    Column("status", String(16), nullable=False, default="confirmed", server_default="confirmed"),
    Column("created_at", DateTime, nullable=False),  # naive UTC, set by the API
    CheckConstraint("status IN ('confirmed','cancelled')", name="bookings_status_ok"),
    Index("bookings_client_idx", "client_id", "created_at"),
    **_MYSQL,
)

# One row per occupied DAY. The PRIMARY KEY is what makes double-booking impossible, even under concurrent
# requests: the second insert fails with a duplicate-key error and the whole transaction rolls back.
# Cancelling deletes these rows (frees the slot) but keeps the bookings row as history.
booking_slots = Table(
    "booking_slots", metadata,
    Column("booking_id", String(32), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
    Column("resource_id", Integer, ForeignKey("resources.id"), nullable=False),
    Column("day", Date, nullable=False),
    PrimaryKeyConstraint("resource_id", "day", name="booking_slots_pk"),
    **_MYSQL,
)
