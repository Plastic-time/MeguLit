// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const A=require('../core/artemis-observer.cjs');
const LUA=[process.env.MEGULIT_LUA51,'H:/MeguLit-Work/deps/lua/bin/lua51.exe'].find(p=>p&&fs.existsSync(p));
const observer=fs.readFileSync(path.join(__dirname,'../core/artemis-observer.lua'),'utf8');
const BASE=String.raw`
local install=(function() __OBSERVER__ end)()
local events, calls, policy = {}, {}, {enabled=true,generation=1}
local control=function() return policy end
local sink=function(e) events[#events+1]=e end
local function pack(...) return {n=select('#',...),...} end
local originals={}
function getMWID(name) calls.id=(calls.id or 0)+1 return name=='select' and '1.80.120' or '1.80.130',nil,'id-tail' end
function getTextBlockFloat(p) return p.ja[1],nil,'row-tail' end
function mw_textloop(p,...)
 calls.loop=(calls.loop or 0)+1
 local row=getTextBlockFloat(p.text)
 if p.change then p.change() end
 if p.fail then error(p.fail,0) end
 return nil,p.marker,nil,...
end
function message_name(text,...) calls.name=(calls.name or 0)+1 return nil,text,nil,... end
function ui_message(id,p,...) calls.ui=(calls.ui or 0)+1 if p.fail then error(p.fail,0) end return nil,id,nil,... end
function select_message()
 local id=getMWID('select')
 ui_message(id..'.1.0.0.2',{'select',text='選ぶ'})
 ui_message(id..'.1.0.0.3',{'select_active',text='選ぶ'})
 ui_message(id..'.3.0.0.2',{'dialog',text='汎用UI'})
 ui_message('elsewhere.2',{'select',text='別の場所'})
 return nil,'selection',nil
end
for _,n in ipairs({'getMWID','getTextBlockFloat','mw_textloop','message_name','ui_message','select_message'}) do originals[n]=_G[n] end
local function body(row,extra) local p=extra or {} p.text={ja={row}} p.lang=p.lang or 'ja' return p end
__CASE__
io.write('PASS\n')
`;
function lua(code){const r=spawnSync(LUA,['-'],{input:BASE.replace('__OBSERVER__',()=>observer).replace('__CASE__',()=>code),encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536});assert.equal(r.status,0,r.stderr||r.error?.message);assert.match(r.stdout,/PASS/);}
const opt={skip:!LUA&&'Lua 5.1 interpreter unavailable'};

test('Artemis observer preparation is strictly opt-in and rejects unpinned executable bytes',()=>{
 for(const enabled of [undefined,false,0,1,'true'])assert.deepEqual(A.prepare({enabled,get exe(){throw Error('must not read');}}),{state:'disabled'});
 assert.deepEqual(A.prepare(null),{state:'disabled'});
 assert.deepEqual(A.prepare({get enabled(){throw Error('must not read');}}),{state:'disabled'});
 assert.deepEqual(A.prepare({enabled:true,get exe(){throw Error('must not read');}}),{state:'unsupported',reason:'ARTEMIS_EXE'});
 assert.deepEqual(A.prepare({enabled:true,exe:Buffer.from('foreign')}),{state:'unsupported',reason:'ARTEMIS_EXE'});
 assert.equal(A.prepare({enabled:true,exe:Buffer.alloc(16*1024*1024+1)}).reason,'ARTEMIS_EXE');
 assert.equal(A.variants.length,2);assert.ok(A.variants.every(v=>Object.isFrozen(v)&&Object.isFrozen(v.modules)));
});

test('default false/invalid policy leaves the actual method identities unchanged',opt,()=>lua(String.raw`
for _,p in ipairs({{enabled=false,generation=1},{enabled='true',generation=1},{enabled=true,generation=0/0},{enabled=true,generation=-1}}) do
 local x,why=install(_G,function()return p end,sink,'synthetic') assert(x==nil and why=='DISABLED')
 for n,f in pairs(originals) do assert(_G[n]==f,n) end
end
local x,why=install({},control,sink,'synthetic') assert(x==nil and why=='API')
local incomplete={} for n,f in pairs(originals) do if n~='select_message' then incomplete[n]=f end end
local x,why=install(incomplete,control,sink,'synthetic') assert(x==nil and why=='API')
for n,f in pairs(incomplete) do assert(f==originals[n]) end
`));

test('actual wrappers preserve nil slots, varargs, chosen row and multi-piece codepoint ruby',opt,()=>lua(String.raw`
local h=assert(install(_G,control,sink,'synthetic'))
local row={'前',{'ruby',text='よしの'},'𠮷',{'font',color='red'},'野',{'/font'},{'/ruby'},'後'}
local r=pack(mw_textloop(body(row,{marker='m'}),'arg',nil))
assert(r.n==5 and r[1]==nil and r[2]=='m' and r[3]==nil and r[4]=='arg' and r[5]==nil)
assert(calls.loop==1 and #events==1 and events[1].text=='前𠮷野後')
assert(events[1].ruby[1][1]==1 and events[1].ruby[1][2]==2 and events[1].ruby[1][3]=='よしの')
assert(events[1].stage=='input' and events[1].kind=='artemis-input-v1' and events[1].role=='line')
assert(row[2].text=='よしの' and row[3]=='𠮷' and row[5]=='野')
message_name('花子');message_name(nil)
assert(events[2].role=='name' and events[3].clear==true)
h.dispose();h.dispose();for n,f in pairs(originals) do assert(_G[n]==f,n) end
`));

test('choice scope records distinct normal/hover inputs without treating generic UI or late callbacks as choices',opt,()=>lua(String.raw`
local h=assert(install(_G,control,sink,'synthetic'))
local r=pack(select_message()) assert(r.n==3 and r[2]=='selection' and calls.id==1)
assert(#events==2 and events[1].variant=='normal' and events[2].variant=='hover')
assert(events[1].id=='1.80.120.1.0.0.2' and events[2].id=='1.80.120.1.0.0.3')
ui_message('1.80.120.1.0.0.2',{'select',text='遅い'}) assert(#events==2)
h.dispose()
`));

test('held disposed wrappers remain inert across a new installation',opt,()=>lua(String.raw`
local first=assert(install(_G,control,sink,'synthetic'))
local held=mw_textloop;first.dispose()
policy={enabled=true,generation=2}
local second=assert(install(_G,control,sink,'synthetic'))
held(body({'古い呼び出し'}));assert(#events==0)
mw_textloop(body({'現在'}));assert(#events==1 and events[1].text=='現在')
second.dispose()
`));

test('off, invalid policy, new generation and disposal retire in-flight snapshots',opt,()=>lua(String.raw`
local h=assert(install(_G,control,sink,'synthetic'))
mw_textloop(body({'旧'},{change=function() policy={enabled=true,generation=2} end})) assert(#events==0)
mw_textloop(body({'新'})) assert(#events==1 and events[1].generation==2)
policy={enabled=false,generation=2};message_name('無効')
policy={enabled=true,generation=2};mw_textloop(body({'同じ世代'})) assert(#events==1)
policy={enabled=true,generation=3};mw_textloop(body({'復帰'})) assert(#events==2)
control=function()error('not used by captured closure')end
policy={enabled='true',generation=3};message_name('不明')
policy={enabled=true,generation=3};mw_textloop(body({'不明の後'})) assert(#events==2)
policy={enabled=true,generation=4};mw_textloop(body({'終了'},{change=h.dispose})) assert(#events==2)
`));

test('unknown commands, malformed UTF8/ruby, sparse rows and budgets decline observation while original calls still complete',opt,()=>lua(String.raw`
local h=assert(install(_G,control,sink,'synthetic'))
local rows={{'a',{'gaiji',text='x'}},{'a',{'ruby',text='よみ'},'b'},{'a',{'/ruby'}},{string.char(0xc0,0x80)},{string.rep('a',2049)},{[1]='a',[3]='b'},{string.char(0)},{{'ruby',text=string.rep('あ',161)},'字',{'/ruby'}}}
for _,row in ipairs(rows)do local r=pack(mw_textloop(body(row,{marker='kept'}))) assert(r.n==3 and r[2]=='kept') end
assert(#events==0 and calls.loop==#rows)
mw_textloop(body({'日本語'},{lang='cn'})) assert(#events==0)
mw_textloop(body({'有効'})) assert(#events==1)
h.dispose()
`));

test('errors and nested calls preserve the original failure object and restore the outer diagnostic context',opt,()=>lua(String.raw`
local h=assert(install(_G,control,sink,'synthetic'))
local failure={kind='original-error'}
local ok,err=pcall(mw_textloop,body({'失敗'},{fail=failure})) assert(not ok and err==failure and #events==0)
mw_textloop(body({'外'},{change=function()mw_textloop(body({'内'}))end}))
assert(#events==2 and events[1].text=='内' and events[2].text=='外')
local replacement=function()return 'other owner'end;_G.ui_message=replacement;h.dispose();assert(_G.ui_message==replacement)
`));

test('a throwing diagnostic sink never changes successful return values',opt,()=>lua(String.raw`
local h=assert(install(_G,control,function()error('sink failure')end,'synthetic'))
local r=pack(message_name('花子','tail')) assert(r.n==4 and r[2]=='花子' and r[4]=='tail')
mw_textloop(body({'正文'}));h.dispose()
`));

test('exact ruby/text bounds are accepted and overflowing choice batches produce no partial group',opt,()=>lua(String.raw`
local id='1.80.120'
select_message=function()
 getMWID('select')
 for i=1,64 do ui_message(id..'.'..i..'.0.0.2',{'select',text='選択'}) end
 ui_message(id..'.1.0.0.3',{'select_active',text='選択'})
 return 'unmodified'
end
local h=assert(install(_G,control,sink,'synthetic'))
mw_textloop(body({{'ruby',text=string.rep('𠮷',160)},string.rep('𠮷',80),{'/ruby'},string.rep('a',1968)}))
assert(#events==1 and #events[1].ruby==1 and events[1].ruby[1][2]==80)
local before=#events;assert(select_message()=='unmodified' and #events==before)
h.dispose()
`));

test('control exceptions retire the generation and a later explicit generation can recover',opt,()=>lua(String.raw`
local broken=false
local h=assert(install(_G,function()if broken then error('policy')end return policy end,sink,'synthetic'))
mw_textloop(body({'最初'}));assert(#events==1)
broken=true;mw_textloop(body({'不明'}));broken=false;mw_textloop(body({'古い許可'}));assert(#events==1)
policy={enabled=true,generation=2};mw_textloop(body({'新しい許可'}));assert(#events==2)
h.dispose()
`));
