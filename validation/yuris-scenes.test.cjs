'use strict';
// E329 YU-RIS scenes (ysbin.ypf + update*.ypf) for zero-latency translation.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const yuris=require('../services/original-engines/yuris.cjs');

// Encoders built from the platform decoders (Node has none for Shift-JIS / GBK).
function encoder(label){const dec=new TextDecoder(label),map=new Map();
 for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){const ch=dec.decode(Buffer.from([a,b]));if(ch.length===1&&ch!=='\ufffd'&&!map.has(ch))map.set(ch,Buffer.from([a,b]));}
 return t=>Buffer.concat(Array.from(t,ch=>ch.charCodeAt(0)<0x80?Buffer.from(ch,'latin1'):map.get(ch)));}
const sjis=encoder('shift_jis'),gbk=encoder('gbk');
const KEY=[0xd3,0x6f,0xac,0x96];
// A YSTB: text lines as WORD (op 91, one raw argument), each after a sound command (op 29, an expression argument).
function ystb(lines){const code=[],args=[],res=[];let off=0;
 const arg=(type,data)=>{const a=Buffer.alloc(12);a.writeUInt16LE(type,2);a.writeUInt32LE(data.length,4);a.writeUInt32LE(off,8);off+=data.length;args.push(a);res.push(data);};
 lines.forEach((t,i)=>{code.push(Buffer.from([29,1,0,0]));arg(3,Buffer.from('M\x08\x00"es.SND"V'+i,'latin1'));code.push(Buffer.from([91,1,0,0]));arg(0,t);});
 const segs=[Buffer.concat(code),Buffer.concat(args),Buffer.concat(res),Buffer.alloc(code.length*4)].map(s=>{const x=Buffer.from(s);for(let i=0;i<x.length;i++)x[i]^=KEY[i&3];return x;});
 const head=Buffer.alloc(32);head.write('YSTB',0,'latin1');head.writeUInt32LE(0x1c2,4);head.writeUInt32LE(code.length,8);segs.forEach((s,k)=>head.writeUInt32LE(s.length,12+k*4));
 return Buffer.concat([head,...segs]);}
function ypf(files){const entries=[],datas=[];let index=0;
 for(const [name] of files)index+=4+1+name.length+18;let off=32+index;
 for(const [name,data] of files){const packed=zlib.deflateSync(data),n=Buffer.from(name,'latin1'),e=Buffer.alloc(4+1+n.length+18);
  e[4]=n.length^0xff;n.forEach((c,i)=>{e[5+i]=c^0xff;});let p=5+n.length;e[p+1]=1;e.writeUInt32LE(data.length,p+2);e.writeUInt32LE(packed.length,p+6);e.writeUInt32LE(off,p+10);off+=packed.length;entries.push(e);datas.push(packed);}
 const head=Buffer.alloc(32);head.write('YPF\0',0,'latin1');head.writeUInt32LE(450,4);head.writeUInt32LE(files.length,8);head.writeUInt32LE(index,12);
 return Buffer.concat([head,...entries,...datas]);}
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
async function patchFor(game){
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=fs.readdirSync(game).find(f=>/\.exe$/i.test(f)&&!/cn/i.test(f));db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',path.join(game,exe));
 const ot=require('../services/original-text.cjs'),data=path.join(path.dirname(game),'data'),r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
 return {r,ot,data,exe:path.join(game,exe)};}

test('YU-RIS: Japanese scenes from ysbin.ypf, the Chinese update1.ypf moved aside by the restore is their translation',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-s-')),game=path.join(base,'game');
 const ja=['きょうはいいてんきですね。','そうだね、さんぽにいこうか。','あのこうえんまであるいていこう。','さくらがきれいにさいているよ。','おべんとうももっていこうね。','たのしみだなあ、はやくいこう。'];
 const zh=['今天天气真好呢。','是啊，去散步吧。','走到那个公园去吧。','樱花开得很漂亮哦。','也带上便当吧。','好期待啊，快走吧。'];
 put(game,{'game.exe':'exe','pac/ysbin.ypf':ypf([['ysbin\\yst00000.ybn',ystb([])],['ysbin\\yst00100.ybn',ystb(ja.map(sjis))]]),
  '.megulit-japanese/yuris/update1.ypf':ypf([['ysbin\\yst00100.ybn',ystb(zh.map(gbk))],['cgsys\\a.png',Buffer.from('png')]])});
 const scenes=yuris.scenes(game);assert.deepStrictEqual(scenes.map(s=>s.name),['yst00100.ybn'],'scenes without text are left out');
 const p=yuris.parse(scenes[0].read());assert.deepStrictEqual(p.lines,ja);assert.strictEqual(p.anchors.length,6);
 const {r,ot,data,exe}=await patchFor(game);
 assert.ok(r.found&&r.found.includes('.megulit-japanese'),JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('あのこうえんまであるいていこう。').translation,'走到那个公园去吧。');
 fs.rmSync(base,{recursive:true,force:true});
});

test('YU-RIS: a Chinese update*.ypf beside the program is the running script (nothing to pair before the restore)',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-o-')),game=path.join(base,'game');
 put(game,{'pac/ysbin.ypf':ypf([['ysbin\\yst00100.ybn',ystb(['あいうえお。'].map(sjis))]]),'update1.ypf':ypf([['ysbin\\yst00100.ybn',ystb(['你好。'].map(gbk))]])});
 assert.strictEqual(yuris.parse(yuris.scenes(game)[0].read()).lines[0],new TextDecoder('shift_jis').decode(gbk('你好。')),'update1.ypf overrides ysbin');
 assert.strictEqual(yuris.sources(game).length,2);
 fs.rmSync(base,{recursive:true,force:true});
});

// The user's own install (skipped elsewhere): 女装山脈 with the 萌空 1.1 patch, whose text is coded for the loader's font.
const REAL='E:\\GAL\\女装山脉';
test('YU-RIS real data: 女装山脈 Japanese ysbin lines pair with the 1.1 Chinese patch',{skip:!fs.existsSync(path.join(REAL,'pac','ysbin.ypf'))&&'女装山脈 not installed'},async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-r-')),game=path.join(base,'女装山脉'),copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
 // The state after 恢复日文: update1.ypf in the backup folder, the loader and its readme still in the game folder.
 copy(path.join(REAL,'pac','ysbin.ypf'),path.join(game,'pac','ysbin.ypf'));
 copy(path.join(REAL,'补丁','1.1汉化补丁','update1.ypf'),path.join(game,'.megulit-japanese','yuris','update1.ypf'));
 for(const f of ['女装山脉cn1.1.exe','readme.ini'])copy(path.join(REAL,'补丁','1.1汉化补丁',f),path.join(game,f));
 fs.writeFileSync(path.join(game,'女装山脈.exe'),'exe');
 const scenes=yuris.scenes(game),lines=scenes.flatMap(s=>yuris.parse(s.read()).lines);
 assert.ok(scenes.length>=5&&lines.length>10000,scenes.length+' scenes, '+lines.length+' lines');
 assert.ok(lines.includes('行けども行けども山ばかり。'),'Japanese lines come from ysbin.ypf');
 const {r,ot,data,exe}=await patchFor(game);
 assert.ok(r.found&&r.found.includes('.megulit-japanese'),JSON.stringify(r));
 const state=JSON.parse(fs.readFileSync(path.join(data,'data/config/original-text.json'),'utf8'))['1'];
 assert.strictEqual(state.engine,'yuris');assert.strictEqual(state.patchStatus,'ready');
 const provider=ot.provider(data,exe);
 assert.strictEqual(provider.resolve('予定では、宿について、風呂で今日の汚れを落としているはずだった。').translation,'本来按照预定，现在已经抵达旅馆，在澡堂里洗白白了。');
 fs.rmSync(base,{recursive:true,force:true});
});
