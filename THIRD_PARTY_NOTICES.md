# Third-Party Software

This project installs third-party packages through npm and Gradle. Those dependencies remain governed by their respective licenses; the project license does not replace them.

The npm lockfile currently contains dependencies under permissive and weak-copyleft license expressions including MIT, ISC, Apache-2.0, BSD variants, MPL-2.0, BlueOak-1.0.0, CC-BY-4.0, Python-2.0, 0BSD, and Unlicense. Two packages that omit license metadata in `package-lock.json` were manually verified from their installed license files:

- `qrcode-terminal`: Apache-2.0, with bundled QRCode code under MIT terms.
- `requireg`: MIT.

Run `npm run licenses` after dependency changes. Distributors remain responsible for preserving required notices and reviewing Android/Gradle dependency licenses for their build.
