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
  "/v1/properties/{propertyId}/notifications/preview": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['NotificationPreviewRequest'] } };
      responses: {
        "200": components['schemas']['NotificationPreview'];
        "403": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/notifications/events": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['NotificationEventRequest'] } };
      responses: {
        "202": never;
        "403": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/notifications/deliveries": {
    get: {
      responses: {
        "200": never;
        "403": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/notification-preferences/me": {
    get: {
      responses: {
        "200": components['schemas']['NotificationPreferences'];
      };
    };
    put: {
      requestBody: { content: { 'application/json': components['schemas']['NotificationPreferences'] } };
      responses: {
        "204": never;
      };
    };
  };
  "/v1/notification-providers/primary/callback": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['NotificationCallback'] } };
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
  "/v1/properties/{propertyId}/housekeeping/tasks": {
    get: {
      responses: {
        "200": components['schemas']['HousekeepingTaskPage'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
      };
    };
    post: {
      requestBody: { content: { 'application/json': components['schemas']['CreateHousekeepingTaskCommand'] } };
      responses: {
        "201": components['schemas']['HousekeepingTaskDetail'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "422": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}": {
    get: {
      responses: {
        "200": components['schemas']['HousekeepingTaskDetail'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}/assign": {
    patch: {
      requestBody: { content: { 'application/json': components['schemas']['AssignHousekeepingTaskCommand'] } };
      responses: {
        "200": components['schemas']['HousekeepingTaskDetail'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
        "422": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}/checklist": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['AddChecklistItemCommand'] } };
      responses: {
        "201": components['schemas']['HousekeepingChecklistItem'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}/checklist/{itemId}": {
    patch: {
      requestBody: { content: { 'application/json': components['schemas']['ToggleChecklistItemCommand'] } };
      responses: {
        "200": components['schemas']['HousekeepingChecklistItem'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}/transitions": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['HousekeepingTransitionCommand'] } };
      responses: {
        "200": components['schemas']['HousekeepingTaskDetail'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
        "422": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}/inspections": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['HousekeepingInspectionCommand'] } };
      responses: {
        "200": components['schemas']['HousekeepingTaskDetail'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
      };
    };
  };
  "/v1/properties/{propertyId}/housekeeping/tasks/{taskId}/escalate": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['HousekeepingEscalationCommand'] } };
      responses: {
        "200": components['schemas']['HousekeepingTaskDetail'];
        "400": components['schemas']['ApiError'];
        "401": components['schemas']['ApiError'];
        "403": components['schemas']['ApiError'];
        "404": components['schemas']['ApiError'];
        "409": components['schemas']['ApiError'];
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
    "NotificationPreviewRequest": {
      "eventType": "reservation.confirmed" | "reservation.changed" | "arrival.reminder" | "task.assigned" | "task.blocked";
      "channel": "email" | "push";
      "locale": "en" | "fr" | "ar";
      "variables": {
      [key: string]: string;
    };
    };
    "NotificationPreview": {
      "templateId": string;
      "version": number;
      "locale": "en" | "fr" | "ar";
      "subject": string;
      "body": string;
    };
    "NotificationEventRequest": {
      "eventId": string;
      "eventType": "reservation.confirmed" | "reservation.changed" | "arrival.reminder" | "task.assigned" | "task.blocked";
      "recipient": {
      "type": "user" | "guest";
      "id": string;
      "email"?: string;
      "pushToken"?: string;
    };
      "variables": {
      [key: string]: string;
    };
    };
    "NotificationPreferences": {
      "locale": "en" | "fr" | "ar";
      "emailEnabled": boolean;
      "pushEnabled": boolean;
      "arrivalReminders": boolean;
      "quietStart": string;
      "quietEnd": string;
      "timezone": string;
      "urgentBypass": boolean;
      "unsubscribedAt": string | null;
    };
    "NotificationCallback": {
      "id": string;
      "messageId": string;
      "status": "delivered" | "bounced" | "failed";
    };
    "HousekeepingTask": {
      "id": string;
      "roomId": string;
      "roomName": string | null;
      "reservationId": string | null;
      "assignee": {
      "id": string;
      "displayName": string | null;
    } | {
      "id": string;
      "displayName": string | null;
    };
      "status": "ready" | "in-progress" | "blocked" | "inspection" | "done";
      "priority": "normal" | "rush";
      "dueAt": string | null;
      "overdue": boolean;
      "inspectionRequired": boolean;
      "blockedReason": string | null;
      "blockedAt": string | null;
      "startedAt": string | null;
      "completedAt": string | null;
      "checklist": {
      "total": number;
      "completed": number;
    };
      "lastChange": {
      "type": string;
      "actorId": string | null;
      "actorName": string | null;
      "at": string;
    } | {
      "type": string;
      "actorId": string | null;
      "actorName": string | null;
      "at": string;
    };
      "version": number;
      "createdAt": string;
      "updatedAt": string;
    };
    "HousekeepingChecklistItem": {
      "id": string;
      "label": string;
      "required": boolean;
      "sortOrder": number;
      "completedAt": string | null;
      "completedBy": string | null;
    };
    "HousekeepingInspection": {
      "id": string;
      "result": "passed" | "failed";
      "notes": string | null;
      "inspectorUserId": string | null;
      "createdAt": string;
    };
    "HousekeepingTaskDetail": {
      "id": string;
      "roomId": string;
      "roomName": string | null;
      "reservationId": string | null;
      "assignee": {
      "id": string;
      "displayName": string | null;
    } | {
      "id": string;
      "displayName": string | null;
    };
      "status": "ready" | "in-progress" | "blocked" | "inspection" | "done";
      "priority": "normal" | "rush";
      "dueAt": string | null;
      "overdue": boolean;
      "inspectionRequired": boolean;
      "blockedReason": string | null;
      "blockedAt": string | null;
      "startedAt": string | null;
      "completedAt": string | null;
      "checklist": {
      "total": number;
      "completed": number;
    };
      "lastChange": {
      "type": string;
      "actorId": string | null;
      "actorName": string | null;
      "at": string;
    } | {
      "type": string;
      "actorId": string | null;
      "actorName": string | null;
      "at": string;
    };
      "version": number;
      "createdAt": string;
      "updatedAt": string;
      "checklistItems": (components['schemas']['HousekeepingChecklistItem'])[];
      "inspections": (components['schemas']['HousekeepingInspection'])[];
      "inspection"?: {
      "id": string;
      "result": "passed" | "failed";
      "createdAt": string;
    };
    };
    "HousekeepingTaskPage": {
      "data": (components['schemas']['HousekeepingTask'])[];
      "nextCursor": string | null;
    };
    "CreateHousekeepingTaskCommand": {
      "roomId": string;
      "priority"?: "normal" | "rush";
      "dueAt"?: string | null;
      "assigneeUserId"?: string | null;
      "inspectionRequired"?: boolean;
    };
    "AssignHousekeepingTaskCommand": {
      "version": number;
      "assigneeUserId": string | null;
    };
    "AddChecklistItemCommand": {
      "label": string;
      "required"?: boolean;
    };
    "ToggleChecklistItemCommand": {
      "completed": boolean;
    };
    "HousekeepingTransitionCommand": {
      "version": number;
      "target": "ready" | "in-progress" | "blocked" | "inspection" | "done";
      "reason"?: string;
    };
    "HousekeepingInspectionCommand": {
      "version": number;
      "result": "passed" | "failed";
      "notes"?: string | null;
    };
    "HousekeepingEscalationCommand": {
      "version": number;
      "reason": string;
    };
  };
}
