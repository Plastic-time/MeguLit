'use strict';
// The VNDB entry corrected in the edit dialog while the details panel is still fetching the old match: the forced refresh
// save_game asks for must run after that fetch, not be folded into it.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-refresh-'));process.env.MEGULIT_ROOT=root;
const store=require('../services/store.cjs'),{GameEnrichment}=require('../services/game-enrichment.cjs');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));

for(const corrected of [false,true])test('two detail languages keep the right work when corrected='+corrected,async t=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-detail-langs-'));
 t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
 const db=store.openStore(work),exe=path.join(work,'game.exe');
 try{db.prepare("INSERT INTO games(id,title,executable,cover,source,original) VALUES('g','Game',?,'cover.jpg','folder',?)")
  .run(exe,JSON.stringify({vndbManual:'v1',library:{vndbId:'v1',appid:'123'}}));}finally{db.close();}
 const covers=path.join(work,'data','assets','covers');
 fs.mkdirSync(covers,{recursive:true});fs.writeFileSync(path.join(covers,'cover.jpg'),Buffer.from([255,216,255,224]));
 const meta=new GameEnrichment(work,()=>{},async url=>{
  const language=new URL(url).searchParams.get('language');
  if(language)return Response.json({query_summary:{},reviews:[{review:'review-'+language,language}]});
  return new Response('',{status:503});
 });
 t.after(()=>meta.stop());
 let started,release;
 const fetching=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const calls=[];meta.synopses.get=async({lang,vndbId})=>{
  calls.push(lang);if(lang==='en'){started();await gate;}
  return {source:'VNDB',text:vndbId+'-'+lang};
 };
 const english=meta.ensure('g','en');await fetching;
 if(corrected){
  const write=store.openStore(work);
  try{write.prepare("UPDATE games SET original=json_set(original,'$.vndbManual','v2') WHERE id='g'").run();}finally{write.close();}
 }
 const japanese=meta.ensure('g','ja');release();await Promise.all([english,japanese]);
 const {synopses:saved,reviews}=store.readJSON(meta.file).g;
 assert.equal(saved.en?.text,corrected?undefined:'v1-en');
 assert.equal(saved.ja?.text,corrected?'v2-ja':'v1-ja');
 assert.equal(reviews.en?.[0]?.text,corrected?undefined:'review-english');
 assert.equal(reviews.ja?.[0]?.text,'review-japanese');
 if(!corrected)await meta.ensure('g','en');
 await meta.ensure('g','ja');
 assert.equal(calls.length,2);
});

test('a forced refresh asked during a run is not lost',async()=>{
 const exe=path.join(root,'game','game.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ');
 const db=store.openStore(root);try{db.prepare('INSERT INTO games(id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?)').run('game-1','月影的幻影',exe,'','folder',JSON.stringify({library:{names:['月影的幻影'],vndbId:'v1'}}));}finally{db.close();}
 const original=()=>{const d=store.openStore(root);try{return JSON.parse(d.prepare('SELECT original FROM games WHERE id=?').get('game-1').original);}finally{d.close();}};
 let release;const gate=new Promise(r=>release=r),asked=[];
 const network=async(url,options={})=>{url=String(url);const body=options.body?JSON.parse(options.body):{};
  if(url==='https://api.vndb.org/kana/vn'){const id=body.filters?.[2];asked.push(id);if(id==='v1')await gate;
   return Response.json({results:[{id,title:'Tsukikage no Simulacre',alttitle:'月影のシミュラクル',titles:[],image:{url:'https://t.vndb.org/cv/00/'+id+'.jpg'},developers:[]}]});}
  if(url==='https://api.vndb.org/kana/release')return Response.json({results:[]});
  if(url.startsWith('https://t.vndb.org/'))return new Response(Buffer.from([0xff,0xd8,0xff,0xe0]));
  return new Response('',{status:404});};
 const realFetch=globalThis.fetch;globalThis.fetch=network;
 try{
  const meta=new GameEnrichment(root,()=>{},network,async()=>'');
  const opened=meta.ensure('game-1','en');/* details panel: fetching v1 */
  await new Promise(r=>setTimeout(r,20));
  {const d=store.openStore(root);try{const o=original();o.vndbManual='v2';d.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(o),'game-1');}finally{d.close();}}/* save_game's write */
  const corrected=meta.ensure('game-1','en',true);/* what save_game's refresh does */
  release();await opened;await corrected;
 }finally{globalThis.fetch=realFetch;}
 assert.deepEqual([...new Set(asked)],['v1','v2']);/* the old run, then one for the corrected entry */
 assert.equal(original().library.vndbId,'v2');
});

test('ordinary import asks for layout once alongside VN metadata and rechecks a different executable',async t=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-vn-layout-'));
 t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
 const db=store.openStore(work),exe=path.join(work,'unknown.exe'),fields=[];
 fs.writeFileSync(exe,'version one');
 db.prepare("INSERT INTO games(id,title,executable,source,original) VALUES('g','Game',?,'folder',?)")
  .run(exe,JSON.stringify({vndbManual:'v123'}));db.close();
 const meta=new GameEnrichment(work,()=>{},async(url,req)=>{
  if(url.endsWith('/kana/vn')){
   const query=JSON.parse(req.body);fields.push(query.fields);
   return Response.json({results:[{id:'v123',title:'Game',...(query.fields.includes('tags.id')?{tags:[{id:'g355',rating:3}]}:{})}]});
  }
  return new Response('',{status:404});
 });
 meta.synopses.get=async()=>null;t.after(()=>meta.stop());
 await meta.ensure('g','en',true);await meta.ensure('g','en',true);
 fs.writeFileSync(exe,'different build');await meta.ensure('g','en',true);
 assert.deepEqual(fields.map(x=>x.includes('tags.id')),[true,false,true]);
});
