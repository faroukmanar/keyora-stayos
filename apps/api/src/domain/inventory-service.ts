import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError, isoTimestamp, notFound, recordAudit, staleVersion, type TenantScope } from './pg';
import type { Actor } from '../auth/types';

export type RoomInput = {
  roomTypeId: string;
  name: string;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance';
  sortOrder?: number;
  amenityIds?: string[];
};
export type RoomPatch = Partial<{ roomTypeId: string; name: string; status: RoomInput['status']; sortOrder: number; amenityIds: string[] }>;
export type MediaInput = { kind: 'image' | 'floorplan'; objectKey: string; mimeType: string; sizeBytes: number; checksumSha256: string; altText: string; sortOrder?: number; metadataStripped: boolean };

const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const roomSelect = `
  SELECT r.*, rt.name AS room_type, rt.capacity,
    COALESCE((SELECT array_agg(a.code ORDER BY a.code) FROM room_amenities ra JOIN amenities a ON a.id = ra.amenity_id WHERE ra.room_id = r.id AND a.archived_at IS NULL), '{}') AS amenities
  FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id AND rt.property_id = r.property_id AND rt.organization_id = r.organization_id`;

function roomFrom(row: Record<string, unknown>) {
  return {
    id: String(row.id), organizationId: String(row.organization_id), propertyId: String(row.property_id),
    roomTypeId: String(row.room_type_id), name: String(row.name), roomType: String(row.room_type),
    capacity: Number(row.capacity), status: row.status as RoomInput['status'], sortOrder: Number(row.sort_order),
    amenities: (row.amenities as string[] | null) ?? [], archivedAt: row.archived_at ? isoTimestamp(row.archived_at) : null,
    version: Number(row.version), updatedAt: isoTimestamp(row.updated_at),
  };
}

export class InventoryService {
  constructor(private readonly mediaSecret: Buffer, private readonly now = () => new Date()) {}

  async listRooms(client: PoolClient, query: { limit: number; cursor?: number; includeArchived?: boolean; status?: string; search?: string }) {
    const offset = query.cursor ? Math.max(0, query.cursor - 1) : 0;
    const values: unknown[] = [];
    const where = ['true'];
    if (!query.includeArchived) where.push('r.archived_at IS NULL');
    if (query.status) { values.push(query.status); where.push(`r.status = $${values.length}`); }
    if (query.search) { values.push(`%${query.search.toLowerCase()}%`); where.push(`(lower(r.name) LIKE $${values.length} OR lower(rt.name) LIKE $${values.length})`); }
    values.push(query.limit + 1, offset);
    const result = await client.query(
      `${roomSelect} WHERE ${where.join(' AND ')} ORDER BY r.sort_order, r.name LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const rows = result.rows.map(roomFrom);
    return { data: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? String(offset + query.limit + 1) : null };
  }

  async getRoom(client: PoolClient, scope: TenantScope, roomId: string) {
    const result = await client.query(`${roomSelect} WHERE r.id=$1 AND r.organization_id=$2 AND r.property_id=$3`, [roomId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Room');
    return roomFrom(result.rows[0]);
  }

  private async assertRoomType(client: PoolClient, scope: TenantScope, roomTypeId: string) {
    const result = await client.query('SELECT 1 FROM room_types WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL', [roomTypeId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw Object.assign(new DomainError(422, 'ROOM_TYPE_INVALID', 'The room type is not active in this property.'), {});
  }

  private async setAmenities(client: PoolClient, scope: TenantScope, roomId: string, amenityIds: string[]) {
    const unique = [...new Set(amenityIds)];
    if (!unique.length) { await client.query('DELETE FROM room_amenities WHERE room_id=$1', [roomId]); return; }
    const valid = await client.query('SELECT id FROM amenities WHERE id = ANY($1::uuid[]) AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL', [unique, scope.organizationId, scope.propertyId]);
    if (valid.rowCount !== unique.length) throw new DomainError(422, 'AMENITY_INVALID', 'One or more amenities are unavailable in this property.');
    await client.query('DELETE FROM room_amenities WHERE room_id=$1', [roomId]);
    for (const amenityId of unique) await client.query('INSERT INTO room_amenities(organization_id, property_id, room_id, amenity_id) VALUES($1,$2,$3,$4)', [scope.organizationId, scope.propertyId, roomId, amenityId]);
  }

  async createRoom(client: PoolClient, scope: TenantScope, actor: Actor, input: RoomInput, requestId: string) {
    await this.assertRoomType(client, scope, input.roomTypeId);
    const result = await client.query(
      `INSERT INTO rooms(organization_id, property_id, room_type_id, name, status, sort_order)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.roomTypeId, input.name, input.status, input.sortOrder ?? 0],
    );
    const roomId = String(result.rows[0].id);
    if (input.amenityIds) await this.setAmenities(client, scope, roomId, input.amenityIds);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.created', entityType: 'room', entityId: roomId, requestId, metadata: { status: input.status } });
    return this.getRoom(client, scope, roomId);
  }

  async updateRoom(client: PoolClient, scope: TenantScope, actor: Actor, roomId: string, version: number, patch: RoomPatch, requestId: string) {
    if (patch.roomTypeId) await this.assertRoomType(client, scope, patch.roomTypeId);
    const current = await this.getRoom(client, scope, roomId);
    if (current.version !== version) throw staleVersion();
    const next = {
      roomTypeId: patch.roomTypeId ?? current.roomTypeId,
      name: patch.name ?? current.name,
      status: patch.status ?? current.status,
      sortOrder: patch.sortOrder ?? current.sortOrder,
    };
    const result = await client.query(
      `UPDATE rooms SET room_type_id=$4, name=$5, status=$6, sort_order=$7, version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND version=$8 RETURNING id`,
      [roomId, scope.organizationId, scope.propertyId, next.roomTypeId, next.name, next.status, next.sortOrder, version],
    );
    if (!result.rowCount) throw staleVersion();
    if (patch.amenityIds) await this.setAmenities(client, scope, roomId, patch.amenityIds);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.updated', entityType: 'room', entityId: roomId, requestId, metadata: { fields: Object.keys(patch).join(',') } });
    return this.getRoom(client, scope, roomId);
  }

  async archiveRoom(client: PoolClient, scope: TenantScope, actor: Actor, roomId: string, requestId: string) {
    const result = await client.query(
      `UPDATE rooms SET archived_at=now(), version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL RETURNING id`,
      [roomId, scope.organizationId, scope.propertyId],
    );
    if (!result.rowCount) throw notFound('Room');
    await client.query('UPDATE maintenance_blocks SET status=\'released\', released_at=now() WHERE room_id=$1 AND status=\'active\'', [roomId]);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.archived', entityType: 'room', entityId: roomId, requestId });
  }

  async reorderRooms(client: PoolClient, scope: TenantScope, actor: Actor, orderedIds: string[], requestId: string) {
    const unique = [...new Set(orderedIds)];
    if (unique.length !== orderedIds.length) throw new DomainError(422, 'DUPLICATE_ROOM', 'A room can appear only once in the order.');
    const existing = await client.query('SELECT id FROM rooms WHERE id = ANY($1::uuid[]) AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL', [unique, scope.organizationId, scope.propertyId]);
    if (existing.rowCount !== unique.length) throw new DomainError(422, 'ROOM_INVALID', 'The order contains a room outside this property.');
    for (const [index, roomId] of unique.entries()) await client.query('UPDATE rooms SET sort_order=$2, updated_at=now() WHERE id=$1', [roomId, index]);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.reordered', entityType: 'room', requestId, metadata: { count: unique.length } });
  }

  async bulkUpdate(client: PoolClient, scope: TenantScope, actor: Actor, roomIds: string[], patch: RoomPatch, requestId: string) {
    const rooms = await client.query('SELECT id FROM rooms WHERE id = ANY($1::uuid[]) AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL', [roomIds, scope.organizationId, scope.propertyId]);
    if (rooms.rowCount !== new Set(roomIds).size) throw new DomainError(422, 'ROOM_INVALID', 'The selection contains a room outside this property.');
    await client.query(
      `UPDATE rooms SET status=COALESCE($4,status), sort_order=COALESCE($5,sort_order), version=version+1, updated_at=now()
       WHERE id = ANY($1::uuid[]) AND organization_id=$2 AND property_id=$3`,
      [roomIds, scope.organizationId, scope.propertyId, patch.status ?? null, patch.sortOrder ?? null],
    );
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.bulk_updated', entityType: 'room', requestId, metadata: { count: roomIds.length } });
  }

  async listAmenities(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT id, code, name FROM amenities WHERE organization_id=$1 AND property_id=$2 AND archived_at IS NULL ORDER BY name', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name) }));
  }

  async createAmenity(client: PoolClient, scope: TenantScope, actor: Actor, input: { code: string; name: string }, requestId: string) {
    const result = await client.query('INSERT INTO amenities(organization_id, property_id, code, name) VALUES($1,$2,$3,$4) RETURNING id', [scope.organizationId, scope.propertyId, input.code, input.name]);
    await recordAudit(client, { scope, actor, category: 'room', action: 'amenity.created', entityType: 'amenity', entityId: String(result.rows[0].id), requestId });
    return { id: String(result.rows[0].id), code: input.code, name: input.name };
  }

  async getPolicies(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT * FROM property_policies WHERE organization_id=$1 AND property_id=$2', [scope.organizationId, scope.propertyId]);
    if (!result.rowCount) return { checkInTime: '15:00', checkOutTime: '11:00', cancellationPolicy: { freeUntilHours: 48, penaltyPercent: 100 }, houseRules: [] as string[], updatedAt: null };
    const row = result.rows[0];
    return { checkInTime: String(row.check_in_time), checkOutTime: String(row.check_out_time), cancellationPolicy: row.cancellation_policy, houseRules: row.house_rules, updatedAt: isoTimestamp(row.updated_at) };
  }

  async savePolicies(client: PoolClient, scope: TenantScope, actor: Actor, input: { checkInTime: string; checkOutTime: string; cancellationPolicy: Record<string, unknown>; houseRules: string[] }, requestId: string) {
    await client.query(
      `INSERT INTO property_policies(property_id, organization_id, check_in_time, check_out_time, cancellation_policy, house_rules)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (property_id) DO UPDATE SET check_in_time=EXCLUDED.check_in_time, check_out_time=EXCLUDED.check_out_time,
       cancellation_policy=EXCLUDED.cancellation_policy, house_rules=EXCLUDED.house_rules, updated_at=now()`,
      [scope.propertyId, scope.organizationId, input.checkInTime, input.checkOutTime, JSON.stringify(input.cancellationPolicy), JSON.stringify(input.houseRules)],
    );
    await recordAudit(client, { scope, actor, category: 'room', action: 'policy.updated', entityType: 'property', entityId: scope.propertyId, requestId });
    return this.getPolicies(client, scope);
  }

  signMediaUrl(mediaId: string, organizationId: string, propertyId: string, expiresAt: Date) {
    const payload = `${mediaId}.${organizationId}.${propertyId}.${Math.floor(expiresAt.getTime() / 1000)}`;
    return `/v1/media/${mediaId}?organizationId=${organizationId}&propertyId=${propertyId}&exp=${Math.floor(expiresAt.getTime() / 1000)}&sig=${createHmac('sha256', this.mediaSecret).update(payload).digest('base64url')}`;
  }

  verifyMediaSignature(mediaId: string, organizationId: string, propertyId: string, exp: number, signature: string) {
    if (!Number.isInteger(exp) || exp * 1000 < this.now().getTime()) throw new DomainError(403, 'MEDIA_URL_EXPIRED', 'The media URL has expired.');
    const expected = createHmac('sha256', this.mediaSecret).update(`${mediaId}.${organizationId}.${propertyId}.${exp}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new DomainError(403, 'MEDIA_SIGNATURE_INVALID', 'The media URL signature is invalid.');
  }

  async registerMedia(client: PoolClient, scope: TenantScope, actor: Actor, roomId: string, input: MediaInput, requestId: string) {
    if (!allowedMime.has(input.mimeType)) throw new DomainError(422, 'MEDIA_TYPE_REJECTED', 'Only JPEG, PNG, WebP, and AVIF images are accepted.');
    if (!input.metadataStripped) throw new DomainError(422, 'MEDIA_METADATA_PRESENT', 'Image metadata must be stripped before registration.');
    await this.getRoom(client, scope, roomId);
    const result = await client.query(
      `INSERT INTO room_media(organization_id, property_id, room_id, kind, object_key, mime_type, size_bytes, checksum_sha256, alt_text, sort_order, metadata_stripped)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id, created_at`,
      [scope.organizationId, scope.propertyId, roomId, input.kind, input.objectKey, input.mimeType, input.sizeBytes, input.checksumSha256, input.altText, input.sortOrder ?? 0],
    );
    const mediaId = String(result.rows[0].id);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.media_registered', entityType: 'room_media', entityId: mediaId, requestId, metadata: { mimeType: input.mimeType, sizeBytes: input.sizeBytes } });
    const expiresAt = new Date(this.now().getTime() + 15 * 60 * 1000);
    return { id: mediaId, roomId, mimeType: input.mimeType, sizeBytes: input.sizeBytes, altText: input.altText, url: this.signMediaUrl(mediaId, scope.organizationId, scope.propertyId, expiresAt), expiresAt: expiresAt.toISOString() };
  }

  async listMedia(client: PoolClient, scope: TenantScope, roomId: string) {
    const result = await client.query('SELECT id, kind, mime_type, size_bytes, alt_text, sort_order, created_at FROM room_media WHERE room_id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL ORDER BY sort_order, created_at', [roomId, scope.organizationId, scope.propertyId]);
    const expiresAt = new Date(this.now().getTime() + 15 * 60 * 1000);
    return result.rows.map((row) => ({ id: String(row.id), kind: String(row.kind), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes), altText: String(row.alt_text), sortOrder: Number(row.sort_order), url: this.signMediaUrl(String(row.id), scope.organizationId, scope.propertyId, expiresAt), expiresAt: expiresAt.toISOString() }));
  }

  async resolveMedia(client: PoolClient, mediaId: string) {
    const result = await client.query('SELECT id, organization_id, property_id, object_key, mime_type, size_bytes FROM room_media WHERE id=$1 AND archived_at IS NULL', [mediaId]);
    if (!result.rowCount) throw notFound('Media');
    const row = result.rows[0];
    return { id: String(row.id), organizationId: String(row.organization_id), propertyId: String(row.property_id), objectKey: String(row.object_key), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes) };
  }

  async createMaintenanceBlock(client: PoolClient, scope: TenantScope, actor: Actor, input: { roomId: string; reason: string; startsAt: string; endsAt: string }, requestId: string) {
    await this.getRoom(client, scope, input.roomId);
    const result = await client.query(
      `INSERT INTO maintenance_blocks(organization_id, property_id, room_id, reason, starts_at, ends_at, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.roomId, input.reason, input.startsAt, input.endsAt, actor.id],
    );
    await client.query("UPDATE rooms SET status='maintenance', version=version+1, updated_at=now() WHERE id=$1", [input.roomId]);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.maintenance_blocked', entityType: 'maintenance_block', entityId: String(result.rows[0].id), requestId, metadata: { roomId: input.roomId } });
    return { id: String(result.rows[0].id), roomId: input.roomId, reason: input.reason, startsAt: input.startsAt, endsAt: input.endsAt, status: 'active' as const };
  }

  async releaseMaintenanceBlock(client: PoolClient, scope: TenantScope, actor: Actor, blockId: string, requestId: string) {
    const result = await client.query(
      `UPDATE maintenance_blocks SET status='released', released_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND status='active' RETURNING room_id`,
      [blockId, scope.organizationId, scope.propertyId],
    );
    if (!result.rowCount) throw notFound('Maintenance block');
    const roomId = String(result.rows[0].room_id);
    const remaining = await client.query("SELECT 1 FROM maintenance_blocks WHERE room_id=$1 AND status='active'", [roomId]);
    if (!remaining.rowCount) await client.query("UPDATE rooms SET status='available', version=version+1, updated_at=now() WHERE id=$1 AND status='maintenance'", [roomId]);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room.maintenance_released', entityType: 'maintenance_block', entityId: blockId, requestId, metadata: { roomId } });
    return { id: blockId, roomId, status: 'released' as const };
  }

  async listMaintenanceBlocks(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT id, room_id, reason, starts_at, ends_at, status, created_at, released_at FROM maintenance_blocks WHERE organization_id=$1 AND property_id=$2 ORDER BY created_at DESC LIMIT 200', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), roomId: String(row.room_id), reason: String(row.reason), startsAt: isoTimestamp(row.starts_at), endsAt: isoTimestamp(row.ends_at), status: String(row.status), createdAt: isoTimestamp(row.created_at), releasedAt: row.released_at ? isoTimestamp(row.released_at) : null }));
  }

  async listRoomTypes(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT id, name, capacity, archived_at FROM room_types WHERE organization_id=$1 AND property_id=$2 ORDER BY name', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), capacity: Number(row.capacity), archivedAt: row.archived_at ? isoTimestamp(row.archived_at) : null }));
  }

  async createRoomType(client: PoolClient, scope: TenantScope, actor: Actor, input: { name: string; capacity: number }, requestId: string) {
    const result = await client.query('INSERT INTO room_types(organization_id, property_id, name, capacity) VALUES($1,$2,$3,$4) RETURNING id', [scope.organizationId, scope.propertyId, input.name, input.capacity]);
    await recordAudit(client, { scope, actor, category: 'room', action: 'room_type.created', entityType: 'room_type', entityId: String(result.rows[0].id), requestId });
    return { id: String(result.rows[0].id), name: input.name, capacity: input.capacity, archivedAt: null };
  }

  async updateRoomType(client: PoolClient, scope: TenantScope, actor: Actor, roomTypeId: string, input: { name?: string; capacity?: number }, requestId: string) {
    const result = await client.query(
      'UPDATE room_types SET name=COALESCE($4,name), capacity=COALESCE($5,capacity), updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL RETURNING id, name, capacity',
      [roomTypeId, scope.organizationId, scope.propertyId, input.name ?? null, input.capacity ?? null],
    );
    if (!result.rowCount) throw notFound('Room type');
    await recordAudit(client, { scope, actor, category: 'room', action: 'room_type.updated', entityType: 'room_type', entityId: roomTypeId, requestId });
    return { id: roomTypeId, name: String(result.rows[0].name), capacity: Number(result.rows[0].capacity), archivedAt: null };
  }

  async archiveRoomType(client: PoolClient, scope: TenantScope, actor: Actor, roomTypeId: string, requestId: string) {
    const activeRooms = await client.query('SELECT 1 FROM rooms WHERE room_type_id=$1 AND archived_at IS NULL LIMIT 1', [roomTypeId]);
    if (activeRooms.rowCount) throw new DomainError(409, 'ROOM_TYPE_IN_USE', 'Archive or move active rooms before archiving this room type.');
    const result = await client.query('UPDATE room_types SET archived_at=now(), updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL RETURNING id', [roomTypeId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Room type');
    await recordAudit(client, { scope, actor, category: 'room', action: 'room_type.archived', entityType: 'room_type', entityId: roomTypeId, requestId });
  }
}
