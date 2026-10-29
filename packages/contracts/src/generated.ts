/**
 * Generated transport types for OpenAPI 1.0.0.
 * Source: packages/contracts/openapi/v1.json
 * Regenerate when the versioned contract changes; do not hand-edit consumers.
 */
export interface paths {
  '/v1/health': {
    get: { responses: { 200: { content: { 'application/json': components['schemas']['HealthResponse'] } } } };
  };
  '/v1/ready': {
    get: { responses: { 200: { content: { 'application/json': components['schemas']['ReadinessResponse'] } }; 503: { content: { 'application/json': components['schemas']['ReadinessResponse'] } } } };
  };
  '/v1/properties/{propertyId}/rooms': {
    get: { responses: { 200: { content: { 'application/json': components['schemas']['RoomPage'] } } } };
  };
  '/v1/properties/{propertyId}/reservations': {
    get: { responses: { 200: { content: { 'application/json': components['schemas']['ReservationPage'] } } } };
    post: { requestBody: { content: { 'application/json': components['schemas']['CreateReservationCommand'] } }; responses: { 201: { content: { 'application/json': components['schemas']['Reservation'] } } } };
  };
}

export interface components {
  schemas: {
    HealthResponse: { status: 'ok'; version: string };
    ReadinessResponse: { status: 'ready' | 'unavailable'; version: string };
    Money: { amountMinor: number; currency: string };
    Room: { id: string; organizationId: string; propertyId: string; name: string; roomType: string; capacity: number; status: 'available' | 'occupied' | 'cleaning' | 'maintenance'; version: number; updatedAt: string };
    GuestSummary: { id: string; displayName: string; vip: boolean };
    Reservation: { id: string; organizationId: string; propertyId: string; roomId: string; guest: components['schemas']['GuestSummary']; checkIn: string; checkOut: string; adults: number; children: number; status: 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled' | 'no-show'; total: components['schemas']['Money']; version: number; updatedAt: string };
    CreateReservationCommand: { propertyId: string; roomId: string; guestId: string; checkIn: string; checkOut: string; adults: number; children?: number; quoteId: string };
    RoomPage: { data: components['schemas']['Room'][]; nextCursor: string | null };
    ReservationPage: { data: components['schemas']['Reservation'][]; nextCursor: string | null };
    ApiError: { error: { code: string; message: string; requestId: string; details?: Record<string, unknown> } };
  };
}
