// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 游戏差分全自动生成) replay of the owner's incr9 run (E:\MeguLit-Test-1421\logs, trimmed to the lines the gate reads):
   - ファタモルガーナの館 (22:51:03-22:53:42Z): lines drawn nowhere and dropped, choices filtered to nothing -> the gate steps it down,
     and the first-play calibration finds no hide combination that passes -> read mode.
   - 千恋＊万花 (22:53:42Z on): no window over a threshold, calibration keeps hide + redraw.
   Then the live service on a fake reader: calibration stored, read mode with the reason, 重新校准 records again. */
process.env.MEGULIT_RELAY_BASE='off';/* no relay: the shared result and the report stay local */
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {replay,parseTrace,SelfCheck,effectFrame}=require('../core/self-check.cjs');
const ap=require('../core/auto-profile.cjs');
const dir=path.join(__dirname,'helpers','selfcheck-replay');
const he=fs.readFileSync(path.join(dir,'incr9-hook-events.log'),'utf8'),rh=fs.readFileSync(path.join(dir,'incr9-reader-host.log'),'utf8');
const FATA=['2026-11-20T22:51:03','2026-11-20T22:53:42'],SENREN=['2026-11-20T22:53:42',''];

/* parser */
assert.deepStrictEqual(parseTrace('2026-11-20T22:51:56.031Z choice options filtered 3 -> 0'),{kind:'choice',at:Date.parse('2026-11-20T22:51:56.031Z'),raw:3,shown:0});
assert.strictEqual(parseTrace('2026-11-20T22:51:55.204Z krkr page: hook line drawn nowhere on the page, dropped chars=16').kind,'drop');
assert.strictEqual(parseTrace('2026-11-20T22:51:13.825Z flow page: not a story line, dropped (menu/help) "オープニング"'),null,'a menu page drop is intended');
assert.strictEqual(parseTrace('selfCheck window=1 lines=20'),null,'its own trace is never read back');
assert.strictEqual(parseTrace('2026-11-20T22:54:32.067Z visual {"type":"hookVisual","sequence":6,"stage":"baseline","valid":true,"matched":true}'),null,'baseline shows the original on purpose');
assert.ok(effectFrame('を私呼ぶを私声呼ぶがを私…私声呼…をぶ'));assert.ok(!effectFrame('その瞬間、私は死体を見下ろしていた。'));

/* the gate */
const fata=replay(he,rh,{from:FATA[0],to:FATA[1]}),senren=replay(he,rh,{from:SENREN[0],to:SENREN[1]});
assert.ok(fata.tripped,'Fata must step down');assert.strictEqual(fata.tripped.window,1,'already in its first window');assert.ok(fata.tripped.over.includes('dropRate'),fata.tripped.over.join());
assert.ok(fata.windows[0].metrics.dropRate>0.15);
assert.ok(senren.windows.length>=1,'Senren closes at least one window');assert.strictEqual(senren.tripped,null,'Senren never steps down: '+JSON.stringify(senren.windows.map(w=>w.over)));
for(const w of senren.windows){assert.strictEqual(w.metrics.dropRate,0);assert.strictEqual(w.metrics.choiceMismatch,0);assert.ok(w.metrics.hideVisible===null||w.metrics.hideVisible<=0.25);}

/* calibration on the first window's recording */
const cf=ap.calibrate(fata.recording),cs=ap.calibrate(senren.recording);
assert.strictEqual(cf.mode,'read','no hide combination fixes Fata: '+JSON.stringify(cf.candidates.map(c=>[c.params,c.over])));
assert.ok(cf.reason.length>0);assert.strictEqual(cf.settings.hide.textEffectsRead,true);
assert.ok(cf.candidates.some(c=>c.params.effectFrames===true&&c.over.includes('hideVisible')),'effect frames as one line still leave the game painting its original');
assert.strictEqual(cs.mode,'hide');assert.strictEqual(cs.settings.calibrate.hideMethod,'hide');assert.strictEqual(cs.settings.calibrate.positionSource,'engine');
assert.strictEqual(cs.settings.page.effectFrames,null,'the least change wins among passing ones');assert.ok(!cs.settings.choice,'kernel choice filters kept');

/* thresholds come from the profile layers */
const strict=replay(he,rh,{from:SENREN[0],to:SENREN[1],thresholds:{window:5,dropRate:-1}});assert.ok(strict.tripped,'a game diff may tighten the thresholds');

/* the record + upload block */
(async()=>{
const crypto=require('node:crypto');
const K='ab'.repeat(32);
const rec=ap.record({key:K,engine:'krkr',exe:'D:\\Games\\Fata\\fata_jp.exe',version:'1.4.21',result:cf});
assert.strictEqual(rec.exe,'fata_jp.exe','no paths');assert.strictEqual(rec.schema,1);
const diag=ap.diagnostic(rec,fata.windows);assert.strictEqual(diag.profile.mode,'read');assert.strictEqual(diag.windows.length,fata.windows.length);assert.ok(!JSON.stringify(diag).includes('Games'));

/* the live service: first play calibrates and stores read mode, the reason reaches GalNative, 重新校准 records again */
const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'selfcheck-'));
try{
 /* the diff key is the exe file's hash: two copies of one file share it, another version does not */
 const exe=path.join(root,'Fata','fata_jp.exe'),copy=path.join(root,'Copy','renamed.exe'),other=path.join(root,'Fata','fata_jp_v2.exe');
 for(const [f,b] of [[exe,'MZ-fata-1'],[copy,'MZ-fata-1'],[other,'MZ-fata-2']]){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);}
 const key=await ap.exeKey(root,exe);assert.strictEqual(key,crypto.createHash('sha256').update('MZ-fata-1').digest('hex'));require('../services/runtime-sample.cjs').setEnabled(root,true);
 assert.strictEqual(await ap.exeKey(root,copy),key,'a renamed copy is the same diff');assert.notStrictEqual(await ap.exeKey(root,other),key,'another version is its own diff');
 assert.strictEqual(ap.exeKeySync(root,exe),key,'remembered: no read at the next start');
 const live=require('../services/self-check-live.cjs');const calls=[],logged=[],traced=[];
 const profiles=[];const gal={setGameProfile(p){profiles.push(p);},textEffectsHold:null,textEffects(on,why){calls.push([on,why]);this.textEffectsHold=on?{why}:null;},hooks:{pageMode:{engine:'krkr'},trace:l=>traced.push(l)}};
 const reader={root,gal,gameExe:exe,logVisibility:e=>logged.push(e)};
 live.start(reader,reader.gameExe);assert.strictEqual(live.current().key,key);
 for(const l of he.split('\n'))if(l>=FATA[0]&&l<FATA[1])live.feedTrace(l);
 const stored=ap.load(root,key);
 assert.ok(stored,'calibration stored');assert.strictEqual(stored.mode,'read');assert.strictEqual(calls.length,1);assert.strictEqual(calls[0][0],true);assert.ok(calls[0][1].length>0,'Alt+T shows why');
 assert.ok(traced.some(l=>l.startsWith('selfCheck window=1')),'window traced');const top=profiles[profiles.length-1];assert.ok(top.layers.endsWith('+auto'),'the calibration is the profile top layer: '+top.layers);assert.strictEqual(top.hide.textEffectsRead,true);assert.strictEqual(top.calibrate.hideMethod,'read');assert.ok(logged.some(e=>e.kind==='selfCheck'&&e.what==='calibrated'));
 /* the runtime sample of the first window */
 const sample=JSON.parse(fs.readFileSync(path.join(root,'data','runtime-samples',key,'sample.json'),'utf8'));assert.strictEqual(sample.schema,'megulit.runtime-sample');assert.ok(sample.lines.length>=20);assert.ok(sample.boxes.length>0);assert.ok(sample.drops.length>0);assert.strictEqual(sample.exe,'fata_jp.exe');
 live.stop();gal.textEffectsHold=null;calls.length=0;
 live.start(reader,reader.gameExe);assert.strictEqual(calls.length,1,'stored read mode applies at the next start');
 gal.textEffectsHold=null;live.recalibrate(reader);assert.strictEqual(ap.load(root,key),null,'重新校准 forgets the stored diff');assert.ok(live.current().check.recording,'and records again');
 live.stop();
 /* a stored hide diff that fails later steps down */
 ap.store(root,key,ap.record({key,engine:'krkr',exe:reader.gameExe,version:'x',result:cs}));calls.length=0;live.start(reader,reader.gameExe);assert.strictEqual(calls.length,0);
 for(const l of he.split('\n'))if(l>=FATA[0]&&l<FATA[1])live.feedTrace(l);
 const down=ap.load(root,key);assert.strictEqual(down.mode,'read');assert.strictEqual(down.source,'gate');assert.ok(down.gate.over.includes('dropRate'));assert.strictEqual(down.previous.mode,'hide');assert.strictEqual(calls.length,1);
 live.stop();
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('self-check gate: Fata steps down (window 1: '+fata.tripped.over.join(',')+'), calibration -> read; Senren '+senren.windows.length+' window(s) pass, calibration -> hide');
})().catch(e=>{console.error(e);process.exit(1);});
