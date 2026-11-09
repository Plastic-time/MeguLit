# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only binaries built from this repository by GitHub Actions (`.github/workflows/sign.yml`): `MeguLit.exe` and the helpers built from `native/`. Bundled third-party files (Node.js runtime, WebView2 loader) keep their original publisher signatures and are not re-signed.

## Team roles

- Committers and reviewers: [ilynthn](https://github.com/ilynthn)
- Approvers: [ilynthn](https://github.com/ilynthn)

Every signing request is approved by hand before a release goes out.

## Privacy

MeguLit does not send any data to other networked systems unless the user turns it on. The features that do go online are online translation (to the translation service the user picks and sets a key for) and update checks (GitHub Releases of this repository).
