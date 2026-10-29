import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "@prometheus-io/client";
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram;
  readonly httpErrors: Counter;
  readonly bookingConflicts: Counter;
  readonly webhookLag: Histogram;
  readonly taskSla: Gauge;
  readonly droppedTelemetry: Counter;
  constructor(labels: { environment: string; version: string }) {
    this.registry.setDefaultLabels({ service: "keyora_api", ...labels });
    collectDefaultMetrics({ register: this.registry, prefix: "keyora_node_" });
    this.httpDuration = new Histogram({
      name: "keyora_http_request_duration_seconds",
      help: "API request latency",
      labelNames: ["method", "route", "status_class"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.httpErrors = new Counter({
      name: "keyora_http_errors_total",
      help: "API errors",
      labelNames: ["route", "code"],
      registers: [this.registry],
    });
    this.bookingConflicts = new Counter({
      name: "keyora_booking_conflicts_total",
      help: "Rejected booking conflicts",
      registers: [this.registry],
    });
    this.webhookLag = new Histogram({
      name: "keyora_webhook_lag_seconds",
      help: "Webhook event processing lag",
      labelNames: ["provider", "event_type"],
      buckets: [0.1, 0.5, 1, 5, 15, 60, 300, 900],
      registers: [this.registry],
    });
    this.taskSla = new Gauge({
      name: "keyora_housekeeping_task_sla_seconds",
      help: "Age of oldest open task",
      labelNames: ["priority"],
      registers: [this.registry],
    });
    this.droppedTelemetry = new Counter({
      name: "keyora_telemetry_dropped_total",
      help: "Telemetry records dropped because buffers were full",
      labelNames: ["kind"],
      registers: [this.registry],
    });
  }
  observeRequest(
    method: string,
    route: string,
    status: number,
    seconds: number,
  ) {
    this.httpDuration
      .labels(method, route, `${Math.floor(status / 100)}xx`)
      .observe(seconds);
    if (status >= 500) this.httpErrors.labels(route, "INTERNAL").inc();
  }
  error(route: string, code: string) {
    this.httpErrors
      .labels(route, code.replace(/[^A-Z0-9_]/gi, "_").slice(0, 60))
      .inc();
  }
  contentType() {
    return this.registry.contentType;
  }
  render() {
    return this.registry.metrics();
  }
}
