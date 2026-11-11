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
