import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookingStore } from './core/booking-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <a routerLink="/" class="logo">🚗 Car Rental</a>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Browse</a>
        <a routerLink="/bookings" routerLinkActive="active">
          My rentals
          @if (store.upcomingCount() > 0) { <span class="badge">{{ store.upcomingCount() }}</span> }
        </a>
      </nav>
    </header>
    <main>
      @if (store.error(); as msg) {
        <div class="error-banner" role="alert">
          {{ msg }} <button class="link" (click)="store.clearError()">Dismiss</button>
        </div>
      }
      @if (!store.ready()) {
        <p class="empty">Loading…</p>
      } @else {
        <router-outlet />
      }
    </main>
  `,
})
export class App {
  protected readonly store = inject(BookingStore);
}
