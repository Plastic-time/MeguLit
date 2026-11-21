// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const A=require('../core/artemis-observer.cjs'),draw=require('../core/artemis-language.cjs'),sc=require('../services/original-engines/scenes.cjs');
const LUA=[process.env.MEGULIT_LUA51,'H:/MeguLit-Work/deps/lua/bin/lua51.exe'].find(p=>p&&fs.existsSync(p));
const run=src=>{const r=spawnSync(LUA,['-'],{input:src,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:32768});assert.equal(r.status,0,r.stderr||r.error?.message);assert.match(r.stdout,/PASS/);};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const extract=(text,name)=>{const m=new RegExp('^function '+name+'\\([^\\n]*\\n[\\s\\S]*?^end\\r?$','m').exec(text);assert.ok(m,name+' actual function');return m[0];};
const HOST=String.raw`
init={};game={mwid='1.80'};conf={mw_aread=0};flg={};scr={ip={block='b'},select={name='s',{},{}}};csv={mw={}};gscr={select={}};lang={font={select_active={}}};tags={};e={};local layer='none';local printed={};local events={}
function e:tag(t) if t[1]=='chgmsg' then layer=t.id elseif t[1]=='/chgmsg' then layer='none' elseif t[1]=='print' then printed[#printed+1]={layer,tostring(t.data)} end end
function tag(t) e:tag(t) end
function estag(t) if type(t)=='table' then if type(_G[t[1]])=='function' then _G[t[1]](t[2]) else e:tag(t) end end end
function getNovelData() return nil end
function getMWID(n) return n=='select' and '1.80.120' or nil end
function getGameMode() return 'adv' end
function getAread() return false end
function get_language() return 'ja' end
function get_sub_lang() return nil end
function mw_areadfastcheck() end
function get_artemis() return 70 end
function set_textfont() end
function exfont() end
function explode(delim,s) local out={} assert(delim=='|') for part in (s..'|'):gmatch('(.-)|') do out[#out+1]=part end return out end
function chgmsg_adv(flag) if flag=='close' then e:tag{'/chgmsg'} else e:tag{'chgmsg',id=mw_getmsgid('adv')} end end
tags.ruby=function(e,p) e:tag(p) end;tags['/ruby']=tags.ruby
function disable_check(i) return ast.b.select.ja[i] end
ast={b={select={ja={'はい','いいえ'}}}}
__FUNCTIONS__
local function perform()
 message_name('花子')
 message_control({ja={{'読み分ける',{'ruby',text='よみ'},'漢字',{'/ruby'}}}},false)
 select_message()
end
perform();local before=printed;printed={}
local loader=(function() __PREPARED__ end)()
local policy={enabled=true,generation=1}
local h=assert(loader(_G,function()return policy end,function(event)events[#events+1]=event end))
perform()
assert(#before==7 and #printed==#before)
for i,x in ipairs(before) do assert(x[1]==printed[i][1] and x[2]==printed[i][2]) end
assert(#events==6)
assert(events[1].role=='name' and events[1].text=='花子')
assert(events[2].role=='line' and events[2].text=='読み分ける漢字')
assert(events[2].ruby[1][1]==5 and events[2].ruby[1][2]==2 and events[2].ruby[1][3]=='よみ')
assert(events[3].role=='choice' and events[3].variant=='normal' and events[4].variant=='hover')
assert(events[5].role=='choice' and events[5].variant=='normal' and events[6].variant=='hover')
assert(events[3].id=='1.80.120.1.0.0.2' and events[5].id=='1.80.120.2.0.0.2')
for _,event in ipairs(events) do assert(event.stage=='input' and event.kind=='artemis-input-v1' and event.rects==nil and event.hidden==nil and event.emb==nil) end
local seen=#events;policy.enabled=false;perform();assert(#events==seen)
policy={enabled=true,generation=2};perform();assert(#events==seen+6)
h.dispose();perform();assert(#events==seen+6)
io.write('PASS actual Lua functions, unchanged 7 print calls, 6 semantic inputs, off/on/dispose\n')
`;
const games=[
 {dir:'H:/MeguLit-Work/samples/amakano3-trial',exe:'Amakano3_tr.exe',pfs:'Amakano3_tr.pfs',id:'amakano3-trial-lua-input-v1'},
 {dir:'E:/Steam/steamapps/common/The Shell Part I',exe:'TheShell.exe',pfs:'TheShell.pfs',id:'the-shell1-lua-input-v1'}
];
for(const g of games)test(g.id+': exact source constructor and actual Lua methods preserve rendering-command inputs',{skip:(!LUA&&'Lua 5.1 interpreter unavailable')||(!fs.existsSync(path.join(g.dir,g.pfs))&&'known local PFS unavailable')},()=>{
 const file=path.join(g.dir,g.pfs),fd=fs.openSync(file,'r'),h=Buffer.alloc(7);try{assert.equal(fs.readSync(fd,h,0,7,0),7);}finally{fs.closeSync(fd);}
 assert.ok(h.readUInt32LE(3)<=1024*1024);
 assert.ok(fs.statSync(path.join(g.dir,g.exe)).size<=16*1024*1024);
 const exe=fs.readFileSync(path.join(g.dir,g.exe)),list=sc.pfsList(file),modules={};let bytes=0;
 for(const name of Object.keys(A.variants.find(v=>v.id===g.id).modules)){
  const e=list.files.find(e=>e.name.replace(/\\/g,'/')===name);assert.ok(e&&e.size<=65536);bytes+=e.size;assert.ok(bytes<=192*1024);
  modules[name]=sc.pfsRead(file,e,list.key);
 }
 const prepared=A.prepare({enabled:true,exe,modules});assert.equal(prepared.state,'prepared');assert.equal(prepared.identity,g.id);assert.equal(prepared.provenance.exe,sha(exe));
 const text=Object.fromEntries(Object.entries(modules).map(([n,b])=>[n,b.toString('utf8')]));
 const names=['mw_getmsgid','message_name','message_control','mw_textloop','mw_textview','getTextBlockFloat'];
 if(/^function tag_print\(/m.test(text['system/msg/message.lua']))names.push('tag_print');
 const functions=[...names.map(n=>extract(text['system/msg/message.lua'],n)),extract(text['system/msg/ui.lua'],'ui_message'),extract(text['system/adv/select.lua'],'select_message')].join('\n');
 run(HOST.replace('__FUNCTIONS__',()=>functions).replace('__PREPARED__',()=>prepared.script));
 const altered={...modules,'system/msg/ui.lua':Buffer.concat([modules['system/msg/ui.lua'],Buffer.from('\n-- modified')])};
 assert.equal(A.prepare({enabled:true,exe,modules:altered}).reason,'ARTEMIS_MODULES');
 const getter={...modules};Object.defineProperty(getter,'system/msg/ui.lua',{get(){throw Error('must not invoke module getter');}});
 assert.equal(A.prepare({enabled:true,exe,modules:getter}).reason,'ARTEMIS_MODULES');
});

test('bilingual wrapper restores nested context, original error objects and exact nil-containing return values',{skip:!LUA&&'Lua 5.1 interpreter unavailable'},()=>{
 run(String.raw`
init={};lang={font={}};function get_fontdata() end
function getTextBlockFloat(p) return p.ja[1] end
local seen={};local failure={kind='original'}
function mw_textloop(p,...)
 if p.nested then if p.fail then error(p.fail,0)end return nil,'inner',nil end
 seen[#seen+1]=getTextBlockFloat(p.text)[1]
 local ok,err=pcall(mw_textloop,{lang='ja',text=p.text,nested=true,fail=failure}) assert(not ok and err==failure)
 seen[#seen+1]=getTextBlockFloat(p.text)[1]
 return nil,'outer',nil,...
end
__BLOCK__
local function pack(...)return {n=select('#',...),...}end
local r=pack(mw_textloop({lang='cn',text={ja={{'J'}},cn={{'C'}}}},'tail',nil))
assert(seen[1]=='C' and seen[2]=='C' and r.n==5 and r[2]=='outer' and r[4]=='tail' and r[5]==nil)
assert(getTextBlockFloat({ja={{'J'}},cn={{'C'}}})[1]=='J')
io.write('PASS nested bilingual context and original result tuple\n')
`.replace('__BLOCK__',()=>draw._internal.drawBlock('cn',0.8)));
});
