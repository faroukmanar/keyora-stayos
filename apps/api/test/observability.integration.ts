import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { migrate } from "../src/database/migrate";
import { seed } from "../src/database/seed";
import { AuditService, type AuditCategory } from "../src/observability/audit";
import { MetricsService } from "../src/observability/metrics";
import { BufferedExporter } from "../src/observability/telemetry";
const connectionString =
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://keyora_owner@127.0.0.1:54329/keyora_test";
const organizationId = "10000000-0000-4000-8000-000000000001",
  propertyId = "10000000-0000-4000-8000-000000000002",
  userId = "10000000-0000-4000-8000-000000000003";
async function main() {
  await migrate("down", { all: true, connectionString });
  await migrate("up", { all: true, connectionString });
  await seed(connectionString);
  const pool = new pg.Pool({ connectionString, max: 5 });
  const audit = new AuditService(pool);
  const categories: AuditCategory[] = [
    "authentication",
    "permission",
    "reservation",
    "room",
    "payment",
    "export",
  ];
  for (const category of categories)
    await audit.record({
      organizationId,
      propertyId,
      actorUserId: userId,
      category,
      action: `${category}.test_action`,
      outcome: category === "permission" ? "denied" : "succeeded",
      entityType: "test",
      requestId: `70000000-0000-4000-8000-${String(categories.indexOf(category) + 1).padStart(12, "0")}`,
      traceId: "a".repeat(32),
      metadata: { status: "synthetic", count: 1 },
    });
  await assert.rejects(
    audit.record({
      organizationId,
      propertyId,
      category: "export",
      action: "export.invalid",
      outcome: "failed",
      entityType: "guest",
      requestId: "70000000-0000-4000-8000-000000000099",
      metadata: { guestEmail: "pii@example.test" },
    }),
    /Sensitive/,
  );
  const admin = await pool.connect();
  try {
    const rows = await admin.query(
      "SELECT category,outcome FROM audit_events ORDER BY id",
    );
    assert.deepEqual(
      rows.rows.map((row) => row.category),
      categories,
    );
    await assert.rejects(
      admin.query(
        "UPDATE audit_events SET outcome='failed' WHERE id=(SELECT min(id) FROM audit_events)",
      ),
      /append-only/,
    );
    await assert.rejects(
      admin.query("DELETE FROM audit_events"),
      /append-only/,
    );
  } finally {
    admin.release();
  }
  const config = loadConfig({
    KEYORA_PROFILE: "test",
    OBSERVABILITY_MODE: "local",
    METRICS_TOKEN: "metrics-token-for-local-integration-123",
  });
  const metrics = new MetricsService({
    environment: "test",
    version: "integration",
  });
  const traces = new BufferedExporter({
    mode: "local",
    metrics,
    kind: "trace",
  });
  const errors = new BufferedExporter({
    mode: "local",
    metrics,
    kind: "error",
  });
  const app = await buildApp(config, {
    metrics,
    traceExporter: traces,
    errorExporter: errors,
  });
  app.get("/test/error", async () => {
    throw new Error(
      "Failure for guest@example.test Bearer abc.def.ghi 4111 1111 1111 1111",
    );
  });
  try {
    const traceId = "b".repeat(32),
      parent = "c".repeat(16);
    const health = await app.inject({
      method: "GET",
      url: "/v1/health?secret=not-recorded",
      headers: { traceparent: `00-${traceId}-${parent}-01` },
    });
    assert.equal(health.statusCode, 200);
    assert.match(
      String(health.headers.traceparent),
      new RegExp(`^00-${traceId}-[a-f0-9]{16}-01$`),
    );
    const denied = await app.inject({
      method: "GET",
      url: "/internal/metrics",
    });
    assert.equal(denied.statusCode, 401);
    metrics.bookingConflicts.inc();
    metrics.webhookLag.labels("primary", "notification").observe(2);
    metrics.taskSla.labels("rush").set(120);
    const scrape = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { authorization: `Bearer ${config.metricsToken}` },
    });
    assert.equal(scrape.statusCode, 200);
    assert.match(scrape.body, /keyora_http_request_duration_seconds/);
    assert.match(scrape.body, /keyora_booking_conflicts_total\{[^}]+\} 1/);
    assert.match(scrape.body, /keyora_webhook_lag_seconds/);
    assert.match(scrape.body, /keyora_housekeeping_task_sla_seconds/);
    const failure = await app.inject({ method: "GET", url: "/test/error" });
    assert.equal(failure.statusCode, 500);
    assert.equal(errors.captured.length, 1);
    const report = errors.captured[0] as { message: string };
    assert.equal(report.message.includes("example.test"), false);
    assert.equal(report.message.includes("4111"), false);
    assert.equal(report.message.includes("abc.def"), false);
    assert.ok(traces.captured.length >= 3);
    assert.equal(
      JSON.stringify(traces.captured).includes("not-recorded"),
      false,
    );
    console.log(
      "Observability integration passed: immutable audits, redaction, correlation, W3C traces, protected metrics, and required signals.",
    );
  } finally {
    await app.close();
    await pool.end();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
