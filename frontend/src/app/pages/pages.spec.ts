import { HttpTestingController } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { booking, configure, car, expectReq, fail, reply } from '../../testing';
import { App } from '../app';

let http: HttpTestingController;
beforeEach(() => {
  localStorage.clear();
  http = configure();
});
afterEach(() => http.verify());

// Let promises resolve, then force a render. NOT `whenStable()`: it waits for every outstanding HttpClient request,
// so it would hang whenever a test has a request it has not answered yet.
const settle = async () => {
  const app = TestBed.inject(ApplicationRef);
  await new Promise((r) => setTimeout(r));
  app.tick();
  await new Promise((r) => setTimeout(r));
  app.tick();
};
type H = RouterTestingHarness;
const root = (h: H) => h.routeNativeElement as HTMLElement;
const text = (h: H) => root(h).textContent ?? '';
const q = <T extends HTMLElement>(h: H, sel: string) => root(h).querySelector<T>(sel)!;
const qa = (h: H, sel: string) => Array.from(root(h).querySelectorAll<HTMLElement>(sel));
// jsdom-friendly input: set the value and fire the event the component listens to.
const type = async (el: HTMLInputElement | HTMLSelectElement, value: string, ev = 'input') => {
  el.value = value;
  el.dispatchEvent(new Event(ev));
  await settle();
};
const click = async (el: HTMLElement) => {
  el.click();
  await settle();
};
// Every page injects BookingStore, which fires GET /api/bookings once.
const initStore = async (list: unknown = []) => {
  reply(expectReq(http, 'GET', '/api/bookings'), list);
  await settle();
};

const AVAIL = (taken: string[] = []) => ({
  from: '2030-01-02',
  price: 40,
  maxDays: 30,
  days: ['2030-01-02', '2030-01-03', '2030-01-04', '2030-01-05'].map((day) => ({ day, booked: taken.includes(day) })),
});

describe('App shell', () => {
  it('shows Loading until bookings load, then the routed page and the badge', async () => {
    const f = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/nope');
    await settle();
    expect(f.nativeElement.textContent).toContain('Loading…');
    reply(expectReq(http, 'GET', '/api/bookings'), [booking(), booking({ id: 'B2', status: 'cancelled' })]);
    await settle();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Page not found.');
    expect(f.nativeElement.querySelector('.badge').textContent).toBe('1');
  });

  it('shows a dismissible error banner when the initial load fails', async () => {
    const f = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/nope');
    reply(expectReq(http, 'GET', '/api/bookings'), fail(500, 'Internal server error'));
    await settle();
    f.detectChanges();
    const banner = f.nativeElement.querySelector('[role=alert]') as HTMLElement;
    expect(banner.textContent).toContain('Internal server error');
    (banner.querySelector('button') as HTMLButtonElement).click();
    await settle();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role=alert]')).toBeNull();
  });
});

describe('Home', () => {
  const list = [
    car(),
    car({ id: 2, name: 'Mazda 3', category: 'Compact', price: 35, rating: 4.6 }),
    car({ id: 3, name: 'Tesla Model 3', category: 'Electric', price: 45, rating: 4.9 }),
  ];
  const open = async (res: unknown = list) => {
    const h = await RouterTestingHarness.create('/'); // Home does not use BookingStore, so no /api/bookings call
    reply(expectReq(http, 'GET', '/api/resources'), res);
    await settle();
    return h;
  };
  const names = (h: H) => qa(h, '.card h3').map((e) => e.textContent);

  it('shows Loading, then the catalog with category chips', async () => {
    const h = await RouterTestingHarness.create('/');
    expect(text(h)).toContain('Loading…');
    reply(expectReq(http, 'GET', '/api/resources'), list);
    await settle();
    expect(names(h)).toEqual(['Toyota Yaris', 'Mazda 3', 'Tesla Model 3']);
    expect(qa(h, '.chip').map((e) => e.textContent)).toEqual(['All', 'Economy', 'Compact', 'Electric']);
  });

  it('shows an error (not an eternal spinner) when the API fails', async () => {
    const h = await open(fail(500, 'Internal server error'));
    expect(text(h)).toContain('Could not load: Internal server error');
  });

  it('filters by search and category, and shows the empty state', async () => {
    const h = await open();
    await type(q(h, 'input[aria-label=Search]'), 'mazda');
    expect(names(h)).toEqual(['Mazda 3']);
    await type(q(h, 'input[aria-label=Search]'), 'zzz');
    expect(text(h)).toContain('Nothing matches your search.');
    await type(q(h, 'input[aria-label=Search]'), '');
    await click(qa(h, '.chip')[3]); // Electric
    expect(names(h)).toEqual(['Tesla Model 3']);
  });

  it('sorts by price and rating', async () => {
    const h = await open();
    await type(q(h, 'select'), 'low', 'change');
    expect(names(h)).toEqual(['Mazda 3', 'Toyota Yaris', 'Tesla Model 3']);
    await type(q(h, 'select'), 'high', 'change');
    expect(names(h)).toEqual(['Tesla Model 3', 'Toyota Yaris', 'Mazda 3']);
    await type(q(h, 'select'), 'rating', 'change');
    expect(names(h)).toEqual(['Tesla Model 3', 'Toyota Yaris', 'Mazda 3']);
    await type(q(h, 'select'), 'featured', 'change');
    expect(names(h)[0]).toBe('Toyota Yaris');
  });

  it('links each card to its detail page', async () => {
    const h = await open();
    expect(qa(h, '.card')[1].getAttribute('href')).toBe('/resource/2');
  });
});

describe('Bookings', () => {
  const open = async (url: string, list: unknown[]) => {
    const h = await RouterTestingHarness.create(url);
    await initStore(list);
    return h;
  };

  it('shows the empty state', async () => {
    const h = await open('/bookings', []);
    expect(text(h)).toContain('No rentals yet.');
  });

  it('lists bookings with the placed banner from ?placed=', async () => {
    const h = await open('/bookings?placed=BKG-AAAA1111', [booking(), booking({ id: 'B2', status: 'cancelled' })]);
    expect(text(h)).toContain('Booking BKG-AAAA1111 confirmed');
    expect(text(h)).toContain('2030-01-02 → 2030-01-03 · 2 days');
    expect(text(h)).toContain('$80.00');
    expect(qa(h, '.order')[1].textContent).toContain('Cancelled');
    expect(qa(h, '.order')[1].querySelector('button')).toBeNull(); // cannot cancel twice
  });

  it('cancels a booking and shows what the server returned', async () => {
    const h = await open('/bookings', [booking({ id: 'B1' })]);
    await click(q(h, 'button.link'));
    expectReq(http, 'POST', '/api/bookings/B1/cancel').flush(booking({ id: 'B1', status: 'cancelled' }));
    await settle();
    expect(qa(h, '.order')[0].textContent).toContain('Cancelled');
  });
});

describe('ResourceDetail', () => {
  const open = async (id = '1', resourceReply: unknown = car(), slots: unknown = AVAIL(['2030-01-04'])) => {
    const h = await RouterTestingHarness.create(`/resource/${id}`);
    await initStore();
    reply(expectReq(http, 'GET', `/api/resources/${id}`), resourceReply);
    await settle();
    if (slots !== null) {
      reply(expectReq(http, 'GET', `/api/resources/${id}/availability`), slots);
      await settle();
    }
    return h;
  };
  const fill = async (h: H, name = 'Ann Lee', email = 'ann@example.com') => {
    const inputs = qa(h, 'label input') as HTMLInputElement[]; // [pick-up, return, name, email]
    await type(inputs[2], name);
    await type(inputs[3], email);
  };
  const submit = (h: H) => click(q(h, 'button.btn'));
  const unavailable = (h: H) => qa(h, '[aria-label="Unavailable dates"] .chip').map((c) => c.textContent!.trim());
  const dateInputs = (h: H) => qa(h, 'input[type=date]') as HTMLInputElement[];

  it('shows the car and lists unavailable dates', async () => {
    const h = await open();
    expect(text(h)).toContain('Toyota Yaris');
    expect(text(h)).toContain('$40.00');
    expect(unavailable(h)).toEqual(['2030-01-04']);
  });

  it('says so when every day is available', async () => {
    const h = await open('1', car(), AVAIL());
    expect(text(h)).toContain('Available every day');
  });

  it('shows Not found for an unknown car', async () => {
    const h = await open('999', fail(404, 'Resource not found'), null);
    expect(text(h)).toContain('Not found.');
  });

  it('shows an error when the car fails to load', async () => {
    const h = await open('2', fail(500, 'Internal server error'), null);
    expect(text(h)).toContain('Could not load: Internal server error');
  });

  it('shows an inline error when availability fails', async () => {
    const h = await open('1', car(), fail(500, 'Internal server error'));
    expect(text(h)).toContain('Internal server error');
  });

  it('computes the total from the number of days and ignores an empty date', async () => {
    const h = await open();
    const [from, to] = dateInputs(h);
    await type(from, '2030-01-02', 'change');
    reply(expectReq(http, 'GET', '/api/resources/1/availability?from=2030-01-02'), AVAIL());
    await settle();
    await type(to, '2030-01-03', 'change');
    expect(q(h, '.total').textContent).toContain('2 days');
    expect(q(h, '.total').textContent).toContain('$80.00');
    await type(to, '', 'change');
    expect(q(h, '.total').textContent).toContain('$80.00');
  });

  it('validates the form client-side before calling the API', async () => {
    const h = await open();
    await submit(h);
    expect(text(h)).toContain('Name is required');
    expect(text(h)).toContain('Email is required');
    await fill(h, 'Ann', 'nope');
    await submit(h);
    expect(text(h)).toContain('Enter a valid email');
    http.expectNone('/api/bookings'); // nothing was sent
  });

  it('rejects a return before pick-up, over-long rentals and rentals overlapping unavailable days', async () => {
    const h = await open();
    await fill(h);
    const [from, to] = dateInputs(h);
    await type(from, '2030-01-02', 'change');
    reply(expectReq(http, 'GET', '/api/resources/1/availability?from=2030-01-02'), AVAIL(['2030-01-04']));
    await settle();
    await type(to, '2030-01-01', 'change');
    await submit(h);
    expect(text(h)).toContain('Return date must be on or after pick-up date');
    await type(to, '2031-01-01', 'change');
    await submit(h);
    expect(text(h)).toContain('Rentals are limited to 30 days');
    await type(to, '2030-01-05', 'change');
    await submit(h);
    expect(text(h)).toContain('Some of those dates are unavailable');
    http.expectNone('/api/bookings');
  });

  it('moving the pick-up date past the return date pulls the return date along', async () => {
    const h = await open();
    const [from, to] = dateInputs(h);
    await type(from, '2099-02-01', 'change');
    reply(expectReq(http, 'GET', '/api/resources/1/availability?from=2099-02-01'), AVAIL());
    await settle();
    expect(to.value).toBe('2099-02-01');
    await type(from, '', 'change'); // an empty date is ignored
  });

  it('books, then navigates to My rentals with the success banner', async () => {
    const h = await open();
    await fill(h);
    await submit(h);
    const req = expectReq(http, 'POST', '/api/bookings');
    expect(req.request.body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(req.request.body.to).toBe(req.request.body.from);
    expect(req.request.body.customer).toEqual({ name: 'Ann Lee', email: 'ann@example.com' });
    expect(req.request.body.total).toBeUndefined(); // never send a client total
    req.flush(booking({ id: 'BKG-NEW00001' }));
    await settle();
    expect(TestBed.inject(Router).url).toBe('/bookings?placed=BKG-NEW00001');
    expect(text(h)).toContain('Booking BKG-NEW00001 confirmed');
  });

  it('after a 409 shows the message and refreshes availability', async () => {
    const h = await open();
    await fill(h);
    await submit(h);
    reply(expectReq(http, 'POST', '/api/bookings'), fail(409, 'Sorry, one of those days was just booked. Pick other dates.'));
    await settle();
    expect(text(h)).toContain('just booked');
    reply(expectReq(http, 'GET', '/api/resources/1/availability'), AVAIL(['2030-01-02', '2030-01-03']));
    await settle();
    expect(unavailable(h)).toEqual(['2030-01-02', '2030-01-03']);
  });
});
