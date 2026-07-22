const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const keystoreProperties = path.join(root, 'android', 'keystore.properties');

if (!fs.existsSync(keystoreProperties)) {
  console.error('Google Play bundle build stopped: android/keystore.properties is missing.');
  console.error('Copy android/keystore.properties.example, point it at a private upload key, and try again.');
  process.exit(1);
}

const verify = spawnSync(process.execPath, [path.join(__dirname, 'verify-native-android.js')], {
  cwd: root,
  stdio: 'inherit',
});
if (verify.status !== 0) process.exit(verify.status ?? 1);

const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradleCommand, [':app:bundleRelease', '--no-daemon'], {
  cwd: path.join(root, 'android'),
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
