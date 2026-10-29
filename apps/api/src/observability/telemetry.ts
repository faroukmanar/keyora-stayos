import { randomBytes } from "node:crypto";
import type { MetricsService } from "./metrics";
export type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  method: string;
  status: number;
  durationMs: number;
  requestId: string;
  environment: string;
  version: string;
  timestamp: string;
};
export type ErrorRecord = {
  traceId: string;
  requestId: string;
  route: string;
  type: string;
  code: string;
  message: string;
  environment: string;
  version: string;
  timestamp: string;
};
type ExportRecord = SpanRecord | ErrorRecord;
const tracePattern = /^00-([a-f0-9]{32})-([a-f0-9]{16})-0[01]$/;
export function traceContext(header: string | undefined) {
  const match = header ? tracePattern.exec(header) : null;
  return {
    traceId: match?.[1] ?? randomBytes(16).toString("hex"),
    parentSpanId: match?.[2],
    spanId: randomBytes(8).toString("hex"),
  };
}
export function sanitizeTelemetryMessage(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_NUMBER]")
    .replace(/[\r\n]/g, " ")
    .slice(0, 300);
}
export class BufferedExporter {
  private queue: ExportRecord[] = [];
  private timer: number | null = null;
  readonly captured: ExportRecord[] = [];
  constructor(
    private readonly options: {
      mode: "disabled" | "local" | "export";
      url?: string;
      token?: string;
      metrics: MetricsService;
      kind: "trace" | "error";
    },
  ) {}
  record(value: ExportRecord) {
    if (this.options.mode === "disabled") return;
    if (this.options.mode === "local") {
      this.captured.push(value);
      return;
    }
    if (this.queue.length >= 1000) {
      this.options.metrics.droppedTelemetry.labels(this.options.kind).inc();
      return;
    }
    this.queue.push(value);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 250);
  }
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.queue.splice(0, 100);
    if (!batch.length || !this.options.url || !this.options.token) return;
    try {
      const response = await fetch(this.options.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          resource: { service: "keyora-api" },
          records: batch,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("export failed");
    } catch {
      this.options.metrics.droppedTelemetry
        .labels(this.options.kind)
        .inc(batch.length);
    }
    if (this.queue.length)
      this.timer = setTimeout(() => void this.flush(), 250);
  }
  async close() {
    await this.flush();
  }
}
