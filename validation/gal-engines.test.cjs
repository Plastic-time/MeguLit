// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Script readers added for the E:\GAL batch (2026-11-11): synthetic inputs for each text format.
const test=require('node:test'),assert=require('node:assert'),zlib=require('node:zlib');
const SJ=(s)=>{const map={'あ':[0x82,0xa0],'い':[0x82,0xa2],'う':[0x82,0xa4],'「':[0x81,0x75],'」':[0x81,0x76]};const out=[];for(const ch of s){if(map[ch])out.push(...map[ch]);else out.push(ch.charCodeAt(0));}return Buffer.from(out);};
test('nitro-pak: <k> splits lines, ruby keeps the base text, VOICE NAME is the speaker',()=>{
 const {parse}=require('../services/original-engines/nitro-pak.cjs');
 const data=Buffer.concat([SJ('<VOICE NAME="'),SJ('あ'),SJ('" SRC="1">「'),SJ('<R TEXT="い">う</R>'),SJ('」<k>'),SJ('ああ<k>')]);
 assert.deepEqual(parse(data).lines,['あ','「う」','ああ']);});
test('bruns: EENZ decodes and send-string lines carry the speaker',()=>{
 const {parse}=require('../services/original-engines/bruns.cjs');
 const body=Buffer.concat([SJ('(a3:send-string clear 1)\r\n(a3:send-string "[$Bあ$K]「いう」$N" 2)\r\n(a3:send-string wait-w 3)')]);
 const z=zlib.deflateSync(body),key=0x12345678,head=Buffer.alloc(8);head.write('EENZ',0,'latin1');head.writeUInt32LE((key^0xDEADBEEF)>>>0,4);
 const enc=Buffer.from(z);for(let i=0;i<enc.length;i++)enc[i]^=(key>>>((i&3)*8))&255;
 assert.deepEqual(parse(Buffer.concat([head,enc])).lines,['あ','「いう」']);});
test('iga: string operands up to NUL, ＃ names, <漢字<よみ> ruby',()=>{
 const {parse}=require('../services/original-engines/iga.cjs');
 const name=Buffer.concat([Buffer.from([0x81,0x94]),SJ('あい')]),line=SJ('「あ<い<う>」');
 const op=s=>Buffer.concat([Buffer.from([0x04,0x00,s.length+3]),s,Buffer.from([0,0,0])]);
 assert.deepEqual(parse(Buffer.concat([Buffer.from([9,9]),op(name),op(line)])).lines,['あい','「あい」']);});
test('paz: .message rows give name and text',()=>{
 const {parse}=require('../services/original-engines/paz.cjs');
 assert.deepEqual(parse(Buffer.concat([SJ('.message\t10\t\t\tああ\r\n.message\t20\tv.ogg\tい\t「う」\r\n.char x\r\n')])).lines,['ああ','い','「う」']);});
test('nitro-npk: Squirrel string literals become lines, voice tags dropped',()=>{
 const {engine}=require('../services/original-engines/npk.cjs');
 const lit=s=>{const b=Buffer.from(s,'utf8'),h=Buffer.alloc(8);h.writeUInt32LE(0x08000010,0);h.writeUInt32LE(b.length,4);return Buffer.concat([h,b]);};
 const data=Buffer.concat([lit('se_click'),lit("//【双葉】\r\n<voice name='双葉' src='v/1'>\r\n「起立」"),lit('\r\n#{・・}はなれない#。\r\n')]);
 assert.deepEqual(engine.parse(data).lines,['双葉','「起立」','はなれない。']);});
test('re-pak: UTF-16 runs joined across line-break codes, other codes split, non-Japanese dropped',()=>{
 const {parse}=require('../services/original-engines/re-pak.cjs');const u=[];const put=s=>{for(const c of s)u.push(c.charCodeAt(0));};
 put('USR\0');put('このマユなら、');u.push(6);put('ずいぶん前に');u.push(0xe001);put('ウチの課だ。');u.push(0x1b,4);put('いいね');u.push(0x1c);put('中文文本');u.push(0x1d);
 const d=Buffer.alloc(u.length*2);u.forEach((v,i)=>d.writeUInt16LE(v,i*2));d.write('USR\0',0,'latin1');
 assert.deepEqual(parse(d).lines,['このマユなら、ずいぶん前にウチの課だ。','いいね']);});
test('kirikiri: Japanese macro names, [漢字\'よみ] ruby, [iscript] code and "\\" continuations',()=>{
 const s=require('../services/original-engines/scenes.cjs');
 const ks=['[iscript]','global.x = 1;','[endscript]','@position marginl=1 \\','margint=2','[輝夜]とふたり[r]','[貴峰丸\'たかねまる]が来た'].join('\r\n');
 const r=s.ENGINES.kirikiri.parse(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(ks,'utf16le')]));
 assert.deepEqual(r.lines,['輝夜とふたり','貴峰丸が来た']);assert.deepEqual(r.ruby,[null,[['貴峰丸','たかねまる']]]);});
test('paz: colour and break codes are dropped',()=>{
 const {parse}=require('../services/original-engines/paz.cjs');
 assert.deepEqual(parse(Buffer.from('.message\t1\t\t\t\\#FF0000red\\#FFFFFF\\nnext\r\n','latin1')).lines,['rednext']);});
test('bgi: <R よみ>漢字</R> splits into text and ruby',()=>{
 const {splitRuby}=require('../services/original-engines/bgi.cjs');
 assert.deepEqual(splitRuby(['<R しゅんげん>峻厳</R>な崖','x']),{lines:['峻厳な崖','x'],ruby:[[['峻厳','しゅんげん']],null]});});
test('fvp: 0x0E pushes with NUL are lines, ASCII names and commands are dropped',()=>{
 const {parse}=require('../services/original-engines/fvp.cjs');
 const push=s=>{const b=Buffer.concat([s,Buffer.from([0])]);return Buffer.concat([Buffer.from([0x0E,b.length]),b]);};
 const code=Buffer.concat([Buffer.from([0x02,0,0]),push(SJ('「あい」')),Buffer.from([0x0E,4]),Buffer.from('bg1\0','latin1'),push(SJ('うあ')),Buffer.from([0x0E,9,0x82])]);
 const head=Buffer.alloc(4);head.writeUInt32LE(4+code.length,0);
 assert.deepEqual(parse(Buffer.concat([head,code,Buffer.from('sysdesc')])).lines,['「あい」','うあ']);});
test('cx filter: generated programs are stable, the filter undoes itself, wrong schemes are not picked from one-byte heads',()=>{
 const cx=require('../services/original-engines/cx-filter.cjs');
 const s=cx.schemes().find(s=>s.titles.includes('ATRI -My Dear Moments-'));assert.ok(s&&s.cb&&s.cb.length===0x400);
 const d=cx.filter(s),a=Buffer.alloc(24);d(0x12345678,0,a);assert.equal(a.toString('hex'),'4a'.repeat(24));
 const b=Buffer.alloc(24);d(0x9abcdef0,1000,b);assert.equal(b.toString('hex'),'1e'.repeat(24));
 const plain=Buffer.from('TJS2100\0some bytecode here','latin1'),c=Buffer.from(plain);d(0x2468ace0,0,c);assert.notDeepEqual(c,plain);d(0x2468ace0,0,c);assert.deepEqual(c,plain);
 assert.ok(cx.looks(Buffer.from('OggS....','latin1')));assert.ok(!cx.looks(Buffer.from(';abc','latin1')));
 assert.ok(cx.schemes().length>=100);});
test('fvp: a Chinese twin .hcb rewritten in place (GBK, NUL-padded) gives the translation of each line',()=>{
 const {parse}=require('../services/original-engines/fvp.cjs');
 const head=n=>{const h=Buffer.alloc(4);h.writeUInt32LE(n,0);return h;};
 const jpText=SJ('「あい」'),body=Buffer.concat([Buffer.from([0x0E,jpText.length+1]),jpText,Buffer.from([0])]);
 const zhText=Buffer.from([0xc4,0xe3,0xba,0xc3]),zbody=Buffer.concat([Buffer.from([0x0E,jpText.length+1]),zhText,Buffer.alloc(jpText.length+1-zhText.length)]);
 const jp=Buffer.concat([head(4+body.length),body]),zh=Buffer.concat([head(4+zbody.length),zbody]);
 const n=Buffer.alloc(4);n.writeUInt32LE(jp.length);
 const r=parse(Buffer.concat([Buffer.from('FVP+ZH\0\0','latin1'),n,jp,zh]));
 assert.deepEqual(r.lines,['「あい」']);assert.deepEqual(r.zh,['你好']);});
test('advhd: Will ARC lists WSC scripts, ror-2 decoding, narration and spoken lines in both id widths',()=>{
 const {parse,decode,list}=require('../services/original-engines/advhd.cjs');
 const z=Buffer.from([0]);
 const early=Buffer.concat([z,Buffer.from([0x41,1,0,0]),SJ('あいう'),z,Buffer.from([0x42,2,0,0,0]),SJ('あい'),z,SJ('「う」'),Buffer.from('%K%P','latin1'),z]);
 assert.deepEqual(parse(early).lines,['あいう','あい','「う」']);
 const later=Buffer.concat([z,Buffer.from([0x41,1,0,0,0]),SJ('うい'),z,Buffer.from([0x42,2,0,0,0,0]),SJ('いい'),z,SJ('「あ」'),z]);
 assert.deepEqual(parse(later).lines,['うい','いい','「あ」']);
 const enc=Buffer.from(early);for(let i=0;i<enc.length;i++)enc[i]=((enc[i]<<2)|(enc[i]>>>6))&255;assert.deepEqual(decode(enc),early);
 const head=Buffer.alloc(16);head.writeInt32LE(1,0);head.write('WSC',4,'latin1');head.writeUInt32LE(1,8);head.writeUInt32LE(16,12);
 const ent=Buffer.alloc(17);ent.write('T01',0,'latin1');ent.writeUInt32LE(enc.length,9);ent.writeUInt32LE(33,13);
 const arc=Buffer.concat([head,ent,enc]);assert.deepEqual(list(arc),[{name:'T01.wsc',size:enc.length,offset:33}]);});
test('naninovel: parsed-asset documents (no "; " text) pair the Japanese and Chinese PrintText texts in order',()=>{
 const n=require('../services/original-engines/naninovel.cjs');
 const s=t=>{const b=Buffer.from(t,'utf8'),h=Buffer.alloc(4);h.writeUInt32LE(b.length);const pad=Buffer.alloc((4-b.length%4)%4);return Buffer.concat([h,b,pad]);};
 const doc=(dst,texts)=>Buffer.concat([Buffer.alloc(8),s('Chinese (T) <zh-TW> to X <'+dst+'> localization document for `S1` naninovel script'),s('LabelScriptLine'),Buffer.alloc(8),
  ...texts.flatMap(t=>[s('PrintText'),s('Naninovel.Commands'),s('Elringus.Naninovel.Runtime'),s('S1'),s(t),Buffer.alloc(4)])]);
 const buf=Buffer.concat([doc('ja-JP',['「あい」','うう']),doc('zh-CN',['你好','好']),doc('ko-KR',['a','b'])]);
 const docs=n._internal.scan(buf,[]);assert.equal(docs.length,3);assert.deepEqual([...docs[0].prints],['「あい」','うう']);
 const [one]=n._internal.combine(docs);const p=n.parse(Buffer.from(one.text,'utf8'));
 assert.deepEqual(p.lines,['「あい」','うう']);assert.deepEqual(p.zh,['你好','好']);});
test('fvp: a translation moved out of place (0x06 jump to appended code) is followed',()=>{
 const {parse}=require('../services/original-engines/fvp.cjs');
 const jpText=SJ('あい'),push=Buffer.concat([Buffer.from([0x0E,jpText.length+1]),jpText,Buffer.from([0])]);
 const head=n=>{const h=Buffer.alloc(4);h.writeUInt32LE(n,0);return h;};
 const jp=Buffer.concat([head(4+push.length),push]);
 const zhText=Buffer.from([0xc4,0xe3,0xba,0xc3,0xc4,0xe3,0xba,0xc3]),far=Buffer.concat([Buffer.from([0x0E,zhText.length+1]),zhText,Buffer.from([0])]);
 const jump=Buffer.alloc(push.length);jump[0]=0x06;jump.writeUInt32LE(4+push.length,1);
 const zh=Buffer.concat([head(4+push.length),jump,far]);
 const n=Buffer.alloc(4);n.writeUInt32LE(jp.length);
 assert.deepEqual(parse(Buffer.concat([Buffer.from('FVP+ZH\0\0','latin1'),n,jp,zh])).zh,['你好你好']);});
test('fvp: a cnpack (AES-128-ECB per record, key by bits 16-17, byte-swapped push address) gives the Chinese line',()=>{
 const {parse}=require('../services/original-engines/fvp.cjs'),crypto=require('node:crypto');
 const jpText=SJ('「あい」'),pre=Buffer.from([0x02,0,0,0,0]),push=Buffer.concat([Buffer.from([0x0E,jpText.length+1]),jpText,Buffer.from([0])]);
 const head=Buffer.alloc(4);head.writeUInt32LE(4+pre.length+push.length,0);const hcb=Buffer.concat([head,pre,push]);
 const at=4+pre.length+1,k=(((at&255)<<24)|((at>>>8&255)<<16)|((at>>>16&255)<<8)|(at>>>24))>>>0;
 const key=crypto.createHash('md5').update(String(k)).digest();assert.equal((k&0x30000)>>>16,0);
 const plain=Buffer.alloc(16);Buffer.from([1,2,3,4,0xc4,0xe3,0xba,0xc3]).copy(plain);
 const c=crypto.createCipheriv('aes-128-ecb',key,null);c.setAutoPadding(false);const data=Buffer.concat([c.update(plain),c.final()]);
 const rec=Buffer.alloc(6);rec.writeUInt32LE(k,0);rec.writeUInt16LE(data.length,4);const cnt=Buffer.alloc(4);cnt.writeUInt32LE(1);
 const n=Buffer.alloc(4);n.writeUInt32LE(hcb.length);
 const r=parse(Buffer.concat([Buffer.from('FVP+CN\0\0','latin1'),n,hcb,cnt,rec,data]));
 assert.deepEqual(r.lines,['「あい」']);assert.deepEqual(r.zh,['你好']);});
test('kirikiri: KAG scenarios kept as .txt under a scenario folder count as scripts, list files do not',()=>{
 const src=require('node:fs').readFileSync(require.resolve('../services/original-engines/scenes.cjs'),'utf8');
 const m=/const KS=(n=>[^\n]+);/.exec(src);const KS=eval(m[1]);
 const B=String.fromCharCode(92),p=(...a)=>a.join(B);
 assert.ok(KS(p('scenario','04route','r04_23.txt')));assert.ok(KS('scenario/first.txt'));assert.ok(KS('a.ks'));
 assert.ok(!KS(p('scenario','!scnlist.txt')));assert.ok(!KS(p('fgimage','face.txt')));assert.ok(!KS('readme.txt'));});
