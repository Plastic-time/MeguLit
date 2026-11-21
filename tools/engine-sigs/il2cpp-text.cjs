// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, Unity IL2CPP (docs/engine-draw-native.md). The reference for native/megulithook/Il2cppDrawRoles.h: both must
   build the same method ranges and give the same role for the same stack frames
   (validation/engine-draw-sig-il2cpp.test.cjs runs this one on the owner's GameAssembly.dll and on the fixture).

   What reads the text: LunaHook's Unity engine already hooks the text setters by name through the il2cpp API
   (TMPro.TMP_Text.set_text, TextMeshPro.set_text, TextMeshProUGUI.SetText, UnityEngine.UI.Text.set_text), so the string is
   read from inside the engine in every IL2CPP build without addresses. What it cannot tell is what the text IS. The role comes
   from who set it: at the setter, walk the caller frames (x64 unwind data, .pdata of GameAssembly.dll) and the first frame
   that lies in a known framework method decides. Method ranges = each method's start up to the next method start of the image
   (the runtime enumerates every method pointer through il2cpp_image_get_class / il2cpp_class_get_methods; offline the same
   list is Il2CppDumper's script.json). The rules are by name, so they hold across versions and games of a framework:
     Naninovel (魔法少女ノ魔女裁判): RevealableText.SetTextValue / set_Text, the printer panels' SetMessages / AddMessage /
       AppendText / RevealMessages -> line; AuthorName*Panel.set_Text,
       RevealableTextPrinterPanel.SetAuthorNameText -> name; ChoiceHandlerButton.* -> choice
     Fungus (海沙风云): Writer.Write and its coroutine -> line; SayDialog.SetCharacterName -> name; MenuDialog.AddOption -> choice
   Any other caller: role system (menus, backlog, UI). Boxes are not read here (TMP geometry needs the canvas and camera; the
   BepInEx IL2CPP plugin is the path for those). */

/* framework rules: [regex on "Namespace.Class$$Method" (nested / compiler-generated types keep their outer name), role] */
const RULES=[
 [/^Naninovel\.UI\.RevealableText\$\$(SetTextValue|set_Text)$/,'line'],
 [/^Naninovel\.UI\.AuthorName\w*Panel\$\$set_Text$/,'name'],
 [/^Naninovel\.UI\.RevealableTextPrinterPanel\$\$SetAuthorNameText$/,'name'],
 [/^Naninovel\.UI\.ChoiceHandlerButton\$\$/,'choice'],
 /* RevealableText.set_Text and SetTextValue end in tail jumps (static: jmp rax), so at the TMP setter the return address is
    already in the printer panel that set the message */
 [/^Naninovel\.UI\.(RevealableTextPrinterPanel|UITextPrinterPanel)\$\$(SetMessages|AddMessage|AppendText|RevealMessages)$/,'line'],
 [/^Fungus\.Writer(\$\$Write$|\.<Write>d__\d+\$\$MoveNext$)/,'line'],
 [/^Fungus\.SayDialog\$\$SetCharacterName$/,'name'],
 [/^Fungus\.MenuDialog\$\$AddOption$/,'choice'],
];
/* the il2cpp API the runtime needs (all exported by GameAssembly.dll of every Unity IL2CPP build) */
const API=['il2cpp_domain_get','il2cpp_domain_get_assemblies','il2cpp_assembly_get_image','il2cpp_image_get_class_count','il2cpp_image_get_class','il2cpp_class_get_methods','il2cpp_class_get_name','il2cpp_class_get_namespace','il2cpp_class_get_declaring_type','il2cpp_method_get_name','il2cpp_thread_attach'];

function roleOf(name){for(const [re,role] of RULES)if(re.test(name))return role;return null;}

/* PE export names (x86 / x64) */
function exportsOf(buf){
 const pe=buf.readUInt32LE(0x3c),magic=buf.readUInt16LE(pe+24),dd=pe+24+(magic===0x20b?112:96),rva=buf.readUInt32LE(dd),n=buf.readUInt16LE(pe+6),opt=buf.readUInt16LE(pe+20),sec=pe+24+opt;
 const off=r=>{for(let i=0;i<n;i++){const o=sec+i*40,va=buf.readUInt32LE(o+12),sz=Math.max(buf.readUInt32LE(o+8),buf.readUInt32LE(o+16));if(r>=va&&r<va+sz)return buf.readUInt32LE(o+20)+r-va;}return -1;};
 if(!rva)return [];const e=off(rva);if(e<0)return [];
 const count=buf.readUInt32LE(e+24),names=off(buf.readUInt32LE(e+32)),out=[];
 for(let i=0;i<count;i++){const p=off(buf.readUInt32LE(names+4*i));let q=p;while(buf[q])q++;out.push(buf.toString('latin1',p,q));}
 return out;
}
function machineOf(buf){const pe=buf.readUInt32LE(0x3c);return buf.readUInt16LE(pe+4);}

/* methods [{start, name}] (any order, duplicates allowed) -> role ranges [{from, to, role, name}] sorted by from: each rule
   method from its start to the next distinct method start */
function ranges(methods){
 const starts=[...new Set(methods.map(m=>m.start))].sort((a,b)=>a-b),out=[],seen=new Set();
 const next=s=>{let lo=0,hi=starts.length;while(lo<hi){const mid=(lo+hi)>>1;if(starts[mid]<=s)lo=mid+1;else hi=mid;}return lo<starts.length?starts[lo]:s+1;};
 for(const m of methods){const role=roleOf(m.name);if(!role||seen.has(m.start))continue;seen.add(m.start);out.push({from:m.start,to:next(m.start),role,name:m.name});}
 return out.sort((a,b)=>a.from-b.from);
}
/* the role of a setter call: frames = return addresses, innermost first; the first inside a range decides; else system */
function classify(rs,frames){
 for(const f of frames){let lo=0,hi=rs.length;while(lo<hi){const mid=(lo+hi)>>1;if(rs[mid].from<=f)lo=mid+1;else hi=mid;}const r=rs[lo-1];if(r&&f>r.from&&f<r.to)return {role:r.role,site:r.from};}
 return {role:'system',site:0};
}
/* Il2CppDumper's script.json -> methods (module offsets) */
function methodsOfScript(json){return (json.ScriptMethod||[]).map(m=>({start:m.Address,name:m.Name}));}

/* one record of native/megulithook/Il2cppDraw.h (hook-diagnostics.log), or null */
const RUN=/^ToMe_DRAWRUN engine=unity (?:ev=(text|clear) role=(\w+) kind=(tmp|ugui) obj=([0-9A-Fa-f]+)(?: site=([0-9a-f]+) n=(\d+) text=(.*))?|(on|off): ?(.*))$/;
function parseRun(line){const m=RUN.exec(String(line||'').trim());if(!m)return null;if(m[8])return {kind:m[8],detail:m[9]};
 if(m[1]==='text'&&m[7]===undefined)return null;
 return {kind:m[1],role:m[2],type:m[3],obj:m[4].toLowerCase(),...(m[1]==='text'?{site:parseInt(m[5],16),n:Number(m[6]),text:m[7]}:{})};}

module.exports={RULES,API,roleOf,exportsOf,machineOf,ranges,classify,methodsOfScript,parseRun};
if(require.main===module){const fs=require('node:fs');const [dll,script]=process.argv.slice(2);
 const buf=fs.readFileSync(dll),ex=new Set(exportsOf(buf));console.log(JSON.stringify({machine:'0x'+machineOf(buf).toString(16),missing:API.filter(a=>!ex.has(a))}));
 if(script)for(const r of ranges(methodsOfScript(JSON.parse(fs.readFileSync(script,'utf8')))))console.log(r.role,'0x'+r.from.toString(16),'0x'+r.to.toString(16),r.name);}
