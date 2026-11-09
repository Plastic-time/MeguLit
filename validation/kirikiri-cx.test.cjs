// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E282: cx-encrypted KiriKiri Z scene files (Steam 千恋＊万花 and others) are read without the game's key, and their own
// Chinese language slot lines up with the Japanese one.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const psb=require('../services/original-engines/psb.cjs'),worker=require('../services/original-engines/cx-worker.cjs');

// A small PSB writer (FreeMote layout) for tests.
function arr(values){const max=Math.max(0,...values);const w=max<256?1:max<65536?2:4;const cn=values.length<256?1:2;const b=Buffer.alloc(2+cn+values.length*w);b[0]=0x0c+cn;b.writeUIntLE(values.length,1,cn);b[1+cn]=0x0c+w;values.forEach((v,i)=>b.writeUIntLE(v,2+cn+i*w,w));return b;}
function buildPsb(root){
 const names=[...new Set(collectKeys(root))].sort(),strings=[];
 // Name trie: every node gets its own block of 256 children; a terminator node points back at each name's last node.
 const nd=[0],cs=[0];let next=256;const child=new Map();
 const terminators=names.map(name=>{let node=0;for(const ch of Buffer.from(name,'latin1')){const key=node+':'+ch;if(!child.has(key)){if(cs[node]===undefined||cs[node]===0&&node!==0||node===0&&!child.size){}if(!cs[node]){cs[node]=next;next+=256;}const x=cs[node]+ch;nd[x]=node;child.set(key,x);}node=child.get(key);}
  const t=next++;nd[t]=node;return t;});
 for(let i=0;i<next;i++){if(nd[i]===undefined)nd[i]=0;if(cs[i]===undefined)cs[i]=0;}
 const idx=s=>{let i=strings.indexOf(s);if(i<0){strings.push(s);i=strings.length-1;}return i;};
 const parts=[];
 function enc(v){
  if(v===null)return Buffer.from([0x01]);
  if(typeof v==='string')return Buffer.from([0x15,idx(v)]);
  if(typeof v==='number')return Buffer.from([0x05,v&255]);
  if(Array.isArray(v)){const items=v.map(enc),offs=[];let o=0;for(const it of items){offs.push(o);o+=it.length;}return Buffer.concat([Buffer.from([0x20]),arr(offs),...items]);}
  const keys=Object.keys(v).sort(),items=keys.map(k=>enc(v[k])),offs=[];let o=0;for(const it of items){offs.push(o);o+=it.length;}
  return Buffer.concat([Buffer.from([0x21]),arr(keys.map(k=>names.indexOf(k))),arr(offs),...items]);
 }
 const body=enc(root);
 const nameBlock=Buffer.concat([arr(cs),arr(nd),arr(terminators)]);
 const sdata=[],soffs=[];let so=0;for(const s of strings){const b=Buffer.from(s+'\0','utf8');soffs.push(so);so+=b.length;sdata.push(b);}
 const header=Buffer.alloc(0x2c),offNames=0x2c,offEntries=offNames+nameBlock.length,offStrings=offEntries+body.length;
 const strArr=arr(soffs),offData=offStrings+strArr.length,data=Buffer.concat(sdata),chunkAt=offData+data.length;
 header.write('PSB\0',0,'latin1');header.writeUInt16LE(3,4);header.writeUInt32LE(0x2c,8);header.writeUInt32LE(offNames,12);header.writeUInt32LE(offStrings,16);header.writeUInt32LE(offData,20);
 header.writeUInt32LE(chunkAt,24);header.writeUInt32LE(chunkAt+3,28);header.writeUInt32LE(chunkAt+6,32);header.writeUInt32LE(offEntries,36);
 return Buffer.concat([header,nameBlock,body,strArr,data,Buffer.from([0x0d,0,0x0d,0x0d,0,0x0d])]);
}
function collectKeys(v){if(Array.isArray(v))return v.flatMap(collectKeys);if(v&&typeof v==='object')return [...Object.keys(v),...Object.values(v).flatMap(collectKeys)];return [];}
const scene={name:'001・テスト.ks',scenes:[{label:'start',texts:[
 [null,null,[[null,'「[し]志[な]那[つ]都荘まで行って欲しいんですけど」'],[null,'To Shinatsu Inn, please.'],[null,'「请送我到志那都庄。」'],[null,'「請送我到志那都莊。」']]],
 ['将臣',null,[[null,'「………」'],['Masaomi','......'],['将臣','「……」'],['將臣','「……」']]],
 [null,null,[[null,'電車も走っておらず、\\n１時間に一本。'],[null,'No trains.'],[null,'这里没有电车，\\n一小时才一班。'],[null,'這裡沒有電車。']]]]}]};

test('PSB writer and reader agree',()=>{
 const doc=psb.parse(buildPsb(scene));
 assert.deepStrictEqual(doc.root,scene);
});

test('cx: two XOR bytes split at a boundary plus a stray byte are undone without a key',()=>{
 const plain=buildPsb(scene),raw=Buffer.from(plain),entries=plain.readUInt32LE(36),split=entries-3,k1=0x5a,k2=0xc3;
 for(let i=0;i<raw.length;i++)raw[i]^=i<split?k1:k2;
 raw[0]^=0x77; // the first byte carries an extra XOR in these archives
 raw[entries+3]^=0x40; // and a stray byte past the boundary: here the width byte of the root's key array
 const doc=psb.openCx(raw);assert.ok(doc,'decrypted');
 assert.deepStrictEqual(doc.root,scene);
});

test('scene text: ruby and \\n markup removed, every language slot kept',()=>{
 const scenes=worker.textsOf({root:scene});
 assert.deepStrictEqual(scenes[0].rows[0],['「志那都荘まで行って欲しいんですけど」','To Shinatsu Inn, please.','「请送我到志那都庄。」','「請送我到志那都莊。」']);
 assert.strictEqual(scenes[0].rows[2][0],'電車も走っておらず、\n１時間に一本。');
});

test('game ruby: neighbouring readings make one word, space-padded group readings join',()=>{
 assert.deepStrictEqual(worker.rubyOf('「[し]志[な]那[つ]都荘まで」'),[['志那都','しなつ']]);
 assert.deepStrictEqual(worker.rubyOf('[くら]鞍[ま]馬[　げんじ　]玄[　ゅう]十[　ろう]郎'),[['鞍馬','くらま'],['玄十郎','げんじゅうろう']]);
 assert.deepStrictEqual(worker.rubyOf('ルビなし'),[]);
 const {ENGINES}=require('../services/original-engines/scenes.cjs'),doc={entry:'x',name:'001',scenes:worker.textsOf({root:scene})};
 assert.deepStrictEqual(ENGINES['kirikiri-cx'].parse(Buffer.from(JSON.stringify(doc))).ruby,[[['志那都','しなつ']],null,null]);
});

test('script ruby reaches the hook line (game readings before dictionary ones)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8');
 assert.match(src,/if\(this\.originalText\?\.kind==='patch'\)\{const r=this\.resolveSource\(text\);if\(r&&Array\.isArray\(r\.ruby\)/);
});

test('kirikiri-cx engine: the Simplified Chinese slot is the translation of the Japanese line',()=>{
 const {ENGINES}=require('../services/original-engines/scenes.cjs'),eng=ENGINES['kirikiri-cx'];
 const doc={entry:'x',name:'001',scenes:worker.textsOf({root:scene})},parsed=eng.parse(Buffer.from(JSON.stringify(doc)));
 assert.strictEqual(parsed.lines[1],'「………」');
 const list=eng.patchLines([{name:'001',...parsed}]);
 assert.strictEqual(list[0].lines[0],'「请送我到志那都庄。」');
});

// Real data when this machine has it.
const senren=path.join('E:/','GAL','SenrenBanka');
test('千恋＊万花 (Steam): Japanese lines get the release\'s own Chinese',{skip:!fs.existsSync(path.join(senren,'scn.xp3'))&&'no local copy',timeout:1800000},async()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(senren,'SenrenBanka.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const ot=require('../services/original-text.cjs'),sc=require('../services/original-engines/scenes.cjs'),data=fs.mkdtempSync(path.join(os.tmpdir(),'cx-'));
 ot.scanRunning(data,'1',exe);while(sc.cxBuilds.size)await new Promise(r=>setTimeout(r,1000));
 assert.strictEqual(ot.scanRunning(data,'1',exe).runtime.engine,'kirikiri-cx');
 const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('明るい笑顔を浮かべながら手を振っているこの人は、馬庭芦花。').translation,'眼前这位笑容爽朗，正冲着我挥手的女性叫作马庭芦花。');
 assert.deepStrictEqual(ot.provider(data,exe).resolve('「すみません、客じゃないんです。鞍馬玄十郎はいますか？」').ruby,[['鞍馬','くらま'],['玄十郎','げんじゅうろう']]);
});
