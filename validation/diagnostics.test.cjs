'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),diag=require('../services/diagnostics.cjs');
/* E362 adaptation overview + diagnostic package */
const who={user:'Megumin',profile:'C:\\Users\\Megumin',names:['魚魚棟']};

test('scrub replaces user name, profile paths and e-mails but keeps hook codes',()=>{
 const input=['C:\\Users\\Megumin\\AppData\\Local\\x.log','"C:\\\\Users\\\\Megumin\\\\Desktop\\\\g.exe"','c:/users/megumin/Downloads','D:\\Users\\Bob\\game','user Megumin logged in, MeguminX stays','contact a.b+c@qq.com or x@mail.example.org','EXHSXN0@D363F:eden_en.exe HQ@game.exe K@1:x.dll','by 魚魚棟','C:\\Users\\Public\\Documents'].join('\n');
 const out=diag.scrub(input,who);
 assert.ok(!/megumin(?!x)/i.test(out.replace(/MeguminX/g,'')),out);
 assert.ok(!/@qq\.com|example\.org|魚魚棟|Bob/.test(out),out);
 assert.match(out,/%USERPROFILE%\\AppData\\Local\\x\.log/);
 assert.match(out,/%USERPROFILE%\\\\Desktop/);
 assert.match(out,/%USERPROFILE%\/Downloads/);
 assert.match(out,/D:\\Users\\<user>\\game/);
 assert.match(out,/<user> logged in, MeguminX stays/);
 assert.equal((out.match(/<email>/g)||[]).length,2);
 assert.match(out,/EXHSXN0@D363F:eden_en\.exe HQ@game\.exe K@1:x\.dll/);
 assert.match(out,/C:\\Users\\Public\\Documents/);
});

test('run windows follow launches and stop at the next game',()=>{
 const t=Date.parse('2026-11-01T10:00:00Z'),e=(gameId,stage,min)=>({gameId,stage,at:t+min*60000});
 const w=diag.runWindows([e('a','launch-request',0),e('a','new-window-ready',1),e('b','launch-request',30),e('a','launch-request',60)],'a',t+90*60000);
 assert.equal(w.length,2);assert.equal(w[0].to,t+30*60000);assert.equal(w[1].to,t+90*60000);
 const lines=['2026-11-01T10:05:00.1234567Z info in A','continuation of A','2026-11-01T10:40:00Z other game','x for other','{"at":"2026-11-01T11:10:00.000Z","type":"y"}','2026-11-01T10:45:00Z mentions game_a.exe'];
 assert.deepEqual(diag.filterLines(lines,w,['game_a.exe']),[lines[0],lines[1],lines[4],lines[5]]);
 assert.equal(diag.filterLines(Array.from({length:3000},(_,i)=>`2026-11-01T10:05:00Z ${i}`),w).length,2000);
});

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-diag-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=openStore(root),exe=path.join(root,'Game','game_a.exe');fs.mkdirSync(path.dirname(exe));fs.writeFileSync(exe,'MZ');
 const ins=db.prepare('INSERT INTO games(id,title,executable,original,last_launched_at) VALUES(?,?,?,?,?)');
 ins.run('a','游戏 A',exe,JSON.stringify({library:{engine:'KiriKiri',hook:'verified',hookVerifiedAt:Date.parse('2026-11-01T10:06:00Z'),hookVerifiedStream:'KiriKiri'}}),Math.floor(Date.parse('2026-11-01T10:00:00Z')/1000));
 ins.run('b','Game B','',JSON.stringify({library:{engine:'YU-RIS',hook:'readonly'}}),null);
 ins.run('c','Game C','',JSON.stringify({library:{engine:''}}),null);
 ins.run('d','Game D','',JSON.stringify({library:{engine:'Artemis',hook:'supported'}}),Math.floor(Date.parse('2026-11-01T09:00:00Z')/1000));
 fs.mkdirSync(path.join(root,'logs'));fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.mkdirSync(path.join(root,'data','hook-streams'));
 fs.writeFileSync(path.join(root,'data','config','original-text.json'),JSON.stringify({a:{status:'native-japanese',patchStatus:'ready',engine:'kirikiri',runtime:{engine:'kirikiri',file:'C:\\Users\\Megumin\\Game\\data.xp3',lines:10}}}));
 fs.writeFileSync(path.join(root,'data','hook-streams','game_a.exe-2.json'),JSON.stringify({name:'KiriKiri',embeddable:true,at:'2026-11-01T10:05:30Z'}));
 const L=o=>JSON.stringify(o);
 fs.writeFileSync(path.join(root,'logs','game-launch.log'),[L({at:'2026-11-01T09:00:00Z',gameId:'d',stage:'launch-failed',error:'GAME_EXITED'}),L({at:'2026-11-01T10:00:00Z',gameId:'a',stage:'launch-request'}),L({at:'2026-11-01T10:00:05Z',gameId:'a',stage:'new-window-ready',exe:'C:\\Users\\Megumin\\Game\\game_a.exe'}),L({at:'2026-11-01T11:00:00Z',gameId:'b',stage:'launch-request'})].join('\n')+'\n');
 fs.writeFileSync(path.join(root,'logs','hook-events.log'),['2026-11-01T10:01:00.000Z check reading A line from megumin@example.com','2026-11-01T11:30:00.000Z B line'].join('\n')+'\n');
 fs.writeFileSync(path.join(root,'logs','hook-diagnostics.log'),'2026-11-01T10:02:00.0000000Z info 0 成功连接到 KiriKiri 引擎 C:\\Users\\Megumin\\Game\n2026-11-01T11:02:00.0000000Z info 0 B\n');
 fs.writeFileSync(path.join(root,'logs','reader-host.log'),L({at:'2026-11-01T11:40:00Z',type:'hostFrame'})+'\n');
 fs.mkdirSync(path.join(root,'data','screenshots'));fs.writeFileSync(path.join(root,'data','screenshots','now.png'),Buffer.from([0x89,0x50,0x4e,0x47]));
 return {root,db};
}

test('overview gives reading, embed and zero-latency states with evidence',t=>{
 const {root,db}=fixture(t),rows=require('../services/adaptation-overview.cjs').overview(db,root).games,by=Object.fromEntries(rows.map(r=>[r.id,r]));
 assert.equal(rows.length,4);
 assert.deepEqual([by.a.reading,by.b.reading,by.c.reading,by.d.reading],['reads','reads','untested','no-text']);
 assert.deepEqual([by.a.hookSupport,by.b.hookSupport,by.c.hookSupport],['verified','readonly','unknown']);
 assert.equal(by.a.zeroLatency,'patch');assert.equal(by.c.zeroLatency,'unknown');
 assert.equal(by.a.engine,'KiriKiri');assert.equal(by.a.evidence.hookStream.name,'KiriKiri');
 assert.equal(by.a.evidence.lastLaunchedAt,Date.parse('2026-11-01T10:00:00Z'),'seconds become ms');
 assert.equal(by.d.evidence.launch.stage,'launch-failed');assert.equal(by.d.evidence.launch.error,'GAME_EXITED');
 assert.ok(by.a.lastSeenAt>=Date.parse('2026-11-01T10:06:00Z'));
 db.close();
});

test('package holds only this game\'s scrubbed logs, info and an existing screenshot',t=>{
 const {root,db}=fixture(t),result=diag.build(root,db,'a',{version:'1.2.8d',now:new Date('2026-11-01T12:00:00Z'),who});
 assert.equal(path.dirname(result.path),path.join(root,'data','diagnostics'));
 const entries=diag.zipEntries(fs.readFileSync(result.path)),names=entries.map(e=>e.name);
 assert.deepEqual(result.entries.map(e=>e.name),names,'preview lists exactly what is inside');
 assert.deepEqual(names,['info.json','logs/hook-diagnostics.log','logs/hook-events.log','logs/game-launch.log','screenshot.png','README.txt']);
 const text=Object.fromEntries(entries.map(e=>[e.name,e.data.toString('utf8')]));
 assert.match(text['logs/hook-events.log'],/A line/);assert.doesNotMatch(text['logs/hook-events.log'],/B line/);
 assert.doesNotMatch(text['logs/hook-diagnostics.log'],/ B$/m);
 assert.doesNotMatch(text['logs/game-launch.log'],/"gameId":"[bd]"/);
 const all=Object.entries(text).filter(([n])=>!n.endsWith('.png')).map(([,v])=>v).join('\n');
 assert.doesNotMatch(all,/megumin|example\.com/i);assert.match(all,/%USERPROFILE%/);assert.match(all,/<email>/);
 const info=JSON.parse(text['info.json']);
 assert.equal(info.megulit.version,'1.2.8d');assert.equal(info.game.engine,'KiriKiri');assert.equal(info.embed.hookSupport,'verified');
 assert.equal(info.originalText.brief,'patch');assert.equal(info.originalText.saved.runtime.file,'%USERPROFILE%\\Game\\data.xp3');
 assert.equal(info.embed.hookStreams.name,'KiriKiri');assert.ok(info.os.release);assert.equal(info.adaptation.reading,'reads');
 assert.equal(diag.ownPackage(root,result.path),result.path);
 assert.throws(()=>diag.ownPackage(root,path.join(root,'logs','hook-events.log')),/DIAGNOSTICS_NOT_FOUND/);
 db.close();
});

test('zip round-trips UTF-8 names and binary data with valid CRC',()=>{
 const buffer=diag.zip([{name:'中文/名.txt',data:'あいう'.repeat(500)},{name:'b.bin',data:Buffer.from([0,1,2,255])}]);
 const back=diag.zipEntries(buffer);assert.equal(back[0].name,'中文/名.txt');assert.equal(back[0].data.toString(),'あいう'.repeat(500));assert.deepEqual([...back[1].data],[0,1,2,255]);
 assert.equal(diag.crc32(Buffer.from('123456789')),0xCBF43926);
});

test('upload is not configured without an endpoint and posts multipart when it is',async t=>{
 const up=require('../services/diagnostics-upload.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-up-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const zipPath=path.join(root,'p.zip');fs.writeFileSync(zipPath,diag.zip([{name:'a.txt',data:'x'}]));
 const saved=process.env.MEGULIT_DIAGNOSTICS_ENDPOINT;delete process.env.MEGULIT_DIAGNOSTICS_ENDPOINT;t.after(()=>{if(saved!==undefined)process.env.MEGULIT_DIAGNOSTICS_ENDPOINT=saved;});
 assert.deepEqual(await up.upload(zipPath,{},{root}),{state:'not-configured'});
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','diagnostics-upload.json'),JSON.stringify({endpoint:'http://insecure.example/api/diagnostics'}));
 assert.equal((await up.upload(zipPath,{},{root})).state,'not-configured','plain http is refused');
 fs.writeFileSync(path.join(root,'data','config','diagnostics-upload.json'),JSON.stringify({endpoint:'https://relay.example/api/diagnostics',token:'k'}));
 let seen=null;const fetcher=async(url,init)=>{seen={url,init};return {ok:true,status:201,json:async()=>({ok:true,issueUrl:'https://github.com/o/r/issues/7',id:'r1'})};};
 const result=await up.upload(zipPath,{version:'1.2.8d',game:{id:'a',title:'A',engine:'KiriKiri'}},{root,fetcher});
 assert.deepEqual(result,{state:'uploaded',issueUrl:'https://github.com/o/r/issues/7',id:'r1'});
 assert.equal(seen.url,'https://relay.example/api/diagnostics');assert.equal(seen.init.method,'POST');assert.equal(seen.init.headers.Authorization,'Bearer k');
 const meta=JSON.parse(await seen.init.body.get('meta').text());assert.equal(meta.version,'1.2.8d');assert.equal(meta.size,fs.statSync(zipPath).size);assert.match(meta.sha256,/^[a-f0-9]{64}$/);
 assert.equal(seen.init.body.get('file').name,'p.zip');
 assert.equal((await up.upload(zipPath,{},{root,fetcher:async()=>({ok:false,status:429,json:async()=>({})})})).error,'HTTP_429');
});

test('bridge and UI are wired',()=>{
 const bridge=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8');
 for(const action of ['adaptation_overview','diagnostics_build','diagnostics_reveal','diagnostics_upload'])assert.ok(bridge.includes(`case '${action}'`),action);
 assert.match(bridge,/'\/select,'\+file\]/);
 const ui=fs.readFileSync(path.join(__dirname,'../web/diagnostics-ui.js'),'utf8');
 for(const file of ['diagnostics-ui.js','adaptation-overview.js']){const src=fs.readFileSync(path.join(__dirname,'../web',file),'utf8').replace(/^\/\/ SPDX[^\n]*\n/,'');assert.doesNotMatch(src,/(^|[^:])\/\/(?!\/)/m,file+': no inline // comments');}
 assert.match(fs.readFileSync(path.join(__dirname,'../web/game-detail.js'),'utf8'),/openDiagnostics\(/);
 assert.match(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),/openAdaptationOverview\(/);
 assert.match(fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8'),/diagnostics\.css/);
});
