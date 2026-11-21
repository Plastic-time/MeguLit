// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const base=path.join(__dirname,'../native/unitytext'),source=fs.readFileSync(path.join(base,'MeguLitUnityText.cs'),'utf8');
function method(name){const start=source.indexOf(name);assert.ok(start>=0);let at=source.indexOf('{',start),n=0,end=at;for(;end<source.length;end++){if(source[end]==='{')n++;else if(source[end]==='}'&&--n===0)break;}return source.slice(start,end+1);}
test('actual Mono source proof and encoder distinguish complete content from prefixes, mismatch and revoked captures',()=>{
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-kemco-source-'));
 try{
  fs.writeFileSync(path.join(dir,'check.cs'),`using System;using System.Reflection;using System.Text;using System.Collections.Generic;
class Component { public string LastMes; }
class Check {
 readonly object gate=new object();bool connected=true,kemcoAsked,kemcoRoles;int kemcoEpoch,kemcoObservedEpoch=-1;string kemcoScope="";long kemcoSequence;int kemcoPid=42;long kemcoStarted=638000000000000000L;FieldInfo kemcoLastMes=typeof(Component).GetField("LastMes");List<string> sent=new List<string>();void Send(string s){sent.Add(s);}
 ${method('void KemcoOwner(')}
 ${method('void KemcoControl(')}
 ${method('void KemcoScope(')}
 ${method('void KemcoSendSource(')}
 ${method('void KemcoSource(')}
 static KemcoSpriteSnapshot.Page Page(bool complete){var rows=new List<IList<KemcoSpriteSnapshot.Glyph>>{new List<KemcoSpriteSnapshot.Glyph>{new KemcoSpriteSnapshot.Glyph{id=1,text="日",shown=true,box=new float[]{1,2,10,20}},new KemcoSpriteSnapshot.Glyph{id=2,text="本",shown=complete,box=new float[]{11,2,10,20}}}};return KemcoSpriteSnapshot.Read(rows,1280,720);}
 void Run(){
  var m=new Component{LastMes="日本\\n"};KemcoControl(true);KemcoScope(new string('a',32));kemcoObservedEpoch=kemcoEpoch;
  var all=Page(true);if(!all.complete)throw new Exception("complete");KemcoSource(m,7,all);
  var partial=Page(false);if(partial.complete)throw new Exception("partial");KemcoSource(m,7,partial);
  m.LastMes="日文違い\\n";KemcoSource(m,7,all);m.LastMes=null;KemcoSource(m,7,all);KemcoSource(null,0,null);
  if(sent.Count!=5)throw new Exception("proof cases");
  KemcoScope("bad");kemcoObservedEpoch=kemcoEpoch;KemcoSource(m,7,all);if(sent.Count!=5)throw new Exception("invalid scope");
  KemcoControl(false);KemcoControl(true);KemcoScope(new string('b',32));m.LastMes="日本\\n";KemcoSource(m,7,all);if(sent.Count!=5)throw new Exception("old capture epoch");
  kemcoObservedEpoch=kemcoEpoch;KemcoSource(m,8,all);if(sent.Count!=6)throw new Exception("fresh scope");
  var large=new KemcoSpriteSnapshot.Page{text=new string('日',5000),complete=true};m.LastMes=large.text;KemcoSource(m,9,large);if(sent.Count!=7)throw new Exception("bound");
  kemcoSequence=9007199254740991L;KemcoSource(null,0,null);if(sent.Count!=7)throw new Exception("counter bound");
  KemcoOwner();using(var self=System.Diagnostics.Process.GetCurrentProcess())if(kemcoPid!=self.Id||kemcoStarted!=self.StartTime.ToUniversalTime().Ticks)throw new Exception("actual self owner capture");
  foreach(var line in sent)Console.WriteLine(line);Console.WriteLine("PASS");
 }
 static void Main(){new Check().Run();}
}`);
  const compiler=process.env.MEGULIT_ROSLYN_CSC||'E:/Apps/build-tools/vs2022/MSBuild/Current/Bin/Roslyn/csc.exe';
  let r=spawnSync(compiler,['/nologo','/codepage:65001','/out:'+path.join(dir,'check.exe'),path.join(base,'KemcoSpriteSnapshot.cs'),path.join(dir,'check.cs')],{windowsHide:true,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stdout+r.stderr);
  r=spawnSync(path.join(dir,'check.exe'),[],{windowsHide:true,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stdout+r.stderr);
  const lines=r.stdout.trim().split(/\r?\n/);assert.equal(lines.pop(),'PASS');assert.equal(lines.length,7);
  const parts=lines.map(l=>l.slice('ToMe_UNITY kemco2 '.length).split('\t'));assert.deepEqual(parts.map(p=>p[3]),['full','pending','pending','pending','gone','full','pending']);
  assert.equal(Buffer.from(parts[0][7],'base64').toString(),'日本');assert.equal(parts[0][5],'42');assert.equal(parts[0][6],'638000000000000000');assert.equal(parts[4][2],'0');assert.equal(parts[5][0],'b'.repeat(32));
  const {UnityKemcoSource}=require('../core/unity-kemco-source.cjs'),events=[],h=new UnityKemcoSource({scope:()=> 'a'.repeat(32),onSource:m=>{events.push(m);return true;}});h.configure(true);
  for(const line of lines.slice(0,5))h.accept(line);assert.equal(events.length,1);assert.equal(events[0].text,'日本');assert.equal(h.block({},{pid:42,started:'638000000000000000'}),false,'actual gone packet releases the source gate');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
