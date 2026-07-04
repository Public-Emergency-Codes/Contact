const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const overrides = {
  'qrcode-terminal': 'Apache-2.0',
  requireg: 'MIT',
};
const counts = new Map();
const missing = [];

for (const [packagePath, metadata] of Object.entries(lock.packages || {})) {
  if (!packagePath.startsWith('node_modules/')) continue;
  const name = packagePath.slice('node_modules/'.length);
  const license = metadata.license || overrides[name];
  if (!license) {
    missing.push(name);
    continue;
  }
  counts.set(license, (counts.get(license) || 0) + 1);
}

for (const [license, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${license}: ${count}`);
}

if (missing.length) {
  console.error(`Dependencies without declared or reviewed licenses:\n${missing.sort().join('\n')}`);
  process.exitCode = 1;
}
