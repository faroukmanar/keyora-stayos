import type { PoolClient } from 'pg';
import type { Actor } from '../auth/types';
import { conflict, DomainError, emitEvent, isoTimestamp, notFound, recordAudit, staleVersion, type TenantScope, dateOnly } from './pg';
import type { RevenueService } from './revenue-service';

export type ReservationStatus = 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled' | 'no-show';
const transitions: Record<ReservationStatus, ReservationStatus[]> = {
  confirmed: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['checked-out'],
  'checked-out': [],
  cancelled: [],
  'no-show': [],
};
const reservationSelect = `
  SELECT r.*, g.display_name, g.vip
  FROM reservations r JOIN guests g ON g.id=r.guest_id AND g.property_id=r.property_id AND g.organization_id=r.organization_id`;

function reservationFrom(row: Record<string, unknown>) {
  return {
    id: String(row.id), organizationId: String(row.organization_id), propertyId: String(row.property_id), roomId: String(row.room_id),
    guest: { id: String(row.guest_id), displayName: String(row.display_name), vip: Boolean(row.vip) },
    checkIn: dateOnly(row.check_in), checkOut: dateOnly(row.check_out),
    adults: Number(row.adults), children: Number(row.children), status: row.status as ReservationStatus,
    total: { amountMinor: Number(row.total_minor), currency: String(row.currency) },
    quoteId: row.quote_id ? String(row.quote_id) : null, ratePlanId: row.rate_plan_id ? String(row.rate_plan_id) : null,
    version: Number(row.version), updatedAt: isoTimestamp(row.updated_at),
  };
}

export class ReservationService {
  constructor(private readonly revenue: RevenueService) {}

  async list(client: PoolClient, query: { limit: number; cursor?: number; status?: ReservationStatus; from?: string; to?: string }) {
    const offset = query.cursor ? Math.max(0, query.cursor - 1) : 0;
    const values: unknown[] = [];
    const where = ['true'];
    if (query.status) { values.push(query.status); where.push(`r.status=$${values.length}`); }
    if (query.from) { values.push(query.from); where.push(`r.check_out > $${values.length}::date`); }
    if (query.to) { values.push(query.to); where.push(`r.check_in < $${values.length}::date`); }
    values.push(query.limit + 1, offset);
    const result = await client.query(`${reservationSelect} WHERE ${where.join(' AND ')} ORDER BY r.check_in, r.created_at LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    const rows = result.rows.map(reservationFrom);
    return { data: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? String(offset + query.limit + 1) : null };
  }

  async get(client: PoolClient, scope: TenantScope, reservationId: string) {
    const result = await client.query(`${reservationSelect} WHERE r.id=$1 AND r.organization_id=$2 AND r.property_id=$3`, [reservationId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Reservation');
    return reservationFrom(result.rows[0]);
  }

  async create(client: PoolClient, scope: TenantScope, actor: Actor, input: { roomId: string; guestId: string; checkIn: string; checkOut: string; adults: number; children: number; quoteId: string }, requestId: string) {
    const guest = await client.query('SELECT 1 FROM guests WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND anonymized_at IS NULL', [input.guestId, scope.organizationId, scope.propertyId]);
    if (!guest.rowCount) throw new DomainError(422, 'GUEST_INVALID', 'The guest is not available in this property.');
    const quote = await this.revenue.verifyQuote(client, scope, input.quoteId, input);
    const result = await client.query(
      `INSERT INTO reservations(organization_id, property_id, room_id, guest_id, check_in, check_out, adults, children, status, total_minor, currency, price_snapshot, quote_id, rate_plan_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11,$12,$13) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.roomId, input.guestId, input.checkIn, input.checkOut, input.adults, input.children, quote.totalMinor, quote.currency, JSON.stringify(quote.breakdown), input.quoteId, quote.ratePlanId],
    );
    const reservationId = String(result.rows[0].id);
    const discountCode = (quote.breakdown as { discount?: { code?: string } | null } | null)?.discount?.code;
    if (discountCode) {
      const redeemed = await client.query(
        `UPDATE discount_codes SET redemptions=redemptions+1
         WHERE organization_id=$1 AND property_id=$2 AND code=$3 AND active
           AND (max_redemptions IS NULL OR redemptions < max_redemptions) RETURNING id`,
        [scope.organizationId, scope.propertyId, discountCode],
      );
      if (!redeemed.rowCount) throw new DomainError(409, 'DISCOUNT_EXHAUSTED', 'The discount code reached its redemption limit.');
    }
    await emitEvent(client, scope, { type: 'reservation.created', entityType: 'reservation', entityId: reservationId, payload: { roomId: input.roomId, checkIn: input.checkIn, checkOut: input.checkOut, status: 'confirmed' } });
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'reservation.created', entityType: 'reservation', entityId: reservationId, requestId, metadata: { roomId: input.roomId, nights: quote.breakdown.nights.length } });
    return this.get(client, scope, reservationId);
  }

  async changeStay(client: PoolClient, scope: TenantScope, actor: Actor, reservationId: string, version: number, input: { checkIn: string; checkOut: string; adults: number; children: number; quoteId: string }, requestId: string) {
    const current = await this.get(client, scope, reservationId);
    if (current.version !== version) throw staleVersion();
    if (!['confirmed', 'checked-in'].includes(current.status)) throw conflict('RESERVATION_LOCKED', 'Only active reservations can change dates or party.');
    const quote = await this.revenue.verifyQuote(client, scope, input.quoteId, { roomId: current.roomId, ...input });
    const result = await client.query(
      `UPDATE reservations SET check_in=$4, check_out=$5, adults=$6, children=$7, total_minor=$8, currency=$9, price_snapshot=$10, quote_id=$11, rate_plan_id=$12, version=version+1, updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND version=$13 RETURNING id`,
      [reservationId, scope.organizationId, scope.propertyId, input.checkIn, input.checkOut, input.adults, input.children, quote.totalMinor, quote.currency, JSON.stringify(quote.breakdown), input.quoteId, quote.ratePlanId, version],
    );
    if (!result.rowCount) throw staleVersion();
    await emitEvent(client, scope, { type: 'reservation.changed', entityType: 'reservation', entityId: reservationId, payload: { checkIn: input.checkIn, checkOut: input.checkOut, status: current.status } });
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'reservation.changed', entityType: 'reservation', entityId: reservationId, requestId });
    return this.get(client, scope, reservationId);
  }

  async reassign(client: PoolClient, scope: TenantScope, actor: Actor, reservationId: string, version: number, roomId: string, requestId: string) {
    const current = await this.get(client, scope, reservationId);
    if (current.version !== version) throw staleVersion();
    if (current.status !== 'confirmed') throw conflict('RESERVATION_LOCKED', 'Only confirmed reservations can be reassigned.');
    const room = await client.query('SELECT 1 FROM rooms WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL AND status <> \'maintenance\'', [roomId, scope.organizationId, scope.propertyId]);
    if (!room.rowCount) throw new DomainError(422, 'ROOM_INVALID', 'The room is unavailable in this property.');
    const result = await client.query('UPDATE reservations SET room_id=$4, version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND version=$5 RETURNING id', [reservationId, scope.organizationId, scope.propertyId, roomId, version]);
    if (!result.rowCount) throw staleVersion();
    await emitEvent(client, scope, { type: 'reservation.reassigned', entityType: 'reservation', entityId: reservationId, payload: { roomId, status: current.status } });
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'reservation.reassigned', entityType: 'reservation', entityId: reservationId, requestId, metadata: { roomId } });
    return this.get(client, scope, reservationId);
  }

  async reprice(client: PoolClient, scope: TenantScope, actor: Actor, reservationId: string, version: number, quoteId: string, requestId: string) {
    const current = await this.get(client, scope, reservationId);
    if (current.version !== version) throw staleVersion();
    const quote = await this.revenue.verifyQuote(client, scope, quoteId, { roomId: current.roomId, checkIn: current.checkIn, checkOut: current.checkOut, adults: current.adults, children: current.children });
    const result = await client.query('UPDATE reservations SET total_minor=$4, currency=$5, price_snapshot=$6, quote_id=$7, rate_plan_id=$8, version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND version=$9 RETURNING id', [reservationId, scope.organizationId, scope.propertyId, quote.totalMinor, quote.currency, JSON.stringify(quote.breakdown), quoteId, quote.ratePlanId, version]);
    if (!result.rowCount) throw staleVersion();
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'reservation.repriced', entityType: 'reservation', entityId: reservationId, requestId });
    return this.get(client, scope, reservationId);
  }

  async transition(client: PoolClient, scope: TenantScope, actor: Actor, reservationId: string, target: ReservationStatus, version: number, requestId: string) {
    const locked = await client.query('SELECT status, room_id, version FROM reservations WHERE id=$1 AND organization_id=$2 AND property_id=$3 FOR UPDATE', [reservationId, scope.organizationId, scope.propertyId]);
    if (!locked.rowCount) throw notFound('Reservation');
    const current = locked.rows[0];
    if (Number(current.version) !== version) throw staleVersion();
    const from = current.status as ReservationStatus;
    if (!transitions[from].includes(target)) throw conflict('INVALID_TRANSITION', `A ${from} reservation cannot move to ${target}.`);
    const roomId = String(current.room_id);
    await client.query('UPDATE reservations SET status=$4, version=version+1, updated_at=now() WHERE id=$1 AND organization_id=$2 AND property_id=$3', [reservationId, scope.organizationId, scope.propertyId, target]);

    if (target === 'checked-in') {
      await client.query("UPDATE rooms SET status='occupied', version=version+1, updated_at=now() WHERE id=$1 AND status <> 'maintenance'", [roomId]);
    }
    if (target === 'checked-out') {
      await client.query("UPDATE rooms SET status='cleaning', version=version+1, updated_at=now() WHERE id=$1 AND status <> 'maintenance'", [roomId]);
      const existing = await client.query('SELECT 1 FROM housekeeping_tasks WHERE reservation_id=$1', [reservationId]);
      if (!existing.rowCount) {
        await client.query(
          `INSERT INTO housekeeping_tasks(organization_id, property_id, room_id, reservation_id, status, priority, due_at)
           VALUES($1,$2,$3,$4,'ready','rush',now() + interval '2 hours')`,
          [scope.organizationId, scope.propertyId, roomId, reservationId],
        );
      }
    }
    if (target === 'cancelled' || target === 'no-show') {
      const active = await client.query("SELECT 1 FROM reservations WHERE room_id=$1 AND id <> $2 AND status IN ('confirmed','checked-in') LIMIT 1", [roomId, reservationId]);
      const maintenance = await client.query("SELECT 1 FROM maintenance_blocks WHERE room_id=$1 AND status='active' LIMIT 1", [roomId]);
      if (!active.rowCount && !maintenance.rowCount) await client.query("UPDATE rooms SET status='available', version=version+1, updated_at=now() WHERE id=$1", [roomId]);
    }
    await emitEvent(client, scope, { type: `reservation.${target}`, entityType: 'reservation', entityId: reservationId, payload: { roomId, from, to: target } });
    await recordAudit(client, { scope, actor, category: 'reservation', action: `reservation.${target}`, entityType: 'reservation', entityId: reservationId, requestId, metadata: { from, to: target } });
    return this.get(client, scope, reservationId);
  }
}
