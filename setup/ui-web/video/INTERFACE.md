# Pre-rendered installer scene: interface between the renderer (tools/setup-prerender.cjs) and the player

Frozen on 2026-11-20. The renderer only adds files under this folder; the player only reads them. Do not change formats without telling the other side.

## Files (per theme: `light` and `dark`)

```
setup/ui-web/video/<theme>/<id>.mp4          H.264, yuv420p, 1920x1230, 30 fps, no audio, +faststart, every segment starts with a keyframe
setup/ui-web/video/<theme>/<id>.glass.json   per-frame glass outlines (see below), only for segments that show glass
setup/ui-web/video/<theme>/<id>.jpg          poster = frame 0 of the segment (JPEG, 1920x1230)
setup/ui-web/video/<theme>/manifest.json     the list below, machine readable
```

`<theme>` = `light` | `dark`. The two themes have identical segment ids, frame counts and timing, so the player can switch theme at the same
segment/frame (cross-fade ~0.5 s, same currentTime).

## Segments (frames at 30 fps; durations are targets, the manifest has the real numbers)

| id | kind | frames | what it shows | next |
|---|---|---|---|---|
| `intro` | transition | ~72 | opening push-in on the welcome street, ends exactly on the first frame of `welcome` | `welcome` |
| `welcome` | **loop** | ~120 | welcome street hold with a slow circular camera drift; frame N-1 -> frame 0 is seamless | stays until the user is ready (the page moves on after ~2.2 s) |
| `to-loc` | transition | ~78 | skim to the location view | `loc` |
| `loc` | **loop** | ~120 | location view hold (drift) | stays while the user chooses a folder |
| `to-field` | transition | ~102 | camera goes under the viaduct into the glass field | `field` |
| `field` | **loop** | ~180 | glass field, slow wander; length does NOT depend on download speed; glass is rendered UNLIT (neutral clear glass) | stays while downloading |
| `to-unpack` | transition | ~66 | dive to the unpack view | `unpack` |
| `unpack` | **loop** | ~90 | unpack view hold | stays while unpacking |
| `to-done` | transition | ~132 | pull back, anamorphic alignment, the logo appears; ends exactly on the first frame of `done` | `done` |
| `done` | **loop** | ~180 | final view with parallax sway (one circle over the clip) | stays |

Transitions play once (`ended` -> start the next segment, preload it while the previous plays). Loops play with `loop` or are re-seeked at the last frame.
Any transition may start from the middle of a loop: the player should let the running loop reach its last frame (<= 4 s), or cross-fade 0.25 s into the transition
(the first frame of a transition equals the pose of the loop's frame 0, so a cross-fade from any loop frame is visually close).
The `field` loop is what the user sees while downloading regardless of speed; progress is drawn by the 2D overlay (below).

## manifest.json

```json
{ "version": 1, "theme": "light", "width": 1280, "height": 820, "fps": 30,
  "segments": [ { "id": "intro", "kind": "transition", "frames": 72, "next": "welcome", "file": "intro.mp4", "poster": "intro.jpg", "glass": null },
                { "id": "field",  "kind": "loop", "frames": 180, "next": null, "file": "field.mp4", "poster": "field.jpg", "glass": "field.glass.json" } ],
  "plates": { "count": 0, "group": [] } }
```
`plates.group[i]` = glass-group (0..7, K = 8) of plate `i`, i.e. what the old scene's `groupOf(i)` returned for plate `i`. Real download segment `s` of `N`
belongs to group `floor(s * 8 / N)` (same rule as scene.js `groupOf`); a plate is "lit" by the real progress of its group (0..1) and is fully lit when the group is done.

## `<id>.glass.json` (glass overlay data)

```json
{ "fps": 30, "frames": 180, "plates": 41, "scale": 4,
  "polys": [ [ [x0,y0,x1,y1,...], null, [ ... ], ... ],   // frame 0: one entry per plate, flat int pairs in 1/4 px of the 1920x1230 video; null = not visible
             [ ... ] ] }
```
- Coordinates are in video pixels * `scale` (so divide by 4); origin top-left of the 1920x1230 frame; the player scales the overlay with the `<video>` (object-fit: fill into the 1000x640 stage).
- Each polygon is the convex outline (8-16 points) of the plate's glass body in that frame. The player lights a plate by clipping to its polygon and drawing a soft inner
  glow plus an edge line, intensity from the group's real progress; the video itself never contains the lit state.
- Plate order is stable across segments and themes and equals `manifest.plates.group` order.
- Files are small (quantised, gzip friendly); the build may ship them gzipped as `<id>.glass.json.gz` (the player must accept either).

## Placeholder / draft

Until the final renders exist the renderer drops low-resolution drafts (640x410, crf 40) with the same names and structure; the manifest has `"draft": true`.
Posters are always real frames.

## Size budget

Both themes together <= 30 MB (hard). Loops are 3-6 s, 30 fps, 1280 wide. The renderer reports the real numbers in `manifest.json` (`bytes`) and in its log.

## Renderer behaviour you can rely on

- Frames are piped to ffmpeg, nothing but the finished files is written under `setup/ui-web/video/`.
- The renderer never blocks on the player; it can be re-run per segment (`--seg <id> --theme light|night`).


## Update 2026-11-21 (HD, no progress overlay)

Videos are 1920x1230 (crf 23). There are no `*.glass.json(.gz)` files and no `plates` / `glass` manifest fields any more: the field loop's glass is the same plain glass as the other segments, progress is not drawn on the video (the UI's own text/percent only). Playback only ever follows the chain intro > welcome > to-loc > loc > to-field > field > to-unpack > unpack > to-done > done (a loop may be skipped when the target is further ahead).
