import type { Pool, PoolClient } from "pg";
import type { Actor } from "../auth/types";
export type AuditCategory =
  | "authentication"
  | "permission"
  | "reservation"
  | "room"
  | "payment"
  | "export"
  | "operations";
export type AuditOutcome = "succeeded" | "denied" | "failed";
export type AuditInput = {
  organizationId: string;
  propertyId: string;
  actorUserId?: string;
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  entityType: string;
  entityId?: string;
  requestId: string;
  traceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};
const forbidden =
  /email|phone|name|password|token|secret|cookie|authorization|card|address|note/i;
export class AuditService {
  constructor(private readonly pool: Pool) {}
  private async tx<T>(input: AuditInput, work: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE keyora_app");
      await c.query(
        "SELECT set_config('app.organization_id',$1,true),set_config('app.property_id',$2,true)",
        [input.organizationId, input.propertyId],
      );
      const result = await work(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async record(input: AuditInput) {
    if (!/^[a-z][a-z0-9_.-]{2,119}$/.test(input.action))
      throw new Error("Invalid audit action");
    const metadata = input.metadata ?? {};
    for (const [key, value] of Object.entries(metadata)) {
      if (forbidden.test(key))
        throw new Error(`Sensitive audit metadata key rejected: ${key}`);
      if (typeof value === "string" && value.length > 200)
        throw new Error("Audit metadata values are limited to 200 characters");
    }
    await this.tx(input, (c) =>
      c.query(
        `INSERT INTO audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,request_id,metadata,category,outcome,trace_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.organizationId,
          input.propertyId,
          input.actorUserId ?? null,
          input.action,
          input.entityType,
          input.entityId ?? null,
          input.requestId,
          JSON.stringify(metadata),
          input.category,
          input.outcome,
          input.traceId ?? null,
        ],
      ),
    );
  }
  fromActor(
    actor: Actor,
    input: Omit<AuditInput, "organizationId" | "propertyId" | "actorUserId">,
  ) {
    return this.record({
      ...input,
      organizationId: actor.organizationId,
      propertyId: actor.propertyId,
      actorUserId: actor.id,
    });
  }
}
