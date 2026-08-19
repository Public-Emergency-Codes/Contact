const { spawnSync } = require('node:child_process');

// image-size is used only by Metro while bundling trusted repository assets.
// As of 2026-08-18, upstream has no patched release for these two parser DoS
// advisories. Keep the exception narrow so every unrelated high-severity
// advisory continues to fail CI.
const allowedAdvisories = new Set([
  'GHSA-w3rx-r6r6-pgpr',
  'GHSA-5p2g-fcmc-qvqq',
]);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['audit', '--audit-level=high', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout || 'npm audit returned invalid JSON.\n');
  process.exit(result.status || 1);
}

if (report.error) {
  process.stderr.write(`${report.error.summary || 'npm audit failed'}\n`);
  process.exit(result.status || 1);
}

const vulnerabilities = report.vulnerabilities || {};
const memo = new Map();

function isAllowed(name, visiting = new Set()) {
  if (memo.has(name)) return memo.get(name);
  // npm reports dependency cycles (for example Metro's packages reference one
  // another). Revisiting a node adds no new advisory; direct advisory objects
  // encountered anywhere else in the traversal still decide whether it blocks.
  if (visiting.has(name)) return true;
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return false;

  const nextVisiting = new Set(visiting).add(name);
  const allowed = vulnerability.via.length > 0 && vulnerability.via.every(via => {
    if (typeof via === 'string') return isAllowed(via, nextVisiting);
    const advisoryId = via.url?.split('/').pop();
    return allowedAdvisories.has(advisoryId);
  });
  memo.set(name, allowed);
  return allowed;
}

const blocking = Object.keys(vulnerabilities).filter(name => !isAllowed(name));
const excepted = Object.keys(vulnerabilities).filter(name => isAllowed(name));

if (excepted.length > 0) {
  console.warn(`Accepted build-only image-size advisories through: ${excepted.join(', ')}`);
}

if (blocking.length > 0) {
  console.error(`Blocking npm audit findings: ${blocking.join(', ')}`);
  process.exit(1);
}

console.log('No unexcepted high-severity npm audit findings.');
