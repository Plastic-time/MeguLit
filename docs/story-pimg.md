# Explicit PIMG layer rendering

`services/story-pimg.cjs` is an unregistered Buffer-only helper, with no filesystem, save, story, profile or unlock policy

- `inspect(plainPsbBuffer,{limits?})` returns PSB3 canvas/layer/chunk metadata and source SHA256
- `await render(plainPsbBuffer,{layerIds:[bottom,...,top],limits?})` returns `{width,height,rgba,provenance}` at the original full canvas size, never a resized thumbnail
- Explicit IDs select and enable those layers, including initially invisible layers; the game mapping/save authority must first prove the permitted selection. No implicit selection, variant union, scene inference or unlock evidence
- PSB3 only, unencrypted header, no tolerant repairs or inferred CX keys, no mdf or unknown codecs. Caller performs proven archive/decryption separately
- Raster layer_type0/type13 only (KiriKiri `ltPsNormal`), ordinary straight-alpha source-over with metadata opacity. Other blend/group/mask types reject

Bounds are exported frozen defaults and caller overrides may only lower them: input64MiB, metadata2MiB, cumulative arrayitems65536, typed nodes16384/depth64, layers256, canvas/one layer8MiPixels, aggregate selected32MiPixels, chunk16MiB. Worker timeout5s, heap128+young16MiB, actual decoded dimensions rechecked. The existing TLG5/6 decoder runs in one owned Worker at a time, terminated on deadline and awaited before rejection. Pixel buffers are external to V8 heap, so the heap setting is not a complete RSS cap. Source snapshot, output, one decoded layer, Worker copies/scratch are simultaneously bounded by the limits; parent caller should retain its process memory budget. PNG encoding can reuse existing `cg-decoders.png` and must not use `fit` for full-image output

PIMG chunk/layer semantics were checked against [GARbro ArcPSB.cs](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/ArcFormats/Emote/ArcPSB.cs), local exact commit b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0, Copyright2016 morkt/MIT. Independent JS implementation of file layout, not a new GARbro dependency. Existing in-repo TLG and PNG decoders are reused. KiriKiri's [script constants](https://github.com/krkrz/krkr2/blob/master/kirikiri2/trunk/kirikiri2/src/core/base/ScriptMgnIntf.cpp) explicitly assign ltPsNormal13; no source implementation taken. FreeMote was examined as an alternative but current upstream is CC-BY-NC-SA4.0, so no code/binary was imported

Synthetic PSB3/TLG5 controls test original canvas placement, source-over, explicit order, invisible-but-explicit selected layers, immutability, dimension/budget/range/schema rejections. They are not compiler or real-game rendering proof. Acceptance output/receipts for the local Senren file, when available, remain outside the repository; game bytes and save data must not be committed

Integration remains with story owner: exact archive/game version, successful decryption, independently proven name-to-layer mapping, per-variant save progress, route/display permission, cache identity from sourceSHA+orderedIDs. The helper cannot authorize a locked CG and does not identify current story scene or guarantee KiriKiri's pixel-exact rounding
