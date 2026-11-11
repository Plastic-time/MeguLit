'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const G=require('../services/learning-goal.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-goal-'));
const NOW=new Date(2026,10,12,12).getTime();
test('normalize keeps only known goals and fills each goal\'s details',()=>{
  const g=G.normalize({goals:['jlpt','eju','x','fun'],jlpt:{level:'N9',score:999,month:3,year:1999},eju:{subjects:['sci','hum'],band:123,parts:[]}},NOW);
  assert.deepEqual(g.goals,['jlpt','eju','fun']);
  assert.deepEqual(g.jlpt,{level:'N3',score:180,full:false,month:7,year:2026});
  assert.equal(g.eju.subjects[0],'ja');assert.ok(!g.eju.subjects.includes('hum'),'理科 and 文科 are not taken together');
  assert.equal(g.eju.band,300);assert.deepEqual(g.eju.parts,['read','listen','write']);assert.equal(g.eju.month,6);
  assert.deepEqual(g.fun,{focus:[]});assert.equal(g.talk,undefined);
  assert.equal(G.normalize({goals:['jlpt'],jlpt:{full:true,score:100}},NOW).jlpt.score,180);
});
test('exam days: JLPT first Sunday of July / December, EJU third Sunday of June and second of November',()=>{
  const d=x=>`${x.getFullYear()}-${x.getMonth()+1}-${x.getDate()}`;
  assert.equal(d(G.examDay('jlpt',2026,7)),'2026-7-5');assert.equal(d(G.examDay('jlpt',2026,12)),'2026-12-6');
  assert.equal(d(G.examDay('eju',2025,6)),'2025-6-15');assert.equal(d(G.examDay('eju',2025,11)),'2025-11-9');
  for(const k of ['jlpt','eju'])for(const m of k==='jlpt'?[7,12]:[6,11])assert.equal(G.examDay(k,2027,m).getDay(),0);
});
test('countdown counts days to each sitting and marks a past one',()=>{
  const c=G.countdown(G.normalize({goals:['jlpt','eju'],jlpt:{month:12,year:2026},eju:{month:6,year:2026}},NOW),NOW);
  assert.equal(c[0].kind,'eju');assert.ok(c[0].past);
  assert.equal(c[1].kind,'jlpt');assert.equal(c[1].days,24);assert.ok(!c[1].past);
});
test('plan: goals decide which grammar categories come first and where review weighs',()=>{
  const jl=G.plan(G.normalize({goals:['jlpt'],jlpt:{level:'N2',full:true}},NOW));
  assert.equal(jl.level,'N2');assert.equal(jl.groups[0],'particle');assert.equal(jl.review.particle,3);
  const ej=G.plan(G.normalize({goals:['eju'],eju:{parts:['listen']}},NOW));assert.equal(ej.level,'N2');assert.deepEqual(ej.groups,['speech','ending','aspect']);assert.ok(ej.tabs.includes('readwords'));
  const fun=G.plan(G.normalize({goals:['fun'],fun:{focus:['voice']}},NOW));assert.equal(fun.groups[0],'speech');assert.ok(fun.tabs.includes('kana'));
  const talk=G.plan(G.normalize({goals:['talk']},NOW),'N2');assert.equal(talk.level,'N0');assert.ok(talk.groups.includes('trend')&&talk.groups.includes('net'));
  assert.deepEqual(G.plan(null).groups,[]);
});
test('set saves, get reads it back, and a synced copy only wins when newer',()=>{
  const root=tmp();
  assert.deepEqual(G.get(root,NOW).goal.goals,[]);assert.equal(G.synced(root),null);
  const r=G.set(root,{goals:['jlpt','talk'],jlpt:{level:'N1',month:12,year:2026},talk:{focus:['slang']}},NOW);
  assert.equal(r.goal.savedAt,NOW);assert.equal(G.get(root,NOW).goal.jlpt.level,'N1');assert.equal(G.get(root,NOW).countdown[0].days,24);
  assert.equal(G.applySynced(root,{goals:['fun'],savedAt:NOW-1}),false);assert.equal(G.get(root,NOW).goal.goals.length,2);
  assert.equal(G.applySynced(root,{goals:['fun'],fun:{focus:['story']},savedAt:NOW+1}),true);assert.deepEqual(G.get(root,NOW).goal.goals,['fun']);
  fs.rmSync(root,{recursive:true,force:true});
});
test('the goal rides the account settings kind and comes back through apply',()=>{
  const A=require('../services/account.cjs'),root=tmp();
  G.set(root,{goals:['eju'],eju:{band:350}},NOW);
  assert.equal(A.accountExtras(root)['learning-goal'].eju.band,350);
  const other=tmp();A.kinds.settings.apply(null,'learning-goal',{data:{goals:['talk'],savedAt:NOW},updated_at:NOW},other);
  assert.deepEqual(G.get(other,NOW).goal.goals,['talk']);
  fs.rmSync(root,{recursive:true,force:true});fs.rmSync(other,{recursive:true,force:true});
});
test('bridge, front end and settings are wired, three languages',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  assert.match(read('services/bridge.cjs'),/case 'learning_goal':[\s\S]*case 'learning_goal_set':/);
  const web=read('web/learning-goal.js');for(const l of ['zh:','ja:','en:'])assert.ok(web.includes('\n '+l));
  assert.match(web,/export function goalPickerHTML/);assert.match(web,/export function orderByGoal/);
  assert.match(read('web/grammar.js'),/goalBarHTML\(opts\.goal/);assert.match(read('web/app.js'),/ensureGoal\(/);assert.match(read('web/settings.js'),/mountGoalSettings/);
  assert.ok(!/^\s*\/\//m.test(web));
});
test('orderByGoal pulls goal categories first and keeps the rest in order',async()=>{
  const {orderByGoal}=await import('../web/learning-goal.js');
  assert.deepEqual(orderByGoal(['a','b','c','d'],{groups:['c','x','a']}),['c','a','b','d']);
  assert.deepEqual(orderByGoal(['a','b'],null),['a','b']);
});
test('EJU 400 band is marked full marks with the scoring note, three languages',async()=>{
  const {goalPickerHTML,goalBarHTML}=await import('../web/learning-goal.js'),esc=x=>String(x);
  const g={goals:['eju'],eju:{subjects:['ja'],band:400,parts:['read'],month:6,year:2027}};
  for(const [l,full,note] of [['zh','400（满分）','几乎不可能'],['ja','400（満点）','ほぼ取れません'],['en','400 (full marks)','almost impossible']]){const h=goalPickerHTML(g,{locale:l,esc});assert.ok(h.includes(full)&&h.includes(note)&&h.includes('/400'),l);assert.ok(goalBarHTML({goal:g},{locale:l,esc}).includes(full),l);}
});
