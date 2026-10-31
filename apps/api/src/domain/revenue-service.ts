import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Actor } from '../auth/types';
import { canonicalJson, DomainError, isoTimestamp, notFound, recordAudit, type TenantScope, dateOnly } from './pg';

export type QuoteInput = { roomId: string; checkIn: string; checkOut: string; adults: number; children: number; discountCode?: string };

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function nightsBetween(checkIn: string, checkOut: string) {
  return Math.round((Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`)) / 86_400_000);
}

export class RevenueService {
  constructor(private readonly signingSecret: Buffer, private readonly now = () => new Date()) {}

  private sign(payload: unknown) {
    return createHmac('sha256', this.signingSecret).update(canonicalJson(payload)).digest('hex');
  }

  async createQuote(client: PoolClient, scope: TenantScope, actor: Actor, input: QuoteInput, requestId: string) {
    const nights = nightsBetween(input.checkIn, input.checkOut);
    if (!Number.isInteger(nights) || nights < 1 || nights > 365) throw new DomainError(422, 'INVALID_STAY', 'The stay must be between one and 365 nights.');
    const room = await client.query(
      `SELECT r.id, rt.id AS room_type_id, rt.capacity, p.currency, p.timezone
       FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id JOIN properties p ON p.id=r.property_id
       WHERE r.id=$1 AND r.organization_id=$2 AND r.property_id=$3 AND r.archived_at IS NULL`,
      [input.roomId, scope.organizationId, scope.propertyId],
    );
    if (!room.rowCount) throw notFound('Room');
    const property = room.rows[0];
    if (input.adults + input.children > Number(property.capacity)) throw new DomainError(422, 'CAPACITY_EXCEEDED', 'The party exceeds the room capacity.');
    const blocked = await client.query(
      `SELECT 1 FROM maintenance_blocks WHERE room_id=$1 AND organization_id=$2 AND property_id=$3 AND status='active'
       AND starts_at < ($5::date + interval '1 day') AND ends_at > $4::date LIMIT 1`,
      [input.roomId, scope.organizationId, scope.propertyId, input.checkIn, input.checkOut],
    );
    if (blocked.rowCount) throw new DomainError(409, 'ROOM_UNAVAILABLE', 'The room is blocked for maintenance during the requested stay.');

    const planResult = await client.query(
      `SELECT rp.* FROM rate_plans rp WHERE rp.organization_id=$1 AND rp.property_id=$2 AND rp.room_type_id=$3 AND rp.active
       ORDER BY rp.created_at LIMIT 1`,
      [scope.organizationId, scope.propertyId, property.room_type_id],
    );
    if (!planResult.rowCount) throw new DomainError(409, 'RATE_UNAVAILABLE', 'No active rate plan exists for this room type.');
    const plan = planResult.rows[0];
    const calendar = await client.query(
      'SELECT * FROM rate_plan_calendar WHERE rate_plan_id=$1 AND stay_date >= $2::date AND stay_date < $3::date ORDER BY stay_date',
      [plan.id, input.checkIn, input.checkOut],
    );
    const byDate = new Map(calendar.rows.map((row) => [dateOnly(row.stay_date), row]));
    const nightly: Array<{ date: string; amountMinor: number }> = [];
    for (let index = 0; index < nights; index += 1) {
      const date = addDays(input.checkIn, index);
      const override = byDate.get(date);
      if ((override?.stop_sell ?? plan.stop_sell) === true) throw new DomainError(409, 'SOLD_OUT', 'The room is closed for sale on one of the requested nights.');
      if (index === 0 && (override?.closed_to_arrival ?? plan.closed_to_arrival)) throw new DomainError(409, 'CLOSED_TO_ARRIVAL', 'Arrival is not allowed on the requested date.');
      if (index === nights - 1 && (override?.closed_to_departure ?? plan.closed_to_departure)) throw new DomainError(409, 'CLOSED_TO_DEPARTURE', 'Departure is not allowed on the requested date.');
      nightly.push({ date, amountMinor: Number(override?.amount_minor ?? plan.amount_minor) });
    }
    const minStay = Math.max(...nightly.map((line) => Number(byDate.get(line.date)?.min_stay ?? plan.min_stay ?? 1)));
    const maxStay = Math.min(...nightly.map((line) => Number(byDate.get(line.date)?.max_stay ?? plan.max_stay ?? 365)));
    if (nights < minStay) throw new DomainError(409, 'MIN_STAY', `This rate requires at least ${minStay} nights.`);
    if (nights > maxStay) throw new DomainError(409, 'MAX_STAY', `This rate allows at most ${maxStay} nights.`);

    const subtotal = nightly.reduce((sum, line) => sum + line.amountMinor, 0);
    const taxRows = await client.query('SELECT * FROM taxes_fees WHERE organization_id=$1 AND property_id=$2 AND active ORDER BY name', [scope.organizationId, scope.propertyId]);
    const taxes = taxRows.rows.map((row) => {
      const amount = row.calculation === 'percent'
        ? Math.round(subtotal * Number(row.basis_points) / 10_000)
        : Number(row.amount_minor) * (row.applies_per === 'night' ? nights : 1);
      return { id: String(row.id), name: String(row.name), kind: String(row.kind), amountMinor: amount };
    });

    let discount = { code: null as string | null, amountMinor: 0 };
    if (input.discountCode) {
      const found = await client.query(
        `SELECT * FROM discount_codes WHERE organization_id=$1 AND property_id=$2 AND code=$3 AND active
         AND starts_on <= $4 AND ends_on >= $4 AND min_nights <= $5 AND (max_redemptions IS NULL OR redemptions < max_redemptions)`,
        [scope.organizationId, scope.propertyId, input.discountCode, input.checkIn, nights],
      );
      if (!found.rowCount) throw new DomainError(409, 'DISCOUNT_INVALID', 'The discount code is not valid for this stay.');
      discount = { code: input.discountCode, amountMinor: Math.round(subtotal * Number(found.rows[0].percent_basis_points) / 10_000) };
    }

    const total = subtotal + taxes.reduce((sum, tax) => sum + tax.amountMinor, 0) - discount.amountMinor;
    const quoteId = randomUUID();
    const expiresAt = new Date(this.now().getTime() + 15 * 60 * 1000);
    const breakdown = {
      nights: nightly,
      subtotalMinor: subtotal,
      taxes: taxes.map((tax) => ({ name: tax.name, kind: tax.kind, amountMinor: tax.amountMinor })),
      discount: discount.code ? { code: discount.code, amountMinor: discount.amountMinor } : null,
      totalMinor: total,
      currency: String(property.currency),
      timezone: String(property.timezone),
      ratePlanId: String(plan.id),
    };
    const signingPayload = { quoteId, organizationId: scope.organizationId, propertyId: scope.propertyId, roomId: input.roomId, checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, children: input.children, totalMinor: total, currency: property.currency, expiresAt: expiresAt.toISOString(), breakdown };
    const signature = this.sign(signingPayload);
    await client.query(
      `INSERT INTO quotes(id, organization_id, property_id, room_id, rate_plan_id, check_in, check_out, adults, children, currency, total_minor, breakdown, signature, discount_code, expires_at, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [quoteId, scope.organizationId, scope.propertyId, input.roomId, plan.id, input.checkIn, input.checkOut, input.adults, input.children, property.currency, total, JSON.stringify(breakdown), signature, discount.code, expiresAt, actor.id],
    );
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'quote.created', entityType: 'quote', entityId: quoteId, requestId, metadata: { roomId: input.roomId, nights, totalMinor: total } });
    return { id: quoteId, roomId: input.roomId, checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, children: input.children, total: { amountMinor: total, currency: String(property.currency) }, breakdown, expiresAt: expiresAt.toISOString() };
  }

  async verifyQuote(client: PoolClient, scope: TenantScope, quoteId: string, expected: { roomId: string; checkIn: string; checkOut: string; adults: number; children: number }) {
    const result = await client.query('SELECT * FROM quotes WHERE id=$1 AND organization_id=$2 AND property_id=$3', [quoteId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw new DomainError(422, 'QUOTE_INVALID', 'The quote does not exist in this property.');
    const quote = result.rows[0];
    if (new Date(isoTimestamp(quote.expires_at)) <= this.now()) throw new DomainError(409, 'QUOTE_EXPIRED', 'The quote expired. Request a new price.');
    if (String(quote.room_id) !== expected.roomId || dateOnly(quote.check_in) !== expected.checkIn || dateOnly(quote.check_out) !== expected.checkOut || Number(quote.adults) !== expected.adults || Number(quote.children) !== expected.children) {
      throw new DomainError(422, 'QUOTE_MISMATCH', 'The quote does not match the requested stay.');
    }
    const signature = this.sign({ quoteId, organizationId: scope.organizationId, propertyId: scope.propertyId, roomId: String(quote.room_id), checkIn: expected.checkIn, checkOut: expected.checkOut, adults: Number(quote.adults), children: Number(quote.children), totalMinor: Number(quote.total_minor), currency: quote.currency, expiresAt: isoTimestamp(quote.expires_at), breakdown: quote.breakdown });
    const actual = Buffer.from(String(quote.signature), 'hex');
    const expectedSignature = Buffer.from(signature, 'hex');
    if (actual.length !== expectedSignature.length || !timingSafeEqual(actual, expectedSignature)) {
      throw new DomainError(422, 'QUOTE_TAMPERED', 'The quote signature is invalid.');
    }
    return { id: quoteId, ratePlanId: String(quote.rate_plan_id), totalMinor: Number(quote.total_minor), currency: String(quote.currency), breakdown: quote.breakdown, expiresAt: new Date(isoTimestamp(quote.expires_at)) };
  }

  async getQuote(client: PoolClient, scope: TenantScope, quoteId: string) {
    const result = await client.query('SELECT * FROM quotes WHERE id=$1 AND organization_id=$2 AND property_id=$3', [quoteId, scope.organizationId, scope.propertyId]);
    if (!result.rowCount) throw notFound('Quote');
    const row = result.rows[0];
    return { id: String(row.id), roomId: String(row.room_id), checkIn: dateOnly(row.check_in), checkOut: dateOnly(row.check_out), adults: Number(row.adults), children: Number(row.children), total: { amountMinor: Number(row.total_minor), currency: String(row.currency) }, breakdown: row.breakdown, expiresAt: isoTimestamp(row.expires_at) };
  }

  async listRatePlans(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT rp.*, rt.name AS room_type FROM rate_plans rp JOIN room_types rt ON rt.id=rp.room_type_id WHERE rp.organization_id=$1 AND rp.property_id=$2 ORDER BY rp.name', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), roomTypeId: String(row.room_type_id), roomType: String(row.room_type), name: String(row.name), amountMinor: Number(row.amount_minor), currency: String(row.currency), active: Boolean(row.active), minStay: Number(row.min_stay), maxStay: row.max_stay ? Number(row.max_stay) : null, stopSell: Boolean(row.stop_sell), closedToArrival: Boolean(row.closed_to_arrival), closedToDeparture: Boolean(row.closed_to_departure), cancellationPolicyId: row.cancellation_policy_id ? String(row.cancellation_policy_id) : null }));
  }

  async setRateCalendar(client: PoolClient, scope: TenantScope, actor: Actor, planId: string, entries: Array<{ stayDate: string; amountMinor: number; minStay?: number | null; maxStay?: number | null; stopSell?: boolean; closedToArrival?: boolean; closedToDeparture?: boolean }>, requestId: string) {
    const plan = await client.query('SELECT 1 FROM rate_plans WHERE id=$1 AND organization_id=$2 AND property_id=$3', [planId, scope.organizationId, scope.propertyId]);
    if (!plan.rowCount) throw notFound('Rate plan');
    for (const entry of entries) {
      await client.query(
        `INSERT INTO rate_plan_calendar(organization_id, property_id, rate_plan_id, stay_date, amount_minor, min_stay, max_stay, stop_sell, closed_to_arrival, closed_to_departure)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(rate_plan_id, stay_date) DO UPDATE SET amount_minor=EXCLUDED.amount_minor, min_stay=EXCLUDED.min_stay, max_stay=EXCLUDED.max_stay,
           stop_sell=EXCLUDED.stop_sell, closed_to_arrival=EXCLUDED.closed_to_arrival, closed_to_departure=EXCLUDED.closed_to_departure, updated_at=now()`,
        [scope.organizationId, scope.propertyId, planId, entry.stayDate, entry.amountMinor, entry.minStay ?? null, entry.maxStay ?? null, entry.stopSell ?? false, entry.closedToArrival ?? false, entry.closedToDeparture ?? false],
      );
    }
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'rate.calendar_updated', entityType: 'rate_plan', entityId: planId, requestId, metadata: { entries: entries.length } });
  }

  async listTaxes(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT * FROM taxes_fees WHERE organization_id=$1 AND property_id=$2 ORDER BY name', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), kind: String(row.kind), calculation: String(row.calculation), basisPoints: row.basis_points === null ? null : Number(row.basis_points), amountMinor: row.amount_minor === null ? null : Number(row.amount_minor), appliesPer: String(row.applies_per), active: Boolean(row.active) }));
  }

  async listDiscounts(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT * FROM discount_codes WHERE organization_id=$1 AND property_id=$2 ORDER BY code', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), code: String(row.code), percentBasisPoints: Number(row.percent_basis_points), startsOn: dateOnly(row.starts_on), endsOn: dateOnly(row.ends_on), minNights: Number(row.min_nights), redemptions: Number(row.redemptions), active: Boolean(row.active) }));
  }

  async createRatePlan(client: PoolClient, scope: TenantScope, actor: Actor, input: { roomTypeId: string; name: string; amountMinor: number; currency: string; minStay: number; maxStay?: number | null; stopSell?: boolean; closedToArrival?: boolean; closedToDeparture?: boolean; cancellationPolicyId?: string | null }, requestId: string) {
    const roomType = await client.query('SELECT 1 FROM room_types WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND archived_at IS NULL', [input.roomTypeId, scope.organizationId, scope.propertyId]);
    if (!roomType.rowCount) throw new DomainError(422, 'ROOM_TYPE_INVALID', 'The room type is not active in this property.');
    if (input.cancellationPolicyId) {
      const policy = await client.query('SELECT 1 FROM cancellation_policies WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND active', [input.cancellationPolicyId, scope.organizationId, scope.propertyId]);
      if (!policy.rowCount) throw new DomainError(422, 'CANCELLATION_POLICY_INVALID', 'The cancellation policy is not active in this property.');
    }
    const result = await client.query(
      `INSERT INTO rate_plans(organization_id, property_id, room_type_id, name, amount_minor, currency, min_stay, max_stay, stop_sell, closed_to_arrival, closed_to_departure, cancellation_policy_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.roomTypeId, input.name, input.amountMinor, input.currency, input.minStay, input.maxStay ?? null, input.stopSell ?? false, input.closedToArrival ?? false, input.closedToDeparture ?? false, input.cancellationPolicyId ?? null],
    );
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'rate.plan_created', entityType: 'rate_plan', entityId: String(result.rows[0].id), requestId });
    return (await this.listRatePlans(client, scope)).find((plan) => plan.id === String(result.rows[0].id))!;
  }

  async updateRatePlan(client: PoolClient, scope: TenantScope, actor: Actor, planId: string, input: { name?: string; amountMinor?: number; active?: boolean; minStay?: number; maxStay?: number | null; stopSell?: boolean }, requestId: string) {
    const result = await client.query(
      `UPDATE rate_plans SET name=COALESCE($4,name), amount_minor=COALESCE($5,amount_minor), active=COALESCE($6,active), min_stay=COALESCE($7,min_stay),
         max_stay=CASE WHEN $8::boolean THEN $9 ELSE max_stay END, stop_sell=COALESCE($10,stop_sell), updated_at=now()
       WHERE id=$1 AND organization_id=$2 AND property_id=$3 RETURNING id`,
      [planId, scope.organizationId, scope.propertyId, input.name ?? null, input.amountMinor ?? null, input.active ?? null, input.minStay ?? null, input.maxStay !== undefined, input.maxStay ?? null, input.stopSell ?? null],
    );
    if (!result.rowCount) throw notFound('Rate plan');
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'rate.plan_updated', entityType: 'rate_plan', entityId: planId, requestId });
    return (await this.listRatePlans(client, scope)).find((plan) => plan.id === planId)!;
  }

  async createTax(client: PoolClient, scope: TenantScope, actor: Actor, input: { name: string; kind: 'tax' | 'fee'; calculation: 'percent' | 'fixed'; basisPoints?: number | null; amountMinor?: number | null; appliesPer: 'stay' | 'night' }, requestId: string) {
    const result = await client.query(
      `INSERT INTO taxes_fees(organization_id, property_id, name, kind, calculation, basis_points, amount_minor, applies_per)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.name, input.kind, input.calculation, input.basisPoints ?? null, input.amountMinor ?? null, input.appliesPer],
    );
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'rate.tax_created', entityType: 'tax_fee', entityId: String(result.rows[0].id), requestId });
    return (await this.listTaxes(client, scope)).find((tax) => tax.id === String(result.rows[0].id))!;
  }

  async createDiscount(client: PoolClient, scope: TenantScope, actor: Actor, input: { code: string; percentBasisPoints: number; startsOn: string; endsOn: string; minNights: number; maxRedemptions?: number | null }, requestId: string) {
    const result = await client.query(
      `INSERT INTO discount_codes(organization_id, property_id, code, percent_basis_points, starts_on, ends_on, min_nights, max_redemptions)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.code, input.percentBasisPoints, input.startsOn, input.endsOn, input.minNights, input.maxRedemptions ?? null],
    );
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'rate.discount_created', entityType: 'discount_code', entityId: String(result.rows[0].id), requestId });
    return (await this.listDiscounts(client, scope)).find((discount) => discount.id === String(result.rows[0].id))!;
  }

  async listCancellationPolicies(client: PoolClient, scope: TenantScope) {
    const result = await client.query('SELECT * FROM cancellation_policies WHERE organization_id=$1 AND property_id=$2 AND active ORDER BY name', [scope.organizationId, scope.propertyId]);
    return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), freeUntilHours: Number(row.free_until_hours), penaltyBasisPoints: Number(row.penalty_basis_points), noShowBasisPoints: Number(row.no_show_basis_points) }));
  }

  async createCancellationPolicy(client: PoolClient, scope: TenantScope, actor: Actor, input: { name: string; freeUntilHours: number; penaltyBasisPoints: number; noShowBasisPoints: number }, requestId: string) {
    const result = await client.query(
      `INSERT INTO cancellation_policies(organization_id, property_id, name, free_until_hours, penalty_basis_points, no_show_basis_points) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [scope.organizationId, scope.propertyId, input.name, input.freeUntilHours, input.penaltyBasisPoints, input.noShowBasisPoints],
    );
    await recordAudit(client, { scope, actor, category: 'reservation', action: 'rate.cancellation_policy_created', entityType: 'cancellation_policy', entityId: String(result.rows[0].id), requestId });
    return (await this.listCancellationPolicies(client, scope)).find((policy) => policy.id === String(result.rows[0].id))!;
  }
}
