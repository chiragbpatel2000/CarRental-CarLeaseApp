import { HttpInterceptorFn } from '@angular/common/http';

const KEY = 'carrental-carleaseapp.clientId';

// Until auth exists, each browser gets an anonymous id that scopes its bookings.
// This header is the seam to replace with a real user/session when auth arrives.
export function clientId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export const clientIdInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-Client-Id': clientId() } }));
