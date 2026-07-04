# Contact

Contact is an Android phone app that enhances the calling and messaging you already use every day with built-in emergency tools. It works the way your phone already works — calls, texts, contacts, keypad, recent — and quietly integrates silent text-to-911, live video dispatch, real-time location sharing, medical-profile relay, and automatic routing to 988, 311, and 211. No new workflows to learn. Built with React Native, TypeScript, and native Kotlin modules.

> [!CAUTION]
> This project is not a certified emergency service, medical device, dispatch system, or replacement for the phone's native emergency calling features. Do not rely on it to contact emergency services or transmit accurate location data. Call your local emergency number using the system dialer when help is needed.

## Project status

The application is Android-first and under active development. It requests sensitive permissions and interacts with SMS, calls, contacts, camera, microphone, and location APIs. Review the implementation and permissions before installing it on a personal device.

## Requirements

- Node.js 20 or newer
- npm
- JDK 17 or newer
- Android Studio and an Android SDK
- A physical Android device for SMS/call testing

## Setup

```powershell
git clone <your-fork-url>
cd contact
npm ci
Copy-Item .env.example .env.local
npm run typecheck
npm run lint
npm run android
```

macOS/Linux users can copy the environment template with `cp .env.example .env.local`.

## Configuration

Configuration is read from Expo public environment variables:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_EMERGENCY_TEST_NUMBER` | Development-only SMS/call test destination. Never commit a personal number. |
| `EXPO_PUBLIC_ENFORCE_NON_911_IN_DEV` | Prevents development builds from targeting `911` when enabled. |

The default development destination is the reserved fictional number `202-555-0100`; it is intentionally nonfunctional.

## Checks

```powershell
npm run check
npm run android:compile
```

Additional build and signing commands are documented in [docs/development.md](docs/development.md). Release signing credentials must never be committed.
Accepted dependency advisories and upgrade constraints are recorded in [docs/dependency-security.md](docs/dependency-security.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `src/components/` | Shared React Native UI components. |
| `src/screens/` | Screen-specific UI, hooks, and styles grouped by feature. |
| `src/services/` | Device and application services, with larger domains such as `location/` and `psap/` grouped together. |
| `src/data/` | Static application datasets, including offline language packs. |
| `src/store/` | Redux store configuration and slices. |
| `src/utils/` | Small, reusable utilities without service ownership. |
| `android/` | Native Android application, modules, and resources. |
| `scripts/` | Repository checks and maintenance automation. |
| `docs/` | Contributor-facing development and security notes. |

## Privacy and external services

The app has no project-operated backend, but features can send data directly to device providers and third-party mapping/geocoding services. See [PRIVACY.md](PRIVACY.md) for the data-flow summary.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before opening an issue or pull request. Never submit real phone numbers, messages, addresses, contact data, credentials, or emergency records.

## License

Released under the [0BSD license](LICENSE). You may use, copy, modify, and distribute the code for any purpose, with or without fee and without an attribution requirement. Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
