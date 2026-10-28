import type { ImageSource } from 'expo-image';

export type AppRole = 'owner' | 'manager' | 'front-desk' | 'housekeeping';
export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance';
export type ReservationStatus = 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';
export type TaskStatus = 'ready' | 'in-progress' | 'blocked' | 'done';

export type AppUser = { id: string; name: string; role: AppRole };
export type Room = {
  id: string;
  name: string;
  property: string;
  city: string;
  type: string;
  floor: string;
  capacity: number;
  nightlyRate: number;
  status: RoomStatus;
  image: ImageSource;
  amenities: string[];
};
export type RoomDetails = {
  bedrooms: number;
  beds: number;
  bathrooms: number;
  areaSqm: number;
  rating: number;
  reviewCount: number;
  description: string;
  highlights: string[];
  checkIn: string;
  checkOut: string;
  cancellation: string;
  houseRules: string[];
  instantBook: boolean;
};
export type Guest = { id: string; name: string; email: string; phone: string; stays: number; vip?: boolean };
export type Reservation = {
  id: string;
  guestId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  status: ReservationStatus;
  channel: 'Direct' | 'Booking.com' | 'Airbnb' | 'Expedia';
  arrivalNote?: string;
};
export type HousekeepingTask = {
  id: string;
  roomId: string;
  assignee: string;
  due: string;
  status: TaskStatus;
  priority: 'standard' | 'rush';
};
