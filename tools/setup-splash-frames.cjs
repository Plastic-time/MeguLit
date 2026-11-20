/* Builds setup/ui-web/video/splash-frames.bin for the exe's native first-run splash (desktop/src/runtime_setup.rs): the first seconds of the installer's
   opening, as small JPEG frames the native window draws one by one (no video decoder needed before PowerShell and WebView2 are up).
   Content (light theme): the whole `intro` clip, then ONE cycle of the `welcome` loop (the native window repeats that cycle until the skin shows its first video frame).
   Format (little endian): "MLSF", u32 count, u32 fps, u32 introFrames, u32 loopFrames, u32 offsets[count+1] (from the start of the data block), then the JPEGs.
   node tools/setup-splash-frames.cjs [--fps 15] [--width 800] [--q 6] */
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const FPS = +arg('fps', 15), WIDTH = +arg('width', 800), Q = +arg('q', 6), FFMPEG = process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg';
const VID = path.resolve(__dirname, '../setup/ui-web/video/light'), OUT = path.resolve(__dirname, '../setup/ui-web/video/splash-frames.bin');
const man = JSON.parse(fs.readFileSync(path.join(VID, 'manifest.json'), 'utf8')), src = man.fps || 30, step = Math.max(1, Math.round(src / FPS));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'msf-')), height = Math.round(WIDTH * man.height / man.width / 2) * 2;
const grab = (id) => { const d = path.join(work, id); fs.mkdirSync(d);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(VID, id + '.mp4'), '-vf', `select='not(mod(n\\,${step}))',scale=${WIDTH}:${height}:flags=lanczos`, '-vsync', 'vfr', '-q:v', String(Q), path.join(d, '%04d.jpg')]);
  return fs.readdirSync(d).sort().map((f) => fs.readFileSync(path.join(d, f))); };
const intro = grab('intro'), loop = grab('welcome'), all = intro.concat(loop);
const head = Buffer.alloc(20 + 4 * (all.length + 1)); head.write('MLSF', 0, 'ascii'); head.writeUInt32LE(all.length, 4); head.writeUInt32LE(Math.round(src / step), 8); head.writeUInt32LE(intro.length, 12); head.writeUInt32LE(loop.length, 16);
let off = 0; all.forEach((b, i) => { head.writeUInt32LE(off, 20 + 4 * i); off += b.length; }); head.writeUInt32LE(off, 20 + 4 * all.length);
fs.writeFileSync(OUT, Buffer.concat([head].concat(all))); fs.rmSync(work, { recursive: true, force: true });
console.log(`splash-frames.bin: ${all.length} frames (${intro.length} intro + ${loop.length} loop) at ${Math.round(src / step)} fps, ${WIDTH}x${height}, ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
