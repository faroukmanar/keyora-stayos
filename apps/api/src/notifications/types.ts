export type NotificationEventType = 'reservation.confirmed' | 'reservation.changed' | 'arrival.reminder' | 'task.assigned' | 'task.blocked';
export type NotificationChannel = 'email' | 'push';
export type TenantScope = { organizationId: string; propertyId: string };
export type Recipient = { type: 'user' | 'guest'; id: string; email?: string; pushToken?: string };
export type Template = { id: string; eventType: NotificationEventType; channel: NotificationChannel; locale: 'en' | 'fr' | 'ar'; version: number; subject: string; body: string; variableNames: string[] };
export type Preferences = { locale: 'en' | 'fr' | 'ar'; emailEnabled: boolean; pushEnabled: boolean; arrivalReminders: boolean; quietStart: string; quietEnd: string; timezone: string; urgentBypass: boolean; unsubscribedAt: Date | null };
export type Delivery = { id: string; scope: TenantScope; eventId: string; eventType: NotificationEventType; recipient: Recipient; channel: NotificationChannel; status: string; ciphertext: Buffer | null; notBefore: Date; providerMessageId: string | null };
export interface NotificationRepository {
  getTemplate(scope: TenantScope, eventType: NotificationEventType, channel: NotificationChannel, locale: string): Promise<Template | null>;
  getPreferences(scope: TenantScope, recipient: Recipient): Promise<Preferences>;
  savePreferences(scope: TenantScope, recipient: Recipient, preferences: Preferences): Promise<void>;
  createDelivery(input: Omit<Delivery, 'id' | 'providerMessageId'> & { templateId?: string }): Promise<Delivery>;
  claimDue(scope: TenantScope, limit: number): Promise<Delivery[]>;
  dueScopes(): Promise<TenantScope[]>;
  markSent(delivery: Delivery, providerMessageId: string): Promise<void>;
  markFailed(delivery: Delivery, code: string): Promise<void>;
  history(scope: TenantScope, recipient?: Recipient): Promise<Array<Omit<Delivery, 'ciphertext'>>>;
  applyCallback(provider: string, providerEventId: string, providerMessageId: string, status: 'delivered' | 'bounced' | 'failed', payloadHash: Buffer): Promise<boolean>;
}
export interface NotificationProvider { send(message: { deliveryId: string; channel: NotificationChannel; destination: string; subject: string; body: string }): Promise<{ messageId: string }> }
