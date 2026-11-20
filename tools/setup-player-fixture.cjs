/* Fake pre-rendered installer segments for the video player (setup/ui-web/player.js), same layout as setup/ui-web/video/INTERFACE.md.
   Built from any short clip (default: the 2 s draft E:/try/prerender-test/open-light.mp4): every segment is that clip looped to the
   segment's frame count, tinted per segment, with its id and frame number burnt in so a test can read which segment/frame is on screen.
   dark = the same frames darkened. Glass outlines: 12 plates (8 core + 4 ambient, manifest.plates = {cores, info}) drifting in circles, on intro..field like the renderer.
   node tools/setup-player-fixture.cjs <outDir> [--src clip.mp4] [--scale 0.5]   (0.5 -> 640x410 drafts like the renderer's) */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'H:/MeguLit-Work/setup-player/fixture');
const SRC = arg('src', 'E:/try/prerender-test/open-light.mp4'), SCALE = +arg('scale', 0.5), FFMPEG = process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg';
const FPS = 30, W = 1280, H = 820, w = Math.round(W * SCALE / 2) * 2, h = Math.round(H * SCALE / 2) * 2;
/* id, kind, frames, next, has glass, tint */
const SEGS = [['intro', 'transition', 72, 'welcome', 1, '0xff8080'], ['welcome', 'loop', 120, null, 1, '0x80ff80'], ['to-loc', 'transition', 78, 'loc', 1, '0x8080ff'],
  ['loc', 'loop', 120, null, 1, '0xffff80'], ['to-field', 'transition', 102, 'field', 1, '0xff80ff'], ['field', 'loop', 180, null, 1, '0x80ffff'],
  ['to-unpack', 'transition', 66, 'unpack', 0, '0xffc080'], ['unpack', 'loop', 90, null, 0, '0xc080ff'], ['to-done', 'transition', 132, 'done', 0, '0x80c0ff'], ['done', 'loop', 180, null, 0, '0xffffff']];
/* plates 0..7 = core plates of groups 0..7, 8..11 = ambient plates lit by total progress past thr */
const PLATES = 12, INFO = Array.from({ length: PLATES }, (_, i) => i < 8 ? { core: true, order: i } : { core: false, thr: (i - 7) * 0.2 });
const FONT = 'C\\:/Windows/Fonts/arial.ttf';
function glass(frames) {
  const polys = [];
  for (let f = 0; f < frames; f++) {
    const row = [];
    for (let p = 0; p < PLATES; p++) {
      const a = 2 * Math.PI * (f / frames) + p, cx = 120 + (p % 6) * 200 + Math.cos(a) * 12, cy = 260 + Math.floor(p / 6) * 300 + Math.sin(a) * 9, r = 70, pts = [];
      if (p === 11 && f % 60 < 10) { row.push(null); continue; }   /* sometimes out of view */
      for (let k = 0; k < 10; k++) { const t = 2 * Math.PI * k / 10; pts.push(Math.round((cx + Math.cos(t) * r * 1.2) * 4), Math.round((cy + Math.sin(t) * r) * 4)); }
      row.push(pts);
    }
    polys.push(row);
  }
  return { fps: FPS, frames, plates: PLATES, scale: 4, polys };
}
for (const theme of ['light', 'dark']) {
  const dir = path.join(OUT, theme); fs.mkdirSync(dir, { recursive: true }); const segs = []; let bytes = 0;
  for (const [id, kind, frames, next, hasGlass, tint] of SEGS) {
    const file = path.join(dir, id + '.mp4');
    const vf = [`scale=${w}:${h}`, `colorchannelmixer=rr=${parseInt(tint.slice(2, 4), 16) / 255}:gg=${parseInt(tint.slice(4, 6), 16) / 255}:bb=${parseInt(tint.slice(6, 8), 16) / 255}`]
      .concat(theme === 'dark' ? ['eq=brightness=-0.35:contrast=0.9'] : [])
      .concat([`drawtext=fontfile='${FONT}':text='${id} %{frame_num}':x=12:y=12:fontsize=${Math.round(28 * SCALE * 2)}:fontcolor=${theme === 'dark' ? 'white' : 'black'}:box=1:boxcolor=${theme === 'dark' ? 'black' : 'white'}@0.6`]).join(',');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-stream_loop', '-1', '-i', SRC, '-frames:v', String(frames), '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '36', '-g', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file]);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-q:v', '5', path.join(dir, id + '.jpg')]);
    let g = null; if (hasGlass) { g = id + '.glass.json'; fs.writeFileSync(path.join(dir, g), JSON.stringify(glass(frames))); }
    const b = fs.statSync(file).size; bytes += b;
    segs.push({ id, kind, frames, next, file: id + '.mp4', poster: id + '.jpg', glass: g, bytes: b });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, theme, width: W, height: H, fps: FPS, draft: true, bytes, segments: segs, plates: { cores: 8, info: INFO } }, null, 1));
  console.log(theme + ': ' + segs.length + ' segments, ' + (bytes / 1048576).toFixed(2) + ' MB');
}
