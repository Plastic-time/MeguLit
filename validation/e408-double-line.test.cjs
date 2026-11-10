const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {DoubleLine}=require('../core/double-line.cjs');
test('E408: a doubled frame is collapsed only with same-stream evidence',()=>{
 let t=0;const d=new DoubleLine(()=>t);
 assert.deepStrictEqual(d.fix('a','はい。はい。','前の台詞。'),{text:'はい。はい。',collapsed:false,reason:''},'real repeat from a stream that never doubled stays');
 t+=500;d.fix('b','うん。');t+=100;const r=d.fix('b','うん。うん。','x');assert.strictEqual(r.text,'うん。');assert.ok(r.collapsed);
 assert.strictEqual(d.fix('c','そうか。\nそうか。','そうか。').text,'そうか。','redraw of the line just shown');
 t+=5000;assert.strictEqual(d.fix('b','行こう。行こう。','x').text,'行こう。','stream already drew twice');
 const e=new DoubleLine(()=>0);e.fix('s','ああ。');assert.strictEqual(e.fix('other','ああ。ああ。','y').collapsed,false,'evidence is per stream');
});
test('E408: hook-native wires the collapse and the cross-stream window',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8');
 assert.match(s,/new DoubleLine\(/);assert.match(s,/source doubled collapsed/);
 assert.match(s,/this\.sourceStream!==this\.lastSourceStream&&age<2500/);assert.match(s,/age<650/);
});
