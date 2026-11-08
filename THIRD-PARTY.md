# Third-party inventory (migration work in progress)

This is an inventory, not a claim that the complete project's license audit is finished.

- New project code uses the existing project's GPL-3.0-or-later declaration. See LICENSE
- Tauri, Wry, WebView2 bindings, native menu/tray/dialog libraries, Serde and transitive dependencies: exact versions in `desktop/Cargo.lock`; retain their individual package notices when producing a distribution
- Node.js: bundled runtime with its original `runtime/NODE-LICENSE.txt`
- Microsoft WebView2 loader: generic x64 dependency artifact; the Evergreen WebView2 runtime is installed separately
- JMdict-derived data: imported from the user's existing dictionary data. Retain the dictionary source attribution and applicable data/translation notices before public distribution; the data is not newly authored by this rewrite
- LunaHook and its engine adaptations: source and notices retained under `preserved/source/`; the custom native/runtime bridge is now integrated with the independent reader, with live game verification still pending
- Existing custom startup helper and character artwork: preserved from the user's project; artwork origin/usage should remain in the distribution inventory
- Noto Sans JP and Noto Serif JP (Google Fonts, https://github.com/google/fonts/tree/main/ofl): SIL Open Font License 1.1, license text in `web/fonts/OFL-NotoJP.txt`. Bundled as `web/fonts/NotoSansJP.woff2` and `NotoSerifJP.woff2`, converted unmodified from the variable TTF to WOFF2
- Tomoyo: historical inspiration and legacy input-data compatibility. Its application executable, Svelte application and Rust application are not included in the new runtime. Legacy data namespace strings are migration inputs, not the new application identity

No existing third-party license was deleted from the preservation checkpoint.

E194: pip 26.3 (MIT), verified official PyPI wheel bundled under runtime/wheels; SHA256 f3b60b20ffaadd4415ed7957212a38ac63fa4c5fa375bd0f4a797777940fad13. Its license is included inside the wheel. No system Python installation is modified.
