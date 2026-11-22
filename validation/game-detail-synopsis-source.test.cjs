// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('../services/store.cjs');
const {detail,refreshSynopsis}=require('../services/game-detail.cjs');
const {GameEnrichment}=require('../services/game-enrichment.cjs');
const {views}=require('../core/synopsis-policy.cjs');
const {launch}=require('../services/cardinal/cdp.cjs');

test('detail and enrichment share the two sources, including a synopsis-only refresh',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-detail-source-'));
 const db=store.openStore(root),config=path.join(root,'data/config'),covers=path.join(root,'data/assets/covers');
 t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(config,{recursive:true});fs.mkdirSync(covers,{recursive:true});
 fs.writeFileSync(path.join(covers,'cover.jpg'),Buffer.from([255,216,255,224]));
 db.prepare("INSERT INTO games(id,title,cover,source,original) VALUES('g','Game','cover.jpg','folder',?)")
  .run(JSON.stringify({vndbManual:'v2',library:{vndbId:'v2'}}));
 let edition=1,wiki=true,translate=true,available=true;
 const manager=new GameEnrichment(root,()=>{},async()=>new Response('',{status:503}),async(text,lang)=>translate?lang+' '+text:'');
 t.after(()=>manager.stop());
 manager.synopses.lookup=async()=>available?{text:'VNDB '+edition}:null;
 manager.synopses.moegirl=async()=>wiki?{text:'萌娘 '+edition,title:'Game'}:null;
 fs.writeFileSync(manager.file,JSON.stringify({g:{matchedVnid:'v2',at:Date.now(),reviews:{zh:[]},synopses:{zh:{text:'obsolete reception synopsis',source:'VNDB'}}}}));

 const first=await manager.ensure('g','zh');
 assert.equal(first.synopsisChoices.preferred,'moegirl');
 assert.deepEqual(first.synopsis,first.synopsisChoices.moegirl);
 assert.match(first.synopsis.source,/^萌娘百科.*CC BY-NC-SA/);
 assert.deepEqual(first.synopsisChoices.vndb,{text:'zh VNDB 1',source:'VNDB · 机翻',lang:'zh'});
 assert.deepEqual(detail(db,root,'g','zh').synopsisChoices,first.synopsisChoices);
 assert.deepEqual(detail(db,root,'g','en').synopsis,{text:'VNDB 1',source:'VNDB',lang:'en'});
 assert.equal(detail(db,root,'g','ja').synopsis.text,'ja VNDB 1');

 fs.writeFileSync(path.join(config,'library.json'),JSON.stringify({infoSource:'vndb'}));
 assert.deepEqual((await manager.ensure('g','zh')).synopsis,first.synopsisChoices.vndb);
 fs.writeFileSync(path.join(config,'library.json'),JSON.stringify({infoSource:'moegirl'}));
 edition=2;translate=false;
 const refreshed=await refreshSynopsis(db,root,'g','en',manager.synopses);
 const reopened=await manager.ensure('g','zh');
 assert.equal(refreshed.text,'萌娘 2');
 assert.deepEqual(reopened.synopsis,refreshed);
 assert.deepEqual(reopened.synopsisChoices.vndb,{text:'VNDB 2',source:'VNDB',lang:'en'});
 assert.deepEqual(detail(db,root,'g','zh').synopsisChoices,reopened.synopsisChoices);

 available=false;wiki=false;
 db.prepare("UPDATE games SET original=json_remove(original,'$.vndbManual') WHERE id='g'").run();
 assert.deepEqual((await manager.ensure('g','zh',true)).synopsisChoices,reopened.synopsisChoices);
 db.prepare("UPDATE games SET original=json_set(original,'$.vndbManual','v3') WHERE id='g'").run();
 const corrected=await manager.ensure('g','zh',true);
 assert.equal(corrected.synopsisChoices.moegirl.text,'');
 assert.equal(corrected.synopsisChoices.vndb.text,'');
 assert.deepEqual(corrected.synopsisChoices,detail(db,root,'g','zh').synopsisChoices);
});

test('the synopsis selector preserves the active source during async updates, navigation and reopening',async()=>{
 const web=path.resolve(__dirname,'../web'),origin='http://megulit-synopsis.test';
 const css=[...fs.readFileSync(path.join(web,'index.html'),'utf8').matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>`<link rel="stylesheet" href="${m[1]}">`).join('');
 const browser=await launch({viewport:{width:680,height:850}}),{page}=browser;
 try{
  page.route(url=>{
   if(!url.startsWith(origin+'/'))return 'abort';
   const file=new URL(url).pathname.slice(1);
   if(!file)return {body:css+'<main class="main" data-kids="dtv-bg"></main>',headers:{'content-type':'text/html; charset=utf-8'}};
   const ext=path.extname(file),type=ext==='.js'?'text/javascript':ext==='.css'?'text/css':'';
   if(!type)return 'abort';
   try{return {body:fs.readFileSync(path.join(web,file)),headers:{'content-type':type+'; charset=utf-8'}};}
   catch{return {status:404};}
  });
  await page.goto(origin+'/');
  await page.evaluate(async()=>{
   const {renderGamePage}=await import('/game-detail.js');
   const empty=()=>{};
   const other={first_player:{state:'off'},cn_version_guide:null,game_reviews_summary:{platforms:[]}};
   window.mount=async(locale,initial)=>{
    window.dispose?.();
    const api=async action=>{
     if(action==='game_detail')return {...initial,game:{title:'Game',available:true},info:{},counts:{sessions:0},sessions:[],reception:{reviews:[]}};
     if(action==='game_enrich')return new Promise(resolve=>{window.complete=resolve;});
     return other[action]??null;
    };
    window.dispose=await renderGamePage({main:document.querySelector('main'),locale,id:'g',api,esc:String,icon:empty,cover:()=>'',number:String,datetime:String,relativeTime:()=>'',isCurrent:()=>true,
     onBack:empty,onRemove:empty,onEdit:empty,onLaunch:empty,toast:empty});
   };
   window.selectSource=value=>{
    const select=document.querySelector('[data-synopsis-source]');
    select.focus();select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));
   };
   window.snapshot=()=>{
    const select=document.querySelector('[data-synopsis-source]');
    return [select.value,document.querySelector('#game-synopsis-body').textContent,document.querySelector('.synopsis-source').textContent];
   };
  });
  const fixture=(locale,revision,wiki=true)=>views({
   en:'VNDB '+revision,src:{en:'VNDB'},
   ...(wiki?{moegirl:{text:'萌娘 '+revision,src:'萌娘百科 · CC BY-NC-SA 3.0'}}:{}),
  },locale,locale==='zh');
  const snapshot=()=>page.evaluate(()=>window.snapshot());
  for(const locale of ['en','ja','zh']){
   await page.evaluate(({locale,state})=>window.mount(locale,state),{locale,state:fixture(locale,1)});
   assert.deepEqual(await snapshot(),locale==='zh'?['moegirl','萌娘 1','萌娘百科 · CC BY-NC-SA 3.0']:['vndb','VNDB 1','VNDB']);
  }
  await page.evaluate(()=>window.selectSource('vndb'));
  assert.deepEqual(await snapshot(),['vndb','VNDB 1','VNDB']);
  await page.evaluate(data=>window.complete(data),fixture('zh',2));
  await page.waitForFunction(()=>window.snapshot()[1]==='VNDB 2');
  assert.deepEqual(await snapshot(),['vndb','VNDB 2','VNDB']);
  assert.equal(await page.evaluate(()=>document.activeElement.matches('[data-synopsis-source]')),true);

  await page.evaluate(()=>{
   document.querySelector('[data-detail-tab="sessions"]').click();
   document.querySelector('[data-detail-tab="overview"]').click();
   document.querySelector('[data-refresh]').click();
  });
  await page.evaluate(data=>window.complete(data),fixture('zh',3,false));
  await page.waitForFunction(()=>window.snapshot()[1]==='VNDB 3');
  assert.deepEqual(await snapshot(),['vndb','VNDB 3','VNDB']);
  await page.evaluate(()=>window.selectSource('moegirl'));
  assert.deepEqual(await snapshot(),['moegirl','这个来源暂无作品简介','']);
  await page.evaluate(data=>window.mount('zh',data),fixture('zh',4,false));
  assert.equal((await snapshot())[0],'moegirl');
  await page.evaluate(data=>window.complete(data),fixture('zh',4,false));
  await page.waitForFunction(()=>window.snapshot()[1]==='这个来源暂无作品简介');

  for(const width of [540,1080]){
   await page.c.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
   assert.equal(await page.evaluate(()=>{
    const panel=document.querySelector('.synopsis-panel').getBoundingClientRect();
    return [...document.querySelectorAll('.synopsis-panel select,.synopsis-panel [data-refresh]')].every(node=>{
     const r=node.getBoundingClientRect();return r.width>0&&r.left>=panel.left&&r.right<=panel.right;
    });
   }),true);
  }
 }finally{await browser.close();}
});
