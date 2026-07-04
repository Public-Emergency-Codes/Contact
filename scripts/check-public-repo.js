const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set([
  '.git', '.expo', '.gradle', '.idea', '.kotlin', 'build', 'dist', 'node_modules', '.cxx',
]);
const forbiddenExtensions = new Set(['.jks', '.keystore', '.pem', '.p12', '.hprof', '.apk', '.aab']);
const ignoredExtensions = new Set(['.log']);
const patterns = [
  { label: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: 'OpenAI key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'machine-specific Windows path', regex: /\b[A-Z]:\\(?:Users|Projects)\\/i },
  { label: 'removed private test number', regex: new RegExp(['845', '283', '4101'].join('')) },
];

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const findings = [];
for (const file of walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative === 'scripts/check-public-repo.js') continue;
  const extension = path.extname(file).toLowerCase();
  if (ignoredExtensions.has(extension)) continue;
  if (forbiddenExtensions.has(extension)) {
    findings.push(`${relative}: forbidden binary/credential extension ${extension}`);
    continue;
  }
  const data = fs.readFileSync(file);
  if (data.includes(0)) continue;
  const text = data.toString('utf8');
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) findings.push(`${relative}: ${pattern.label}`);
  }
}

if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Public repository hygiene check passed.');
}
