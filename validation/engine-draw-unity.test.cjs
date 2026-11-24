// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, Unity (native/unitytext/MeguLitUnityText.cs): the replacement text the plugin gives the dialogue component
   (static Build, pure string work) is compiled out of the plugin source into a tiny .NET harness and run here; the node
   side of the control socket (DRAW / EMB out, ask in) is checked directly. Skipped without Roslyn csc. No Unity, no game. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'native/unitytext/MeguLitUnityText.cs'),'utf8');
const {findRoslynCompiler}=require('./helpers/roslyn-compile.cjs');
const CSC=findRoslynCompiler();
function slice(start){const a=src.indexOf(start);assert.ok(a>=0,start);let i=src.indexOf('{',a),d=0;for(;i<src.length;i++){if(src[i]==='{')d++;else if(src[i]==='}'&&--d===0)break;}return src.slice(a,i+1);}

test('Build: ruby over its base (TMP), the game\'s tags and breaks kept, Chinese as a smaller paragraph; uGUI gets the Chinese only',{skip:!CSC&&'no Roslyn csc'},()=>{
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-unity-build-'));
 const harness=`using System;using System.Text;using System.Collections.Generic;
static class H{ ${slice('static string Build(')}
 ${slice('static string F(float v)')}
 static void Main(){Console.OutputEncoding=Encoding.UTF8;
  Console.WriteLine(Build("<color=#fff>今日は</color>\\n晴れ","0:2:きょう","今天晴朗",true,0.8f,0));
  Console.WriteLine("---");
  Console.WriteLine(Build("今日は晴れ","0:2:きょう","今天<b>",false,0.8f,22));
  Console.WriteLine("---");
  Console.WriteLine(Build("今日は晴れ","bad|3:1:","",true,0.8f,0));}}`;
 fs.writeFileSync(path.join(dir,'h.cs'),harness);
 const c=spawnSync(CSC,['/nologo','/out:'+path.join(dir,'h.exe'),path.join(dir,'h.cs')],{encoding:'utf8',windowsHide:true});assert.equal(c.status,0,c.stdout+c.stderr);
 const r=spawnSync(path.join(dir,'h.exe'),[],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);
 const [tmp,ugui,none]=r.stdout.replace(/\r/g,'').split('---\n').map(s=>s.replace(/\n$/,''));
 assert.equal(tmp,'<color=#fff>今日<space=-1.8em><voffset=1em><size=50%>きょう</size></voffset><space=0.2em>は</color>\n晴れ\n<size=80%><noparse>今天晴朗</noparse></size>','ruby centred over 今日 (2em base, 1.5em reading), tags and the break kept');
 assert.equal(ugui,'今日は晴れ\n<size=22>今天<b></size>','uGUI: no ruby, the Chinese in its size tag');
 assert.equal(none,'今日は晴れ','malformed / empty ruby and no Chinese: the game\'s text unchanged');
});

test('plugin wiring: never hidden while embedding, record cut to the Japanese with emb, roles by component and framework',()=>{
 assert.ok(src.includes('bool want = hideAsked && connected && !drawEmbed;'));
 assert.ok(src.includes('if (embedded && all.Count > embJp) all.RemoveRange(embJp, all.Count - embJp);'));
 assert.ok(src.includes('(embedded ? " emb=" + embLevel : "")'));
 for(const k of ['"AdvUguiSelection"','"ChoiceHandlerButton"','"AuthorNamePanel"','"MessageWindow"','n == "Button" || n == "Toggle"'])assert.ok(src.includes(k),k);
 assert.ok(src.includes('if (asked.Add(key)) Send("ToMe_UNITY ask " + key);'),'one ask per sentence');
});

test('node side: DRAW / EMB lines out (kept for a reconnect), asks in',()=>{
 const U=require('../core/text-paths-unity.cjs'),out=[],asks=[];const u=new U.UnityTextPath({onAsk:a=>asks.push(a)});u.sock={write:s=>out.push(s)};
 u.drawConfig({roles:true,embed:true});u.drawConfig({roles:true,embed:true});u.drawEmbed('今日は晴れ',{ruby:[[0,2,'きょう']],zh:'今天\n晴朗'});u.line('ToMe_UNITY ask 今日は晴れ');
 assert.deepEqual(out,['DRAW roles=1 embed=1 zh=1\n','EMB 今日は晴れ\t0:2:きょう\t今天\u001f晴朗\n']);assert.deepEqual(asks,[{key:'今日は晴れ',text:'今日は晴れ',engine:'unity'}]);
 out.length=0;u.push();assert.ok(out[0].includes('DRAW roles=1')&&out[0].includes('EMB 今日は晴れ'),'a reconnect gets the switches and the table again');
});
