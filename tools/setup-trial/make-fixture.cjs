/* Builds three small fixture packs (same layout as the real runtime packs: a zip with a top-level runtime/ folder) and a matching manifest,
   so the trial can be tested end to end without pulling ~590 MB from the internet.   node make-fixture.cjs <dir> */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const dir = path.resolve(process.argv[2] || 'fixture'); fs.mkdirSync(dir, { recursive: true });
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../runtime.json'), 'utf8').replace(/^\uFEFF/, ''));
const sizes = { base: 48, reading: 64, voice: 88 }; const out = { version: 'fixture', packs: {}, mirrors: real.mirrors };
for (const [id, mb] of Object.entries(sizes)) {
  const work = path.join(dir, '_w-' + id); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(path.join(work, 'runtime', id), { recursive: true });
  for (let i = 0; i < mb / 8; i++) fs.writeFileSync(path.join(work, 'runtime', id, `blob${i}.bin`), crypto.randomBytes(8 * 1048576));
  fs.writeFileSync(path.join(work, 'runtime', id, 'README.txt'), 'fixture ' + id);
  const zip = path.join(dir, `MeguLit-runtime-${id}-fixture.zip`); try { fs.rmSync(zip); } catch (e) { /* new */ }
  cp.execFileSync(path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '-C', work, 'runtime']);
  const buf = fs.readFileSync(zip); out.packs[id] = { size: buf.length, unpacked: mb * 1048576, sha256: crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(), urls: [`https://github.com/ilynthn/MeguLit/releases/download/runtime-fixture/MeguLit-runtime-${id}-fixture.zip`] };
  fs.rmSync(work, { recursive: true, force: true });
}
fs.writeFileSync(path.join(dir, 'runtime.fixture.json'), JSON.stringify(out, null, 1)); console.log('fixture ready in', dir);
