# Observability and incident queries

The API emits structured JSON logs with service, environment, version, correlation ID, method, route pattern, and status. Authorization/cookie headers, bodies, passwords, tokens, secrets, and response cookies are redacted. Metrics use bounded labels only—never tenant, guest, room, reservation, email, or arbitrary URLs. W3C `traceparent` is accepted and returned; exported spans contain route patterns, never query strings or bodies. Error events redact emails, bearer values, and card-like digit sequences before entering a bounded asynchronous exporter.

Production startup requires export mode, HTTPS trace/error endpoints and credentials, and a non-placeholder metrics bearer token. Export queues hold at most 1,000 records, flush in batches without blocking requests, and increment `keyora_telemetry_dropped_total` instead of exhausting memory. Audit metadata rejects sensitive key names and long values. PostgreSQL prevents update/delete of audit rows with an immutable trigger.

## Local stack

1. Start the API with `OBSERVABILITY_MODE=export`, `TRACE_EXPORT_URL=http://127.0.0.1:8686`, `ERROR_REPORT_URL=http://127.0.0.1:8686`, local non-production exporter tokens, and the metrics token from `ops/observability/prometheus.yml`.
2. Run `docker compose -f ops/observability/compose.yaml up -d`.
3. Open Grafana on `http://127.0.0.1:3000`; Prometheus is on port 9090 and Loki on 3100. These ports are loopback-only and credentials are explicitly local-only.
4. Stop with `docker compose -f ops/observability/compose.yaml down`.

## Incident queries

- P95 latency: `histogram_quantile(0.95, sum by (le,route) (rate(keyora_http_request_duration_seconds_bucket[5m])))`
- Error rate: `sum by (route,code) (rate(keyora_http_errors_total[5m]))`
- Booking conflicts: `increase(keyora_booking_conflicts_total[15m])`
- Provider lag: `histogram_quantile(0.95, sum by (le,provider,event_type) (rate(keyora_webhook_lag_seconds_bucket[10m])))`
- Rush task SLA: `keyora_housekeeping_task_sla_seconds{priority="rush"}`
- Trace lookup in Loki: `{service="keyora-api",kind="trace"} |= "<trace-id>"`
- Privacy-safe error lookup: `{service="keyora-api",kind="error"} | json | code="INTERNAL_ERROR"`
- Authentication denials in PostgreSQL: `SELECT occurred_at, action, outcome, request_id, trace_id FROM audit_events WHERE category='authentication' AND outcome<>'succeeded' ORDER BY occurred_at DESC LIMIT 100;`
- Permission denials: same query with `category='permission' AND outcome='denied'`.

Run `npm run observability:test` for immutable audit/redaction/metrics/trace integration and `npm run api:performance` for the local 1,000-request latency/throughput budget. Alerts are defined in `ops/observability/alerts.yml`.
