import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { configure, car, expectReq, fail, reply } from '../../testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let http: HttpTestingController;
  let api: ApiService;
  beforeEach(() => {
    localStorage.clear();
    http = configure();
    api = TestBed.inject(ApiService);
  });
  afterEach(() => http.verify());

  it('sends an anonymous X-Client-Id and reuses it', async () => {
    const p1 = api.resources();
    const r1 = expectReq(http, 'GET', '/api/resources');
    const id = r1.request.headers.get('X-Client-Id');
    expect(id).toBeTruthy();
    r1.flush([car()]);
    expect(await p1).toHaveLength(1);

    const p2 = api.resources();
    const r2 = expectReq(http, 'GET', '/api/resources');
    expect(r2.request.headers.get('X-Client-Id')).toBe(id);
    r2.flush([]);
    await p2;
  });

  it('surfaces the server error message, with fallbacks', async () => {
    let p = api.bookings();
    reply(expectReq(http, 'GET', '/api/bookings'), fail(409, 'Slot taken'));
    await expect(p).rejects.toThrow('Slot taken');

    p = api.bookings();
    expectReq(http, 'GET', '/api/bookings').flush('<html>', { status: 502, statusText: 'Bad Gateway' });
    await expect(p).rejects.toThrow('Request failed (502)');

    p = api.bookings();
    expectReq(http, 'GET', '/api/bookings').error(new ProgressEvent('error'));
    await expect(p).rejects.toThrow('Cannot reach the server');
  });

  it('resource() resolves null for not-found / invalid id but rejects other failures', async () => {
    let p = api.resource(999);
    reply(expectReq(http, 'GET', '/api/resources/999'), fail(404, 'Resource not found'));
    expect(await p).toBeNull();

    p = api.resource('abc');
    reply(expectReq(http, 'GET', '/api/resources/abc'), fail(400, 'Invalid id'));
    expect(await p).toBeNull();

    p = api.resource(1);
    reply(expectReq(http, 'GET', '/api/resources/1'), fail(500, 'Internal server error'));
    await expect(p).rejects.toThrow('Internal server error');
  });

  it('passes the from date as a query param and posts bookings / cancellations', async () => {
    const a = api.availability(1, '2030-01-02');
    expectReq(http, 'GET', '/api/resources/1/availability?from=2030-01-02').flush({ from: '2030-01-02', price: 40, maxDays: 30, days: [] });
    expect((await a).price).toBe(40);

    const payload = { resourceId: 1, from: '2030-01-02', to: '2030-01-03', customer: { name: 'A', email: 'a@b.co' } };
    const c = api.createBooking(payload);
    const req = expectReq(http, 'POST', '/api/bookings');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'X' });
    await c;

    const x = api.cancelBooking('BKG 1');
    expectReq(http, 'POST', '/api/bookings/BKG%201/cancel').flush({ id: 'BKG 1' });
    await x;
  });
});
