# Privacy and Data Flow (Developer Notes)

The complete public policy for the distributed app is [Contact Privacy Policy](docs/privacy-policy.md). The notes below describe repository-specific data handling for contributors.

Contact processes highly sensitive device data. Anyone distributing a build is responsible for reviewing the code, platform disclosures, third-party terms, and applicable law.

## Device data

Depending on granted permissions and enabled features, the app can access SMS/MMS content, call state and call logs, contacts, precise/background location, camera, microphone, media, notifications, and overlay capabilities. Most application state is stored locally on the device.

## External services

The project has no project-operated application backend. Some features communicate directly with external services, including:

- OpenStreetMap and ArcGIS tile services for map rendering.

Coordinates, search terms, IP addresses, and related request metadata may therefore be received by those providers. Review their policies and usage requirements before distributing the app.

## Repository data hygiene

Never commit `.env` files, API keys, signing keys, real phone numbers, messages, addresses, call logs, contact exports, recordings, screenshots containing personal data, or device logs. Use fictional test data only.

These developer notes supplement, but do not replace, the complete public privacy policy linked above.
