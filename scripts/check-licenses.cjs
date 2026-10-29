const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const forbidden = /(?:^|\s|\()(?:(?:A|L)?GPL|SSPL|BUSL)(?:-|\s|\)|$)/i;
const permissive = /\b(?:MIT|ISC|BSD-[234]-Clause|Apache-2\.0|MPL-2\.0|0BSD|Unlicense)\b/i;
const unknown = [];
const denied = [];

for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  if (!location || !location.startsWith('node_modules/')) continue;
  const license = typeof metadata.license === 'string' ? metadata.license : '';
  if (!license) unknown.push(location.replace(/^node_modules\//, ''));
  else if (forbidden.test(license) && !(license.includes(' OR ') && permissive.test(license))) denied.push(`${location.replace(/^node_modules\//, '')}: ${license}`);
}

if (denied.length) {
  console.error(`Forbidden dependency licenses:\n${denied.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`License policy passed for ${Object.keys(lock.packages ?? {}).length - 1} locked packages; ${unknown.length} package records require upstream metadata review.`);
}
