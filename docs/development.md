# Development and build commands
npm ci
npm run typecheck
npm run lint
npm run android

# Native Android compile check
$env:NODE_ENV = "production"
./android/gradlew.bat -p android :app:compileDebugKotlin --no-daemon

# Release compile check (does not produce a publishable bundle)
$env:NODE_ENV = "production"
./android/gradlew.bat -p android :app:compileReleaseKotlin --no-daemon

# Signed Google Play App Bundle
# 1. Copy android/keystore.properties.example to android/keystore.properties.
# 2. Create a private release keystore outside the repository.
# 3. Fill in the local keystore.properties values.
# 4. Run npm run android:bundle:play.

# Install a debug build on a connected device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
