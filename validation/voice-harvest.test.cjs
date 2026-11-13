// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// services/voice-harvest.cjs: matching recorded clips to hooked lines, against simulated play sessions (no game, no DLL).
// The simulation: lines shown at reading pace, voice starting with jitter around the hook time, unvoiced lines, a click
// sound effect on every advance, looping music, skipping (voice cut by the next line), backlog replays. The native side
// has its own stand-in game (native/runtimedump/selftest/voicehost.cpp); its output is checked at the end when present.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');

function fresh(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-voice-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 for(const m of ['../services/runtime-dump.cjs','../services/voice-harvest.cjs'])delete require.cache[require.resolve(m)];
 const game=path.join(base,'Game');fs.mkdirSync(game);return{base,game,vh:require('../services/voice-harvest.cjs')};}

// Small deterministic PRNG so runs are repeatable.
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function simulate({n=600,seed=1,lead=[-250,500],voiced=0.75,skip=0.08,click=true,music=true,replay=0.03}={}){
 const r=rng(seed),lines=[],clips=[],truth=new Map();let t=1_700_000_000_000,file=0;
 const clip=(start,ms,extra={})=>{const c={file:`${String(++file).padStart(5,'0')}.wav`,start:Math.round(start),ms:Math.round(ms),crc:extra.crc||('c'+file),stopped:!!extra.stopped,obj:extra.obj||'v'};clips.push(c);return c;};
 if(music)clip(t-5000,90000-1,{obj:'bgm',crc:'bgm'});
 for(let i=0;i<n;i++){const text=`台詞${i}「テストの行${i}です」`;lines.push({text,t});
  const len=1200+r()*6000,read=len+400+r()*2500;let dwell=read;
  if(click)clip(t-20,120,{obj:'se',crc:'click'});
  if(r()<voiced){const start=t+lead[0]+r()*(lead[1]-lead[0]);const skipped=r()<skip;if(skipped)dwell=Math.max(300,(start-t)+200+r()*800);
   const ms=skipped?Math.max(MIN,(t+dwell)-start):len;const c=clip(start,ms,{stopped:skipped});truth.set(text,{c,partial:skipped});}
  if(r()<replay&&truth.size){const old=[...truth.values()][Math.floor(r()*truth.size)].c;clip(t+dwell*0.6,old.ms,{crc:old.crc});}
  t+=dwell;}
 return{lines,clips,truth};}
const MIN=400;
function score(vh,sim){const m=vh.match(sim.lines,sim.clips),got=new Map(m.map(x=>[x.text,x]));let right=0,wrong=0,missed=0,falsePos=0,partialOk=0;
 for(const l of sim.lines){const want=sim.truth.get(l.text),have=got.get(l.text);
  if(!want){if(have)falsePos++;continue;}
  if(!have){missed++;continue;}
  if(have.clip.crc===want.c.crc){right++;if(have.partial===want.partial)partialOk++;}else wrong++;}
 const voiced=sim.truth.size;return{voiced,right,wrong,missed,falsePos,precision:right/Math.max(1,right+wrong+falsePos),recall:right/Math.max(1,voiced),partialOk:partialOk/Math.max(1,right)};}

const report=[];
test.after(()=>{if(report.length)console.log('\nvoice-harvest accuracy\n'+report.join('\n'));});

for(const [name,opts,minP,minR] of [
 ['normal reading',{},0.99,0.98],
 ['voice up to 1 s after the hook',{lead:[-300,1000],seed:2},0.98,0.97],
 ['heavy skipping (30%)',{skip:0.3,seed:3},0.98,0.95],
 ['no click / no music',{click:false,music:false,seed:4},0.99,0.98],
 ['mostly unvoiced (30% voiced)',{voiced:0.3,seed:5},0.99,0.98],
 ['fast auto-skip reader',{skip:0.6,seed:6},0.95,0.9]]){
 test(`matching: ${name}`,()=>{const{vh}=fresh();let agg=null;
  for(let s=0;s<5;s++){const r=score(vh,simulate({...opts,seed:(opts.seed||1)*100+s}));agg=agg?Object.fromEntries(Object.keys(r).map(k=>[k,agg[k]+r[k]])):r;}
  const p=agg.right/Math.max(1,agg.right+agg.wrong+agg.falsePos),rc=agg.right/agg.voiced;
  report.push(`  ${name.padEnd(34)} precision ${(p*100).toFixed(2)}%  recall ${(rc*100).toFixed(2)}%  (voiced ${agg.voiced}, wrong ${agg.wrong}, false ${agg.falsePos}, missed ${agg.missed}, partial flag ${(agg.partialOk/5*100).toFixed(1)}%)`);
  assert.ok(p>=minP,`precision ${p}`);assert.ok(rc>=minR,`recall ${rc}`);});}

test('build keeps the full clip over a partial one and lookup/publish/script naming work',()=>{const{base,game,vh}=fresh();
 const dir=vh.voiceDir(game);fs.mkdirSync(dir,{recursive:true});
 const wav=(f,n)=>{const b=Buffer.alloc(44+n);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(22050,24);b.writeUInt32LE(44100,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n,40);b.fill(7,44);fs.writeFileSync(path.join(dir,f),b);};
 wav('00001.wav',4000);wav('00002.wav',40000);wav('00003.wav',20000);
 const ev=[{file:'00001.wav',start:1000,ms:500,crc:'a',stopped:true},{file:'00002.wav',start:20100,ms:5000,crc:'b',stopped:false},{file:'00003.wav',start:90000,ms:2000,crc:'c',name:'C:\\g\\voice\\mgm0042.ogg'}];
 fs.writeFileSync(path.join(dir,'events.jsonl'),ev.map(e=>JSON.stringify(e)).join('\n')+'\n');
 vh.noteLine(game,'めぐみん「爆裂魔法！」',950);vh.noteLine(game,'次の行',1520);vh.noteLine(game,'めぐみん「爆裂魔法！」',20000);vh.noteLine(game,'他の行',30000);
 const r=vh.build(game,{script:[{text:'「吾が名はめぐみん」',voice:'MGM0042'}]});
 assert.equal(r.voiced,2);
 const hit=vh.lookup(game,'「爆裂魔法！」');assert.equal(hit.file,'00002.wav');assert.equal(hit.partial,false);
 assert.equal(vh.lookup(game,'吾が名はめぐみん').src,'script');assert.equal(vh.lookup(game,'他の行'),null);
 process.env.MEGULIT_TEST_ROOT=base;const gv=require('../services/game-voice.cjs');gv._reset();
 assert.equal(vh.publish(base,game),2);assert.ok(gv.find(base,'めぐみん「爆裂魔法！」'));});

test('always on (no switch); three faults for a game switch it off',()=>{const{game,vh}=fresh();assert.equal(vh.enabled(game),true);
 assert.equal(vh.setEnabled,undefined);
 const d=vh.voiceDir(game);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'disabled.txt'),'fault a\nfault b\n');assert.equal(vh.enabled(game),true);
 fs.appendFileSync(path.join(d,'disabled.txt'),'fault c\n');assert.equal(vh.enabled(game),false);});

// Output of the native stand-in game (selftest/voice-run.ps1), when it has run on this machine.
const NATIVE=process.env.MEGULIT_VOICE_SELFTEST||'H:\\MeguLit-Work\\voice-selftest';
for(const bit of ['32','64'])test(`native stand-in game x${bit}: every voiced line gets its own clip`,{skip:!fs.existsSync(path.join(NATIVE,'out'+bit))},()=>{
 process.env.MEGULIT_RUNTIME_DUMP=path.join(NATIVE,'out'+bit);for(const m of ['../services/runtime-dump.cjs','../services/voice-harvest.cjs'])delete require.cache[require.resolve(m)];
 const vh=require('../services/voice-harvest.cjs'),game=path.join(NATIVE,'game'+bit);
 const truth=JSON.parse(fs.readFileSync(path.join(NATIVE,'game'+bit,'truth.json'),'utf8'));
 vh.build(game);let right=0,wrong=0,missed=0,falsePos=0;
 for(const t of truth){const hit=vh.lookup(game,t.text);
  if(t.id<0){if(hit)falsePos++;continue;}if(!hit){missed++;continue;}
  const b=fs.readFileSync(hit.path),d=b.indexOf('data')+8,id=b.readInt16LE(d+2);/* the stand-in writes its clip id as the 2nd sample */
  if(id===t.id)right++;else wrong++;
  assert.equal(hit.partial,/これは9番目/.test(t.text),`partial flag for ${t.text}`);/* the stand-in skips line 9 mid-voice */}
 const voiced=truth.filter(t=>t.id>=0).length;
 report.push(`  native x${bit} (${[...new Set(truth.map(t=>t.api).filter(Boolean))].join('/')})`.padEnd(36)+` right ${right}/${voiced}, wrong ${wrong}, false ${falsePos}, missed ${missed}`);
 assert.equal(wrong,0);assert.equal(falsePos,0);assert.ok(right>=voiced-1,`right ${right}/${voiced}`);});
