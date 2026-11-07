// SPDX-License-Identifier: GPL-3.0-or-later
// Typewriter frame-drop probe (E213.3). Loaded first so every module's MutationObserver is attributed to its file.
// While a line is being revealed it counts frames over 25 ms, long tasks and the time each module's observer callbacks
// take, then sends one summary per line to logs/reader-perf.log. Measurement only: callbacks run unchanged.
(()=>{
 if(window.__megulitPerf)return;window.__megulitPerf=true;
 const observers=new Map(),stats={frames:0,jank:0,worst:0,long:0,longMs:0,mutations:0,started:0};let typing=false,last=performance.now();
 const Native=window.MutationObserver;
 const origin=()=>{for(const line of String(new Error().stack||'').split('\n')){const m=line.match(/\/([\w.-]+\.js)/);if(m&&m[1]!=='perf-probe.js')return m[1];}return '?';};
 window.MutationObserver=class extends Native{constructor(callback){const where=origin();super((list,observer)=>{const t=performance.now();try{return callback(list,observer);}finally{if(typing){const d=performance.now()-t,s=observers.get(where)||{ms:0,calls:0,max:0};s.ms+=d;s.calls++;s.max=Math.max(s.max,d);observers.set(where,s);stats.mutations+=list.length;}}});}};
 const frame=t=>{const d=t-last;last=t;if(typing){stats.frames++;if(d>25)stats.jank++;if(d>stats.worst)stats.worst=d;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
 try{new PerformanceObserver(list=>{if(!typing)return;for(const e of list.getEntries()){stats.long++;stats.longMs+=e.duration;}}).observe({type:'longtask'});}catch{}
 const flush=()=>{if(stats.frames<3)return;const top=[...observers].map(([file,s])=>[file,Math.round(s.ms*10)/10,s.calls,Math.round(s.max*10)/10]).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const message={type:'perfDiagnostic',seconds:Math.round((performance.now()-stats.started)/100)/10,frames:stats.frames,jank:stats.jank,worstFrame:Math.round(stats.worst),longTasks:stats.long,longTaskMs:Math.round(stats.longMs),mutations:stats.mutations,dom:document.getElementsByTagName('*').length,observers:top};
  try{window.__tomoyoTranslateRequest?.(JSON.stringify(message));}catch{}};
 addEventListener('megulit-reveal-progress',event=>{const now=!!event.detail?.typing;if(now&&!typing){observers.clear();Object.assign(stats,{frames:0,jank:0,worst:0,long:0,longMs:0,mutations:0,started:performance.now()});last=performance.now();}if(!now&&typing)flush();typing=now;},true);
})();
