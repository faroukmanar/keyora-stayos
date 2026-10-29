/**
 * AUTO-GENERATED from packages/contracts/openapi/v1.json.
 * Run npm run contract:generate; do not edit by hand.
 */
export interface paths {
  "/v1/health": {
    get: {
      responses: {
        "200": components['schemas']['HealthResponse'];
      };
    };
  };
  "/v1/ready": {
    get: {
      responses: {
        "200": components['schemas']['ReadinessResponse'];
        "503": components['schemas']['ReadinessResponse'];
      };
    };
  };
  "/v1/auth/login": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['LoginRequest'] } };
      responses: {
        "200": components['schemas']['AuthResponse'];
        "401": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/auth/refresh": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['RefreshRequest'] } };
      responses: {
        "200": components['schemas']['AuthResponse'];
        "401": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/auth/logout": {
    post: {
      responses: {
        "204": never;
      };
    };
  };
  "/v1/auth/password-reset/request": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['PasswordResetRequest'] } };
      responses: {
        "202": never;
      };
    };
  };
  "/v1/auth/password-reset/confirm": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['PasswordResetConfirm'] } };
      responses: {
        "204": never;
        "401": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/rooms": {
    get: {
      responses: {
        "200": components['schemas']['RoomPage'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/reservations": {
    get: {
      responses: {
        "200": components['schemas']['ReservationPage'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
      };
    };
    post: {
      requestBody: { content: { 'application/json': components['schemas']['CreateReservationCommand'] } };
      responses: {
        "201": components['schemas']['Reservation'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
        "422": components['schemas']['ApiError'];
      };
    };
  };
}

export interface components {
  schemas: {
    "HealthResponse": {
      "status": "ok";
      "version": string;
    };
    "ReadinessResponse": {
      "status": "ready" | "unavailable";
      "version": string;
    };
    "Money": {
      "amountMinor": number;
      "currency": string;
    };
    "Room": {
      "id": string;
      "organizationId": string;
      "propertyId": string;
      "name": string;
      "roomType": string;
      "capacity": number;
      "status": "available" | "occupied" | "cleaning" | "maintenance";
      "version": number;
      "updatedAt": string;
    };
    "GuestSummary": {
      "id": string;
      "displayName": string;
      "vip": boolean;
    };
    "Reservation": {
      "id": string;
      "organizationId": string;
      "propertyId": string;
      "roomId": string;
      "guest": components['schemas']['GuestSummary'];
      "checkIn": string;
      "checkOut": string;
      "adults": number;
      "children": number;
      "status": "confirmed" | "checked-in" | "checked-out" | "cancelled" | "no-show";
      "total": components['schemas']['Money'];
      "version": number;
      "updatedAt": string;
    };
    "CreateReservationCommand": {
      "propertyId": string;
      "roomId": string;
      "guestId": string;
      "checkIn": string;
      "checkOut": string;
      "adults": number;
      "children"?: number;
      "quoteId": string;
    };
    "RoomPage": {
      "data": (components['schemas']['Room'])[];
      "nextCursor": string | null;
    };
    "ReservationPage": {
      "data": (components['schemas']['Reservation'])[];
      "nextCursor": string | null;
    };
    "ApiError": {
      "error": {
      "code": string;
      "message": string;
      "requestId": string;
      "details"?: {
      [key: string]: unknown;
    };
    };
    };
    "AuthUser": {
      "id": string;
      "organizationId": string;
      "propertyId": string;
      "displayName": string;
      "role": "owner" | "manager" | "front-desk" | "housekeeping";
      "sessionId": string;
    };
    "LoginRequest": {
      "email": string;
      "password": string;
      "propertyId": string;
      "clientType": "native" | "web";
      "deviceName": string;
      "mfaCode"?: string;
    };
    "RefreshRequest": {
      "clientType": "native" | "web";
      "refreshToken"?: string;
    };
    "AuthResponse": {
      "user": components['schemas']['AuthUser'];
      "accessExpiresInSeconds": 300;
      "accessToken"?: string;
      "refreshToken"?: string;
      "refreshExpiresAt"?: string;
    };
    "PasswordResetRequest": {
      "email": string;
      "propertyId": string;
    };
    "PasswordResetConfirm": {
      "token": string;
      "newPassword": string;
    };
  };
}
