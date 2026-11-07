# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Japanese learners who play galgame / visual novels in the original Japanese. Today the primary user is the author; the product will be released publicly, so a first-time player must understand the library and settings without help. They read in-game, look words up, check furigana and audio, and mine sentences into Anki for review.

## Product Purpose

MeguLit sits on top of a running galgame. It reads the game's text through hooks, can replace the game's own text box with its own (embedding), and adds reading tools: furigana, dictionary lookup, TTS, translation, and Anki mining and review. The main window is the game library, history, learning (Anki review, statistics) and settings. Success is reading the original game comfortably and turning what was read into reviewed vocabulary.

## Positioning

Engine-level text capture and in-place embedding for many galgame engines (Siglus, KiriKiri, MAGES, CS2, Leaf and others), with the learning loop (lookup, card, review) inside the same app as the game library.

## Operating Context

Windows desktop app (WebView2 host). The main window is used between play sessions and at small window sizes; the reader overlay floats over a fullscreen or windowed game and must not steal focus. Anki runs alongside through AnkiConnect.

## Capabilities and Constraints

- Generated reader modules change only through tools/*.cjs; E:\Apps\ToMe and migration/original-overlay-20261104 are read-only.
- No framework; plain JS/CSS, system fonts, memory-light motion (transform/opacity, pause off-screen).
- Existing CSS classes, storage keys and native ABI stay compatible.
- Chinese, Japanese and English UI strings.

## Brand Commitments

- Name: MeguLit. The product is Megumin's grimoire: Megumin (Konosuba, Crimson Demon, explosion magic) is the brand itself, and her world may enter the design directly.
- Logo: web/assets/megulit-logo.svg must be kept.
- Home background image (user-selectable) must be kept.

## Evidence on Hand

Logo, home background, the user's real game library (covers from VNDB/Steam). No testimonials, user counts or press exist; do not invent them.

## Product Principles

- The game comes first: overlays never block, steal focus, or flicker.
- Fixes are engine-generic, never per-title.
- Protect save data and Anki progress.
- Learning stays one step from reading.
