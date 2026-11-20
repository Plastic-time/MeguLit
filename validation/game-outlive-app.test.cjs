'use strict';
/* 1.4.21 (user: 「不要让megulit关了游戏也被关」): games start outside MeguLit's job (MeguLit.exe --spawn-outside-job), helpers stay in it. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
const g = require('../services/game-readiness.cjs'), read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fakeHelper = (stdout, code, calls) => (file, args, opts) => { calls.push({ file, args, opts }); const c = new EventEmitter(); c.stdout = new PassThrough(); setImmediate(() => { c.stdout.write(stdout); c.emit('exit', code); }); return c; };

test('the helper is asked for the program, its folder and arguments; its pid comes back and is watched', async () => {
  const calls = [];
  const state = await g.startOutsideJob('C:/M/MeguLit.exe', 'C:/G/game.exe', ['-a', 'b c'], 'C:/G', 'GAME_LAUNCH_FAILED', fakeHelper(String(process.pid) + '\r\n', 0, calls), { X: '1' });
  assert.deepEqual(calls[0].args, ['--spawn-outside-job', 'C:/G', 'C:/G/game.exe', '-a', 'b c']);
  assert.equal(calls[0].opts.env.X, '1', 'the game gets the caller environment (Steam ids, locale)');
  assert.equal(state.pid, process.pid); assert.equal(state.exit, null); assert.equal(state.outsideJob, true);
});

test('a helper that fails or prints no pid is a failed launch with the caller error code', async () => {
  await assert.rejects(g.startOutsideJob('M', 'f', [], 'c', 'LE_SPAWN_FAILED', fakeHelper('', 1, []), null), /LE_SPAWN_FAILED/);
  await assert.rejects(g.startOutsideJob('M', 'f', [], 'c', 'GAME_LAUNCH_FAILED', fakeHelper('oops', 0, []), null), /GAME_LAUNCH_FAILED/);
});

test('without MeguLit.exe (tests, rigs) or with MEGULIT_GAME_IN_JOB=1 the direct spawn stays', () => {
  const keep = { root: process.env.MEGULIT_ROOT, flag: process.env.MEGULIT_GAME_IN_JOB };
  try {
    delete process.env.MEGULIT_ROOT; assert.equal(g.outsideJobLauncher(), null);
    process.env.MEGULIT_ROOT = path.join(__dirname, 'no-such-root'); assert.equal(g.outsideJobLauncher(), null);
  } finally { if (keep.root === undefined) delete process.env.MEGULIT_ROOT; else process.env.MEGULIT_ROOT = keep.root; if (keep.flag === undefined) delete process.env.MEGULIT_GAME_IN_JOB; else process.env.MEGULIT_GAME_IN_JOB = keep.flag; }
});

test('the job ends helpers with MeguLit and lets only a requested process leave; MeguLit.exe has the launch mode', () => {
  assert.match(read('desktop/src/broker.rs'), /info\.basic\.flags=0x2000\|0x800;/);
  const m = read('desktop/src/main.rs');
  assert.match(m, /fn spawn_outside_job\(args:&\[String\]\)->i32/);
  assert.match(m, /start\(0x01000000\|0x00000200\)\.or_else\(\|_\|start\(0x00000200\)\)/, 'breakaway, and inside the job when a foreign job refuses it');
  assert.match(m, /args\.get\(1\)\.map\(\|a\|a=="--spawn-outside-job"\)/);
  { const main = m.slice(m.indexOf('fn main() {')); assert.ok(main.indexOf('--spawn-outside-job') >= 0 && main.indexOf('--spawn-outside-job') < main.indexOf('STARTED.get_or_init'), 'checked before the app starts (no single-instance, no window)'); }
});

test('the exit code comes back through the helper, so a Steam restart (53) is still seen', async () => {
  const c = new EventEmitter(); c.stdout = new PassThrough();
  const p = g.startOutsideJob('M', 'Game.exe', [], 'C:/G', 'GAME_LAUNCH_FAILED', () => c, null);
  c.stdout.write('4242\r\n'); const state = await p; assert.equal(state.pid, 4242); assert.equal(state.exit, null, 'running');
  c.stdout.write('exit 53\r\n'); await new Promise(r => setImmediate(r)); c.emit('exit', 0);
  assert.deepEqual(state.exit, { code: 53, signal: null });
  assert.equal(require('../services/steam-restart.cjs').restarted(state.exit), true);
});

test('a helper ended with MeguLit (no exit line) leaves the game watched by pid', async () => {
  const c = new EventEmitter(); c.stdout = new PassThrough();
  const p = g.startOutsideJob('M', 'Game.exe', [], 'C:/G', 'GAME_LAUNCH_FAILED', () => c, null);
  c.stdout.write(String(2 ** 30) + '\n'); const state = await p; c.emit('exit', 1);
  await new Promise(r => setTimeout(r, 700)); assert.deepEqual(state.exit, { code: null, signal: null }, 'the pid is gone');
});
