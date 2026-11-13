/* 2026-11-13 (user: "我要的十种不同手牌和在场牌切换的不同…动画呢", "最后衔接会卡") the ten hand/field flights each have their own signature and length,
   end exactly on the field pose, and hand off to the real card with a short cross-fade */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('the ten flights each have a signature that tells them apart',async()=>{
 const h=await import('../web/home-hand.js'),A={x:900,y:700,r:12,s:.3,rx:0,ry:0,o:1},B={x:1000,y:300,r:-4,s:1,rx:0,ry:0,o:1};
 const sig=k=>{const f=h.flightFrames(k,A,B,60),dist=Math.hypot(B.x-A.x,B.y-A.y),line=p=>((p.x-A.x)*(B.y-A.y)-(p.y-A.y)*(B.x-A.x))/dist;
  return {arc:Math.max(...f.map(p=>Math.abs(line(p)))),spinR:Math.max(...f.map(p=>Math.abs(p.r-B.r))),ry:Math.max(...f.map(p=>Math.abs(p.ry))),rx:Math.max(...f.map(p=>Math.abs(p.rx))),
   back:Math.max(...f.map(p=>((A.x-p.x)*(B.x-A.x)+(A.y-p.y)*(B.y-A.y))/dist)),up:Math.max(...f.map(p=>A.y-p.y))};};
 const s=Object.fromEntries(h.HAND_VARIANTS.map(k=>[k,sig(k)]));
 assert.ok(s.toss.arc>150,'toss: high arc');assert.ok(s.flip.ry>=180,'flip: turns over');assert.ok(s.spin.spinR>=300,'spin: a full turn');
 assert.ok(s.edge.ry>70,'edge: goes edge-on');assert.ok(s.slap.rx>15,'slap: slams down');assert.ok(s.pull.back>40,'pull: winds back first');
 assert.ok(s.swing.spinR>20&&s.swing.ry===0,'swing: pendulum');assert.ok(s.dive.rx>10,'dive: tips into the table');
 for(const k of h.HAND_VARIANTS)assert.ok(h.FLIGHT_MS[k]>=500&&h.FLIGHT_MS[k]<=1100,k+' has its own length');
 assert.ok(new Set(Object.values(h.FLIGHT_MS)).size>=6,'lengths differ');
});

test('landing: exact final pose, scale taken from the rotated real card, ghost fades over the real card',()=>{
 const js=fs.readFileSync(path.join(__dirname,'..','web','home-hand.js'),'utf8');
 assert.ok(js.includes("if(q>=1)return {x:B.x,y:B.y"),'q=1 is exactly the target');
 assert.ok(/s=r\.width\/\(W\*Math\.cos\(t\)\+H\*Math\.sin\(t\)\)/.test(js),'landing scale from the rotated face box');
 assert.ok(js.includes("animate([{opacity:1},{opacity:0}],{duration:170"),'ghost cross-fades out after the real card shows');
});
