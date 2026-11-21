# CG content classification

The story viewer uses static, version-bound facts rather than an image model. Classification runs when an engine builds its story catalog; opening the gallery consumes the stored records. This module starts no process, timer or network request.

Research before implementation: [Ren'Py's official gallery documentation](https://www.renpy.org/doc/html/rooms.html) describes separate gallery buttons, images and unlock conditions. Those are useful structural inputs, but an unlock condition alone does not identify adult content. [VNDB's API documentation](https://api.vndb.org/kana) distinguishes release age information from image sexual/violence ratings. A cover's rating is not proof that the whole release is all-ages. No third-party implementation was copied.

`classify({name,gallery,script,gameRating})` produces `{name,adult,basis,reasons}`. The engine parser supplies facts from real tables and script references. A gallery category wins; conflicting categories conservatively retain the adult classification and both facts. Script inference requires two different evidence kinds. Repeated H labels or filenames remain one kind. Exclusive adult usage needs complete occurrence counts and an independently established adult context, not a self-referential guess.

Without sufficient local evidence, an identified VNDB release/game classification is the fallback. Missing information is recorded as `unknown` and veiled; it is never relabeled as a verified adult scene or all-ages release. The UI reuses MeguLit's existing NSFW setting and temporary per-image reveal.

`validateRatings(rows,{names})` checks strict fields, relative resource references, known gallery names, duplicate identities and consistency of the decision with its recorded reasons. It verifies the data contract, not that a remote publisher's semantic claim is true. The existing Seed identity and review boundaries remain necessary. Records contain no pictures, saves, personal progress or absolute user paths.

This generic classifier does not yet establish the two real games' counts or manual five-image checks; those require separately recorded extraction and inspection evidence.
