import assert from "node:assert/strict";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
async function main() {
  const app = await buildApp(loadConfig({ KEYORA_PROFILE: "test" }));
  const total = 1000,
    concurrency = 50,
    durations: number[] = [];
  const started = performance.now();
  try {
    for (let offset = 0; offset < total; offset += concurrency)
      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, total - offset) },
          async () => {
            const before = performance.now();
            const response = await app.inject({
              method: "GET",
              url: "/v1/health",
            });
            durations.push(performance.now() - before);
            assert.equal(response.statusCode, 200);
          },
        ),
      );
  } finally {
    await app.close();
  }
  durations.sort((a, b) => a - b);
  const elapsed = (performance.now() - started) / 1000,
    p95 = durations[Math.floor(durations.length * 0.95)],
    rps = total / elapsed;
  assert.ok(p95 < 100, `p95 ${p95.toFixed(2)}ms exceeds 100ms local budget`);
  assert.ok(
    rps > 500,
    `throughput ${rps.toFixed(0)} req/s below 500 req/s local budget`,
  );
  console.log(
    `API performance passed: ${total} requests, ${concurrency} concurrency, p95=${p95.toFixed(2)}ms, throughput=${rps.toFixed(0)} req/s.`,
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
