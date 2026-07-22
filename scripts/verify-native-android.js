const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/com/contact/app/MainApplication.kt',
  'android/app/src/main/java/com/contact/app/PackageRegistry.kt',
  'android/app/src/main/java/com/contact/app/DirectSmsModule.kt',
  'android/app/src/main/java/com/contact/app/EmergencySwitchInCallService.kt',
  'android/app/src/main/java/com/contact/app/InCallModule.kt',
  'android/app/src/main/res/layout/activity_in_call_ui.xml',
  'android/app/src/main/res/layout/quick_reply_bottom_sheet.xml',
];

const missing = requiredFiles.filter((relativePath) =>
  !fs.existsSync(path.join(root, relativePath))
);

const requiredText = [
  ['android/app/src/main/java/com/contact/app/MainApplication.kt', 'E911NativePackages.all()'],
  ['android/app/src/main/java/com/contact/app/PackageRegistry.kt', 'DirectSmsPackage()'],
  ['android/app/src/main/java/com/contact/app/PackageRegistry.kt', 'InCallPackage()'],
  ['android/app/src/main/AndroidManifest.xml', '.EmergencySwitchInCallService'],
  ['android/app/src/main/AndroidManifest.xml', '.SmsDeliverReceiver'],
  ['android/app/src/main/AndroidManifest.xml', 'android.intent.action.DIAL'],
  ['android/app/src/main/AndroidManifest.xml', 'android.provider.Telephony.SMS_DELIVER'],
];

const disconnected = requiredText.filter(([relativePath, needle]) => {
  const absolutePath = path.join(root, relativePath);
  return !fs.existsSync(absolutePath) || !fs.readFileSync(absolutePath, 'utf8').includes(needle);
});

if (missing.length || disconnected.length) {
  console.error('Native Android integrity check failed. Do not build or publish this tree.');
  for (const relativePath of missing) console.error(`Missing: ${relativePath}`);
  for (const [relativePath, needle] of disconnected) {
    console.error(`Missing registration "${needle}" in ${relativePath}`);
  }
  console.error('Expo prebuild may have replaced the committed custom Android project.');
  process.exit(1);
}

console.log('Native Android integrity check passed.');
