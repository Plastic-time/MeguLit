// E345 YU-RIS6 in-game replacement (女装山脈): the hook rewrites only the script's temporary string register,
// after proving that the bytes in front of ESI are exactly the string the reader just copied.
// native/megulithook/Yuris.cpp overlays the upstream file in the default MeguLitHook32 build.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','native/megulithook/Yuris.cpp'),'utf8');

test('YU-RIS6 embed only arms on the verified copy loop and falls back to read-only otherwise',()=>{
 const body=src.slice(src.indexOf('bool Yuris::InsertYuris6Hook()'),src.indexOf('bool Yuris::yuris7()'));
 const embed=body.indexOf('"EmbedYURIS6"'),plain=body.indexOf('"YU-RIS6"'),arm=body.indexOf('// E345');
 assert.ok(arm>0&&embed>arm&&plain>embed,'E345 embed first, then the upstream read-only hook');
 assert.match(body.slice(arm,embed),/if \(MatchPattern\(addr - sizeof\(checkbefore\), checkbefore, sizeof\(checkbefore\)\)\)/);
 assert.match(body.slice(arm,embed),/EMBED_ABLE/);assert.doesNotMatch(body.slice(arm,embed),/EMBED_AFTER_NEW|EMBED_AFTER_OVERWRITE|DATA_INDIRECT/);
 assert.match(src,/hp\.filter_fun = Yuris6Filter;/,'read-only path keeps the upstream de-duplicating filter');
});

test('YU-RIS6 embed writes only behind a byte-exact copy and within the proven register size',()=>{
 const ns=src.slice(src.indexOf('namespace Yuris6Embed'),src.indexOf('bool Yuris::InsertYuris6Hook()'));
 assert.match(ns,/context->esi - n - 1/);assert.match(ns,/memcmp\(dest, src, n \+ 1\)/);
 assert.match(ns,/capacity \? capacity : original/,'unknown builds never grow the string');
 assert.match(ns,/0x68, 0x00, 0x10, 0x00, 0x00/,'0x1000 only when every caller allocates it');
 assert.match(ns,/IsDBCSLeadByteEx\(932/,'never cuts a Shift-JIS character in half');
 assert.match(ns,/lastSource == now/,'repeated reads of a line get the same replacement');
});
