'use strict';
// Auto read-aloud after a lookup or selection (user, 2026-11-09): a voice setting, off by default, saved like the
// others; the word card says where to turn it on without taking extra space.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {cleanV4}=require('../core/v4-config.cjs');

test('aivisAutoSpeak is a saved boolean that defaults to off',()=>{
 assert.equal(cleanV4({}).aivisAutoSpeak,false);
 assert.equal(cleanV4({aivisAutoSpeak:true}).aivisAutoSpeak,true);
 assert.equal(cleanV4({aivisAutoSpeak:'yes'}).aivisAutoSpeak,false);
});

test('the voice page has the switch, the card speaks once and hints where the switch is',()=>{
 const v4=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','v4.js'),'utf8');
 assert.match(v4,/\['aivisAutoSpeak','点读或选中单词后自动朗读','checkbox'\]/);
 assert.match(v4,/if\(config\.aivisAutoSpeak\)\{const key=\[args\.text,args\.start,args\.end\]/);
 assert.match(v4,/Alt\+T → 语音 可开启自动朗读/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','settings-schema.cjs'),'utf8'),/'aivisAutoSpeak'/);
});
