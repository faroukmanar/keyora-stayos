import type { Guest, HousekeepingTask, Reservation, Room, RoomDetails } from '@/domain/models';

export const rooms: Room[] = [
  { id: 'atlas', name: 'Atlas Signature', property: 'KEYORA Medina', city: 'Marrakech', type: 'King suite', floor: 'Riad · 1', capacity: 2, nightlyRate: 2850, status: 'occupied', image: require('../../assets/images/atlas-suite.webp'), amenities: ['King bed', 'Breakfast', 'Courtyard'] },
  { id: 'fez', name: 'Cedar Junior', property: 'KEYORA Fez', city: 'Fez', type: 'Junior suite', floor: 'Riad · 2', capacity: 2, nightlyRate: 2250, status: 'available', image: require('../../assets/images/fez-junior-suite.webp'), amenities: ['King bed', 'Zellige bath', 'Patio'] },
  { id: 'family', name: 'Palm Family', property: 'KEYORA Palmeraie', city: 'Marrakech', type: 'Family suite', floor: 'Garden · 1', capacity: 4, nightlyRate: 3200, status: 'cleaning', image: require('../../assets/images/marrakech-family-suite.webp'), amenities: ['King + twins', 'Lounge', 'Cot'] },
  { id: 'penthouse', name: 'Atlantic Penthouse', property: 'KEYORA Corniche', city: 'Casablanca', type: 'Penthouse', floor: 'Tower · 12', capacity: 2, nightlyRate: 4900, status: 'occupied', image: require('../../assets/images/casablanca-penthouse.webp'), amenities: ['Ocean view', 'Butler', 'Lounge'] },
  { id: 'twin', name: 'Strait Twin', property: 'KEYORA Kasbah', city: 'Tangier', type: 'Twin room', floor: 'House · 2', capacity: 2, nightlyRate: 1750, status: 'available', image: require('../../assets/images/tangier-twin.webp'), amenities: ['Twin beds', 'Workspace', 'Sea light'] },
  { id: 'rabat', name: 'Agdal Residence', property: 'KEYORA Residences', city: 'Rabat', type: 'Serviced apartment', floor: 'Residence · 5', capacity: 3, nightlyRate: 2100, status: 'maintenance', image: require('../../assets/images/rabat-apartment.webp'), amenities: ['Kitchen', 'Living room', 'Washer'] },
  { id: 'private', name: 'Mogador Private', property: 'KEYORA House', city: 'Essaouira', type: 'Private room', floor: 'House · 1', capacity: 2, nightlyRate: 1250, status: 'available', image: require('../../assets/images/essaouira-private.webp'), amenities: ['Queen bed', 'Desk', 'Breakfast'] },
  { id: 'dorm', name: 'Medina Pods', property: 'KEYORA Social', city: 'Marrakech', type: '6-bed dorm', floor: 'House · G', capacity: 6, nightlyRate: 420, status: 'cleaning', image: require('../../assets/images/medina-dorm.webp'), amenities: ['Privacy pods', 'Lockers', 'Lounge'] },
  { id: 'loft', name: 'Corniche Loft', property: 'KEYORA Residences', city: 'Casablanca', type: 'City loft', floor: 'Residence · 8', capacity: 3, nightlyRate: 2400, status: 'occupied', image: require('../../assets/images/corniche-loft.webp'), amenities: ['Kitchen', 'City view', 'Workspace'] },
];

const sharedRules = ['No smoking', 'No parties or events', 'Quiet hours after 22:00'];
export const roomDetails: Record<string, RoomDetails> = {
  atlas: { bedrooms: 1, beds: 1, bathrooms: 1, areaSqm: 46, rating: 4.92, reviewCount: 184, description: 'A sculptural riad suite pairing hand-finished plaster, cobalt zellige and a private courtyard rhythm in the heart of the Medina.', highlights: ['Breakfast included', 'Private courtyard view', 'Airport transfer available'], checkIn: '15:00 – 22:00', checkOut: 'Before 11:00', cancellation: 'Free cancellation until 5 days before arrival', houseRules: sharedRules, instantBook: true },
  fez: { bedrooms: 1, beds: 1, bathrooms: 1, areaSqm: 39, rating: 4.88, reviewCount: 127, description: 'A serene cedar-and-tadelakt junior suite with a handcrafted zellige bath and quiet patio access.', highlights: ['Local breakfast', 'Patio access', '24-hour reception'], checkIn: '14:00 – 21:00', checkOut: 'Before 11:00', cancellation: 'Free cancellation until 3 days before arrival', houseRules: sharedRules, instantBook: true },
  family: { bedrooms: 2, beds: 3, bathrooms: 2, areaSqm: 72, rating: 4.86, reviewCount: 96, description: 'A generous family suite with a private king bedroom, twin alcove and flexible living space near the Palmeraie.', highlights: ['Family breakfast', 'Cot on request', 'Pool access'], checkIn: '15:00 – 22:00', checkOut: 'Before 11:00', cancellation: 'Flexible cancellation within 48 hours', houseRules: [...sharedRules, 'Children welcome'], instantBook: true },
  penthouse: { bedrooms: 1, beds: 1, bathrooms: 2, areaSqm: 108, rating: 4.97, reviewCount: 73, description: 'A cinematic Atlantic-facing penthouse with panoramic arches, private lounge and dedicated concierge service.', highlights: ['Ocean panorama', 'Private concierge', 'Priority airport transfer'], checkIn: '15:00 – 23:00', checkOut: 'Before 12:00', cancellation: 'Free cancellation until 7 days before arrival', houseRules: sharedRules, instantBook: false },
  twin: { bedrooms: 1, beds: 2, bathrooms: 1, areaSqm: 34, rating: 4.81, reviewCount: 112, description: 'A light-filled Tangier twin room designed for friends and colleagues, with generous workspace and coastal daylight.', highlights: ['Two full beds', 'Dedicated workspace', 'Breakfast available'], checkIn: '14:00 – 22:00', checkOut: 'Before 11:00', cancellation: 'Free cancellation until 24 hours before arrival', houseRules: sharedRules, instantBook: true },
  rabat: { bedrooms: 1, beds: 2, bathrooms: 1, areaSqm: 58, rating: 4.79, reviewCount: 68, description: 'An extended-stay Agdal apartment with a full kitchen, separate living zone and hotel-grade weekly service.', highlights: ['Full kitchen', 'Weekly housekeeping', 'Self check-in'], checkIn: 'From 15:00', checkOut: 'Before 11:00', cancellation: 'Free cancellation until 5 days before arrival', houseRules: sharedRules, instantBook: true },
  private: { bedrooms: 1, beds: 1, bathrooms: 1, areaSqm: 27, rating: 4.84, reviewCount: 141, description: 'A compact private hideaway for two, balancing warm birch joinery, a real workspace and Essaouira’s soft coastal light.', highlights: ['Breakfast included', 'Fast Wi-Fi', 'Shared roof terrace'], checkIn: '14:00 – 21:00', checkOut: 'Before 10:30', cancellation: 'Free cancellation until 24 hours before arrival', houseRules: sharedRules, instantBook: true },
  dorm: { bedrooms: 1, beds: 6, bathrooms: 2, areaSqm: 42, rating: 4.76, reviewCount: 238, description: 'Six private sleep pods with individual lighting, power, lockers and a calm social lounge for modern travelers.', highlights: ['Privacy curtains', 'Secure lockers', 'Community kitchen'], checkIn: '14:00 – 00:00', checkOut: 'Before 10:00', cancellation: 'Free cancellation until 24 hours before arrival', houseRules: [...sharedRules, 'Registered guests only'], instantBook: true },
  loft: { bedrooms: 1, beds: 2, bathrooms: 1, areaSqm: 64, rating: 4.9, reviewCount: 89, description: 'A design-led city loft with skyline views, full kitchen and a flexible work-and-live layout on the Corniche.', highlights: ['City and ocean view', 'Full kitchen', 'Self check-in'], checkIn: 'From 15:00', checkOut: 'Before 11:00', cancellation: 'Free cancellation until 3 days before arrival', houseRules: sharedRules, instantBook: true },
};

export const guests: Guest[] = [
  { id: 'g1', name: 'Leila Haddad', email: 'leila@example.com', phone: '+212 661 42 91 08', stays: 6, vip: true },
  { id: 'g2', name: 'Thomas Becker', email: 'thomas@example.com', phone: '+49 151 204 109', stays: 2 },
  { id: 'g3', name: 'Nora El Mansouri', email: 'nora@example.com', phone: '+33 612 88 42 10', stays: 4, vip: true },
  { id: 'g4', name: 'Maya Chen', email: 'maya@example.com', phone: '+44 770 210 338', stays: 1 },
];

export const reservations: Reservation[] = [
  { id: 'KEY-1048', guestId: 'g1', roomId: 'atlas', checkIn: '2026-10-27', checkOut: '2026-10-30', adults: 2, status: 'checked-in', channel: 'Direct' },
  { id: 'KEY-1049', guestId: 'g2', roomId: 'penthouse', checkIn: '2026-10-28', checkOut: '2026-11-01', adults: 2, status: 'confirmed', channel: 'Booking.com' },
  { id: 'KEY-1050', guestId: 'g3', roomId: 'loft', checkIn: '2026-10-28', checkOut: '2026-11-03', adults: 2, status: 'checked-in', channel: 'Airbnb' },
  { id: 'KEY-1051', guestId: 'g4', roomId: 'twin', checkIn: '2026-10-29', checkOut: '2026-10-31', adults: 2, status: 'confirmed', channel: 'Expedia' },
];

export const housekeepingTasks: HousekeepingTask[] = [
  { id: 'hk1', roomId: 'family', assignee: 'Samira', due: '12:30', status: 'in-progress', priority: 'rush' },
  { id: 'hk2', roomId: 'dorm', assignee: 'Youssef', due: '13:15', status: 'ready', priority: 'standard' },
  { id: 'hk3', roomId: 'rabat', assignee: 'Imane', due: '14:00', status: 'blocked', priority: 'standard' },
];
