import { z } from 'zod';

export const API_VERSION = '1.0.0' as const;

export const idSchema = z.string().uuid();
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected ISO 4217 currency');
export const appRoleSchema = z.enum(['owner', 'manager', 'front-desk', 'housekeeping']);
export const roomStatusSchema = z.enum(['available', 'occupied', 'cleaning', 'maintenance']);
export const reservationStatusSchema = z.enum(['confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show']);

export const moneySchema = z.object({
  amountMinor: z.number().int().safe().nonnegative(),
  currency: currencySchema,
}).strict();

export const actorSchema = z.object({
  userId: idSchema,
  organizationId: idSchema,
  propertyId: idSchema,
  role: appRoleSchema,
}).strict();

export const roomSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  propertyId: idSchema,
  name: z.string().trim().min(1).max(120),
  roomType: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(50),
  status: roomStatusSchema,
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const guestSummarySchema = z.object({
  id: idSchema,
  displayName: z.string().trim().min(1).max(160),
  vip: z.boolean(),
}).strict();

export const reservationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  propertyId: idSchema,
  roomId: idSchema,
  guest: guestSummarySchema,
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50),
  status: reservationStatusSchema,
  total: moneySchema,
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().refine((value) => value.checkOut > value.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
});

export const createReservationCommandSchema = z.object({
  propertyId: idSchema,
  roomId: idSchema,
  guestId: idSchema,
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50).default(0),
  quoteId: idSchema,
}).strict().refine((value) => value.checkOut > value.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z0-9_]+$/),
    message: z.string().min(1).max(500),
    requestId: z.string().uuid(),
    details: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
}).strict();

export const pageSchema = <T extends z.ZodType>(item: T) => z.object({
  data: z.array(item),
  nextCursor: z.string().max(512).nullable(),
}).strict();

export type AppRole = z.infer<typeof appRoleSchema>;
export type Actor = z.infer<typeof actorSchema>;
export type Money = z.infer<typeof moneySchema>;
export type Room = z.infer<typeof roomSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type CreateReservationCommand = z.infer<typeof createReservationCommandSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
