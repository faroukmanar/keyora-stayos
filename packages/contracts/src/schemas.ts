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
  roomTypeId: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  roomType: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(50),
  status: roomStatusSchema,
  sortOrder: z.number().int().nonnegative().optional(),
  amenities: z.array(z.string().min(1).max(40)).optional(),
  archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
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
  quoteId: idSchema.nullable().optional(),
  ratePlanId: idSchema.nullable().optional(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().refine((value) => value.checkOut > value.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
});

export const reservationTransitionCommandSchema = z.object({
  version: z.number().int().positive(),
  target: reservationStatusSchema,
}).strict();

export const guestSchema = z.object({
  id: idSchema,
  displayName: z.string().min(1).max(160),
  email: z.string().max(254).nullable(),
  phone: z.string().max(40).nullable(),
  preferredLanguage: z.string().nullable(),
  preferences: z.record(z.string(), z.unknown()),
  vip: z.boolean(),
  marketingOptIn: z.boolean(),
  marketingOptInAt: z.string().datetime({ offset: true }).nullable(),
  analyticsOptIn: z.boolean(),
  version: z.number().int().positive(),
  anonymizedAt: z.string().datetime({ offset: true }).nullable(),
  mergedIntoGuestId: idSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  sensitiveFieldsMasked: z.boolean(),
}).passthrough();

export const createGuestCommandSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()\-]{6,24}$/, 'Enter a valid phone number.').nullable().optional(),
  vip: z.boolean().optional(),
}).strict();

export const createQuoteCommandSchema = z.object({
  roomId: idSchema,
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50).default(0),
  discountCode: z.string().regex(/^[A-Z0-9-]{3,32}$/).optional(),
}).strict().refine((value) => value.checkOut > value.checkIn, { message: 'checkOut must be after checkIn', path: ['checkOut'] });

export const quoteSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int(),
  children: z.number().int(),
  total: moneySchema,
  breakdown: z.object({
    nights: z.array(z.object({ date: isoDateSchema, amountMinor: z.number().int() }).passthrough()),
    subtotalMinor: z.number().int(),
    taxes: z.array(z.object({ name: z.string(), kind: z.string(), amountMinor: z.number().int() }).passthrough()),
    discount: z.object({ code: z.string(), amountMinor: z.number().int() }).passthrough().nullable(),
    totalMinor: z.number().int(),
    currency: currencySchema,
  }).passthrough(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export const maintenanceBlockSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  reason: z.string(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: z.enum(['active', 'released']),
  createdAt: z.string().datetime({ offset: true }),
  releasedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const createMaintenanceBlockCommandSchema = z.object({
  roomId: idSchema,
  reason: z.string().trim().min(3).max(300),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
}).strict().refine((value) => value.endsAt > value.startsAt, { message: 'endsAt must be after startsAt', path: ['endsAt'] });

export const roomStatusCommandSchema = z.object({ version: z.number().int().positive(), status: roomStatusSchema }).strict();

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

export const housekeepingTaskStatusSchema = z.enum(['ready', 'in-progress', 'blocked', 'inspection', 'done']);
export const housekeepingPrioritySchema = z.enum(['normal', 'rush']);
const timestampSchema = z.string().datetime({ offset: true });

export const housekeepingTaskSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  roomName: z.string().nullable(),
  reservationId: idSchema.nullable(),
  assignee: z.object({ id: idSchema, displayName: z.string().nullable() }).strict().nullable(),
  status: housekeepingTaskStatusSchema,
  priority: housekeepingPrioritySchema,
  dueAt: timestampSchema.nullable(),
  overdue: z.boolean(),
  inspectionRequired: z.boolean(),
  blockedReason: z.string().nullable(),
  blockedAt: timestampSchema.nullable(),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  checklist: z.object({ total: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }).strict(),
  lastChange: z.object({ type: z.string(), actorId: idSchema.nullable(), actorName: z.string().nullable(), at: timestampSchema }).strict().nullable(),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

export const housekeepingChecklistItemSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(200),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  completedAt: timestampSchema.nullable(),
  completedBy: idSchema.nullable(),
}).strict();

export const housekeepingInspectionSchema = z.object({
  id: idSchema,
  result: z.enum(['passed', 'failed']),
  notes: z.string().nullable(),
  inspectorUserId: idSchema.nullable(),
  createdAt: timestampSchema,
}).strict();

export const housekeepingTaskDetailSchema = housekeepingTaskSchema.extend({
  checklistItems: z.array(housekeepingChecklistItemSchema),
  inspections: z.array(housekeepingInspectionSchema),
  inspection: z.object({ id: idSchema, result: z.enum(['passed', 'failed']), createdAt: timestampSchema }).strict().optional(),
}).strict();

export const housekeepingTransitionCommandSchema = z.object({
  version: z.number().int().positive(),
  target: housekeepingTaskStatusSchema,
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();

export const housekeepingInspectionCommandSchema = z.object({
  version: z.number().int().positive(),
  result: z.enum(['passed', 'failed']),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();

export const housekeepingEscalationCommandSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
}).strict();

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
export type HousekeepingTaskStatus = z.infer<typeof housekeepingTaskStatusSchema>;
export type HousekeepingTask = z.infer<typeof housekeepingTaskSchema>;
export type HousekeepingTaskDetail = z.infer<typeof housekeepingTaskDetailSchema>;
export type HousekeepingChecklistItem = z.infer<typeof housekeepingChecklistItemSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type Guest = z.infer<typeof guestSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type MaintenanceBlock = z.infer<typeof maintenanceBlockSchema>;
