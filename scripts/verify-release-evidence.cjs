#!/usr/bin/env node
/**
 * Refuses a release unless saved gate evidence exists for the exact commit being released.
 *   npm run release:verify             # checks HEAD
 *   node scripts/verify-release-evidence.cjs <sha> [--max-age-hours=24] [--require-native]
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.find((value) => value.startsWith(`--${name}`));
const maxAgeHours = Number(flag('max-age-hours')?.split('=')[1] ?? 24);
const requireNative = Boolean(flag('require-native'));
const target = argv.find((value) => !value.startsWith('--')) ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const evidenceRoot = path.join(root, '.release-evidence');

const fail = (message) => { console.error(`✖ Release evidence check failed: ${message}`); process.exit(1); };
if (!fs.existsSync(evidenceRoot)) fail('no .release-evidence directory. Run `npm run release:gate` first.');

const candidates = fs.readdirSync(evidenceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(target.slice(0, 12)))
  .map((entry) => {
    try { return { dir: entry.name, summary: JSON.parse(fs.readFileSync(path.join(evidenceRoot, entry.name, 'summary.json'), 'utf8')) }; } catch { return null; }
  })
  .filter((item) => item && item.summary.sha === target)
  .sort((a, b) => b.summary.finishedAt.localeCompare(a.summary.finishedAt));

if (!candidates.length) fail(`no gate run recorded for ${target.slice(0, 12)}.`);
const passing = candidates.find(({ summary }) => summary.passed && !summary.dirty && summary.scope.web && (!requireNative || summary.scope.native));
if (!passing) fail(`runs exist for ${target.slice(0, 12)} but none passed on a clean tree with web end-to-end${requireNative ? ' and native flows' : ''}.`);
const ageHours = (Date.now() - Date.parse(passing.summary.finishedAt)) / 3_600_000;
if (ageHours > maxAgeHours) fail(`latest passing evidence is ${ageHours.toFixed(1)}h old (limit ${maxAgeHours}h). Re-run the gate.`);
console.log(`✔ Release evidence OK for ${target.slice(0, 12)}: .release-evidence/${passing.dir} (${passing.summary.stages.length} stages, ${ageHours.toFixed(1)}h old${passing.summary.scope.native ? ', native included' : ', native not run'}).`);
