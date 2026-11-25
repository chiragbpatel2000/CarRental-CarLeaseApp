import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { money } from '../../core/format';
import { Resource } from '../../core/models';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError(); as msg) {
      <p class="empty">Could not load: {{ msg }}</p>
    } @else if (!resources()) {
      <p class="empty">Loading…</p>
    } @else {
      <div class="toolbar">
        <input placeholder="Search cars…" aria-label="Search" [value]="query()" (input)="query.set(val($event))" />
        <select aria-label="Sort" [value]="sort()" (change)="sort.set(val($event))">
          <option value="featured">Featured</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
          <option value="rating">Top rated</option>
        </select>
      </div>
      <div class="chips">
        @for (c of categories(); track c) {
          <button class="chip" [class.active]="c === category()" (click)="category.set(c)">{{ c }}</button>
        }
      </div>
      @if (shown().length === 0) {
        <p class="empty">Nothing matches your search.</p>
      } @else {
        <div class="grid">
          @for (r of shown(); track r.id) {
            <a class="card" [routerLink]="['/resource', r.id]">
              <div class="thumb" [style.background]="r.color">{{ r.emoji }}</div>
              <h3>{{ r.name }}</h3>
              <div class="meta"><span>{{ r.category }}</span><span class="rating">★ {{ r.rating.toFixed(1) }}</span></div>
              <div class="row"><strong>{{ money(r.price) }}</strong><small>/ day · {{ r.seats }} seats · {{ r.transmission }}</small></div>
            </a>
          }
        </div>
      }
    }
  `,
})
export class Home {
  private readonly api = inject(ApiService);
  protected readonly money = money;

  protected readonly resources = signal<Resource[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly category = signal('All');
  protected readonly sort = signal('featured');

  protected readonly categories = computed(() => ['All', ...new Set((this.resources() ?? []).map((r) => r.category))]);

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = (this.resources() ?? []).filter(
      (r) => (this.category() === 'All' || r.category === this.category()) && r.name.toLowerCase().includes(q),
    );
    switch (this.sort()) {
      case 'low': return [...list].sort((a, b) => a.price - b.price);
      case 'high': return [...list].sort((a, b) => b.price - a.price);
      case 'rating': return [...list].sort((a, b) => b.rating - a.rating);
      default: return list;
    }
  });

  constructor() {
    // Every fetch needs a catch: no silent forever-"Loading…".
    this.api.resources().then((r) => this.resources.set(r)).catch((e: Error) => this.loadError.set(e.message));
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
