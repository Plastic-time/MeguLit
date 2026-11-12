'use strict';
// Issue 119: changing the Japanese text size had no effect.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>require('./flat-source.cjs')(path.join(root,f));
const style=require('../core/game-style.js'),profile=require('../core/game-profile.js'),{Settings}=require('../services/settings.cjs');

test('a hand-set size is remembered as such and travels with a work\'s settings',()=>{
 assert.equal(style.clean({sizeSource:'user'}).sizeSource,'user');
 assert.equal(style.clean({sizeSource:'auto'}).sizeSource,'');
 assert.equal(style.clean({}).sizeSource,'');
 assert.equal(profile.pick({sizeSource:'user'},'text').sizeSource,'user');
 for(const f of ['web/reader/modules/game-style.js','web/reader/modules/game-profile.js'])assert.match(read(f),/sizeSource/);
});

test('home settings: a global size is saved as hand-set, and a work\'s size as well',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-119-'));
 try{
  const s=new Settings(dir);
  s.save({scope:'text',values:{japaneseSize:22}});
  const global=s.read('text');
  assert.equal(global.japaneseSize,22);
  assert.equal(global.sizeSource,'user');
  const key='a'.repeat(64);
  fs.writeFileSync(path.join(s.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'x',savedAt:1,textSavedAt:1,prefs:{japaneseSize:40}}}}));
  assert.equal(s.read('text',key).japaneseSize,40,'a work\'s saved size wins over the global one');
  s.save({scope:'text',profile:key,values:{japaneseSize:18}});
  const work=s.read('text',key);
  assert.equal(work.japaneseSize,18);
  assert.equal(work.sizeSource,'user');
  s.save({scope:'text',values:{typewriter:false}});
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.folder,'text-defaults.json'),'utf8')).japaneseSize,22,'other text saves keep the size');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('the running reader is rebuilt from the global preset, and global sizes reach the running work',()=>{
 const src=read('services/runtime.cjs');
 assert.match(src,/SIZE_KEYS=\['japaneseSize','translationSize','englishSize'\]/);
 assert.match(src,/settings\.save\(\{scope:'text',profile:active/);
 assert.match(src,/const global=settings\.read\('text'\)/);
 assert.doesNotMatch(src,/clean\(readJSON\(path\.join\(this\.folder,'gal-preferences\.json'\)\)\)/);
});

test('automatic calibration keeps a hand-set size; a sync the user starts measures it again',()=>{
 const src=read('web/reader/modules/game-style-sync-ui.js');
 assert.match(src,/m\.gameStyleAutomatic===true&&b\.galPreferences\(\)\.sizeSource==='user'\)\{for\(const k of \['japaneseSize','translationSize','japaneseSpacingPx'\]\)delete out\[k\];\}else if\(m\.gameStyleAutomatic!==true\)out\.sizeSource='';/);
 assert.match(read('web/reader/modules/gal.js'),/sizeSource: Number\(f\('galJapaneseSize'\)\.value\)!==preferences\.japaneseSize/);
});

test('page modes use the hand-set size instead of the game\'s',()=>{
 const src=read('web/reader/modules/island-page.js');
 assert.match(src,/function userSize\(p\)\{if\(p\.sizeSource!=='user'\)return 0;/);
 assert.match(src,/function placeGrid\(G\)\{let info=/);
 assert.match(src,/const own=userSize\(p\);if\(own\)\{const f=own\/size;size=own;pitch\*=f;rowH\*=f;\}/);
 assert.match(src,/const own=userSize\(p\);if\(own\)\{width\*=own\/size;size=own;\}/);
});
