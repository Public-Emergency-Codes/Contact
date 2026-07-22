# Google Play release checklist

Contact uses restricted phone, SMS, call-log, overlay, notification-policy, battery-optimization, and background-location capabilities. A successful build does not establish policy approval or functional correctness.

## Build invariants

- Treat the committed `android/` directory as authoritative. Do not run `expo prebuild` in the Play release workflow unless a tested config plugin preserves every custom Kotlin source, manifest component, resource, and package registration.
- Run `npm run check` before every release.
- Configure the private upload key in `android/keystore.properties` using `android/keystore.properties.example`.
- Build with `npm run android:bundle:play`.
- Confirm the output bundle version name and version code are unique and increasing.

## Physical-device release testing

Test the signed release build, not a development client, on at least two physical Android devices and two supported Android versions.

- Fresh install, upgrade, launch, navigation, process death, reboot, and offline launch.
- Request and revoke each runtime permission; verify denial and "don't ask again" behavior.
- Acquire and lose the default Phone role; place, receive, answer, reject, hold, mute, use speaker, use keypad, and end calls.
- Acquire and lose the default SMS role; send and receive SMS and MMS, including media compression and failed delivery.
- Verify call history, missed-call behavior, contacts, sharing, notifications, overlays, and return-to-call UI.
- Verify foreground and background location disclosures, indicators, battery use, termination, and data retention.
- Verify camera, microphone, video recording, media library, document picker, and cleanup after cancellation or failure.
- Verify emergency-number behavior on real carrier devices without making unauthorized test calls to emergency services.
- Confirm every advertised 911/988/311/211, dispatch-video, translation, medical-profile, and PSAP-routing capability against an authorized test environment. Disable or clearly label unavailable integrations.
- Inspect crashes, ANRs, strict-mode violations, and excessive battery/network activity.

## Play Console requirements

- Create and verify the developer account and enable Play App Signing.
- Upload the signed Android App Bundle to an internal testing track first.
- Complete the Data safety, privacy policy, app access, content rating, ads, target audience, and store-listing sections.
- Complete declarations for SMS and Call Log permissions and demonstrate that Contact becomes the active default Phone/SMS handler before requesting them.
- Complete the background-location declaration with a prominent in-app disclosure, store disclosure, privacy policy, and demonstration video.
- Declare foreground-service types and any other sensitive permissions requested by the uploaded bundle.
- Supply phone screenshots, feature graphic, icon, short description, full description, support contact, and release notes.
- Resolve every pre-launch report, policy warning, crash, ANR, and accessibility issue before production rollout.
- Use staged production rollout and monitor Android vitals and user reports.
