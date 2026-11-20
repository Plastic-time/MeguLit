'use strict';
/* 2026-11-21 (ファタモルガーナの館, KiriKiri: the game drew its lines invisible; its hook text was garbled by the text effects or dropped):
   a line the game drew hidden that no source line carried within 450 ms is delivered as a source line itself, so it is read,
   given furigana and translated; a line a source carried is never delivered twice. A hidden line the reader cannot draw makes the
   engine hide give way (the game draws its own text): never the game invisible and nothing drawn. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { HookNative } = require('../core/hook-native.cjs');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fake = () => { const o = { serial: 1, traced: [], delivered: [], sent: [] }; o.trace = t => o.traced.push(t); o.deliverSource = (t, origin) => o.delivered.push([t, origin]); o.send = m => o.sent.push(m);
  o.placedHidden = HookNative.prototype.placedHidden; o.giveWay = HookNative.prototype.giveWay; return o; };
test('a hidden line no source carried is delivered from the placement; one a source carried is not', async () => {
  const h = fake(); h.recentSources = [HookNative.flat('そして火の爆ぜる音。')];
  h.placedHidden('呼吸をひとつする度に、\u001f指先に感覚が宿る。'); h.placedHidden('そして火の爆ぜる音。'); h.placedHidden('呼吸をひとつする度に、指先に感覚が宿る。');
  await new Promise(r => setTimeout(r, 520));
  assert.deepEqual(h.delivered, [['呼吸をひとつする度に、指先に感覚が宿る。', 'placement']]);
});
test('a source arriving within the wait wins', async () => {
  const h = fake(); h.placedHidden('どこかで雨の音を聞いた。'); setTimeout(() => { h.recentSources = [HookNative.flat('どこかで雨の音を聞いた。')]; }, 200);
  await new Promise(r => setTimeout(r, 520)); assert.deepEqual(h.delivered, []);
});
test('give way goes to the bridge, bounded; the bridge holds the hide off until then; the reader asks when it cannot draw', () => {
  const h = fake(); h.giveWay(99999); assert.deepEqual(h.sent, [{ type: 'engineGiveWay', ms: 10000 }]);
  const bridge = read('native/HookBridge.cs');
  assert.match(bridge, /bool want=ReplacementEnabled&&!KrkrHideBroken&&over&&DateTime\.UtcNow\.Ticks>=Interlocked\.Read\(ref GiveWayUntil\)/);
  assert.match(bridge, /type=="engineGiveWay"/);
  assert.match(read('services/reader.cjs'), /case 'engineGiveWay':g\?\.hooks\?\.giveWay\?\.\(r\.ms\)/);
  assert.match(read('core/gal-native.cjs'), /message\.type==='hookCharRects'&&message\.hidden===true&&message\.text&&this\.placement\?\.on\)this\.hooks\?\.placedHidden/);
  assert.match(read('web/reader/modules/text-place.js'), /\{ giveWay\(\); return; \} \/\* cannot be drawn here/);
});
