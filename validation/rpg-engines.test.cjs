// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E375: RPG Maker MV/MZ (www/data JSON) and WOLF RPG Editor (.mps / CommonEvent.dat, loose or in a plain DXArchive).
// Every fixture is built here: small JSON maps, hand-made event commands and a hand-made unencrypted .wolf archive.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ot=require('../services/original-text.cjs'),scenes=require('../services/original-engines/scenes.cjs');
const rpgmaker=require('../services/original-engines/rpgmaker.cjs'),wolf=require('../services/original-engines/wolf.cjs'),library=require('../core/library.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'rpg-'));
function db1(exe){const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);return db;}

// ---- RPG Maker MV/MZ ----------------------------------------------------------------------------------------------
const say=(rows,name='')=>[{code:101,indent:0,parameters:['Actor1',0,0,2,name]},...rows.map(t=>({code:401,indent:0,parameters:[t]}))];
const JA={
 map:[...say(['\\N[1]「おはよう、\\C[2]今日\\C[0]はいい天気だね。」','\\|そうだね、散歩に行こうか。'],'ハロルド'),{code:102,indent:0,parameters:[['はい','いいえ'],1,0,2,0]},{code:105,indent:0,parameters:[2,false]},{code:405,indent:0,parameters:['むかしむかし、']},{code:405,indent:0,parameters:['あるところに。']},{code:0,indent:0,parameters:[]}],
 page2:[...say(['あれ？ここはどこだろう。']),{code:0,indent:0,parameters:[]}],
 common:[...say(['所持金は\\V[3]ゴールドです。\\!']),{code:0,indent:0,parameters:[]}],
 troop:[...say(['スライムが現れた！']),{code:0,indent:0,parameters:[]}],
};
const ZH={
 // The translators wrote the first message over three rows: lines still pair by message, not by command index.
 map:[...say(['\\N[1]「早上好，','\\C[2]今天\\C[0]天气真好。」','是啊，去散步吧。'],'哈罗德'),{code:102,indent:0,parameters:[['好','不要'],1,0,2,0]},{code:105,indent:0,parameters:[2,false]},{code:405,indent:0,parameters:['很久很久以前，']},{code:405,indent:0,parameters:['在某个地方。']},{code:0,indent:0,parameters:[]}],
 page2:[...say(['咦？这里是哪里。']),{code:0,indent:0,parameters:[]}],
 common:[...say(['持有金钱为\\V[3]金币。']),{code:0,indent:0,parameters:[]}],
 troop:[...say(['史莱姆出现了！']),{code:0,indent:0,parameters:[]}],
};
function writeRpgData(d,t,actor){fs.mkdirSync(d,{recursive:true});const w=(n,v)=>fs.writeFileSync(path.join(d,n),JSON.stringify(v));
 w('System.json',{gameTitle:'テスト'});w('MapInfos.json',[null,{id:1,name:'MAP001'}]);w('Actors.json',[null,{id:1,name:actor}]);
 w('Map001.json',{events:[null,{id:1,name:'EV001',pages:[{list:t.map},{list:t.page2}]}]});
 w('CommonEvents.json',[null,{id:1,name:'所持金',list:t.common}]);
 w('Troops.json',[null,{id:1,name:'スライム',pages:[{list:t.troop}]}]);}

test('RPG Maker: control codes are dropped, \\N[n] is the actor name, \\n is a line break',()=>{
 assert.equal(rpgmaker.clean('\\N[1]「\\C[2]やあ\\C[0]\\I[64]」\\.\\|\\!\\{大\\}\\>速\\<\\^',['','ハロルド']),'ハロルド「やあ」大速');
 assert.equal(rpgmaker.clean('一行目\\n二行目\\n[1]',['','リード']),'一行目\n二行目リード');
 assert.equal(rpgmaker.clean('\\FS[24]\\V[3]円\\\\'),'円\\');
});

test('RPG Maker: Show Text, Show Choices and Scrolling Text from maps, common events and troops',()=>{
 const top=tmp(),game=path.join(top,'jp');writeRpgData(path.join(game,'www','data'),JA,'ハロルド');fs.writeFileSync(path.join(game,'Game.exe'),'MZ');
 assert.equal(scenes.detect(game),'rpgmaker');
 const list=scenes.read('rpgmaker',game),map=list.find(s=>s.name==='Map001.json');
 assert.deepEqual(map.lines,['ハロルド「おはよう、今日はいい天気だね。」\nそうだね、散歩に行こうか。','はい','いいえ','むかしむかし、\nあるところに。','あれ？ここはどこだろう。']);
 assert.deepEqual(map.keys,['e1.p0:m#1','e1.p0:c#1','e1.p0:c#2','e1.p0:s#1','e1.p1:m#1']);
 assert.equal(map.speakers[0],'ハロルド');
 assert.deepEqual(list.find(s=>s.name==='CommonEvents.json').lines,['所持金はゴールドです。']);
 assert.deepEqual(list.find(s=>s.name==='Troops.json').lines,['スライムが現れた！']);
 assert.deepEqual(list.map(s=>s.name),['CommonEvents.json','Map001.json','Troops.json']);
});

test('RPG Maker: MZ layout (data/ beside Game.exe) is found by the library and the script reader',()=>{
 const game=path.join(tmp(),'mz');writeRpgData(path.join(game,'data'),JA,'ハロルド');fs.writeFileSync(path.join(game,'Game.exe'),'MZ');
 assert.equal(library.engineOf(game)?.name,'RPG Maker MV/MZ');assert.equal(library.engineOf(game).hook,null);
 assert.equal(rpgmaker.dataDir(game),path.join(game,'data'));
});

test('RPG Maker: a translated copy next to the game pairs by map, event, page and message',async()=>{
 const top=tmp(),game=path.join(top,'jp'),patch=path.join(top,'jp-chs');
 writeRpgData(path.join(game,'www','data'),JA,'ハロルド');writeRpgData(path.join(patch,'www','data'),ZH,'哈罗德');
 const exe=path.join(game,'Game.exe');fs.writeFileSync(exe,'MZ');const db=db1(exe),data=path.join(top,'megulit');
 const state=ot.scanRunning(data,'1',exe);assert.equal(state.runtime.engine,'rpgmaker');assert.equal(state.status,'native-japanese');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));assert.equal(r.found,patch);
 const p=ot.provider(data,exe);
 assert.equal(p.resolve('ハロルド「おはよう、今日はいい天気だね。」\nそうだね、散歩に行こうか。').translation,'哈罗德「早上好，\n今天天气真好。」\n是啊，去散步吧。');
 assert.equal(p.resolve('むかしむかし、あるところに。').translation,'很久很久以前，\n在某个地方。');
 assert.equal(p.resolve('スライムが現れた！').translation,'史莱姆出现了！');
});

test('RPG Maker: a translated data folder inside the game folder (www/data_cn) is found too',async()=>{
 const top=tmp(),game=path.join(top,'jp');writeRpgData(path.join(game,'www','data'),JA,'ハロルド');
 // Only the maps were translated: no System.json there.
 const cn=path.join(game,'www','data_cn');writeRpgData(cn,ZH,'哈罗德');fs.rmSync(path.join(cn,'System.json'));fs.rmSync(path.join(cn,'MapInfos.json'));
 const exe=path.join(game,'Game.exe');fs.writeFileSync(exe,'MZ');const db=db1(exe),data=path.join(top,'megulit');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.equal(ot.provider(data,exe).resolve('あれ？ここはどこだろう。').translation,'咦？这里是哪里。');
});

test('RPG Maker: a page whose message count differs in the translation keeps the Japanese',()=>{
 const top=tmp(),game=path.join(top,'jp'),patch=path.join(top,'cn');writeRpgData(path.join(game,'data'),JA,'ハロルド');
 writeRpgData(path.join(patch,'data'),{...ZH,page2:[...say(['咦？']),...say(['这里是哪里。']),{code:0,indent:0,parameters:[]}]},'哈罗德');
 const base=scenes.read('rpgmaker',game),found=ot.collect(patch),list=rpgmaker.patchLines(base,found),map=list.find(s=>s.name==='Map001.json');
 assert.equal(map.lines[4],'あれ？ここはどこだろう。');assert.equal(map.lines[1],'好');
});

// ---- WOLF RPG Editor --------------------------------------------------------------------------------------------
const i32=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const wstr=b=>{b=Buffer.isBuffer(b)?b:Buffer.from(b,'utf8');return Buffer.concat([i32(b.length+1),b,Buffer.from([0])]);};
const cmd=(code,args,strings)=>Buffer.concat([Buffer.from([args.length+1]),i32(code),...args.map(i32),Buffer.from([0,strings.length]),...strings.map(wstr),Buffer.from([0])]);
const event=(id,name,cmds)=>Buffer.concat([Buffer.from([0x6f,0x39,0x30,0,0]),i32(id),wstr(name),i32(0),i32(0),i32(1),i32(0),Buffer.from([0x79]),i32(0),wstr(''),Buffer.alloc(40),i32(0),i32(cmds.length),...cmds,i32(3),Buffer.from([0,1,1,0x7a,0x70])]);
const mps=evs=>Buffer.concat([Buffer.alloc(10),Buffer.from('WOLFM\0','latin1'),Buffer.alloc(4),Buffer.from([0x64,0,0,0,0x65]),wstr('マップ'),i32(1),i32(20),i32(15),i32(evs.length),Buffer.alloc(20*15*12),...evs,Buffer.from([0x66])]);
const common=cmds=>Buffer.concat([Buffer.from([0,'W'.charCodeAt(0),0,'O'.charCodeAt(0),'L'.charCodeAt(0),'F'.charCodeAt(0),'C'.charCodeAt(0),0]),i32(1),Buffer.from([0x8e]),i32(0),i32(0),Buffer.alloc(7),wstr('共通'),i32(cmds.length),...cmds,Buffer.from([0x8f])]);
const wolfMapJa=()=>mps([event(1,'村人',[cmd(0,[],[]),cmd(101,[],['村人\n「\\c[2]ようこそ\\c[0]、\\r[勇者,ゆうしゃ]さま！」']),cmd(102,[0x2],['はい','いいえ']),cmd(111,[1,2,3],[])]),event(2,'看板',[cmd(101,[],['ここは\\f[20]はじまりの村です。\\A+'])])]);
const wolfMapZh=()=>mps([event(1,'村民',[cmd(0,[],[]),cmd(101,[],['村民\n「\\c[2]欢迎\\c[0]，勇者大人！」']),cmd(102,[0x2],['是','否']),cmd(111,[1,2,3],[])]),event(2,'看板',[cmd(101,[],['这里是\\f[20]起始之村。'])])]);
const commonJa=()=>common([cmd(101,[],['宿屋に泊まりますか？']),cmd(101,[],['ゆっくり休んでね。'])]),commonZh=()=>common([cmd(101,[],['要住旅店吗？']),cmd(101,[],['好好休息吧。'])]);
// DxLib LZ, enough to round-trip: literals (the key byte doubled) and back references of 4+ bytes within 256 bytes.
function lz(src,key=0xf7){const out=[];let s=0;
 while(s<src.length){let best=0,dist=0;for(let d=1;d<=Math.min(256,s);d++){let n=0;while(s+n<src.length&&n<4+0x1fff&&src[s+n]===src[s+n-d])n++;if(n>best){best=n;dist=d;}}
  if(best>=4){const m=best-4,code=(m&0x1f)<<3|(m>31?4:0)|0;out.push(key,code>=key?code+1:code);if(m>31)out.push(m>>5);out.push(dist-1);s+=best;continue;}
  if(src[s]===key)out.push(key,key);else out.push(src[s]);s++;}
 const body=Buffer.from(out);return Buffer.concat([u32(src.length),u32(body.length+9),Buffer.from([key]),body]);}
/* An unencrypted DXArchive v8 (flags: no key, head not packed) or v6, folders and files: {'BasicData/CommonEvent.dat': buf}. */
function dxa(files,{version=8,pack=[]}={}){
 const tree={};for(const [p,b] of Object.entries(files)){const parts=p.split('/');let t=tree;for(const d of parts.slice(0,-1))t=t[d]=t[d]||{};t[parts.at(-1)]=b;}
 const names=[],nameOf=n=>{const at=Buffer.concat(names).length,len=Math.ceil((Buffer.byteLength(n)+1)/4)*4,pad=s=>{const b=Buffer.alloc(len);Buffer.from(s).copy(b);return b;};names.push(u16(len/4),u16(0),pad(n.toUpperCase()),pad(n));return at;};
 const fileSize=version>=8?72:64,datas=[];let dataAt=0;const fileRecs=[],dirRecs=[];
 const fileRec=(nameAt,attr,data,size,packed)=>{const r=Buffer.concat([u64(nameAt),u64(attr),Buffer.alloc(24),u64(data),u64(size),packed<0?Buffer.from('ffffffffffffffff','hex'):u64(packed),...(version>=8?[Buffer.from('ffffffffffffffff','hex')]:[])]);fileRecs.push(r);return (fileRecs.length-1)*fileSize;};
 const dirOf=(t,selfAt,parentAt,label)=>{const index=dirRecs.length;dirRecs.push(null);const keys=Object.keys(t),first=fileRecs.length*fileSize,slots=[];
  for(const k of keys){slots.push(fileRec(0,0,0,0,-1));}
  keys.forEach((k,i)=>{const v=t[k],at=nameOf(k);
   if(Buffer.isBuffer(v)){const full=label+k,body=pack.includes(full)?lz(v):v;fileRecs[slots[i]/fileSize]=Buffer.concat([u64(at),u64(0x20),Buffer.alloc(24),u64(dataAt),u64(v.length),pack.includes(full)?u64(body.length):Buffer.from('ffffffffffffffff','hex'),...(version>=8?[Buffer.from('ffffffffffffffff','hex')]:[])]);datas.push(body);dataAt+=body.length;}
   else{const sub=dirOf(v,slots[i],selfAt,label+k+'/');fileRecs[slots[i]/fileSize]=Buffer.concat([u64(at),u64(0x10),Buffer.alloc(24),u64(sub),u64(0),Buffer.from('ffffffffffffffff','hex'),...(version>=8?[Buffer.from('ffffffffffffffff','hex')]:[])]);}});
  dirRecs[index]=Buffer.concat([u64(selfAt),u64(parentAt),u64(keys.length),u64(first)]);return index*32;};
 nameOf('');fileRec(0,0x10,0,0,-1);dirOf(tree,0,0xffffffff,'');
 const nameBuf=Buffer.concat(names),fileBuf=Buffer.concat(fileRecs),dirBuf=Buffer.concat(dirRecs),head=Buffer.concat([nameBuf,fileBuf,dirBuf]),data=Buffer.concat(datas);
 const hs=version>=8?64:48,h=Buffer.concat([u16(0x5844),u16(version),u32(head.length),u64(hs),u64(hs+data.length),u64(nameBuf.length),u64(nameBuf.length+fileBuf.length),...(version>=8?[u32(932),u32(3),Buffer.alloc(16)]:[u64(932)])]);
 return Buffer.concat([h,data,head]);}

test('WOLF: message and choice commands, control codes dropped, \\r[base,reading] is the game\'s ruby',()=>{
 const r=wolf.parse(wolfMapJa());
 assert.deepEqual(r.lines,['村人\n「ようこそ、勇者さま！」','はい','いいえ','ここははじまりの村です。']);
 assert.deepEqual(r.keys,['e1:m#1','e1:c#1','e1:c#2','e2:m#1']);
 assert.deepEqual(r.ruby[0],[['勇者','ゆうしゃ']]);
 // Shift-JIS (WOLF 2.x): こんにちは
 const sj=Buffer.from('82b182f182c982bf82cd','hex'),c=Buffer.concat([Buffer.from([1]),i32(101),Buffer.from([0,1]),i32(sj.length+1),sj,Buffer.from([0,0])]);
 assert.deepEqual(wolf.parse(c).lines,['こんにちは']);
});

test('WOLF: DxLib LZ round trip',()=>{const src=Buffer.from('あいうえおあいうえおあいうえお\u00f7\u00f7'.repeat(20));assert.ok(wolf._internal.lzDecode(lz(src)).equals(src));});

test('WOLF: loose Data folder is read and a translated copy next to it pairs by event',async()=>{
 const top=tmp(),game=path.join(top,'wolf-jp'),patch=path.join(top,'wolf-jp-chs');
 for(const [d,m,c] of [[game,wolfMapJa(),commonJa()],[patch,wolfMapZh(),commonZh()]]){fs.mkdirSync(path.join(d,'Data','MapData'),{recursive:true});fs.mkdirSync(path.join(d,'Data','BasicData'));fs.writeFileSync(path.join(d,'Data','MapData','Map001.mps'),m);fs.writeFileSync(path.join(d,'Data','BasicData','CommonEvent.dat'),c);fs.writeFileSync(path.join(d,'Game.exe'),'MZ');}
 const exe=path.join(game,'Game.exe'),db=db1(exe),data=path.join(top,'megulit');
 assert.equal(library.engineOf(game)?.name,'Wolf RPG');
 const state=ot.scanRunning(data,'1',exe);assert.equal(state.runtime.engine,'wolf');assert.equal(state.status,'native-japanese');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.equal(r.found,patch,JSON.stringify(r));
 const p=ot.provider(data,exe);
 assert.equal(p.resolve('ここははじまりの村です。').translation,'这里是起始之村。');
 assert.equal(p.resolve('宿屋に泊まりますか？').translation,'要住旅店吗？');
});

test('WOLF: plain .wolf archives (DXArchive v8 and v6, LZ-packed entries) are read',()=>{
 for(const version of [8,6]){const game=path.join(tmp(),'wolf');fs.mkdirSync(path.join(game,'Data'),{recursive:true});fs.writeFileSync(path.join(game,'Game.exe'),'MZ');
  fs.writeFileSync(path.join(game,'Data','MapData.wolf'),dxa({'MapData/Map001.mps':wolfMapJa()},{version,pack:['MapData/Map001.mps']}));
  fs.writeFileSync(path.join(game,'Data','BasicData.wolf'),dxa({'BasicData/CommonEvent.dat':commonJa()},{version}));
  const t=wolf._internal.dxaList(path.join(game,'Data','MapData.wolf'));assert.equal(t.state,'plain');assert.deepEqual(t.files.map(f=>f.name),['MapData/Map001.mps']);
  assert.equal(scenes.detect(game),'wolf');
  const list=scenes.read('wolf',game);assert.deepEqual(list.map(s=>s.name),['CommonEvent.dat','Map001.mps']);
  assert.equal(list[1].lines[3],'ここははじまりの村です。');assert.equal(list[0].lines[1],'ゆっくり休んでね。');}
});

test('WOLF: encrypted archives (and WOLF Pro) are reported unsupported with a reason, no key search',()=>{
 const top=tmp();
 for(const [exe,want] of [['Game.exe','WOLF_ENCRYPTED'],['GamePro.exe','WOLF_PRO_ENCRYPTED']]){const game=path.join(top,exe);fs.mkdirSync(path.join(game,'Data'),{recursive:true});fs.writeFileSync(path.join(game,exe),'MZ');
  const noise=Buffer.alloc(4096);for(let i=0;i<noise.length;i++)noise[i]=(i*131+7)&255;fs.writeFileSync(path.join(game,'Data.wolf'),noise);
  assert.equal(library.engineOf(game)?.name,'Wolf RPG');assert.equal(wolf.unsupported(game),want);
  const state=ot.scanRunning(path.join(top,'megulit-'+exe),'1',path.join(game,exe));assert.equal(state.status,'unsupported');assert.equal(state.error,want);assert.ok(state.detail.includes('加密'));}
 // A v8 archive that needs a key is encrypted too, even with a readable header.
 const game=path.join(top,'keyed');fs.mkdirSync(path.join(game,'Data'),{recursive:true});fs.writeFileSync(path.join(game,'Game.exe'),'MZ');
 const a=dxa({'MapData/Map001.mps':wolfMapJa()});a.writeUInt32LE(2,44);fs.writeFileSync(path.join(game,'Data','MapData.wolf'),a);
 assert.equal(wolf.unsupported(game),'WOLF_ENCRYPTED');
});

// ---- Real games on this PC (read only) ---------------------------------------------------------------------------
const roots=['E:/GAL','E:/steam/steamapps/common'].filter(r=>fs.existsSync(r));
const real=roots.flatMap(r=>{try{return fs.readdirSync(r).map(n=>path.join(r,n));}catch{return [];}}).filter(d=>{try{return !!rpgmaker.dataDir(d)||wolf._internal.isWolf(d);}catch{return false;}});
test('RPG Maker / WOLF games on this PC are read',{skip:!real.length&&'no RPG Maker or WOLF game on this PC'},()=>{
 for(const d of real){const id=scenes.detect(d);assert.ok(id==='rpgmaker'||id==='wolf'||wolf.unsupported(d),d);}
});
