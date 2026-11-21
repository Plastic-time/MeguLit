// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* ファタモルガーナの館 acceptance (2026-11-21, owner: one owner, a real DOM-level replay, everything green before a test package).
   The owner's own logs of 2026-11-21 (owner-20261121/logs: engine-draw / hook-events / reader-host excerpts, 02:56-02:58 and
   03:31-03:36 UTC; recordings 11.57.19, 12.35.41 local) replayed through the whole chain the owner's PC runs
   (tools/reader-replay/driver.cjs: runtime -> reader service -> GalNative -> HookNative -> placement / engine-draw ->
   the real reader page with every module, headless Edge), with the owner's own settings (owner-20261121/data).
   Every symptom the owner reported is one check:
     1 every Japanese line is drawn on the game's place by the engine-coordinate path and can be clicked
     2 the Chinese sits under the Japanese; the Japanese does not move when the translation arrives
     3 no flash when advancing (no line comes back, nothing drawn from the orphan / glyph fallback)
     4 20 lines in a row keep all of it, the hide is never given up (no disable, no give way)
     5 never read mode
     6 the maid page's options are drawn (the choice frame reaches the script), no OCR noise becomes the reader's line
     7 「聖なるかな」 is one bilingual line, no table of OCR rows
     8 after 校准当前句 the Japanese stays, back within 1 s, the hook is not restarted or switched
     9 one render owner: a line's Japanese is drawn by one path only
    10 no white Japanese that cannot be clicked (every Japanese glyph drawn is inside a hit region)
    11 the control file end to end: profile -> hook-native with the game's real pid -> %TEMP%\MeguLit\draw\<pid>.txt -> the
       script's own reader (native/krkrtext/script.inc st.ctl, through tools/reader-replay/krkr-model.cjs)
   Models used where the logs cannot carry what a newer build would make the game do (each named in driver.cjs): the script
   reports hidden=1 while core keeps the hide on; the game clears its layer at the click ([cm]) and the script reports it
   (st.clearSent, only with #clearline). MEGULIT_FATA_ACCEPT_OUT=<file> writes the per-check table. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
module.exports=async ({assert,root,fixture})=>{
 let pw;try{pw=require.resolve(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core');}catch{console.log('# fata acceptance skipped: no playwright-core');return;}
 if(process.env.MEGULIT_FATA_ACCEPT==='0')return;
 const L=require(path.join(root,'tools','reader-replay','from-logs.cjs'));
 const logs=path.join(fixture,'owner-20261121','logs'),data=path.join(fixture,'owner-20261121','data');
 const work=fs.mkdtempSync(path.join(process.env.MEGULIT_REPLAY_WORK||require('node:os').tmpdir(),'fata-accept-'));
 const game=(pid,started)=>({pid,started,hwnd:'2107056',sha:'17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42',title:'ファタモルガーナの館',process:'fata_jp',exe:'D:\\Games\\Fata\\fata_jp.exe',
  /* reader-host.log: pointer x - gameX = 462, y - gameY = 264 (dpr 1); the reader box = the owner's x 9.08 % / y 85.76 % of the 804x604 client */
  layout:{clientWidth:804,clientHeight:604,clientX:462,clientY:264,magpie:false,readerX:535,readerY:782,readerWidth:731,readerHeight:163,workBottom:1040,surfaceWidth:1920,surfaceHeight:1079,maskX:0,maskY:0},
  stream:{id:'575310:0:0',name:'Krkr2wcs',code:'EXHQXN8@175310:fata_jp.exe'}});
 const calib=t=>({t:Date.parse(t),mark:'calibrate',settle:0,page:String(()=>{const x=document.querySelector('[data-game-style-sync]');if(!x)window.__tomoyoChinese?.toggleGalMenu?.();setTimeout(()=>{const y=document.querySelector('[data-game-style-sync]');window.__replayCalib=(window.__replayCalib||0)+(y?1:0);y?.click();setTimeout(()=>{if(document.querySelector('[data-game-style-sync]'))window.__tomoyoChinese?.toggleGalMenu?.();},400);},200);})});
 function scenario(name,from,to,g,{actions=[],choice=[]}={}){
  const ex=L.extract(logs,from,to);const t0=Date.parse(from);
  const steps=[...L.attachSteps(g,t0),...L.timeline(ex,g,{actions:[...actions,...choice.map(t=>({t:Date.parse(t),choicePage:t}))]}),{t:Date.parse(to),mark:'end'}];
  const file=path.join(work,name+'.json');fs.writeFileSync(file,JSON.stringify({game:g,steps,maxGap:1500,sampleEvery:90}));return {name,file,ex};}
 const runs=[
  scenario('dialogue',  '2026-11-21T03:35:30.000Z','2026-11-21T03:36:45.000Z',game(42452,'638994198000000000'),{actions:[calib('2026-11-21T03:35:49.300Z')],choice:['2026-11-21T03:36:30.000Z']}),
  scenario('art',       '2026-11-21T03:31:50.000Z','2026-11-21T03:32:32.000Z',game(42452,'638994198000000000')),
  scenario('advance',   '2026-11-21T02:56:30.000Z','2026-11-21T02:58:20.000Z',game(39016,'638994190000000000'))];
 const outs=await Promise.all(runs.map(r=>new Promise(resolve=>{const out=r.file.replace(/\.json$/,'.out.json');
  const p=spawn(process.execPath,[path.join(root,'tools','reader-replay','driver.cjs'),r.file,out],{env:{...process.env,MEGULIT_REPLAY_DATA:data,MEGULIT_REPLAY_WORK:work,MEGULIT_PLAYWRIGHT:path.dirname(pw)},stdio:['ignore','ignore',fs.openSync(r.file.replace(/.json$/,'.err.txt'),'w')],windowsHide:true});
  const kill=setTimeout(()=>p.kill(),420000);p.on('exit',()=>{clearTimeout(kill);let o=null;try{o=JSON.parse(fs.readFileSync(out,'utf8'));}catch{}resolve({...r,o});});})));
 const res={},put=(k,ok,why)=>{res[k]={ok:!!ok,why:String(why||'').slice(0,600)};};
 for(const r of outs)assert.ok(r.o&&!r.o.errors.length,r.name+' replay ran: '+JSON.stringify(r.o?.errors||'no output').slice(0,600));
 const by=Object.fromEntries(outs.map(r=>[r.name,r]));
 const JP=/[\u3040-\u30ff\u3400-\u9fff]/;
 const jpGlyphs=s=>s.glyphs.filter(g=>JP.test(g.text)&&!['ui','zh'].includes(g.kind)&&!/[A-Za-z]{2}|[\u4e00-\u9fff]{2,}[，。：]/.test(g.text)&&g.kind!=='other');
 const inside=(g,hits)=>hits.some(h=>{const cx=g.rect.x+g.rect.w/2,cy=g.rect.y+g.rect.h/2;return cx>=h.x-1&&cx<=h.x+h.width+1&&cy>=h.y-1&&cy<=h.y+h.height+1;});
 const norm=t=>String(t||'').replace(/[^\u3040-\u30ff\u3400-\u9fff]/g,'');
 /* the dialogue lines of a run: each hookSource with its first record, and the samples taken while it was the reader's line */
 /* a line counts once it is the reader's line for 700 ms; lines of a skip burst (the next record within 300 ms, Ctrl held) only pass by */
 function lines(r){const o=r.o,out=[];const steps=JSON.parse(fs.readFileSync(r.file,'utf8')).steps.filter(st=>st.hb?.type==='hookSource'&&st.line);
  steps.forEach((st,i)=>{if(steps[i+1]&&steps[i+1].t-st.t<300)return;if(i>0&&st.t-steps[i-1].t<300)return;out.push({line:st.line,text:st.text});});
  for(const l of out){let run=[];const all=o.samples.filter(s=>!s.body.includes('megulit-menu-open'));for(let i=0;i<all.length;i++){if(norm(all[i].hookSource)&&norm(all[i].hookSource)===norm(l.text)){run.push(all[i]);}else if(run.length){if(run.at(-1).at-run[0].at>=700)break;run=[];}}
   l.samples=run.length&&run.at(-1).at-run[0].at>=700?run:[];}return out.filter(l=>l.samples.length);}
 /* 1 + 10 + 9 + 2 on every line of every run */
 {const bad1=[],bad2=[],bad9=[],bad10=[];
  for(const r of outs){for(const l of lines(r)){const want=norm(l.text);if(!want)continue;
    const settled=l.samples.filter(s=>s.at-l.samples[0].at>=300);const shown=settled.filter(s=>norm(jpGlyphs(s).filter(g=>g.kind==='line').map(g=>g.text).join('')).length>=Math.min(want.length,2));
    if(settled.length&&shown.length<settled.length*0.9)bad1.push(r.name+' line '+l.line+' 「'+l.text+'」 Japanese shown in '+shown.length+'/'+settled.length+' samples');
    for(const s of shown){const g=jpGlyphs(s).filter(g=>g.kind==='line');const out=g.filter(x=>!inside(x,s.hitRegions)||x.pointer==='none');if(out.length){bad1.push(r.name+' line '+l.line+' not clickable: '+out.map(x=>x.text).join(''));break;}}
    /* 2: Chinese under the Japanese, the Japanese row keeps its y once the Chinese is there */
    const withCn=shown.filter(s=>s.cn.length);if(withCn.length){const s=withCn[0],jpBottom=Math.max(...jpGlyphs(s).filter(g=>g.kind==='line').map(g=>g.rect.y+g.rect.h));if(s.cn[0].rect.y<jpBottom-2)bad2.push(r.name+' line '+l.line+' Chinese at '+s.cn[0].rect.y+' over the Japanese bottom '+jpBottom);}
    const ys=new Set(shown.map(s=>Math.round(Math.min(...jpGlyphs(s).filter(g=>g.kind==='line').map(g=>g.rect.y)))));if(ys.size>1)bad2.push(r.name+' line '+l.line+' Japanese y moved: '+[...ys].join(','));
    for(const s of settled){const kinds=new Set(jpGlyphs(s).filter(g=>norm(g.text)&&want.includes(norm(g.text))).map(g=>g.kind));if(kinds.size>1){bad9.push(r.name+' line '+l.line+' drawn by '+[...kinds].join('+'));break;}}}
   for(const s of r.o.samples){/* 10 (owner 2026-11-21): no Japanese that cannot be clicked and read (the placement fallback layer passes clicks to the game) or is not in the line's colour */const lc=jpGlyphs(s).find(g=>g.kind==='line')?.color+'';const out=jpGlyphs(s).filter(g=>!inside(g,s.hitRegions)||g.kind==='extra'||g.pointer==='none'||(g.kind!=='choice'&&lc!=='undefined'&&g.color+''!==lc));if(out.length){bad10.push(r.name+' @'+s.at+' '+out.map(g=>g.kind+':'+g.text+'('+(g.color||[]).join('/')+')').join(' ').slice(0,200));if(bad10.length>6)break;}}}
  put('1',!bad1.length,bad1.slice(0,8).join(' | '));put('2',!bad2.length,bad2.slice(0,8).join(' | '));put('9',!bad9.length,bad9.slice(0,6).join(' | '));put('10',!bad10.length,bad10.slice(0,6).join(' | '));}
 /* 3 flashes: nothing from the orphan / glyph fallback (#megulit-place-extras), and a line the reader left never comes back */
 {const bad=[];for(const r of outs){const seq=[];for(const s of r.o.samples){if(jpGlyphs(s).some(g=>g.kind==='extra'))bad.push(r.name+' @'+s.at+' fallback drew '+jpGlyphs(s).filter(g=>g.kind==='extra').map(g=>g.text).join(''));
    /* by the line the reader shows (its source), not by its typed-out prefix */const t=jpGlyphs(s).some(g=>g.kind==='line')?norm(s.hookSource):'';if(t&&seq.at(-1)!==t)seq.push(t);}
   const fedTexts=JSON.parse(fs.readFileSync(r.file,'utf8')).steps.filter(st=>st.hb?.type==='hookSource').map(st=>norm(st.text));
   for(let i=2;i<seq.length;i++){const j=seq.lastIndexOf(seq[i],i-2);if(j<0)continue;if(fedTexts.filter(x=>x===seq[i]).length>1)continue;/* the game said it twice */bad.push(r.name+' 「'+seq[i]+'」 came back after 「'+seq[i-1]+'」');}}
  put('3',!bad.length,[...new Set(bad)].slice(0,6).join(' | '));}
 /* 4: 20 lines in a row on the dialogue run keep 1/10, and the hide is never given up */
 {const r=by.dialogue,ls=lines(r);const off=r.o.hbSent.filter(m=>m.type==='disable'||m.type==='probeHide'&&m.on===false),gw=r.o.hookEvents.filter(l=>/give way|gave way|giving way/i.test(l)&&!/no give way/i.test(l));
  put('4',ls.length>=20&&!off.length&&!gw.length&&res['1'].ok&&res['10'].ok,'lines '+ls.length+', disable '+off.length+', give way '+gw.length+(res['1'].ok?'':', check 1 failed')+(res['10'].ok?'':', check 10 failed'));}
 /* 5: never read mode (core route, text-effects switch, the page's hide) */
 {const bad=[];for(const r of outs){for(const l of r.o.hookEvents)if(/render mode switched in place \S+ -> read\b|text effects: .*read mode(?! not taken)|switched to read mode|read mode on/i.test(l))bad.push(r.name+': '+l.slice(25,140));
   if(r.o.samples.some(s=>s.hookHide===false&&s.hookProfile==='read'&&/megulit-read-mode|tome-read-mode/.test(s.body)))bad.push(r.name+': reader in read mode');}
  put('5',!bad.length,bad.slice(0,6).join(' | '));}
 /* 6: the choice frame reaches the script (the game draws the options), no OCR noise becomes the line meanwhile */
 {const r=by.dialogue,c=r.o.krkr.choice[0],noise=r.o.samples.filter(s=>/ノ気ゞ亠/.test(s.hookSource||''));
  put('6',c&&c.ui==='choice'&&!noise.length,'script on the 選択肢 frame: '+JSON.stringify(c||null)+(noise.length?' | OCR noise shown as the line':''));}
 /* 7: 聖なるかな one bilingual line, no rows of OCR copies */
 {const r=by.art,ss=r.o.samples.filter(s=>norm(s.hookSource)==='聖なるかな');const bad=[];
  if(!ss.length)bad.push('never the reader line');
  for(const s of ss.filter(s=>s.at-ss[0].at>=400)){const g=jpGlyphs(s),t=norm(g.map(x=>x.text).join(''));if(t.split('聖なるかな').length-1>1||g.some(x=>x.kind==='art'))bad.push('@'+s.at+' '+t.slice(0,40)+' kinds '+[...new Set(g.map(x=>x.kind))].join('+'));if(!s.cn.length||s.cn.length>1)bad.push('@'+s.at+' Chinese rows '+s.cn.length);if(bad.length>4)break;}
  put('7',!bad.length,bad.join(' | '));}
 /* 8: calibration: the Japanese stays (no gap over 1 s), the hook is not restarted, switched or released */
 {const r=by.dialogue,o=r.o,cal=o.samples.find(s=>s.mark==='calibrate');const bad=[];
  if(!cal)bad.push('no calibration step');else{const after=o.samples.filter(s=>s.watch&&s.at>=cal.at&&s.at<=cal.at+2500&&!s.body.includes('megulit-menu-open'));let gap=0,last=cal.at;
   for(const s of after){const has=jpGlyphs(s).some(g=>g.kind==='line');if(has){gap=Math.max(gap,s.at-last);last=s.at;}}gap=Math.max(gap,(after.at(-1)?.at||cal.at)-last);if(gap>1000)bad.push('Japanese gone '+gap+' ms');
   if(o.hookSpawned>1)bad.push('hook restarted ('+o.hookSpawned+' starts)');if(o.hbSent.some(m=>m.type==='disable'))bad.push('hide disabled');
   for(const l of o.hookEvents)if(/render mode switched|reselect|select id=|stream .*switched|hook reconnect/i.test(l)&&Date.parse(l.slice(0,24))-o.t0>=cal.at-50)bad.push(l.slice(25,120));}
  put('8',!bad.length,bad.slice(0,6).join(' | '));}
 /* 11: profile -> hook-native (real pid) -> control file -> the script's reader */
 {const r=by.dialogue,o=r.o,f=(o.control.at(-1)?.files||[]).find(x=>x.name==='42452.txt'),cfg=o.krkr.cfg||{};
  const ok=!!f&&/#clearline/.test(f.text)&&/#choiceframe \^選択肢\$/.test(f.text)&&cfg.clear===1&&Array.isArray(cfg.choiceFrames)&&cfg.choiceFrames.length===1&&o.krkr.clears>0;
  put('11',ok,'file '+(f?JSON.stringify(f.text.slice(0,120)):'missing (files: '+JSON.stringify((o.control.at(-1)?.files||[]).map(x=>x.name))+')')+' script cfg '+JSON.stringify(cfg)+' clears '+o.krkr.clears);}
 if(process.env.MEGULIT_FATA_ACCEPT_OUT)fs.writeFileSync(process.env.MEGULIT_FATA_ACCEPT_OUT,JSON.stringify({res,work},null,1));
 if(!process.env.MEGULIT_REPLAY_KEEP)try{fs.rmSync(work,{recursive:true,force:true});}catch{}
 const failed=Object.entries(res).filter(([,v])=>!v.ok);
 assert.deepEqual(failed.map(([k,v])=>k+': '+v.why),[],'ファタ acceptance');
};
