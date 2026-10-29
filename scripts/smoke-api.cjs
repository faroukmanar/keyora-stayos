const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = 4199;
const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], {
  cwd: root,
  env: { ...process.env, KEYORA_PROFILE: 'local', API_HOST: '127.0.0.1', API_PORT: String(port), LOG_LEVEL: 'silent' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let diagnostics = '';
child.stdout.on('data', (chunk) => { diagnostics += chunk.toString(); });
child.stderr.on('data', (chunk) => { diagnostics += chunk.toString(); });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchUntilReady(pathname) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
      if (response.ok) return response;
      lastError = new Error(`${pathname} returned ${response.status}`);
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw lastError ?? new Error(`${pathname} did not become ready`);
}

(async () => {
  try {
    const health = await fetchUntilReady('/v1/health');
    const ready = await fetchUntilReady('/v1/ready');
    const healthBody = await health.json();
    const readyBody = await ready.json();
    if (!health.headers.get('x-request-id')) throw new Error('missing x-request-id');
    if (healthBody.status !== 'ok' || readyBody.status !== 'ready') throw new Error('unexpected probe response');
    console.log(`API smoke passed: health=${healthBody.status}, readiness=${readyBody.status}, version=${healthBody.version}`);
  } catch (error) {
    console.error(diagnostics);
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3_000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
})();
