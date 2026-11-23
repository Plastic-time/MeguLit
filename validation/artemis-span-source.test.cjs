// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Profiles=require('../core/profiles/index.cjs'),{HookNative:Hook}=require('../core/hook-native.cjs');
const sha='5132eed8c2e4a7d0ec4d853cd2b8247f3a0641c4a3825a8210fd435530e7d716';
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('only the diagnosed Amakano 3 executable opts into Artemis quoted spans',()=>{
 const measured=Profiles.profileFor({engine:'Artemis',exe:'Amakano3.exe',exeSha256:sha});
 assert.equal(measured.source.artemisQuoteSpans,true);assert.match(measured.layers,/\+seed$/);
 for(const input of [{engine:'Artemis',exe:'Amakano3.exe'},{engine:'Artemis',exe:'Amakano3.exe',exeSha256:'ca1fe32160ee8557acc0af712cd5eaf642eb29cc14f0ec06715824675d3c05a5'},{engine:'kirikiri'},{engine:'bgi'},{engine:'siglus'}])assert.equal(Profiles.profileFor(input).source.artemisQuoteSpans,false);
 const bridge=Hook.prototype.bridgeProfile;
 assert.equal(bridge.call({profile:measured}).artemisQuoteSpans,true);
 assert.equal(bridge.call({profile:{...measured,engine:'bgi'}}).artemisQuoteSpans,undefined);
 assert.equal(bridge.call({profile:Profiles.profileFor({})}).artemisQuoteSpans,undefined);
});
test('the native span path is engine-specific, opt-in and disabled during skipping',()=>{
 const b=read('native/HookBridge.cs'),frames=read('native/HookSourceFrames.cs');
 assert.match(b,/ProfileArtemisQuoteSpans&&name=="Artemis64x"&&!SkipHeld\?EmbedBatch\.ArtemisQuoteLine\(text,DateTime\.UtcNow\):latest/);
 assert.match(b,/ProfileArtemisQuoteSpans=d!=null&&d\.TryGetValue\("artemisQuoteSpans",out av\)&&av is bool&&\(bool\)av/);
 assert.match(b,/!EmbedSourceBatch\.ArtemisQuoteSelfTest\(\)/);
 assert.match(b,/if\(!artemisJoined\)ChoiceBatch\(name,EmbedBatch\.Recent\(DateTime\.UtcNow\)\)/,'message spans never become choice candidates');
 assert.match(b,/if\(final==text&&!SkipHeld&&!artemisJoined\)pageParts=/,'rt2 spans stay on this message instead of advancing on later clicks');
 assert.match(frames,/if\(start>=0&&start<parts\.Count-1&&quotes\.Count==0\)return String\.Concat/);
 assert.match(frames,/ArtemisQuoteLine\("未記録"\+first\+tail,now\)!=batch\.LastLine/);
});


