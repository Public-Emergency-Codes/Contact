# Contributing

## Before contributing

- Search existing issues before opening a new one.
- Do not include personal data, real messages, phone numbers, addresses, API keys, call logs, or emergency records in issues, screenshots, fixtures, or commits.
- Use reserved fictional phone numbers such as `202-555-0100` in examples.
- Report security and privacy vulnerabilities through the process in `SECURITY.md`, not a public issue.

## Development workflow

1. Fork the repository and create a focused branch.
2. Install exact dependencies with `npm ci`.
3. Copy `.env.example` to `.env.local`; never commit the resulting file.
4. Make the smallest coherent change.
5. Run `npm run check`.
6. For native changes, run `npm run android:compile` and test on an appropriate Android device.
7. Describe behavior changes, permissions, data flows, and manual testing in the pull request.

Keep modules reasonably focused. Refactor large files when it improves ownership and testability, but do not split code solely to satisfy an arbitrary line count.

Place shared UI in `src/components`, static datasets in `src/data`, and domain logic in a matching `src/services/<domain>` folder. Screen-only code belongs beside its screen. Use PascalCase for React component files, `use`-prefixed camelCase for hooks, and descriptive camelCase for other TypeScript modules; avoid numbered suffixes such as `helper2`.

## Pull requests

Pull requests should include:

- A concise problem and solution description.
- Testing performed and device/Android version when relevant.
- Screenshots for visual changes, scrubbed of personal information.
- Permission, privacy, or security implications.
- Documentation updates for configuration or behavior changes.

By submitting a contribution, you agree that it may be distributed under the repository's selected license.
