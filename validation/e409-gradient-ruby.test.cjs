const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const gal=fs.readFileSync(path.join(__dirname,'../web/reader/modules/gal.js'),'utf8');
test('E409: gradient outline filter is on the characters, never on the whole line (ruby stays readable)',()=>{
 assert.match(gal,/\.sentence-text \.char-token \{ filter:var\(--tomoyo-gal-jp-filter,none\)!important; \}/);
 assert.doesNotMatch(gal,/\.sentence-text \{ filter:var\(--tomoyo-gal-jp-filter/);
 assert.match(gal,/megulit-ruby-base\[data-tomoyo-reading\]::before \{ -webkit-text-fill-color:var\(--tomoyo-gal-color,#fffaf2\)!important;background-image:none!important; \}/);
});
test('E409: read and unread paints both carry a gradient and a solid ruby colour',()=>{
 const A=require('../web/reader/modules/game-style.js');
 const s={textColor:'#fffaf2',readTextColor:'',textGradient:false,readTextGradient:true,textGradientTop:'#fff',textGradientBottom:'#aaa',readTextGradientTop:'#b0e2ff',readTextGradientBottom:'#639bd1',readTextGradientStart:34,autoGameStyle:true};
 const read=A.paintFor(s,true),unread=A.paintFor(s,false);
 assert.match(read.gradient,/#b0e2ff 34%, #639bd1 100%/);assert.strictEqual(read.fill,'transparent');assert.match(read.color,/^#[0-9a-f]{6}$/i);
 assert.strictEqual(unread.gradient,'none');assert.strictEqual(A.paintVariables(read)['--tomoyo-gal-jp-filter'],'var(--tomoyo-gradient-jp-outline)');
});
