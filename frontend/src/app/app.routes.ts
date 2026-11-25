import { Routes } from '@angular/router';
import { Bookings } from './pages/bookings/bookings';
import { Home } from './pages/home/home';
import { NotFound } from './pages/not-found/not-found';
import { ResourceDetail } from './pages/resource-detail/resource-detail';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'resource/:id', component: ResourceDetail },
  { path: 'bookings', component: Bookings },
  { path: '**', component: NotFound },
];
