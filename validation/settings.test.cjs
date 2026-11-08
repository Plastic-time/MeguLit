// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Settings}=require('../services/settings.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-settings-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const settings=new Settings(root),put=(name,value)=>fs.writeFileSync(settings.file(name),JSON.stringify(value));return {root,settings,put,read:name=>JSON.parse(fs.readFileSync(settings.file(name),'utf8'))};}
test('all exposed setting groups have three languages and round-trip valid values',t=>{
 const {settings}=fixture(t),data=settings.get();assert.equal(new Set(data.fields.map(field=>field.scope+'.'+field.key)).size,data.fields.length);
 for(const group of data.groups){for(const lang of ['zh','en','ja'])assert.ok(group.label[lang]);const update={};for(const field of data.fields.filter(f=>f.scope===group.id)){for(const lang of ['zh','en','ja'])assert.ok(field.label[lang]);update[field.key]=field.readOnly?data.values[group.id][field.key]:field.type==='select'?field.options[0].value:field.type==='boolean'?true:field.type==='number'?(field.min??1):field.type==='color'?'#123456':field.key==='ankiPath'?'C:\\Test\\anki.exe':/Url|baseUrl/.test(field.key)?'http://127.0.0.1:8765':field.key==='folders'?'E:\\Games\nE:\\More':'round-trip';}
  const after=settings.save({scope:group.id,values:update});for(const field of data.fields.filter(f=>f.scope===group.id)){const actual=after.values[group.id][field.key];assert.equal(actual,update[field.key],group.id+'.'+field.key);}
 }
});
test('settings preserve unknown custom fields, encrypted vault bytes, and adjacent scopes',t=>{
 const {settings,put,read}=fixture(t);put('preferences.json',{provider:'google',contextLines:6,customExtension:{future:true}});put('native-preferences.json',{profile_picture:'original-picture.png',word_level_colors:['#111111','#222222','#333333','#444444','#555555'],unknownCustom:321});fs.writeFileSync(settings.file('secrets.dpapi'),'opaque-test-ciphertext');
 settings.save({scope:'translation',values:{contextLines:3}});settings.save({scope:'lookup',values:{'word_level_colors.2':'#abcdef'}});
 assert.equal(read('preferences.json').customExtension.future,true);assert.equal(read('native-preferences.json').unknownCustom,321);assert.equal(read('native-preferences.json').profile_picture,'original-picture.png');assert.deepEqual(read('native-preferences.json').word_level_colors,['#111111','#222222','#abcdef','#444444','#555555']);assert.equal(fs.readFileSync(settings.file('secrets.dpapi'),'utf8'),'opaque-test-ciphertext');assert.equal(settings.get().hasSavedKeys,true);
});
test('per-game styles and extracted game fonts survive saves without changing global defaults',t=>{
 const {settings,put,read}=fixture(t),key='a'.repeat(64);put('gal-preferences.json',{japaneseSize:34});put('game-style-profiles.json',{version:3,entries:{[key]:{name:'Test work',prefs:{japaneseSize:42,japaneseFont:'game:0123456789'},positionMap:{anchor:7},customFlag:true,history:[]}}});
 const before=settings.get(key);assert.equal(before.values.text.japaneseSize,42);settings.save({scope:'text',profile:key,values:{japaneseSize:45,japaneseFont:'game:0123456789'}});assert.equal(settings.get().values.text.japaneseSize,34);assert.equal(settings.get(key).values.text.japaneseSize,45);assert.equal(read('game-style-profiles.json').entries[key].customFlag,true);assert.equal(read('game-style-profiles.json').entries[key].positionMap.anchor,7);assert.equal(read('game-style-profiles.json').entries[key].history.length,1);
});
test('three panel settings remain independent and preserve existing positions and crops',t=>{
 const {settings,root}=fixture(t);fs.writeFileSync(path.join(root,'data','ui-state.json'),JSON.stringify({'tome-log-position':'{"x":20}','tome-menu-background':JSON.stringify({alpha:62,panels:{menu:{alpha:40},log:{alpha:70},card:{alpha:90}},custom:true,crop:{x:22,y:44,zoom:2}})}));
 settings.save({scope:'panels',values:{'panels.menu.alpha':35,'panels.log.glassBlur':9}});const panels=settings.read('panels');assert.equal(panels.panels.menu.alpha,35);assert.equal(panels.panels.log.alpha,70);assert.equal(panels.panels.card.alpha,90);assert.equal(panels.custom,true);assert.equal(panels.crop.x,22);assert.equal(settings.ui()['tome-log-position'],'{"x":20}');
});
test('invalid profiles and fields cannot partially write settings',t=>{
 const {settings,put,read}=fixture(t);put('preferences.json',{provider:'google',contextLines:6});
 for(const params of [{scope:'translation',profile:'b'.repeat(64),values:{contextLines:1}},{scope:'translation',values:{contextLines:2,apiKey:'must-not-be-written'}},{scope:'anki',values:{ankiUrl:'https://example.com'}},{scope:'translation',values:{baseUrl:'https://user:pass@example.com'}},{scope:'text',values:{japaneseSize:NaN}}])assert.throws(()=>settings.save(params));assert.equal(read('preferences.json').contextLines,6);
});
test('numeric controls return their clamped persisted values',t=>{const {settings}=fixture(t);assert.equal(settings.save({scope:'speech',values:{aivisSpeed:999,aivisSpeaker:1.8}}).values.speech.aivisSpeed,2);assert.equal(settings.get().values.speech.aivisSpeaker,2);});

test('continuous appearance controls retain fractions while counts stay integral',t=>{
 const {settings}=fixture(t);
 for(const [scope,values]of Object.entries({text:{japaneseSize:34.125,rubyOffsetX:-1.375,textGradientStart:22.375,lineHeight:-.333},position:{x:4.125,width:90.375},background:{blur:12.375,dim:44.125},speech:{aivisSpeed:1.123,aivisVolume:.777},reader:{history_font_size:17.375,history_line_height:1.777},lookup:{status_underline_width:1.375}})){
  const saved=settings.save({scope,values}).values[scope];
  for(const [key,value]of Object.entries(values))assert.equal(saved[key],value,scope+'.'+key);
 }
 assert.equal(settings.save({scope:'translation',values:{contextLines:3.7}}).values.translation.contextLines,4);
 assert.equal(settings.save({scope:'speech',values:{aivisSpeaker:2.8}}).values.speech.aivisSpeaker,3);
});
