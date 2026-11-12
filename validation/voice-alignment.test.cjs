'use strict';
// E461 (user: "例句的配音对不上例句", WHITE ALBUM2 「…ぶっちゃけ甘えてる。俺に。」 played another line's voice).
const test=require('node:test'),assert=require('node:assert/strict');
const a=require('../services/original-engines/aquaplus.cjs');
const {trimWav,wav,parse}=require('../core/voice-trim.cjs');

// A WHITE ALBUM2-style scene whose strings a counted-out message list gets wrong: a name before a <F16…>-wrapped speech,
// a Japanese image name (ギター.tga) and two choices. Every message call says which string it shows (3 <n>).
test('aquaplus: a message shows the string its 3 <n> names, not the k-th string left after guessing names',()=>{
 const strings=['','bak','春希','「やあ」','ギター.tga','かずさ','<F16「もう一つだけ」>','地の文。','１．話す','２．帰る','春希','「それで」'];
 // Shift-JIS bytes through the reader's own decoder: build them with iconv-free mapping of these few characters
 const w=[0,0,0];const push=v=>w.push(5,3,v),call=id=>w.push(4,id),str=n=>w.push(6,30,3,n);
 const msg=(k,n,voice)=>{if(voice!==undefined){push(voice[0]);push(256);push(0);push(0);push(voice[1]);call(138);}str(n);push(k);push(1);call(131);};
 msg(0,3,[0,10]);msg(1,6,[1,11]);msg(2,7);msg(3,11,[0,12]);
 const bnr=Buffer.alloc(w.length*4);w.forEach((v,i)=>bnr.writeInt32LE(v,i*4));
 const out=a._internal.sceneVoices('3905',shiftJis(strings.join(',')),bnr);
 assert.deepEqual(out,[{text:'「やあ」',ref:'3905_0010_00'},{text:'「もう一つだけ」',ref:'3905_0011_01'},{text:'「それで」',ref:'3905_0012_00'}]);});

// Shift-JIS for the test strings (Node has no Shift-JIS encoder): a table of the characters used.
function shiftJis(s){const T={'春':'8f74','希':'8af3','「':'8175','」':'8176','や':'82e2','あ':'82a0','ギ':'834d','タ':'835e','ー':'815b','か':'82a9','ず':'82b8','さ':'82b3','も':'82e0','う':'82a4','一':'88ea','つ':'82c2','だ':'82be','け':'82af','地':'926e','の':'82cc','文':'95b6','。':'8142','１':'8250','２':'8251','．':'8144','話':'9862','す':'82b7','帰':'8b41','る':'82e9','そ':'82bb','れ':'82ea','で':'82c5'};
 const out=[];for(const ch of s){if(ch.charCodeAt(0)<0x80){out.push(ch.charCodeAt(0));continue;}const h=T[ch];if(!h)throw new Error('no sjis for '+ch);out.push(parseInt(h.slice(0,2),16),parseInt(h.slice(2),16));}return Buffer.from(out);}

test('aquaplus: display tags around a speech are dropped from its text',()=>{
 assert.equal(a._internal.clean('<F16「花だけでなく…\\n><F16そしたらあたし」>'),'「花だけでなく…\nそしたらあたし」');
 assert.equal(a._internal.clean('<R上司|はまださん>が<W10>来た'),'上司が来た');});

// Runtime recording: the clip starts 0.45 s before its line appeared.
const rate=24000;
function signal(parts){const rnd=(()=>{let x=7;return()=>((x=(x*1103515245+12345)&0x7fffffff)/0x7fffffff)*2-1;})();const n=Math.round(parts.reduce((s,p)=>s+p[1],0)*rate),s=new Int16Array(n);let at=0;
 for(const [kind,len] of parts){const m=Math.round(len*rate);for(let i=0;i<m;i++){let v=1500*Math.sin((at+i)*2*Math.PI*110/rate);if(kind==='speech'){const t=i/rate;v+=Math.abs(Math.sin(t*Math.PI*5))*6000*rnd();}s[at+i]=Math.max(-32768,Math.min(32767,Math.round(v)));}at+=m;}return wav(s,rate);}
test('runtime voice: the line before still speaking at the start is not kept as this line\'s voice',()=>{
 // the previous voice runs on, a pause, then this line's own voice
 const both=signal([['speech',0.8],['quiet',0.6],['speech',1.4],['quiet',4]]),out=trimWav(both,'今日はいい天気ですね',{carry:true});
 assert.ok(out&&out.data,'own voice kept');const kept=parse(out.data);assert.ok(kept.samples.length/rate<2.2&&kept.samples.length/rate>1.2,'only the second run: '+out.seconds.toFixed(2));
 // only the previous voice: this line has none
 const carried=trimWav(signal([['speech',1.0],['quiet',4]]),'うん',{carry:true});assert.equal(carried.data,null);assert.equal(carried.carried,true);
 // the first line of a run (nothing before it) keeps a voice that starts at once
 assert.ok(trimWav(signal([['speech',1.0],['quiet',4]]),'うん').data);
 const native=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','core','gal-native.cjs'),'utf8');
 assert.match(native,/trimWav\(wav,lines\[i\]\.text,\{carry:i>0\}\);if\(t\)wav=t\.data\?t\.data\.toString\('base64'\):''/);});

// みにくいモジカの子: voice/b10/5000440a03 and voice/d30/5000440a03 are two different lines' clips.
test('a voice named with its folder finds that folder\'s clip, not the first file of the same name',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ref=require('../services/original-engines/voice-ref.cjs'),gv=require('../services/game-voice.cjs');
 assert.equal(ref.clean('voice/d30/5000440a03'),'d30/5000440a03');assert.equal(ref.clean('5000440a03.ogg'),'5000440a03');assert.equal(ref.bare('d30/5000440a03'),'5000440a03');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-vfolder-'));const ogg=t=>Buffer.concat([Buffer.from('OggS'),Buffer.from(t.padEnd(16,'.'))]);
 for(const d of ['b10','d30']){fs.mkdirSync(path.join(dir,'voice',d),{recursive:true});fs.writeFileSync(path.join(dir,'voice',d,'5000440a03.ogg'),ogg(d));}
 const cat=gv.catalog(dir);assert.match(cat.get('d30/5000440a03')().toString(),/d30/);assert.match(cat.get('b10/5000440a03')().toString(),/b10/);
 assert.ok(cat.get('5000440a03'),'a bare name still finds a clip');assert.ok(cat.get('zz9/5000440a03'),'an unknown folder falls back to the name');
 fs.rmSync(dir,{recursive:true,force:true});});

// Summer Pockets: 【しろは】@mes(id,「…」) has two arguments, and /* … */ staff notes hold 「…」 lines that are no message.
test('siglus: a two-argument @mes is a message, and a block comment never takes the voices',()=>{const s=require('../services/original-engines/siglus-source.cjs');
 assert.deepEqual(s.voiced('KOE(004500821,001)\n/*\n「私も好きいいい」と叫ぶ時の絵ですね。R\n*/\nKOE(004500845,001)【しろは】@mes(200876100,「私も！！」)@RET\n@mes(200875900,俺も。)@RET'),
  [{text:'「私も！！」',koe:4500821},{text:'「私も！！」',koe:4500845},{text:'俺も。',koe:null}]);});

// A voice index written by older readers is not trusted: its voices are not played until the game is scanned again,
// and a scan replaces that game's old entries instead of keeping the first one seen.
test('a voice from an older scan is not played, and a new scan replaces the game\'s old pairs',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),gv=require('../services/game-voice.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-vstale-')),dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-vgame-'));fs.mkdirSync(path.join(root,'data','voice-cache'),{recursive:true});
 fs.mkdirSync(path.join(dir,'voice'));fs.writeFileSync(path.join(dir,'voice','A002.ogg'),Buffer.concat([Buffer.from('OggS'),Buffer.alloc(16)]));
 const g=gv.gameKey(dir),file=path.join(root,'data','voice-cache','lines.json');
 fs.writeFileSync(file,JSON.stringify({schema:1,games:{[g]:{dir:path.join(dir,'missing-now'),engine:'x',scanned:Date.now()}},lines:{[gv.keyOf('「あいうえお」')]:[g,'A001']}}));
 gv._reset();assert.equal(gv.find(root,'「あいうえお」'),null,'old scan not played');
 gv.scan(root,dir,{engine:'kirikiri',scenes:[{lines:['「かきくけこ」'],voices:['voice/A002']}]});
 assert.equal(gv.has(root,'「あいうえお」'),false,'old pair dropped');assert.ok(gv.find(root,'「かきくけこ」'),'new pair played');
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(dir,{recursive:true,force:true});gv._reset();});
