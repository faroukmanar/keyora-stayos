#!/usr/bin/env node
/**
 * Local release gate (issue #25). One command runs every check against disposable services and
 * writes evidence to .release-evidence/<sha>-<timestamp>/. No hosted CI is involved.
 *
 *   npm run release:gate                # full gate
 *   npm run release:gate -- --skip-web  # skip browser end-to-end
 *   npm run release:gate -- --native    # also run Maestro flows (needs maestro + a booted device/emulator with the dev build)
 *   npm run release:gate -- --keep-db   # leave the disposable Postgres running afterwards
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const isWindows = process.platform === 'win32';
const pgPort = process.env.KEYORA_GATE_PG_PORT ?? '55434';
const apiPort = process.env.KEYORA_GATE_API_PORT ?? '4188';
const webPort = process.env.KEYORA_GATE_WEB_PORT ?? '19188';
const composeProject = 'keyora-gate';
const databaseUrl = `postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:${pgPort}/keyora_test`;
const syntheticPassword = 'Local-Test-Only!2026';

const git = (...gitArgs) => spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).stdout.trim();
const sha = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain').length > 0;
const startedAt = new Date();
const evidenceDir = path.join(root, '.release-evidence', `${sha.slice(0, 12)}-${startedAt.toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const baseEnv = { ...process.env, MIGRATION_DATABASE_URL: databaseUrl, KEYORA_PG_PORT: pgPort, FORCE_COLOR: '0', CI: '1' };
const stages = [];
const background = [];

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
}

function run(name, command, commandArgs, env = {}) {
  return new Promise((resolve) => {
    const logPath = path.join(evidenceDir, `${String(stages.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.log`);
    const log = fs.createWriteStream(logPath);
    const started = Date.now();
    process.stdout.write(`▶ ${name} … `);
    const child = spawn(command, commandArgs, { cwd: root, env: { ...baseEnv, ...env }, shell: isWindows, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('close', (code) => {
      log.end();
      const stage = { name, command: [command, ...commandArgs].join(' '), status: code === 0 ? 'passed' : 'failed', exitCode: code, durationMs: Date.now() - started, log: path.relative(root, logPath) };
      stages.push(stage);
      console.log(`${stage.status} (${Math.round(stage.durationMs / 1000)}s)`);
      resolve(stage);
    });
  });
}

function startBackground(name, command, commandArgs, env = {}) {
  const log = fs.createWriteStream(path.join(evidenceDir, `bg-${name}.log`));
  const child = spawn(command, commandArgs, { cwd: root, env: { ...baseEnv, ...env }, shell: isWindows, detached: !isWindows, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  background.push(child);
  return child;
}

async function waitFor(url, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function main() {
  const npm = 'npm';
  const npx = 'npx';
  const required = async (name, command, commandArgs, env) => {
    const stage = await run(name, command, commandArgs, env);
    if (stage.status !== 'passed') throw new Error(`${name} failed; see ${stage.log}`);
  };

  await required('postgres (disposable)', 'docker', ['compose', '-p', composeProject, 'up', '-d', '--wait', 'postgres']);
  await required('lint', npm, ['run', '-s', 'lint']);
  await required('typecheck', npm, ['run', '-s', 'typecheck']);
  await required('contract validate', npm, ['run', '-s', 'contract:validate']);
  await required('unit (jest)', npm, ['test', '--', '--ci']);
  await required('api unit', npm, ['run', '-s', 'api:test']);
  await required('license policy', npm, ['run', '-s', 'security:licenses']);
  for (const suite of ['database', 'auth', 'security', 'notifications', 'inventory', 'reservations', 'guests', 'housekeeping', 'realtime', 'bootstrap', 'contract']) {
    await required(`integration: ${suite}`, npx, ['tsx', `apps/api/test/${suite}.integration.ts`]);
  }
  await required('api smoke', npm, ['run', '-s', 'api:smoke']);

  if (!args.has('--skip-web') || args.has('--native')) {
    // Integration suites leave the schema seeded; refresh staff credentials for end-to-end runs.
    await required('seed e2e users', npx, ['tsx', 'apps/api/src/database/seed-auth-users.ts'], { KEYORA_MOCK_PASSWORD: syntheticPassword });
    startBackground('api', npx, ['tsx', 'apps/api/src/server.ts'], { KEYORA_PROFILE: 'local', API_PORT: apiPort, DATABASE_MODE: 'required', DATABASE_URL: databaseUrl, CORS_ORIGINS: `http://localhost:${webPort}`, AUTH_RATE_LIMIT_MAX: '100', RATE_LIMIT_MAX: '5000', LOG_LEVEL: 'warn' });
    await waitFor(`http://127.0.0.1:${apiPort}/v1/ready`, 'API');
  }
  if (!args.has('--skip-web')) {
    const apiUrl = `http://localhost:${apiPort}`;
    await required('web production export', npx, ['expo', 'export', '-p', 'web', '--output-dir', 'dist-e2e'], { EXPO_PUBLIC_API_URL: apiUrl, NODE_ENV: 'production' });
    startBackground('web', npx, ['expo', 'serve', 'dist-e2e', '--port', webPort]);
    await waitFor(`http://localhost:${webPort}`, 'web build');
    await required('web end-to-end (playwright)', npx, ['playwright', 'test', '--reporter=list'], { WEB_E2E_BASE_URL: `http://localhost:${webPort}`, EXPO_PUBLIC_API_URL: apiUrl, KEYORA_E2E_PASSWORD: syntheticPassword });
  }
  if (args.has('--native')) {
    await required('native end-to-end (maestro)', 'maestro', ['test', '.maestro', '--format', 'junit', '--output', path.join(evidenceDir, 'maestro-junit.xml')], { MAESTRO_PASSWORD: syntheticPassword });
  }
}

main()
  .then(() => finish(true))
  .catch((error) => { console.error(`\n✖ ${error.message}`); finish(false); });

function finish(passed) {
  for (const child of background) killTree(child);
  if (!args.has('--keep-db')) spawnSync('docker', ['compose', '-p', composeProject, 'down', '-v'], { cwd: root, env: baseEnv, stdio: 'ignore', shell: isWindows });
  const summary = {
    sha,
    dirty,
    passed,
    scope: { web: !args.has('--skip-web'), native: args.has('--native') },
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    stages,
  };
  fs.writeFileSync(path.join(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(root, '.release-evidence', 'latest.json'), `${JSON.stringify({ ...summary, evidence: path.relative(root, evidenceDir) }, null, 2)}\n`);
  console.log(`\n${passed ? '✔ Release gate passed' : '✖ Release gate failed'} for ${sha.slice(0, 12)}${dirty ? ' (uncommitted changes present)' : ''}. Evidence: ${path.relative(root, evidenceDir)}`);
  process.exitCode = passed ? 0 : 1;
}
