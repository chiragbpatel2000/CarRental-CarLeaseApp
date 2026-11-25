// Wire types: what /api returns. The server is the source of truth for every number here.
export interface Resource {
  id: number;
  name: string;
  category: string;
  price: number;
  emoji: string;
  color: string;
  rating: number;
  description: string;
  seats: number;
  transmission: string;
}

export interface AvailabilityDay {
  day: string; // 'YYYY-MM-DD'
  booked: boolean;
}

export interface Availability {
  from: string;
  price: number; // per day
  maxDays: number;
  days: AvailabilityDay[];
}

export interface Customer {
  name: string;
  email: string;
}

export interface Booking {
  id: string;
  resource: { id: number; name: string; emoji: string };
  from: string; // 'YYYY-MM-DD', first rental day
  to: string; // last rental day (inclusive)
  days: number;
  total: number;
  customer: Customer;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface BookingPayload {
  resourceId: number;
  from: string;
  to: string;
  customer: Customer;
}
