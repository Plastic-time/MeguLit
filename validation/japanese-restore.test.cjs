'use strict';
// E237 Japanese restore: synthetic Siglus .dbs tables (built with the module's own encoder), applied and undone in a temp dir.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jr=require('../core/japanese-restore.cjs'),{encrypt,decrypt,parse}=jr._internal;

function table(rows){ // rows: string[][], all columns are strings (0x53), unicode marker 1
 const cols=rows[0].length,head=28,fmt=head,data=fmt+cols*8,text=data+rows.length*cols*4,pool=[],idx=new Map();let size=0;
 const put=s=>{if(!idx.has(s)){const b=Buffer.from(s+'\0','utf16le');idx.set(s,size);pool.push(b);size+=b.length;}return idx.get(s);};
 const b=Buffer.alloc(text);b.writeUInt32LE(rows.length,4);b.writeUInt32LE(cols,8);b.writeUInt32LE(head,12);b.writeUInt32LE(fmt,16);b.writeUInt32LE(data,20);b.writeUInt32LE(text,24);
 for(let c=0;c<cols;c++){b.writeUInt32LE(c,fmt+c*8);b.writeUInt32LE(0x53,fmt+c*8+4);}
 rows.forEach((r,ri)=>r.forEach((v,ci)=>b.writeUInt32LE(put(v),data+(ri*cols+ci)*4)));
 const raw=Buffer.concat([b,...pool]);raw.writeUInt32LE(raw.length,0);return encrypt(1,raw);
}
const cells=f=>{const d=decrypt(fs.readFileSync(f));return parse(d.raw,d.marker).cells;};

const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-')),dat=path.join(root,'dat');fs.mkdirSync(dat);
const story=[];for(let i=0;i<20;i++)story.push(['「島に着いた」'+i,'We reached the island '+i,'我们到了岛上'+i,'','voice_'+i]);
fs.writeFileSync(path.join(dat,'10_story.dbs'),table(story));
const music=[];for(let i=0;i<8;i++)music.push(['BGM0'+i,'BGM0'+i,'テーマ曲'+i,'Theme '+i]);
fs.writeFileSync(path.join(dat,'music_info.dbs'),table(music));
const base=[['しまもん','ふつう'],['うみねこ','つよい']],en=[['Shimamon','normal'],['Seagull','strong']];
fs.writeFileSync(path.join(dat,'skill.dbs'),table(base));fs.writeFileSync(path.join(dat,'skill_en.dbs'),table(en));
const before=Object.fromEntries(fs.readdirSync(dat).map(f=>[f,fs.readFileSync(path.join(dat,f))]));

let d=jr.detect(root);
assert.equal(d.state,'restorable');assert.equal(d.adapter,'siglus-dbs');
assert.ok([1,2].every(c=>d.targetColumns.includes(c))&&!d.targetColumns.includes(4));
const r=jr.apply(root);assert.ok(r.applied>=3);
let s=cells(path.join(dat,'10_story.dbs'));
assert.equal(s[3][1],'「島に着いた」3');assert.equal(s[3][2],'「島に着いた」3');
assert.equal(s[3][4],'voice_3','identifier column untouched');assert.equal(s[3][3],'','empty column untouched');
const m=cells(path.join(dat,'music_info.dbs'));
assert.equal(m[2][0],'BGM02','file-name column untouched');assert.equal(m[2][3],'テーマ曲2','English title takes Japanese');
assert.deepEqual(cells(path.join(dat,'skill_en.dbs')),base,'locale twin takes the base strings');
assert.equal(jr.detect(root).state,'applied');

// a file changed after apply (a game update) is left alone on undo
const upd=path.join(dat,'music_info.dbs'),updated=table(music.map(r=>[...r.slice(0,3),'Updated']));fs.writeFileSync(upd,updated);
const u=jr.restore(root);assert.deepEqual(u.skipped,['music_info.dbs']);
assert.ok(fs.readFileSync(path.join(dat,'10_story.dbs')).equals(before['10_story.dbs']),'story restored byte-for-byte');
assert.ok(fs.readFileSync(path.join(dat,'skill_en.dbs')).equals(before['skill_en.dbs']));
assert.ok(fs.readFileSync(upd).equals(updated),'updated file kept');
assert.ok(fs.existsSync(path.join(root,'.megulit-japanese')),'backup kept while something was skipped');

// a folder without Japanese data
const empty=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr0-'));assert.equal(jr.detect(empty).state,'none');
fs.writeFileSync(path.join(empty,'SceneEN.pck'),'x');assert.equal(jr.detect(empty).state,'unsupported');
assert.throws(()=>jr.apply(empty),/NOTHING_TO_RESTORE/);
fs.rmSync(root,{recursive:true,force:true});fs.rmSync(empty,{recursive:true,force:true});
console.log('japanese-restore ok');

require('node:test')('rebuilding a Siglus table keeps the engine layout: one string per cell in order, padded to 32 bytes',()=>{
 const {_internal:I}=require('../core/japanese-restore.cjs');
 /* CLANNAD crashed (0xC0000005) on a deduplicated, unpadded pool; an unchanged table must rebuild byte for byte */
 const cells=[['あ',''],['あ','x']],rows=2,cols=2,fmt=28,data=fmt+cols*8,text=data+rows*cols*4;
 const pool=[];let off=0;const idx=[];for(const row of cells)for(const v of row){idx.push(off);const b=Buffer.from(v+'\0','utf16le');pool.push(b);off+=b.length;}
 const head=Buffer.alloc(text);[0,rows,cols,0,fmt,data,text].forEach((v,i)=>head.writeUInt32LE(v,i*4));
 for(let c=0;c<cols;c++){head.writeUInt32LE(c,fmt+c*8);head.writeUInt32LE(0x53,fmt+c*8+4);}idx.forEach((v,i)=>head.writeUInt32LE(v,data+i*4));
 const body=Buffer.concat([head,...pool]),raw=Buffer.alloc(Math.ceil(body.length/32)*32);body.copy(raw);raw.writeUInt32LE(body.length,0);
 const t=I.parse(raw,1);assert.ok(I.rebuild(raw,1,t,t.cells).equals(raw));
 const next=I.rebuild(raw,1,t,[['あ','あ'],['あ','あ']]),offs=[0,1,2,3].map(i=>next.readUInt32LE(data+i*4));
 assert.equal(new Set(offs).size,4);assert.equal(next.length%32,0);assert.equal(next.readUInt32LE(0),text+16);
});
