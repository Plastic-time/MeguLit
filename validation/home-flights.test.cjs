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

test('landing: no fade, the real card replaces the flying one in the same task, on an untilted scene',()=>{
 const W=path.join(__dirname,'..','web'),js=fs.readFileSync(path.join(W,'home-hand.js'),'utf8'),depth=fs.readFileSync(path.join(W,'home-depth.js'),'utf8'),
  tv=fs.readFileSync(path.join(W,'home-tv.js'),'utf8'),css=fs.readFileSync(path.join(W,'home-tv.css'),'utf8');
 assert.ok(js.includes("if(q>=1)return {x:B.x,y:B.y"),'q=1 is exactly the target');
 assert.ok(js.includes('s=r.width/(W*Math.cos(t)+H*Math.sin(t))'),'landing scale from the rotated face box');
 assert.ok(!js.includes('{opacity:1},{opacity:0}'),'(user: 过渡到展示的怎么是渐变过渡的) the flying card never fades out');
 assert.ok(js.includes("done?.();f.anims.forEach(a=>a.cancel());f.el.remove();"),'swap and removal happen in one task');
 assert.ok(js.includes('(opts.neutral||(fn=>fn()))(coverPose)'),'landing pose measured on the untilted scene');
 assert.ok(depth.includes('function hold(on)')&&depth.includes('function neutral(fn)'),'depth can settle flat and measure flat');
 assert.ok(tv.includes('live?.depth?.hold(true)')&&tv.includes('live?.depth?.hold(false)'),'the scene settles flat for the flight and follows the pointer again after');
 assert.ok(!/\.tv-canvas\{[^}]*transition/.test(css),'no CSS transition on the tilted canvas (it made the real card lag behind the measured pose)');
});
