# Release test results

## 2026-07-22 automated baseline

Device: Motorola Edge 2025, Android 16 (API 36)

- Dependency audit: passed, zero known vulnerabilities.
- TypeScript, lint, unit tests, license audit, repository hygiene, and native-integrity checks: passed.
- Clean `compileReleaseKotlin`: passed.
- Standalone `assembleRelease`: passed.
- Release-test APK installation: passed.
- Standalone launch and bundled JavaScript load: passed.
- Process remained alive after launch and `MainActivity` was the top resumed activity.
- Installed package reports version `1.0.0` (code `1`), minimum SDK 24, and target SDK 36.
- Android registered `EmergencySwitchInCallService`, `SmsDeliverReceiver`, and `RespondViaSmsService`.
- Restricted permissions remained ungranted during the automated baseline.
- The device retained its existing default dialer and SMS applications; automated testing did not change user roles.

Observed warnings:

- Expo Notifications attempted to initialize Firebase without a `google-services.json` configuration. Decide whether the Play build needs remote push notifications; configure them deliberately or remove the unused Firebase initialization path.
- React Native new-architecture libraries emitted generated-setter and compatibility warnings, but no fatal startup exception occurred.
- Android SDK tools are installed in duplicate/nonstandard `*-2` directories. Builds completed, but the SDK installation should be normalized when convenient.

## Manual tests still required

Use the physical-device checklist in `docs/google-play-release.md`. The default Phone/SMS roles, restricted permission prompts, calls, SMS/MMS, background location, camera, microphone, notifications, and emergency-facing features require deliberate user interaction and authorized test destinations.
