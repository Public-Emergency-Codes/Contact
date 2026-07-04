# Development and build commands
npm ci
npm run typecheck
npm run lint
npm run android

# Native Android compile check
$env:NODE_ENV = "production"
./android/gradlew.bat -p android :app:compileDebugKotlin --no-daemon

# Unsigned release build
$env:NODE_ENV = "production"
./android/gradlew.bat -p android :app:assembleRelease --no-daemon

# Signed release build
# 1. Copy android/keystore.properties.example to android/keystore.properties.
# 2. Create a private release keystore outside the repository.
# 3. Fill in the local keystore.properties values.
# 4. Run the release build command above.

# Install a debug build on a connected device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
