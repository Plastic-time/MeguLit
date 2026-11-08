// SPDX-License-Identifier: GPL-3.0-or-later
// E215 global text defaults: the home settings page edits a preset for works without saved settings (white text,
// black outline out of the box). Merge order: built-in → preset → the work's saved settings; saving one work's text
// settings never changes the preset or another work.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {Settings}=require('../services/settings.cjs'),presets=require('../core/text-defaults.cjs'),{GameStyleSync}=require('../core/game-style-sync.cjs');
function root(){const r=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-text-'));fs.mkdirSync(path.join(r,'data','config'),{recursive:true});return r;}
const A='a'.repeat(64),B='b'.repeat(64);
function profiles(r,entries){fs.writeFileSync(path.join(r,'data','config','game-style-profiles.json'),JSON.stringify({version:3,entries}));}
test('the built-in preset is white text with a black outline',()=>{
 const r=root(),v=new Settings(r).read('text');assert.equal(v.textColor,'#ffffff');assert.equal(v.japaneseOutlineColor,'#000000');assert.equal(v.chineseOutlineColor,'#000000');assert.equal(v.rubyOutlineColor,'#000000');
});
test('home settings write the preset, not the live session file; other text fields stay with the session',()=>{
 const r=root(),s=new Settings(r);s.save({scope:'text',values:{japaneseFont:'yuMincho',japaneseSize:40,englishFont:'georgia',paddingX:12}});
 const preset=presets.read(path.join(r,'data','config'));assert.equal(preset.japaneseFont,'yuMincho');assert.equal(preset.japaneseSize,40);assert.equal(preset.englishFont,'georgia');assert.equal(preset.paddingX,undefined);
 const session=JSON.parse(fs.readFileSync(path.join(r,'data','config','gal-preferences.json'),'utf8'));assert.equal(session.paddingX,12);assert.equal(session.japaneseFont,undefined);
 assert.equal(s.read('text').japaneseSize,40);
});
test('a work with saved settings keeps them; saving work A changes neither the preset nor work B',()=>{
 const r=root(),s=new Settings(r);profiles(r,{[A]:{name:'A',savedAt:1,prefs:{japaneseSize:28,textColor:'#ffeeaa'}},[B]:{name:'B',savedAt:1,prefs:{}}});
 s.save({scope:'text',values:{japaneseSize:44}});s.save({scope:'text',profile:A,values:{japaneseFont:'meiryo'}});
 assert.equal(s.read('text',A).japaneseSize,28);assert.equal(s.read('text',A).japaneseFont,'meiryo');assert.equal(s.read('text',A).textColor,'#ffeeaa');
 assert.equal(s.read('text',B).japaneseSize,44);assert.equal(s.read('text',B).japaneseFont,'originalGothic');
 assert.equal(presets.read(path.join(r,'data','config')).japaneseFont,undefined);
});
test('binding a new game applies built-in → preset → saved work settings',()=>{
 const r=root(),config=path.join(r,'data','config');presets.write(config,{japaneseSize:46,rubyFont:'mincho'});
 const sync=Object.create(GameStyleSync.prototype);sync.profileFile=path.join(config,'game-style-profiles.json');
 const base=sync.base();assert.equal(base.japaneseSize,46);assert.equal(base.rubyFont,'mincho');assert.equal(base.textColor,'#ffffff');assert.ok('x' in base||'width' in base);
});
