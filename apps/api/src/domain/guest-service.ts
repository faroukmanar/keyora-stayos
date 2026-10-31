import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Actor } from '../auth/types';
import { conflict, dateOnly, DomainError, isoTimestamp, notFound, recordAudit, staleVersion, type TenantScope } from './pg';

export type GuestPreferences = {
  pillow?: string;
  floor?: 'low' | 'high' | 'any';
  dietary?: string[];
  accessibility?: string[];
  roomType?: string;
};

export type GuestInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  preferredLanguage?: string | null;
  preferences?: GuestPreferences;
  vip?: boolean;
  marketingOptIn?: boolean;
  analyticsOptIn?: boolean;
};

export type GuestNoteCategory = 'preference' | 'internal' | 'alert';

function normalizePhone(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 7 ? digits : null;
}

export function maskEmail(value: string | null) {
  if (!value) return null;
  const [local, domain] = value.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

export function maskPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
}

export class GuestService {
  private readonly encryptionKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(secret: Buffer, private readonly now = () => new Date()) {
    this.encryptionKey = createHash('sha256').update(secret).update('guest-phone-encryption').digest();
    this.hashKey = createHash('sha256').update(secret).update('guest-phone-hash').digest();
  }

  private encryptPhone(phone: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  private decryptPhone(value: unknown) {
    if (!Buffer.isBuffer(value) || value.length < 29) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  private phoneHash(phone: string) {
    const normalized = normalizePhone(phone);
    return normalized ? createHmac('sha256', this.hashKey).update(normalized).digest('hex') : null;
  }

  private toGuest(row: Record<string, unknown>, sensitive: boolean) {
    const phone = this.decryptPhone(row.phone_encrypted);
    return {
      id: String(row.id),
      displayName: String(row.display_name),
      email: sensitive ? (row.email ? String(row.email) : null) : maskEmail(row.email ? String(row.email) : null),
      phone: sensitive ? phone : maskPhone(phone),
      preferredLanguage: row.preferred_language ? String(row.preferred_language) : null,
      preferences: (row.preferences as GuestPreferences | null) ?? {},
      vip: Boolean(row.vip),
      marketingOptIn: Boolean(row.marketing_opt_in),
      marketingOptInAt: row.marketing_opt_in_at ? isoTimestamp(row.marketing_opt_in_at) : null,
      analyticsOptIn: Boolean(row.analytics_opt_in),
      version: Number(row.version),
      anonymizedAt: row.anonymized_at ? isoTimestamp(row.anonymized_at) : null,
      mergedIntoGuestId: row.merged_into_guest_id ? String(row.merged_into_guest_id) : null,
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
      sensitiveFieldsMasked: !sensitive,
    };
  }

  private noteFrom(row: Record<string, unknown>) {
    return {
      id: String(row.id),
      category: String(row.category) as GuestNoteCategory,
      body: String(row.body),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: isoTimestamp(row.created_at),
    };
  }

  async list(client: PoolClient, query: { limit: number; cursor?: number; q?: string; vip?: boolean }, sensitive: boolean) {
    const offset = query.cursor ? Math.max(0, query.cursor - 1) : 0;
    const values: unknown[] = [];
    const where = ['g.anonymized_at IS NULL', 'g.merged_into_guest_id IS NULL'];
    if (query.q) {
      values.push(query.q);
      where.push(sensitive
        ? `(g.display_name ILIKE '%' || $${values.length} || '%' OR g.email ILIKE '%' || $${values.length} || '%')`
        : `g.display_name ILIKE '%' || $${values.length} || '%'`);
    }
    if (query.vip !== undefined) {
      values.push(query.vip);
      where.push(`g.vip=$${values.length}`);
    }
    values.push(query.limit + 1, offset);
    const result = await client.query(
      `SELECT g.* FROM guests g WHERE ${where.join(' AND ')} ORDER BY g.display_name, g.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const rows = result.rows.map((row) => this.toGuest(row, sensitive));
    return { data: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? String(offset + query.limit + 1) : null };
  }

  async get(client: PoolClient, scope: TenantScope, guestId: string, sensitive: boolean) {
    const result = await client.query('SELECT * FROM guests WHERE id=$1 AND organization_id=$2 AND property_id=$3', [guestId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Guest');
    const row = result.rows[0];
    const [notes, stays] = await Promise.all([
      sensitive
        ? client.query('SELECT * FROM guest_notes WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200', [guestId, scope.organizationId, scope.propertyId])
        : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
      client.query(
        `SELECT count(*)::int AS total, max(check_out) AS last_check_out
         FROM reservations WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3 AND status IN ('checked-in', 'checked-out')`,
        [guestId, scope.organizationId, scope.propertyId],
      ),
    ]);
    return {
      ...this.toGuest(row, sensitive),
      notes: notes.rows.map((note) => this.noteFrom(note)),
      staySummary: { completedStays: Number(stays.rows[0].total), lastCheckOut: stays.rows[0].last_check_out ? dateOnly(stays.rows[0].last_check_out) : null },
    };
  }

  async listStays(client: PoolClient, scope: TenantScope, guestId: string) {
    const guest = await client.query('SELECT 1 FROM guests WHERE id=$1 AND organization_id=$2 AND property_id=$3', [guestId, scope.organizationId, scope.propertyId]);
    if (!guest.rowCount) throw notFound('Guest');
    const result = await client.query(
      `SELECT id, room_id, check_in, check_out, status, adults, children, total_minor, currency
       FROM reservations WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3 ORDER BY check_in DESC LIMIT 100`,
      [guestId, scope.organizationId, scope.propertyId],
    );
    return result.rows.map((row) => ({
      id: String(row.id), roomId: String(row.room_id), checkIn: dateOnly(row.check_in), checkOut: dateOnly(row.check_out),
      status: String(row.status), adults: Number(row.adults), children: Number(row.children),
      total: { amountMinor: Number(row.total_minor), currency: String(row.currency) },
    }));
  }

  async create(client: PoolClient, scope: TenantScope, actor: Actor, input: GuestInput, requestId: string) {
    const phone = input.phone?.trim() || null;
    const result = await client.query(
      `INSERT INTO guests(organization_id, property_id, display_name, email, phone_encrypted, phone_hash, preferred_language, preferences, vip, marketing_opt_in, marketing_opt_in_at, analytics_opt_in)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        scope.organizationId, scope.propertyId, input.displayName.trim(), input.email?.trim().toLowerCase() ?? null,
        phone ? this.encryptPhone(phone) : null, phone ? this.phoneHash(phone) : null,
        input.preferredLanguage ?? null, JSON.stringify(input.preferences ?? {}), input.vip ?? false,
        input.marketingOptIn ?? false, input.marketingOptIn ? this.now() : null, input.analyticsOptIn ?? false,
      ],
    );
    const guest = this.toGuest(result.rows[0], true);
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.created', entityType: 'guest', entityId: guest.id, requestId, metadata: { vip: guest.vip, marketingOptIn: guest.marketingOptIn } });
    return guest;
  }

  async update(client: PoolClient, scope: TenantScope, actor: Actor, guestId: string, version: number, input: Partial<GuestInput>, requestId: string) {
    const current = await client.query('SELECT * FROM guests WHERE id=$1 AND organization_id=$2 AND property_id=$3 FOR UPDATE', [guestId, scope.organizationId, scope.propertyId]);
    if (!current.rowCount) throw notFound('Guest');
    const row = current.rows[0];
    if (row.anonymized_at || row.merged_into_guest_id) throw conflict('GUEST_ANONYMIZED', 'An anonymized or merged guest cannot be edited.');
    if (Number(row.version) !== version) throw staleVersion();

    const marketingOptIn = input.marketingOptIn ?? Boolean(row.marketing_opt_in);
    const marketingOptInAt = marketingOptIn
      ? (row.marketing_opt_in_at ? isoTimestamp(row.marketing_opt_in_at) : this.now().toISOString())
      : null;
    const phone = input.phone === undefined ? this.decryptPhone(row.phone_encrypted) : (input.phone?.trim() || null);
    const result = await client.query(
      `UPDATE guests SET display_name=$4, email=$5, phone_encrypted=$6, phone_hash=$7, preferred_language=$8, preferences=$9,
         vip=$10, marketing_opt_in=$11, marketing_opt_in_at=$12, analytics_opt_in=$13, version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND version=$14 RETURNING *`,
      [
        guestId, scope.organizationId, scope.propertyId,
        input.displayName?.trim() ?? String(row.display_name),
        input.email === undefined ? (row.email ? String(row.email) : null) : (input.email?.trim().toLowerCase() ?? null),
        phone ? this.encryptPhone(phone) : null, phone ? this.phoneHash(phone) : null,
        input.preferredLanguage === undefined ? (row.preferred_language ? String(row.preferred_language) : null) : input.preferredLanguage,
        JSON.stringify(input.preferences ?? row.preferences ?? {}),
        input.vip ?? Boolean(row.vip), marketingOptIn, marketingOptInAt, input.analyticsOptIn ?? Boolean(row.analytics_opt_in), version,
      ],
    );
    if (!result.rowCount) throw staleVersion();
    const guest = this.toGuest(result.rows[0], true);
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.updated', entityType: 'guest', entityId: guestId, requestId, metadata: { fields: Object.keys(input).length } });
    return guest;
  }

  async addNote(client: PoolClient, scope: TenantScope, actor: Actor, guestId: string, input: { category: GuestNoteCategory; body: string }, requestId: string) {
    const guest = await client.query('SELECT 1 FROM guests WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND anonymized_at IS NULL AND merged_into_guest_id IS NULL', [guestId, scope.organizationId, scope.propertyId]);
    if (!guest.rowCount) throw notFound('Guest');
    const result = await client.query(
      `INSERT INTO guest_notes(organization_id, property_id, guest_id, category, body, created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [scope.organizationId, scope.propertyId, guestId, input.category, input.body.trim(), actor.id],
    );
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.note_added', entityType: 'guest_note', entityId: String(result.rows[0].id), requestId, metadata: { guestId, category: input.category } });
    return this.noteFrom(result.rows[0]);
  }

  async deleteNote(client: PoolClient, scope: TenantScope, actor: Actor, guestId: string, noteId: string, requestId: string) {
    const result = await client.query(
      'UPDATE guest_notes SET deleted_at=now() WHERE id=$1 AND guest_id=$2 AND organization_id=$3 AND property_id=$4 AND deleted_at IS NULL RETURNING id',
      [noteId, guestId, scope.organizationId, scope.propertyId],
    );
    if (!result.rowCount) throw notFound('Guest note');
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.note_deleted', entityType: 'guest_note', entityId: noteId, requestId, metadata: { guestId } });
    return { id: noteId, deleted: true as const };
  }

  async findDuplicates(client: PoolClient, scope: TenantScope, input: { email?: string | null; phone?: string | null; displayName?: string | null }, sensitive: boolean) {
    const email = input.email?.trim().toLowerCase() || null;
    const hash = input.phone?.trim() ? this.phoneHash(input.phone) : null;
    const name = input.displayName?.trim() || null;
    if (!email && !hash && !name) return { candidates: [] };
    const result = await client.query(
      `SELECT g.*, similarity(g.display_name, $5) AS name_score FROM guests g
       WHERE g.organization_id=$1 AND g.property_id=$2 AND g.anonymized_at IS NULL AND g.merged_into_guest_id IS NULL
         AND (($3::text IS NOT NULL AND lower(g.email)=$3) OR ($4::text IS NOT NULL AND g.phone_hash=$4) OR ($5::text IS NOT NULL AND similarity(g.display_name, $5) >= 0.45))
       ORDER BY name_score DESC, g.display_name LIMIT 10`,
      [scope.organizationId, scope.propertyId, email, hash, name],
    );
    return {
      candidates: result.rows.map((row) => ({
        guest: this.toGuest(row, sensitive),
        matchReasons: [
          ...(email && String(row.email).toLowerCase() === email ? ['email'] : []),
          ...(hash && String(row.phone_hash) === hash ? ['phone'] : []),
          ...(name && Number(row.name_score) >= 0.45 ? ['name'] : []),
        ],
        nameScore: Number(row.name_score ?? 0),
      })),
    };
  }

  async merge(client: PoolClient, scope: TenantScope, actor: Actor, targetId: string, sourceId: string, requestId: string) {
    if (targetId === sourceId) throw new DomainError(422, 'MERGE_INVALID', 'A guest cannot be merged into itself.');
    const locked = await client.query(
      'SELECT * FROM guests WHERE id = ANY($1::uuid[]) AND organization_id=$2 AND property_id=$3 ORDER BY id FOR UPDATE',
      [[sourceId, targetId], scope.organizationId, scope.propertyId],
    );
    if (locked.rowCount !== 2) throw notFound('Guest');
    const source = locked.rows.find((row) => String(row.id) === sourceId)!;
    const target = locked.rows.find((row) => String(row.id) === targetId)!;
    if (source.anonymized_at || source.merged_into_guest_id || target.anonymized_at || target.merged_into_guest_id) {
      throw conflict('GUEST_MERGED', 'Only active guests can be merged.');
    }
    const counts = await client.query(
      `SELECT (SELECT count(*)::int FROM reservations WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3) AS reservations,
              (SELECT count(*)::int FROM guest_notes WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3 AND deleted_at IS NULL) AS notes`,
      [sourceId, scope.organizationId, scope.propertyId],
    );
    await client.query('UPDATE reservations SET guest_id=$4 WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3', [sourceId, scope.organizationId, scope.propertyId, targetId]);
    await client.query('UPDATE guest_notes SET guest_id=$3 WHERE guest_id=$1 AND organization_id=$2 AND property_id=$4 AND deleted_at IS NULL', [sourceId, scope.organizationId, targetId, scope.propertyId]);
    const marketingOptIn = Boolean(target.marketing_opt_in || source.marketing_opt_in);
    await client.query(
      `UPDATE guests SET email=COALESCE(email,$4), phone_encrypted=COALESCE(phone_encrypted,$5), phone_hash=COALESCE(phone_hash,$6),
         preferences=($7::jsonb || preferences), vip=$8, marketing_opt_in=$9,
         marketing_opt_in_at=CASE WHEN $9 THEN COALESCE(marketing_opt_in_at, $10::timestamptz) ELSE NULL END,
         analytics_opt_in=($11 OR analytics_opt_in), version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
      [targetId, scope.organizationId, scope.propertyId, source.email ?? null, source.phone_encrypted ?? null, source.phone_hash ?? null,
        JSON.stringify(source.preferences ?? {}), Boolean(target.vip || source.vip), marketingOptIn,
        marketingOptIn ? isoTimestamp(source.marketing_opt_in_at ?? this.now()) : null, Boolean(source.analytics_opt_in)],
    );
    await client.query(
      `UPDATE guests SET display_name='Merged guest', email=NULL, phone_encrypted=NULL, phone_hash=NULL, preferred_language=NULL,
         preferences='{}'::jsonb, vip=false, marketing_opt_in=false, marketing_opt_in_at=NULL, analytics_opt_in=false,
         anonymized_at=now(), merged_into_guest_id=$4, version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3`,
      [sourceId, scope.organizationId, scope.propertyId, targetId],
    );
    await client.query(
      `INSERT INTO guest_merges(organization_id, property_id, source_guest_id, target_guest_id, source_snapshot, merged_by)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [scope.organizationId, scope.propertyId, sourceId, targetId,
        JSON.stringify({ displayName: String(source.display_name), vip: Boolean(source.vip), reservations: counts.rows[0].reservations, notes: counts.rows[0].notes }), actor.id],
    );
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.merged', entityType: 'guest', entityId: targetId, requestId, metadata: { sourceId, reservations: counts.rows[0].reservations, notes: counts.rows[0].notes } });
    return this.get(client, scope, targetId, true);
  }

  private async anonymizeRow(client: PoolClient, scope: TenantScope, guestId: string) {
    const existing = await client.query(
      'SELECT anonymized_at FROM guests WHERE id=$1 AND organization_id=$2 AND property_id=$3 FOR UPDATE',
      [guestId, scope.organizationId, scope.propertyId],
    );
    if (!existing.rowCount) throw notFound('Guest');
    const result = await client.query(
      `UPDATE guests SET display_name='Anonymized guest', email=NULL, phone_encrypted=NULL, phone_hash=NULL, preferred_language=NULL,
         preferences='{}'::jsonb, vip=false, marketing_opt_in=false, marketing_opt_in_at=NULL, analytics_opt_in=false,
         anonymized_at=now(), version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND anonymized_at IS NULL RETURNING id`,
      [guestId, scope.organizationId, scope.propertyId],
    );
    if (result.rowCount) {
      await client.query('UPDATE guest_notes SET deleted_at=now() WHERE guest_id=$1 AND organization_id=$2 AND property_id=$3 AND deleted_at IS NULL', [guestId, scope.organizationId, scope.propertyId]);
    }
    await client.query("UPDATE guest_merges SET source_snapshot = source_snapshot - 'displayName' WHERE source_guest_id=$1 AND organization_id=$2 AND property_id=$3", [guestId, scope.organizationId, scope.propertyId]);
    return Boolean(result.rowCount);
  }

  async anonymize(client: PoolClient, scope: TenantScope, actor: Actor, guestId: string, requestId: string) {
    const anonymized = await this.anonymizeRow(client, scope, guestId);
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.anonymized', entityType: 'guest', entityId: guestId, requestId, metadata: { newlyAnonymized: anonymized } });
    return this.get(client, scope, guestId, true);
  }

  async exportGuests(client: PoolClient, scope: TenantScope, actor: Actor, requestId: string) {
    const result = await client.query(
      'SELECT * FROM guests WHERE organization_id=$1 AND property_id=$2 AND anonymized_at IS NULL AND merged_into_guest_id IS NULL ORDER BY display_name, id LIMIT 5000',
      [scope.organizationId, scope.propertyId],
    );
    await recordAudit(client, { scope, actor, category: 'export', action: 'guest.exported', entityType: 'guest', requestId, metadata: { count: result.rowCount ?? 0 } });
    return result.rows.map((row) => this.toGuest(row, true));
  }

  async runRetention(client: PoolClient, scope: TenantScope, actor: Actor, input: { olderThanYears: number; dryRun: boolean }, requestId: string) {
    const cutoff = this.now();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - input.olderThanYears);
    const candidates = await client.query(
      `SELECT g.id FROM guests g
       WHERE g.organization_id=$1 AND g.property_id=$2 AND g.anonymized_at IS NULL AND g.merged_into_guest_id IS NULL AND g.created_at < $3
         AND NOT EXISTS (
           SELECT 1 FROM reservations r WHERE r.guest_id=g.id AND r.organization_id=$1 AND r.property_id=$2
             AND (r.check_out >= $3::date OR r.status IN ('confirmed', 'checked-in'))
         )
       ORDER BY g.created_at LIMIT 500`,
      [scope.organizationId, scope.propertyId, cutoff],
    );
    let anonymized = 0;
    if (!input.dryRun) {
      for (const row of candidates.rows) {
        if (await this.anonymizeRow(client, scope, String(row.id))) anonymized += 1;
      }
    }
    await recordAudit(client, { scope, actor, category: 'guest', action: 'guest.retention_applied', entityType: 'property', requestId, metadata: { cutoff: cutoff.toISOString(), candidates: candidates.rowCount ?? 0, anonymized, dryRun: input.dryRun } });
    return { cutoff: cutoff.toISOString(), candidates: candidates.rowCount ?? 0, anonymized, dryRun: input.dryRun };
  }
}
