import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Booking, BookingPayload } from './models';

// One store (signals). The server is the source of truth: every mutation calls the API and stores WHAT THE SERVER
// RETURNS. No optimistic updates. Failures go to the `error` banner; the exception is createBooking, which THROWS
// so the booking form can show the message next to its button.
@Injectable({ providedIn: 'root' })
export class BookingStore {
  private readonly api = inject(ApiService);

  readonly bookings = signal<Booking[]>([]);
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);
  readonly upcomingCount = computed(() => this.bookings().filter((b) => b.status === 'confirmed').length);

  constructor() {
    this.api
      .bookings()
      .then((b) => this.bookings.set(b))
      .catch((e: Error) => this.error.set(e.message))
      .finally(() => this.ready.set(true));
  }

  clearError(): void {
    this.error.set(null);
  }

  async createBooking(payload: BookingPayload): Promise<Booking> {
    const booking = await this.api.createBooking(payload);
    this.bookings.update((b) => [booking, ...b]);
    return booking;
  }

  async cancelBooking(id: string): Promise<void> {
    try {
      this.error.set(null);
      const updated = await this.api.cancelBooking(id);
      this.bookings.update((list) => list.map((x) => (x.id === id ? updated : x)));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
