// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, 千恋＊万花, hide mode): "有时候原文还是会出来一下". Not a wrong judgement of the scene probe: the game took its text window
   away itself. Recorded (reader-host.log / hook-diagnostics, portable):
     11:20:43.34 click   11:20:44.415 dialogScene visible=false "text window hidden: box 73%, picture 0%"   (next line 11:20:47.17: a staged pause)
     11:20:24.30 skip    11:20:32.916 dialogScene visible=false "scene changed 80%, box 59%"                 (next line 11:20:37.13)
     11:21:27.99 another program in front (the third time; the layer hides, the game's text is still there)
   In the first two the reading layer left, 1.6 s later the hook bridge gave the text back to the game, and the next line was drawn by
   the game until the layer had been back for 0.6 s. A layer that is away with the game's text window has nothing to give back. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { Immersion } = require('../core/immersion.cjs');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const rig = () => { let now = 1000; const out = [], im = new Immersion(m => out.push(m), () => now); im.configure({ immersion: true, dialogDetection: 'hook' }); im.source('「まあ……確かにご無沙汰だったとは思うけどさ」', 'krkr', 'hook'); now += 2000; im.tick(); return { im, out, step: ms => { now += ms; im.tick(); } }; };

test('the text window taken away by the game (recorded 73% / 0%): the layer is away with it, until the next line', () => {
  const { im, step } = rig(); assert.equal(im.awayByDialog(), false, 'a line on screen');
  im.window(false, 'text window hidden: box 73%, picture 0%'); step(100);
  assert.equal(im.visible, false); assert.equal(im.awayByDialog(), true);
  step(2700); assert.equal(im.awayByDialog(), true, 'for as long as the pause lasts (2.8 s recorded)');
  im.source('「みたいな感じでさ。子供にそういう脅しを使う」', 'krkr', 'hook'); step(800);
  assert.equal(im.visible, true); assert.equal(im.awayByDialog(), false, 'the next line ends it');
});
test('the text window back without a new line (the player hid it and showed it again) ends it too', () => {
  const { im, step } = rig(); im.window(false, 'text window hidden: box 70%, picture 1%'); step(100); assert.equal(im.awayByDialog(), true);
  im.window(true, 'text window back'); step(100); assert.equal(im.visible, true); assert.equal(im.awayByDialog(), false);
});
test('a scene change that takes the dialogue box away (recorded 80% / 59%) counts; so does a skip, until the next line', () => {
  const { im, step } = rig(); im.scene(false, 'scene changed 80%, box 59%'); step(100);
  assert.equal(im.visible, false); assert.equal(im.awayByDialog(), true);
  const b = rig(); b.im.skip(true); b.step(500); assert.equal(b.im.visible, false, 'the layer stands down for the game\'s own fast-forward');
  assert.equal(b.im.awayByDialog(), true, 'the hide layers stand down for the skip anyway; the gate keeps its state for after it');
  b.im.skip(false); b.step(100); assert.equal(b.im.awayByDialog(), true, 'key let go, no line yet: still away');
  b.im.source('「……行くか」観光に来たわけじゃないんだから、立ち尽くしてても仕方ない。', 'krkr', 'hook'); b.step(800);
  assert.equal(b.im.visible, true); assert.equal(b.im.awayByDialog(), false, 'the next line ends it');
});
/* 2026-11-21 (owner's recording 08:28, 千恋＊万花 incr11) replayed against the bridge's gate (native/HookBridge.cs OverlayGate, 200 ms samples):
   hook-diagnostics 23:28:17.475 skip key held / 19.061 released / 20.489 "krkr draws its text itself" / 21.306 "draws its text invisible";
   reader-host 17.878 visibilityDecision skip, 20.799 the line shows the layer. Video frames 253-266: the game's 「観光に来た…」 alone for
   0.6 s, then under MeguLit's copy for 0.5 s. */
test('recorded skip 23:28:17-21: the gate never gives the text back to the game around a skip', () => {
  const ShownSamples = 3, LostSamples = 8; /* HookBridge.cs OverlayGate */
  const track = (over, st, seen) => { if (seen === 1) { st.bad = 0; if (++st.ok >= ShownSamples) over = true; } else if (seen === 0) { st.ok = 0; if (++st.bad >= LostSamples) over = false; } return over; };
  const replay = away => {
    let now = 17000; const im = new Immersion(() => {}, () => now); im.configure({ immersion: true, dialogDetection: 'hook' });
    im.source('青々とした木々ばかりの面白味のない風景の峠道を抜け、ようやく辿り着いた穂織の町。', 'krkr', 'hook'); now += 100; im.tick();
    let over = true; const st = { ok: 0, bad: 0 }, given = [];
    const until = t => { while (now < t) { now += 100; im.tick(); if (now % 200 === 0) { const seen = im.visible ? 1 : 0, s = seen === 0 && away(im) ? -1 : seen; over = track(over, st, s); if (!over) given.push(now); } } };
    now = 17400; im.skip(true); until(19000); assert.equal(im.visible, false, 'hidden for the skip (17.88 recorded)');
    im.skip(false); until(20000);
    im.source('「……行くか」観光に来たわけじゃないんだから、立ち尽くしてても仕方ない。', 'krkr', 'hook'); until(22000);
    assert.equal(im.visible, true, 'the line shows the layer'); return given; };
  const given = replay(im => im.awayByDialog());
  assert.deepEqual(given, [], 'given back at ' + given[0] + ' (recorded 20489: the game drew the line itself)');
  /* the rule before: a skip was a real absence, and the replay gives the text back as recorded */
  assert.ok(replay(im => im.visible === false && im.skipAt == null && (im.windowHidden === true || im.sceneHidden === true)).length > 0);
});
test('a layer that is simply shown, or hidden for no reason of the text window, is not away with it', () => {
  const { im } = rig(); assert.equal(im.awayByDialog(), false);
  im.visible = false; assert.equal(im.awayByDialog(), false, 'e.g. another program in front: the game\'s text is still there to read');
});
test('the front end tells the bridge, and the bridge keeps the hide for those samples only', () => {
  const svc = read('services/reader.cjs'), hb = read('native/HookBridge.cs');
  assert.ok(svc.includes("this.gal?.hooks?.send?.({type:'dialogAway',away});"));
  assert.ok(svc.includes('this.tick=setInterval(()=>{this.immersion.tick();this.syncDialogAway();},100);'));
  assert.ok(hb.includes('public static int Seen(int seen){return seen==0&&DialogAway?-1:seen;}'), 'unknown, not lost: the gate keeps its state');
  assert.ok(hb.includes('int seen=OverlayGate.Seen(OverlayGate.Check(GameWindow,out reason));'));
  assert.ok(hb.includes('else if(type=="dialogAway"){'));
  assert.ok(hb.includes('return "text given back while the text window was away ("'), 'gate self-test');
  assert.ok(!/SenrenBanka|BGI\b/.test(hb.slice(hb.indexOf('public static volatile bool DialogAway;') - 700, hb.indexOf('public static volatile bool DialogAway;') + 200).replace(/\/\*[\s\S]*?\*\//g, '')), 'no game or engine name in the code');
});
