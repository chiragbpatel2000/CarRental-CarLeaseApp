import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BookingStore } from '../../core/booking-store';
import { dayCount, money, toDay } from '../../core/format';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// `resource()` tracks loading/error per request and ignores stale responses (a slow reply for a previous day or
// id is never shown), which is the job the `live` flag did in the React version.
const message = (e: unknown): string => {
  const err = e as { cause?: { message?: string }; message?: string } | undefined;
  return err?.cause?.message ?? err?.message ?? 'Unknown error';
};

@Component({
  selector: 'app-resource-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (item.error()) {
      <p class="empty">Could not load: {{ errorText(item.error()) }}</p>
    } @else if (item.isLoading() || item.status() === 'idle') {
      <p class="empty">Loading…</p>
    } @else if (item.value() === null) {
      <p class="empty">Not found. <a routerLink="/">Back to browse</a></p>
    } @else if (item.value(); as r) {
      <div class="detail">
        <div class="big-thumb" [style.background]="r.color">{{ r.emoji }}</div>
        <form (submit)="submit($event)" novalidate>
          <a routerLink="/" class="back">← Back</a>
          <h1>{{ r.name }}</h1>
          <div class="meta"><span>{{ r.category }}</span><span class="rating">★ {{ r.rating.toFixed(1) }}</span></div>
          <p>{{ r.description }}</p>
          <div class="price">{{ money(r.price) }} <small>/ day · {{ r.seats }} seats · {{ r.transmission }}</small></div>

          <label>Pick-up date
            <input type="date" [value]="from()" [min]="today" (change)="setFrom($event)" />
          </label>
          <label>Return date
            <input type="date" [value]="to()" [min]="from()" (change)="setTo($event)" />
          </label>

          <h3>Unavailable dates (from pick-up, 60 days)</h3>
          @if (slots.error()) {
            <p class="err">{{ errorText(slots.error()) }}</p>
          } @else if (slots.isLoading() || !slots.hasValue()) {
            <p class="empty">Loading dates…</p>
          } @else if (bookedDays().length === 0) {
            <p class="empty">Available every day in this period.</p>
          } @else {
            <div class="chips" role="group" aria-label="Unavailable dates">
              @for (d of bookedDays(); track d) {
                <span class="chip">{{ d }}</span>
              }
            </div>
          }

          <label>Your name
            <input [value]="name()" (input)="name.set(val($event))" />
            @if (errors().name; as m) { <span class="err">{{ m }}</span> }
          </label>
          <label>Email
            <input [value]="email()" (input)="email.set(val($event))" />
            @if (errors().email; as m) { <span class="err">{{ m }}</span> }
          </label>

          <div class="summary"><div class="total"><span>{{ days() }} {{ days() === 1 ? 'day' : 'days' }} · Total</span><span>{{ money(total()) }}</span></div></div>
          @if (errors().form; as m) { <p class="err" role="alert">{{ m }}</p> }
          <button class="btn block" [disabled]="submitting()">{{ submitting() ? 'Booking…' : 'Confirm rental' }}</button>
        </form>
      </div>
    }
  `,
})
export class ResourceDetail {
  private readonly api = inject(ApiService);
  private readonly store = inject(BookingStore);
  private readonly router = inject(Router);
  protected readonly money = money;
  protected readonly today = toDay();
  protected readonly errorText = message;

  /** Route param `:id` (bound by withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly from = signal(toDay());
  protected readonly to = signal(toDay());
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly errors = signal<{ name?: string; email?: string; form?: string }>({});
  protected readonly submitting = signal(false);

  // value(): undefined = loading, null = not found, Resource = ok. error() = failed. Each rendered distinctly.
  protected readonly item = resource({
    params: () => this.id(),
    loader: ({ params }) => this.api.resource(params),
  });

  // Availability is keyed by (resource, pick-up date); it only loads once the resource exists.
  protected readonly slots = resource({
    params: () => (this.item.value() ? { id: this.id(), from: this.from() } : undefined),
    loader: ({ params }) => this.api.availability(params.id, params.from),
  });

  protected readonly days = computed(() => Math.max(0, dayCount(this.from(), this.to())));
  protected readonly total = computed(() => (this.item.value()?.price ?? 0) * this.days());
  protected readonly bookedDays = computed(() => (this.slots.value()?.days ?? []).filter((d) => d.booked).map((d) => d.day));

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setFrom(e: Event): void {
    const v = this.val(e);
    if (!v) return;
    this.from.set(v);
    if (this.to() < v) this.to.set(v);
  }

  protected setTo(e: Event): void {
    const v = this.val(e);
    if (v) this.to.set(v);
  }

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    const r = this.item.value();
    if (!r) return;
    // Client-side validation mirrors the server's for fast feedback; the server stays authoritative.
    const errs: { name?: string; email?: string; form?: string } = {};
    const max = this.slots.value()?.maxDays ?? 30;
    if (this.days() < 1) errs.form = 'Return date must be on or after pick-up date';
    else if (this.days() > max) errs.form = `Rentals are limited to ${max} days`;
    else if (this.overlapsBooked()) errs.form = 'Some of those dates are unavailable. Pick other dates.';
    if (!this.name().trim()) errs.name = 'Name is required';
    if (!this.email().trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(this.email())) errs.email = 'Enter a valid email';
    this.errors.set(errs);
    if (Object.keys(errs).length) return;

    this.submitting.set(true);
    try {
      const b = await this.store.createBooking({
        resourceId: r.id,
        from: this.from(),
        to: this.to(),
        customer: { name: this.name(), email: this.email() },
      });
      await this.router.navigate(['/bookings'], { queryParams: { placed: b.id } });
    } catch (err) {
      this.errors.set({ form: (err as Error).message });
      this.submitting.set(false);
      // a 409 means someone else took a day: refresh to show what is actually free
      this.slots.reload();
    }
  }

  private overlapsBooked(): boolean {
    return this.bookedDays().some((d) => d >= this.from() && d <= this.to());
  }
}
