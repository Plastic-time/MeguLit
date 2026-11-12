'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {trimWav,parse,wav,spokenLimit}=require('../core/voice-trim.cjs');
const rate=24000;
function clip({lead=0.5,speech=1.5,tail=6}={}){const rnd=(()=>{let x=7;return()=>((x=(x*1103515245+12345)&0x7fffffff)/0x7fffffff)*2-1;})();
 const n=Math.round((lead+speech+tail)*rate),s=new Int16Array(n);
 for(let i=0;i<n;i++){let v=1500*Math.sin(i*2*Math.PI*110/rate);const t=i/rate;if(t>=lead&&t<lead+speech){const env=Math.abs(Math.sin((t-lead)*Math.PI*5));v+=env*6000*rnd();}s[i]=Math.max(-32768,Math.min(32767,Math.round(v)));}
 return wav(s,rate);}
test('E454 a recorded line keeps the voice and drops the music after it',()=>{
 const input=clip(),out=trimWav(input,'今日はいい天気ですね');assert.ok(out,'speech found');
 assert.ok(out.seconds<3,'trimmed to about the spoken run, got '+out.seconds.toFixed(2)+' s');assert.ok(out.seconds>1.4,'speech kept');
 const back=parse(out.data);assert.equal(back.rate,rate);assert.equal(back.samples.length,Math.round(out.seconds*rate));});
test('E454 music alone is not speech, and odd input is left alone',()=>{
 const tone=new Int16Array(rate*3);for(let i=0;i<tone.length;i++)tone[i]=Math.round(1500*Math.sin(i*2*Math.PI*110/rate));
 assert.equal(trimWav(wav(tone,rate),'あ'),null);assert.equal(trimWav(Buffer.from('not a wav'),'あ'),null);});
test('E454 the cut never runs past what the line could take to say',()=>{
 assert.ok(spokenLimit('あ')>=2);assert.ok(spokenLimit('あ'.repeat(500))<=20);
 const long=clip({speech:12,tail:2}),out=trimWav(long,'短い');assert.ok(out.seconds<=spokenLimit('短い')+0.6,'capped by the text, got '+out.seconds.toFixed(2));});
test('E454 the reader prefers the scanned voice file over the game recording, and a card carries the AI note',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
 assert.match(reader,/if\(voice\?\.source==='scan'\)\{extra\.sentenceAudio=asAudio\(voice\);extra\.gameAudio=true;\}\s*else if\(media\?\.audio\)/);
 assert.match(reader,/aiNote:args\.aiNote/);
 const anki=fs.readFileSync(path.join(__dirname,'..','core','anki.cjs'),'utf8');assert.match(anki,/AI 归纳义项/);
 const native=fs.readFileSync(path.join(__dirname,'..','core','gal-native.cjs'),'utf8');assert.match(native,/voice-trim\.cjs'\)\.trimWav/);});
