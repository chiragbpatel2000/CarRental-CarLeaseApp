"""Seed data, inserted on first start when `resources` is empty. Cars; price is per day."""


def _r(id, name, category, price, emoji, color, rating, seats, transmission, description):
    return {"id": id, "name": name, "category": category, "price": price, "emoji": emoji, "color": color,
            "rating": rating, "seats": seats, "transmission": transmission, "description": description}


RESOURCES = [
    _r(1, "Toyota Yaris", "Economy", 34, "🚗", "#dbeafe", 4.4, 5, "Manual", "Small, thrifty city car. Easy to park."),
    _r(2, "Honda Fit", "Economy", 36, "🚗", "#e0e7ff", 4.3, 5, "Automatic", "Surprisingly roomy hatchback with great mileage."),
    _r(3, "Toyota Corolla", "Compact", 42, "🚙", "#dcfce7", 4.6, 5, "Automatic", "Comfortable, reliable all-rounder."),
    _r(4, "Mazda 3", "Compact", 46, "🚙", "#d1fae5", 4.7, 5, "Automatic", "Sharp handling and a premium-feeling cabin."),
    _r(5, "Honda Accord", "Midsize", 58, "🚘", "#fef3c7", 4.6, 5, "Automatic", "Spacious sedan for longer trips."),
    _r(6, "Tesla Model 3", "Electric", 89, "⚡", "#cffafe", 4.9, 5, "Automatic", "Quick, quiet and fully electric."),
    _r(7, "Nissan Leaf", "Electric", 62, "⚡", "#ccfbf1", 4.2, 5, "Automatic", "Easy city EV with a comfortable ride."),
    _r(8, "Toyota RAV4", "SUV", 74, "🚐", "#fed7aa", 4.7, 5, "Automatic", "Compact SUV with plenty of luggage space."),
    _r(9, "Jeep Wrangler", "SUV", 95, "🛻", "#fecaca", 4.5, 4, "Manual", "Go anywhere. Removable top for sunny days."),
    _r(10, "Chrysler Pacifica", "Van", 92, "🚐", "#e9d5ff", 4.4, 7, "Automatic", "Seven seats for families and group trips."),
    _r(11, "Ford Mustang", "Luxury", 120, "🏎️", "#fbcfe8", 4.8, 4, "Automatic", "V8 convertible. Make the drive the holiday."),
    _r(12, "BMW 5 Series", "Luxury", 135, "🏎️", "#e5e7eb", 4.8, 5, "Automatic", "Executive saloon with every comfort."),
]
