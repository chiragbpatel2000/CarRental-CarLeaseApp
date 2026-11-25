import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingStore } from '../../core/booking-store';
import { formatDates, money } from '../../core/format';

@Component({
  selector: 'app-bookings',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.bookings().length === 0) {
      <p class="empty">No rentals yet. <a routerLink="/">Browse</a></p>
    } @else {
      <h1>My rentals</h1>
      @if (placed(); as id) {
        <div class="success" role="status">Booking {{ id }} confirmed. Enjoy the drive!</div>
      }
      @for (b of store.bookings(); track b.id) {
        <div class="order">
          <div class="row">
            <strong>{{ b.resource.emoji }} {{ b.resource.name }}</strong>
            <span>{{ b.status === 'cancelled' ? 'Cancelled' : 'Confirmed' }}</span>
          </div>
          <div>{{ formatDates(b.from, b.to) }} · {{ b.days }} {{ b.days === 1 ? 'day' : 'days' }}</div>
          <small>{{ b.id }} · {{ money(b.total) }}</small>
          @if (b.status === 'confirmed') {
            <div><button class="link" (click)="store.cancelBooking(b.id)">Cancel rental</button></div>
          }
        </div>
      }
    }
  `,
})
export class Bookings {
  protected readonly store = inject(BookingStore);
  protected readonly money = money;
  protected readonly formatDates = formatDates;
  /** `?placed=ID` (bound from the query string by withComponentInputBinding). */
  readonly placed = input<string>();
}
