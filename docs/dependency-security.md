# Dependency security notes

The project has been upgraded to Expo SDK 57 and its compatible React Native and native-module versions. `npm audit` currently reports zero known vulnerabilities.

Expo's `xcode` dependency still declares an outdated `uuid` range, so `package.json` overrides that transitive dependency to patched `uuid` 11. Keep the override until Expo's dependency chain no longer requires it, and verify the `xcode` UUID API plus native compilation whenever it changes.

Do not use `npm audit fix --force` casually: it can move Expo and related native dependencies across compatibility boundaries. Use `npx expo install --fix`, then run the full JavaScript and native checks after an SDK upgrade.
