'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'../native/unitytext/MeguLitUnityText.cs'),'utf8');
const compiler=process.env.MEGULIT_ROSLYN_CSC||'E:/Apps/build-tools/vs2022/MSBuild/Current/Bin/Roslyn/csc.exe';
test('production clear retires a published page once, preserves the old id and allows identical text on the next page',()=>{
 const start=source.indexOf('void ClearPublished()');assert.ok(start>=0);
 let at=source.indexOf('{',start),depth=0,end=at;for(;end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}'&&--depth===0)break;}
 const method=source.slice(start,end+1),dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-unity-clear-'));
 try{
  const harness=`using System;using System.Collections.Generic;static class Screen{public static int width=1280,height=720;}
class H{bool published;string lastKey="",lastText="";int line;List<string> output=new List<string>();void Send(string text){output.Add(text);}
${method}
void Run(){ClearPublished();if(output.Count!=0)throw new Exception("unpublished");
 line=41;published=true;lastKey="old";lastText="同じ文";ClearPublished();ClearPublished();
 if(output.Count!=1||published||lastKey!=""||lastText!=""||line!=41)throw new Exception("clear identity");Console.WriteLine(output[0]);
 /* EmbedTick can clear the geometry dedup key before the previously published line is retired */
 line=42;published=true;lastKey="";lastText="同じ文";ClearPublished();if(output.Count!=2)throw new Exception("empty key");Console.WriteLine(output[1]);
 /* A never-published candidate must not manufacture a clear for someone else's line */
 line=43;ClearPublished();if(output.Count!=2)throw new Exception("candidate");Console.WriteLine("PASS");}
static void Main(){new H().Run();}}`;
  fs.writeFileSync(path.join(dir,'clear.cs'),harness);
  let r=spawnSync(compiler,['/nologo','/out:'+path.join(dir,'clear.exe'),path.join(dir,'clear.cs')],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stdout+r.stderr);
  r=spawnSync(path.join(dir,'clear.exe'),[],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(r.status,0,r.stdout+r.stderr);
  const lines=r.stdout.trim().split(/\r?\n/);assert.equal(lines.pop(),'PASS');
  const {parseChars}=require('../core/text-paths.cjs'),{OverlayPlacement}=require('../core/overlay-placement.cjs');
  const sent=[],place=new OverlayPlacement({send:m=>sent.push(m)});place.wanted=()=>true;place.configure({},{bound:true,clientWidth:1280,clientHeight:720});sent.length=0;
  const frame=id=>({type:'hookCharRects',engine:'unity',line:id,hidden:true,sw:1280,sh:720,viewport:[0,0,1280,720],rects:[[20,500,24,24],[44,500,24,24],[68,500,24,24]],text:'同じ文'});
  place.hook(frame(41));assert.equal(sent.pop().text,'同じ文');
  place.hook(parseChars(lines[0]));assert.deepEqual(sent.pop(),{type:'textPlace',gone:true,text:'同じ文'});
  place.hook(parseChars(lines[0]));assert.equal(sent.length,0,'duplicate clear is silent');
  place.hook(frame(42));assert.equal(sent.pop().text,'同じ文','same sentence with a new page id is drawn again');
  place.hook(parseChars(lines[1]));assert.deepEqual(sent.pop(),{type:'textPlace',gone:true,text:'同じ文'});
  place.stop();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('all actual retirement paths use the publication lifecycle',()=>{
 assert.match(source,/if \(best != current\) \{ ClearPublished\(\); Restore\(\);/);
 assert.match(source,/if \(current == null \|\| !Shown\(current\)\) \{ ClearPublished\(\);/);
 assert.match(source,/if \(all.Count == 0\) \{ ClearPublished\(\); return; \}/);
 assert.match(source,/if \(rects.Count == 0\) \{ ClearPublished\(\); return; \}/);
 assert.match(source,/lastKey = key; lastText = flat; published = true;/);
 assert.match(source,/void OnDestroy\(\) \{ (?:kemcoPages.Reset\(Screen.width,Screen.height,Send\); )?ClearPublished\(\); Restore\(\); \}/);
});
