'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
// E334: YU-RIS hands every line skipped with Ctrl over as one text; only the line the game stopped on is shown.
test('merged skip text keeps the line after the last speaker change',()=>{
 const h=Object.create(HookNative.prototype);
 const merged='否定できない自分が悔しい……だ」駄目だっ。これ以上由良の顔を見てたら……もうっ……そうだ、目を逸らして、気持ちを落ち着かせれば――由良「隙ありっ」行人「えっ――？」由良が、何か呟いたかと思うと……ドサッ！次の瞬間、俺は地面に押し倒されていた。行人「痛たたた……」';
 assert.equal(h.lastOfMerged(merged),'行人「痛たたた……」');
});
test('ordinary long narration is left whole',()=>{
 const h=Object.create(HookNative.prototype);
 const text='余計な不安を煽るかのように、鳥の鳴き声が物悲しく響いていた。森の奥へ進むほど、空気は冷たくなっていく。足元の落ち葉が乾いた音を立て、どこか遠くで枝の折れる音がした。俺は思わず足を止め、辺りを見回した。誰もいない。';
 assert.equal(h.lastOfMerged(text),text);
 assert.equal(h.lastOfMerged('短い台詞。'),'短い台詞。');
});
