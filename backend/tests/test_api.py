from datetime import UTC, datetime, timedelta

import pytest

from app.api import MAX_DAYS, WINDOW_DAYS

CUSTOMER = {"name": "Ann Lee", "email": "ann@example.com"}
_n = 0


def new_client_id() -> str:
    global _n
    _n += 1
    return f"client-{_n:04d}-test"


def future(days: int = 30) -> str:
    """A date safely in the future, from UTC so it never depends on the machine timezone."""
    return (datetime.now(UTC) + timedelta(days=days)).date().isoformat()


def hdr(cid: str) -> dict:
    return {"X-Client-Id": cid}


def book(client, cid, **over):
    d = future()
    body = {"resourceId": 1, "from": d, "to": d, "customer": CUSTOMER, **over}
    return client.post("/api/bookings", json=body, headers=hdr(cid))


def mine(client, cid):
    return client.get("/api/bookings", headers=hdr(cid)).json()


def avail(client, day, rid=1):
    return client.get(f"/api/resources/{rid}/availability", params={"from": day}).json()


def booked_days(client, day, rid=1):
    return [d["day"] for d in avail(client, day, rid)["days"] if d["booked"]]


class TestHealth:
    def test_ok_when_database_answers(self, client):
        assert client.get("/api/health").json() == {"ok": True}

    def test_generic_500_when_database_fails_and_no_leak(self, client, ctl):
        ctl.fail_on = r"SELECT 1"
        res = client.get("/api/health")
        assert res.status_code == 500
        assert res.json() == {"error": "Internal server error"}
        assert "secret" not in res.text


class TestResources:
    def test_list_has_numeric_price_and_rating(self, client):
        body = client.get("/api/resources").json()
        assert len(body) > 0
        assert isinstance(body[0]["price"], float) and isinstance(body[0]["rating"], float)

    def test_get_one_404_and_400(self, client):
        assert client.get("/api/resources/1").json()["id"] == 1
        assert client.get("/api/resources/999").status_code == 404
        assert client.get("/api/resources/abc").status_code == 400
        assert client.get("/api/resources/0").status_code == 400

    def test_get_one_has_car_fields(self, client):
        r = client.get("/api/resources/1").json()
        assert r["seats"] == 5 and r["transmission"] == "Manual"

    def test_availability_marks_booked_days(self, client):
        cid, day = new_client_id(), future(31)
        body = avail(client, day)
        assert body["from"] == day and len(body["days"]) == WINDOW_DAYS and body["maxDays"] == MAX_DAYS
        assert not any(d["booked"] for d in body["days"])
        book(client, cid, **{"from": future(32), "to": future(34)})
        assert booked_days(client, day) == [future(32), future(33), future(34)]

    def test_availability_validates_input(self, client):
        assert client.get("/api/resources/1/availability").status_code == 400
        assert client.get("/api/resources/1/availability?from=2030-02-31").status_code == 400
        assert client.get(f"/api/resources/999/availability?from={future()}").status_code == 404


class TestBookings:
    def test_requires_valid_client_id(self, client):
        assert client.get("/api/bookings").status_code == 400
        assert client.get("/api/bookings", headers={"X-Client-Id": "bad id!"}).status_code == 400

    def test_creates_with_server_total_and_plain_days(self, client):
        cid = new_client_id()
        res = book(client, cid, **{"from": future(40), "to": future(42)})
        assert res.status_code == 201
        body = res.json()
        assert body["resource"]["name"] == "Toyota Yaris" and body["from"] == future(40) and body["to"] == future(42)
        assert body["days"] == 3 and body["total"] == 102 and body["status"] == "confirmed"
        import re
        assert re.fullmatch(r"BKG-[0-9A-F]{8}", body["id"])
        listed = mine(client, cid)
        assert len(listed) == 1 and listed[0]["id"] == body["id"] and listed[0]["total"] == 102

    def test_ignores_a_client_supplied_total(self, client):
        res = book(client, new_client_id(), total=0.01)
        assert res.json()["total"] == 34

    def test_scoped_to_the_client(self, client):
        book(client, new_client_id(), **{"from": future(41), "to": future(41)})
        assert mine(client, new_client_id()) == []

    def test_409_when_a_day_is_taken_and_nothing_left_behind(self, client):
        assert book(client, new_client_id(), **{"from": future(43), "to": future(44)}).status_code == 201
        other = new_client_id()
        res = book(client, other, **{"from": future(42), "to": future(43)})  # 42 free, 43 taken
        assert res.status_code == 409 and "just booked" in res.json()["error"]
        assert mine(client, other) == []
        assert future(42) not in booked_days(client, future(42))  # rolled back

    def test_adjacent_dates_other_cars_are_fine(self, client):
        cid = new_client_id()
        assert book(client, cid, **{"from": future(50), "to": future(51)}).status_code == 201
        assert book(client, cid, **{"from": future(52), "to": future(52)}).status_code == 201
        assert book(client, cid, resourceId=2, **{"from": future(50), "to": future(51)}).status_code == 201

    def test_max_length_is_allowed(self, client):
        res = book(client, new_client_id(), **{"from": future(60), "to": future(60 + MAX_DAYS - 1)})
        assert res.status_code == 201 and res.json()["days"] == MAX_DAYS

    @pytest.mark.parametrize("label,over,status", [
        ("unknown resource", {"resourceId": 999}, 404),
        ("bad resource id", {"resourceId": "x"}, 400),
        ("missing from", {"from": None}, 400),
        ("bad to", {"to": "tomorrow"}, 400),
        ("impossible day", {"from": "2030-02-31"}, 400),
        ("day in the past", {"from": "2020-01-01", "to": "2020-01-02"}, 400),
        ("return before pick-up", {"from": future(30), "to": future(29)}, 400),
        ("too long", {"from": future(30), "to": future(30 + MAX_DAYS)}, 400),
        ("missing name", {"customer": {"email": "a@b.co"}}, 400),
        ("customer not an object", {"customer": "Ann"}, 400),
        ("bad email", {"customer": {"name": "Ann", "email": "nope"}}, 400),
    ])
    def test_rejects(self, client, label, over, status):
        res = book(client, new_client_id(), **over)
        assert res.status_code == status, label
        assert res.json()["error"]

    def test_non_json_body_is_400(self, client):
        res = client.post("/api/bookings", content="{bad", headers={**hdr(new_client_id()), "Content-Type": "application/json"})
        assert res.status_code == 400 and res.json() == {"error": "Invalid JSON"}

    def test_rolls_back_and_hides_error_when_a_statement_fails(self, client, ctl):
        cid = new_client_id()
        ctl.fail_on = r"INSERT INTO booking_slots"
        res = book(client, cid, **{'from': future(45), 'to': future(45)})
        assert res.status_code == 500 and res.json() == {"error": "Internal server error"}
        ctl.fail_on = None
        assert mine(client, cid) == []  # the bookings row was rolled back too

    def test_cancel_frees_slots_and_keeps_history(self, client):
        cid, day = new_client_id(), future(46)
        b = book(client, cid, **{"from": day, "to": day}).json()
        res = client.post(f"/api/bookings/{b['id']}/cancel", headers=hdr(cid))
        assert res.status_code == 200 and res.json()["status"] == "cancelled"
        assert mine(client, cid)[0]["status"] == "cancelled"
        assert book(client, new_client_id(), **{'from': day, 'to': day}).status_code == 201  # days free again

    def test_cancel_404s_twice_foreign_or_unknown(self, client):
        cid = new_client_id()
        b = book(client, cid, **{'from': future(47), 'to': future(47)}).json()
        assert client.post(f"/api/bookings/{b['id']}/cancel", headers=hdr(new_client_id())).status_code == 404
        client.post(f"/api/bookings/{b['id']}/cancel", headers=hdr(cid))
        assert client.post(f"/api/bookings/{b['id']}/cancel", headers=hdr(cid)).status_code == 404
        assert client.post("/api/bookings/NOPE/cancel", headers=hdr(cid)).status_code == 404

    def test_cancel_rolls_back_when_freeing_slots_fails(self, client, ctl):
        cid = new_client_id()
        b = book(client, cid, **{'from': future(48), 'to': future(48)}).json()
        ctl.fail_on = r"DELETE FROM booking_slots"
        assert client.post(f"/api/bookings/{b['id']}/cancel", headers=hdr(cid)).status_code == 500
        ctl.fail_on = None
        assert mine(client, cid)[0]["status"] == "confirmed"


class TestPlumbing:
    def test_unknown_api_route_is_json_404(self, client):
        res = client.get("/api/nope")
        assert res.status_code == 404 and res.json() == {"error": "Not found"}

    def test_unsupported_method_outside_api_is_json(self, client):
        res = client.post("/somewhere")
        assert res.status_code == 405 and "error" in res.json()
