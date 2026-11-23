process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 (owner, test pack v5 974eecd6, ファタモルガーナの館, E:\MeguLit-Test-1421\logs 03:32-03:34Z): 「校准当前句」 at 03:32:53.639
   logged `replacement disabled; reason=reader-preflight` and `hide layers give way (reader-preflight): write-back=off engine=off
   glyph=off gpu=off`; krkr hidden stopped at 463 of 596 draws, every placement said "drawn by the game itself (hidden=0)", the
   hookVisual baseline ended "The operation was canceled." and only at 03:33:35 "render mode switched in place read -> embed" (42 s
   later, when the user advanced: the 'read' route there is the give way itself, not a read mode). Japanese gone, original showing,
   calibration stuck at 正在测量当前句…. Replayed: the KiriKiri page with its character boxes; the calibration follows the boxes,
   the hide never goes; any other give way comes back within 2 s. */
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
const {HookControl}=require('../core/hook-control.cjs');
const LINE='その瞬間、私は死体を見下ろしていた。';
function rig(engine){
 const sent=[],traces=[],hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>1000);
 clearInterval(hook.timer);hook.send=m=>sent.push(m);hook.trace=t=>traces.push(t);
 hook.ownTextFn=()=>true;hook.compositedFn=()=>false;hook.pageMode=engine?{engine}:null;
 const state={bound:true,gameProcessId:123,gameStarted:'1',gameHwnd:'456',coverEnabled:true};
 const preferences={hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:true};
 hook.process={kill(){}};hook.pid=123;hook.started='1';hook.enabled=true;hook.route='embed';
 const style={statuses:[],status(s){this.statuses.push(s);},begin(){},request(){},publish(){return false;},cancel(){}};
 /* placement as the log has it before the click: line 18, 12 characters, first box 283,488,22,22 in client 804x604 */
 const placement={current:{id:'krkr',text:LINE,rects:[...LINE].map((c,i)=>[283+i*22,488,22,22]),client:[804,604]}};
 const host={state,preferences,hooks:hook,styleSync:style,placement,onEvent(){},notify(){},send(){},save(){}};
 const control=new HookControl(host,()=>1000);control.plan='embed';control.running=true;
 hook.configure(preferences,state);sent.length=0;
 return {hook,control,style,sent,traces,switches:()=>sent.filter(m=>m.type==='enable'||m.type==='disable')};
}
test('03:32:53Z replay: 校准当前句 on the KiriKiri page keeps the hide, the Japanese stays drawn, the calibration completes',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const r=rig('krkr');r.control.beginStyleSync(true,'all');
 assert.deepEqual(r.switches(),[],'no `replacement disabled; reason=reader-preflight`');
 assert.equal(r.hook.enabled,true);assert.equal(r.hook.route,'embed');assert.equal(r.hook.preflight===true,false);
 assert.equal(r.style.statuses.at(-1),'following','done at once: following the engine coordinates, never stuck at 正在测量当前句');
 assert.equal(r.control.styleCalibration,false);assert.ok(r.traces.some(l=>/engine boxes, no give way/.test(l)));
 t.mock.timers.tick(60000);assert.deepEqual(r.switches(),[],'nothing gives way later either');
 /* the line the placement reported keeps being the one the reader draws (Japanese on the engine boxes) */
 assert.equal(r.control.host.placement.current.text,LINE);
});
test('a give way elsewhere (no engine boxes; the 03:32:47Z baseline) is back within 1-2 s whatever the probe does',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const r=rig('');r.control.host.placement={current:null};r.control.beginStyleSync(false,'all');
 assert.deepEqual(r.switches(),[{type:'disable',reason:'reader-preflight'}]);
 t.mock.timers.tick(2000);assert.equal(r.switches().at(-1).type,'enable','hide and replacement back');assert.equal(r.hook.preflight,false);
 assert.equal(r.style.statuses.at(-1),'timeout');assert.ok(r.traces.some(l=>/give way capped/.test(l)));
});
test('SenrenBanka calibration follows TextRender boxes even when the glyph fallback owns the hidden text',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const r=rig('');
 Object.assign(r.control.host.placement.current,{fallback:true,engine:'krkr'});
 r.control.beginStyleSync(true,'all');
 t.mock.timers.tick(25000);
 assert.equal(r.style.statuses.at(-1),'following');
 assert.deepEqual(r.switches(),[]);
});
