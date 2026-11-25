import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { booking, configure, expectReq, fail, reply } from '../../testing';
import { BookingStore } from './booking-store';

const flushPromises = () => new Promise((r) => setTimeout(r));

describe('BookingStore', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = configure();
  });
  afterEach(() => http.verify());

  // Creating the store fires GET /api/bookings; answer it and let the promise chain finish.
  const create = async (initial: unknown) => {
    const store = TestBed.inject(BookingStore);
    reply(expectReq(http, 'GET', '/api/bookings'), initial);
    await flushPromises();
    return store;
  };

  it('loads bookings, becomes ready and counts only confirmed ones', async () => {
    const store = await create([booking(), booking({ id: 'B2', status: 'cancelled' })]);
    expect(store.ready()).toBe(true);
    expect(store.bookings()).toHaveLength(2);
    expect(store.upcomingCount()).toBe(1);
  });

  it('shows an error banner (and is still ready) when the initial load fails, and can dismiss it', async () => {
    const store = await create(fail(500, 'Internal server error'));
    expect(store.ready()).toBe(true);
    expect(store.error()).toBe('Internal server error');
    store.clearError();
    expect(store.error()).toBeNull();
  });

  it('createBooking stores what the server returns and THROWS on failure', async () => {
    const store = await create([]);
    const payload = { resourceId: 1, from: '2030-01-02', to: '2030-01-03', customer: { name: 'A', email: 'a@b.co' } };
    const ok = store.createBooking(payload);
    expectReq(http, 'POST', '/api/bookings').flush(booking({ id: 'NEW' }));
    expect((await ok).id).toBe('NEW');
    expect(store.bookings()[0].id).toBe('NEW');

    const bad = store.createBooking(payload);
    reply(expectReq(http, 'POST', '/api/bookings'), fail(409, 'Sorry, one of those days was just booked. Pick other dates.'));
    await expect(bad).rejects.toThrow(/just booked/);
    expect(store.bookings()).toHaveLength(1); // no phantom booking
    expect(store.error()).toBeNull(); // the form shows it, not the banner
  });

  it('cancelBooking replaces the booking with the server copy; failures go to the banner', async () => {
    const store = await create([booking({ id: 'B1' })]);
    const done = store.cancelBooking('B1');
    expectReq(http, 'POST', '/api/bookings/B1/cancel').flush(booking({ id: 'B1', status: 'cancelled' }));
    await done;
    expect(store.bookings()[0].status).toBe('cancelled');
    expect(store.upcomingCount()).toBe(0);

    const bad = store.cancelBooking('B1');
    reply(expectReq(http, 'POST', '/api/bookings/B1/cancel'), fail(404, 'Booking not found or already cancelled'));
    await bad;
    expect(store.error()).toBe('Booking not found or already cancelled');
  });
});
