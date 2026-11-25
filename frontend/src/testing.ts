// Shared test harness. Frontend tests NEVER touch the network: HttpClientTesting intercepts every request, and each
// test answers the calls it expects (flush) -- an unexpected or unanswered call fails the test via verify().
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app/app.routes';
import { clientIdInterceptor } from './app/core/client-id.interceptor';
import { Booking, Resource } from './app/core/models';

export function configure(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([clientIdInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/** Find the single pending request for `method url` (query string included, so match on a prefix). */
export function expectReq(http: HttpTestingController, method: string, url: string): TestRequest {
  return http.expectOne((r) => r.method === method && r.urlWithParams.startsWith(url), `${method} ${url}`);
}

export const fail = (status: number, error: string) => ({ body: { error }, init: { status, statusText: 'err' } });

/** Answer a pending request with a body or with `fail(...)`. */
export function reply(req: TestRequest, result: unknown): void {
  const f = result as { body?: unknown; init?: { status: number; statusText: string } };
  if (f && f.init) req.flush(f.body as object, f.init);
  else req.flush(result as object);
}

export const car = (over: Partial<Resource> = {}): Resource => ({
  id: 1, name: 'Toyota Yaris', category: 'Economy', price: 40, emoji: '🚗', color: '#dbeafe', rating: 4.8,
  description: 'Small city car.', seats: 5, transmission: 'Manual', ...over,
});

export const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'BKG-AAAA1111', resource: { id: 1, name: 'Toyota Yaris', emoji: '🚗' }, from: '2030-01-02', to: '2030-01-03', days: 2, total: 80,
  customer: { name: 'Ann', email: 'ann@example.com' }, status: 'confirmed', createdAt: '2030-01-01T10:00:00Z', ...over,
});
