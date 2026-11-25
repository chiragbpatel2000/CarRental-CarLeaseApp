import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Availability, Booking, BookingPayload, Resource } from './models';

// Thin wrapper over HttpClient for the same-origin /api backend (no CORS or base URL config; `ng serve` proxies it).
// Every method returns a Promise that rejects with an Error whose message is the server's `error` text, so the UI
// can show it as-is. Callers MUST handle rejection (a missing catch means an eternal "Loading…").
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private async call<T>(req: Promise<T>): Promise<T> {
    try {
      return await req;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        throw new Error(e.error?.error || (e.status === 0 ? 'Cannot reach the server' : `Request failed (${e.status})`));
      }
      throw e;
    }
  }

  resources(): Promise<Resource[]> {
    return this.call(firstValueFrom(this.http.get<Resource[]>('/api/resources')));
  }

  // Resolves to null when the resource doesn't exist; any other failure rejects.
  // The strings are the server's exact messages ('Resource not found' / 'Invalid id').
  async resource(id: string | number): Promise<Resource | null> {
    try {
      return await this.call(firstValueFrom(this.http.get<Resource>(`/api/resources/${encodeURIComponent(id)}`)));
    } catch (e) {
      const m = (e as Error).message;
      if (m === 'Resource not found' || m === 'Invalid id') return null;
      throw e;
    }
  }

  availability(id: string | number, from: string): Promise<Availability> {
    return this.call(
      firstValueFrom(this.http.get<Availability>(`/api/resources/${encodeURIComponent(id)}/availability`, { params: { from } })),
    );
  }

  bookings(): Promise<Booking[]> {
    return this.call(firstValueFrom(this.http.get<Booking[]>('/api/bookings')));
  }

  createBooking(payload: BookingPayload): Promise<Booking> {
    return this.call(firstValueFrom(this.http.post<Booking>('/api/bookings', payload)));
  }

  cancelBooking(id: string): Promise<Booking> {
    return this.call(firstValueFrom(this.http.post<Booking>(`/api/bookings/${encodeURIComponent(id)}/cancel`, {})));
  }
}
