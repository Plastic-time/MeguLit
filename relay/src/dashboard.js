// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-16 beta live-usage dashboard served by the relay (GET /dashboard). Polls /api/probe/stats on both relay nodes
   (CORS open) every 15 s, shows the first answer and each node's latency. Phone: https://cn-api.megulit.com/dashboard.
   Operator console (btop/htop/tmux idiom), black + red, LED dot-matrix live counter, full-width 12-column grid. */
export const DASHBOARD_HTML=String.raw`<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>MeguLit Live Ops</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Silkscreen&family=DotGothic16&display=swap">

<style>
/* operator console in the btop / htop / tmux idiom: titled hairline panes, aligned columns, bar meters, sparklines,
   a request log with latency. Black and one red. Code mono for data, small pixel caps for labels, pixel CJK. */
:root{--bg:#070707;--pane:#0b0b0b;--line:#262626;--line2:#1a1a1a;--fg:#cfcfcf;--hi:#f2f2f2;--dim:#626262;--dim2:#3a3a3a;--red:#e0303e;--ok:#5b9a6b;--gold:#e0a84b;--gold2:#7a5a26;
  --mono:"JetBrains Mono","DotGothic16",ui-monospace,Menlo,Consolas,monospace;--px:"Silkscreen",ui-monospace,monospace;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0}
/* hairline red scrollbar on a clear track */
/* Chrome drops ::-webkit-scrollbar once scrollbar-width is set, so the standard props are for Firefox only */
@-moz-document url-prefix(){html{scrollbar-width:thin;scrollbar-color:var(--red) transparent}}
::-webkit-scrollbar{width:2px;height:2px;background:transparent}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--red);border-radius:0}
::-webkit-scrollbar-button{display:none;width:0;height:0}
::-webkit-scrollbar-corner{background:transparent}
body{background:var(--bg);color:var(--fg);font-family:var(--mono);font-size:13px;line-height:1.55;font-variant-numeric:tabular-nums;
  padding-left:max(12px,env(safe-area-inset-left,0px));padding-right:max(12px,env(safe-area-inset-right,0px));padding-block:0 28px;overflow-x:hidden}
.r{color:var(--red)}.d{color:var(--dim)}.h{color:var(--hi)}.dd{color:var(--dim2)}.g{color:var(--ok)}
.wrap{max-width:1760px;margin:0 auto}

/* tmux status line */
.tmux{display:flex;align-items:center;margin:10px 0 12px;background:#111;border:1px solid var(--line2);font-size:12px;white-space:nowrap;overflow:hidden}
.tmux>span{padding:3px 10px}
.tmux .sess{background:var(--red);color:#000;font-family:var(--px);font-size:10px;letter-spacing:.06em;padding:4px 10px}
.tmux .win{color:var(--dim)}.tmux .win.on{color:var(--hi);background:#1b1b1b}
.tmux .sp{flex:1}.tmux .host{color:var(--dim)}
.tmux .clk{color:var(--hi);border-left:1px solid var(--line)}
.gl{position:relative;display:inline-block}
.gl::before,.gl::after{content:attr(data-t);position:absolute;inset:0;padding:inherit;overflow:hidden}
.gl::before{animation:g1 3.1s steps(1) infinite;background:var(--red);color:#000}
.gl::after{animation:g2 4.3s steps(1) infinite;color:var(--hi)}
@keyframes g1{0%,90%,100%{clip-path:inset(0 0 100% 0);transform:none}91%{clip-path:inset(0 0 50% 0);transform:translateX(-3px)}93%{clip-path:inset(55% 0 0 0);transform:translateX(2px)}95%{clip-path:inset(25% 0 45% 0);transform:translateX(-1px)}}
@keyframes g2{0%,84%,100%{clip-path:inset(0 0 100% 0);transform:none}85%{clip-path:inset(35% 0 30% 0);transform:translateX(3px)}87%{clip-path:inset(70% 0 5% 0);transform:translateX(-2px)}}
.gl.kick::before{animation:g1k .3s steps(1)}
@keyframes g1k{0%{clip-path:inset(0 0 40% 0);transform:translateX(-4px)}50%{clip-path:inset(50% 0 0 0);transform:translateX(3px)}100%{clip-path:inset(0 0 100% 0)}}

/* panes */
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px 12px}
.grid>.pane{grid-column:span 12}
@media(min-width:900px){.grid>.c3,.grid>.c4,.grid>.c6{grid-column:span 6}.grid>.c8,.grid>.c12{grid-column:span 12}}
@media(min-width:1400px){.grid>.c3{grid-column:span 3}.grid>.c4{grid-column:span 4}.grid>.c6{grid-column:span 6}.grid>.c8{grid-column:span 8}}
.pane{position:relative;border:1px solid var(--line);background:var(--pane);padding:16px 12px 10px;min-width:0}
.pane .ti{position:absolute;top:-8px;left:10px;background:var(--bg);padding:0 6px;font-family:var(--px);font-size:10px;letter-spacing:.06em;color:var(--hi);line-height:14px}
.pane .ti b{color:var(--red);font-weight:400}
.pane .tr{position:absolute;top:-8px;right:10px;background:var(--bg);padding:0 6px;font-size:11px;color:var(--dim);line-height:14px}
/* 24h histogram */
.hist{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;align-items:end;height:104px;border-bottom:1px solid var(--line);padding-top:4px}
.hist.h6{grid-template-columns:repeat(36,minmax(0,1fr));gap:1px;height:72px;margin-top:10px}
.hist i{display:block;background:var(--red);min-height:2px;opacity:.85}.hist i.z{background:var(--dim2);opacity:1}.hist i.now{background:var(--hi);opacity:1}
.hist i:hover{opacity:1;outline:1px solid var(--hi)}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.chips span{border:1px solid var(--dim2);color:var(--dim);font-size:11px;padding:0 5px}.chips b{color:var(--hi);font-weight:400}

/* online */
.on-row{display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap}
.big{display:block;image-rendering:pixelated}
.big.hit{animation:hit .28s steps(1)}
@keyframes hit{0%{transform:translateX(-3px);color:var(--hi)}40%{transform:translateX(2px)}100%{transform:none}}
.side{display:grid;grid-template-columns:auto auto;gap:0 12px;font-size:12px;align-content:end}
.side .k{color:var(--dim)}
.spark{margin-top:12px;color:var(--red);white-space:pre;overflow:hidden;font-size:14px;line-height:1}
.axis{display:flex;justify-content:space-between;color:var(--dim2);font-size:10px;margin-top:3px}
.cap{color:var(--dim);font-size:12px;margin-top:8px}

/* meters, htop style */
.m{display:grid;grid-template-columns:8em 1fr auto;gap:10px;align-items:center;padding:2px 0}
.m .k{color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m .bar{white-space:pre;overflow:hidden;color:var(--dim2)}
.m .bar i{font-style:normal;color:var(--red)}
.m .v{color:var(--hi);min-width:4ch;text-align:right}
.sep{border-top:1px dashed var(--line);margin:8px 0}
.m.m4{grid-template-columns:8em 1fr auto 3.5ch}
.m .pc{color:var(--dim);text-align:right;font-size:11px}
.m.m5{grid-template-columns:7.6em minmax(0,1fr) 4.5ch 13ch;gap:6px}.m.m5 .pc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m.hot .v{color:var(--red)}.m.hot .k{color:var(--hi)}
.sub{color:var(--dim);font-size:11px;margin-bottom:2px}

/* full dumps counters */
.cnt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
.cnt>div{border:1px solid var(--line2);padding:6px 8px}
.cnt .v{font-size:22px;line-height:1.1;color:var(--hi)}
.cnt .v.r{color:var(--red)}
.cnt .k{color:var(--dim);font-size:11px}
.kv{display:grid;grid-template-columns:8em 1fr;gap:2px 10px;font-size:12px}
.kv .k{color:var(--dim)}
/* THE SEED: the one gold pane */
.pane.gold{border-color:var(--gold2)}
.pane.gold .ti{color:var(--gold)}.pane.gold .ti b{color:var(--gold)}
.pane.gold .bar i{color:var(--gold)}
.seed-top{display:flex;align-items:flex-end;gap:14px;margin-bottom:8px}
.seed-n{font-size:40px;line-height:1;color:var(--gold);font-weight:600}
.seed-u{color:var(--dim);font-size:12px;line-height:1.4}.seed-u b{color:var(--hi);font-weight:400}
.m.seed-ok .v{color:var(--gold)}.m.seed-ok .k{color:var(--hi)}
.chips.gold span{border-color:var(--gold2)}.chips.gold b{color:var(--gold)}
.pane .ti.cjk{font-family:"DotGothic16",var(--mono);font-size:12px}

/* tables */
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-family:var(--px);font-size:9px;letter-spacing:.06em;color:var(--dim);font-weight:400;text-align:left;padding:2px 6px 5px;border-bottom:1px solid var(--line)}
th.rt,td.rt{text-align:right}
td{padding:4px 6px;border-bottom:1px solid var(--line2);vertical-align:top}
td.n{color:var(--dim);width:3ch}td.v{color:var(--red);white-space:nowrap}
td.t{color:var(--hi);word-break:break-word}
td.s{color:var(--dim);white-space:nowrap;font-size:11px}
td.z{color:var(--fg);white-space:nowrap}
tbody tr:hover td{background:#121212}
.tag{color:#000;background:var(--red);font-size:10px;padding:0 4px;margin-left:6px}
.st{display:inline-block;font-size:10px;padding:0 5px;border:1px solid var(--dim2);color:var(--dim)}
.st.ready{border-color:var(--red);color:var(--red)}.st.uploading{border-color:var(--hi);color:var(--hi)}.st.done{border-color:var(--ok);color:var(--ok)}
.empty{color:var(--dim);font-size:12px;padding:4px 0}
@media(max-width:520px){.hide-s{display:none}}

/* log */
.log{font-size:12px;max-height:22em;overflow:hidden}
.log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv{display:inline-block;width:3.2ch}.lv.i{color:var(--ok)}.lv.e{color:var(--red)}
.ms{color:var(--dim)}
.lat{color:var(--red);white-space:pre;font-size:12px;line-height:1;margin-bottom:6px;overflow:hidden}

/* vim-ish footer */
.vim{display:flex;margin-top:14px;border:1px solid var(--line2);font-size:11px;white-space:nowrap;overflow:hidden;background:#0e0e0e}
.vim>span{padding:3px 9px}
.vim .md{background:var(--hi);color:#000;font-family:var(--px);font-size:9px;padding:4px 9px}
.vim .md.err{background:var(--red)}
.vim .sp{flex:1}
.vim .cur::after{content:"";display:inline-block;width:.55em;height:1em;background:var(--red);vertical-align:-2px;margin-left:4px;animation:bl 1s steps(1) infinite}
@keyframes bl{50%{opacity:0}}
#boot{position:fixed;inset:0;z-index:9;background:var(--bg);padding:16px max(14px,env(safe-area-inset-left,0px));font-size:13px;color:var(--fg)}
#boot .ok{color:var(--ok)}#boot.off{display:none}
@media(max-width:520px){.tmux .win:not(.on),.tmux .host,.vim #ep{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>

<div id="boot"><div id="tw"></div></div>

<div class="wrap">
  <div class="tmux">
    <span class="sess gl" id="name" data-t="MEGULIT">MEGULIT</span>
    <span class="win on">0:live*</span><span class="win">1:dumps</span><span class="win">2:log</span>
    <span class="sp"></span>
    <span class="host" id="host">relay ─</span>
    <span class="clk" id="clock">--:--:--</span>
  </div>

  <div class="grid">
    <section class="pane c3">
      <span class="ti">┤ <b>online</b> ├</span><span class="tr">last 10 min</span>
      <div class="on-row">
        <canvas class="big" id="big" role="img" aria-label="online"></canvas>
        <div class="side">
          <span class="k">peak</span><span class="h" id="peak">--</span>
          <span class="k">Δ poll</span><span id="delta">--</span>
          <span class="k">since</span><span class="d" id="since">--</span>
        </div>
      </div>
      <div class="hist h6" id="h6"></div>
      <div class="axis"><span>-6h</span><span>-3h</span><span>now</span></div>
      <div class="kv" style="margin-top:6px"><span class="k">now / 1h</span><span id="oNow">--</span><span class="k">6h avg</span><span id="o6">--</span></div>
      <div class="spark" id="spark" hidden></div><span id="ax0" hidden></span>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>stats</b> ├</span><span class="tr">/api/probe/stats</span>
      <div class="m"><span class="k">active 1h</span><span class="bar" id="b1"></span><span class="v" id="v1">--</span></div>
      <div class="m"><span class="k">active today</span><span class="bar" id="b2"></span><span class="v" id="v2">--</span></div>
      <div class="m"><span class="k">active 24h</span><span class="bar" id="bA24"></span><span class="v" id="vA24">--</span></div>
      <div class="m"><span class="k">peak 10 min</span><span class="bar"></span><span class="v" id="vP10">--</span></div>
      <div class="m"><span class="k">avg online</span><span class="bar"><span class="d">per player today</span></span><span class="v" id="vAvg">--</span></div>
      <div class="m"><span class="k">1h+ sessions</span><span class="bar"><span class="d">today</span></span><span class="v" id="vLong">--</span></div>
      <div class="sep"></div>
      <div class="m"><span class="k">probed games</span><span class="bar" id="b3"></span><span class="v" id="v3">--</span></div>
      <div class="m"><span class="k">reporters</span><span class="bar"></span><span class="v" id="v4">--</span></div>
      <div class="m"><span class="k">per game</span><span class="bar"></span><span class="v" id="v5">--</span></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>activity</b> ├</span><span class="tr">online per hour · 24h</span>
      <div class="hist" id="hist"></div>
      <div class="axis"><span>-24h</span><span>-12h</span><span>now</span></div>
      <div class="kv" style="margin-top:8px"><span class="k">peak hour</span><span id="hPeak">--</span><span class="k">avg / hour</span><span id="hAvg">--</span><span class="k">quiet hours</span><span id="hZero">--</span><span class="k">this hour</span><span id="hNow">--</span><span class="k">busiest 3h</span><span id="h3">--</span></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>quota</b> ├</span><span class="tr">usage / limit</span>
      <div id="quota"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3 gold">
      <span class="ti">┤ <b>the seed</b> ├</span><span class="tr">The Seed/ · 差分种子</span>
      <div id="seed"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>why</b> ├</span><span class="tr">by step</span>
      <div id="steps"><div class="empty">-- no data</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>accounts</b> ├</span><span class="tr">login · sync</span>
      <div id="acc"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>community</b> ├</span><span class="tr">board · forum · social</span>
      <div id="com"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c8">
      <span class="ti">┤ <b>targets</b> ├</span><span class="tr">by reporters</span>
      <div id="top"><div class="empty">-- no rows</div></div>
    </section>

    <section class="pane c4">
      <span class="ti">┤ <b>most read</b> ├</span><span class="tr">by characters</span>
      <div id="most"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>adapters</b> ├</span><span class="tr">packs · reports · uploads</span>
      <div id="adp"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>now playing</b> ├</span><span class="tr">board · last 7d</span>
      <div id="playing"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>storage</b> ├</span><span class="tr">r2 · uploads in flight</span>
      <div id="stor"><div class="empty">-- loading</div></div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>full dumps</b> ├</span><span class="tr">r2://probe-full</span>
      <div class="cnt">
        <div><div class="v r" id="fReady">--</div><div class="k">ready</div></div>
        <div><div class="v" id="fUp">--</div><div class="k">uploading</div></div>
        <div><div class="v" id="fDone">--</div><div class="k">done</div></div>
      </div>
      <div class="m"><span class="k">r2</span><span class="bar" id="bR2"></span><span class="v" id="vR2">--</span></div>
      <div class="kv" style="margin-top:6px">
        <span class="k">stored</span><span id="fMB">--</span>
        <span class="k">avg / dump</span><span id="fAvg">--</span>
        <span class="k">last upload</span><span id="fLast">--</span>
      </div>
    </section>

    <section class="pane c3">
      <span class="ti">┤ <b>relay.log</b> ├</span><span class="tr" id="latT">latency</span>
      <div class="lat" id="lat"></div>
      <div class="log" id="log"></div>
    </section>
  </div>

  <div class="vim"><span class="md" id="mode">LINK</span><span id="ep">GET /api/probe/stats</span><span class="d" id="code">--</span><span class="sp"></span><span class="d" id="extAt">ext --</span><span class="d" id="node">--</span><span>poll <span id="count">15</span>s<span class="cur"></span></span></div>
</div>

<script>
"use strict";
var NODES=[["cn-api","https://cn-api.megulit.com/api/probe/stats"],["api","https://api.megulit.com/api/probe/stats"]];
var PERIOD=15,HIST=60;
var $=function(id){return document.getElementById(id);};
var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
function fmt(n){return (n==null||isNaN(n))?"--":String(n);}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
function ago(sec){if(!sec)return "--";var s=Math.max(0,Math.floor(Date.now()/1000-sec));if(s<60)return s+"s ago";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h"+String(Math.floor(s%3600/60)).padStart(2,"0")+"m ago";return Math.floor(s/86400)+"d ago";}
function mb(v){return v==null?"--":(v>=1024?(v/1024).toFixed(2)+" GB":v.toFixed(1)+" MB");}

/* LED dot-matrix digits: 5x7 glyphs, every dot its own square; lit dots red with a faint bloom, unlit dots stay as a
   dark grid, empty leading slots are dark too (a counter) */
var GL={"0":["01110","10001","10011","10101","11001","10001","01110"],"1":["00100","01100","00100","00100","00100","00100","01110"],
 "2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11111","00010","00100","00010","00001","10001","01110"],
 "4":["00010","00110","01010","10010","11111","00010","00010"],"5":["11111","10000","11110","00001","00001","10001","01110"],
 "6":["00110","01000","10000","11110","10001","10001","01110"],"7":["11111","00001","00010","00100","01000","01000","01000"],
 "8":["01110","10001","10001","01110","10001","10001","01110"],"9":["01110","10001","10001","01111","00001","00010","01100"],
 "-":["00000","00000","00000","11111","00000","00000","00000"]};
var SLOTS=3;
function drawLed(t){var cv=$("big"),slots=Math.max(SLOTS,t.length),cell=innerWidth<520?9:11,gap=2,pad=6,dpr=Math.max(1,window.devicePixelRatio||1);
 var cols=slots*6-1,W=cols*cell+pad*2,H=7*cell+pad*2;cv.style.width=W+"px";cv.style.height=H+"px";cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 var x=cv.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);
 var s=String(t);while(s.length<slots)s=" "+s;var lit=[];
 for(var k=0;k<slots;k++){var g=GL[s.charAt(k)];for(var r=0;r<7;r++)for(var c=0;c<5;c++){var on=g&&g[r].charAt(c)==="1",px=pad+(k*6+c)*cell,py=pad+r*cell;
  x.fillStyle=on?"#e0303e":"#151515";x.fillRect(px,py,cell-gap,cell-gap);if(on)lit.push([px,py]);}}
 x.save();x.globalCompositeOperation="lighter";x.shadowColor="rgba(224,48,62,.55)";x.shadowBlur=cell*.9;x.fillStyle="rgba(224,48,62,.18)";
 lit.forEach(function(p){x.fillRect(p[0],p[1],cell-gap,cell-gap);});x.restore();
 x.fillStyle="rgba(255,255,255,.10)";lit.forEach(function(p){x.fillRect(p[0],p[1],cell-gap,1);});}
var shown="";
function setBig(v){var t=fmt(v),el=$("big");el.setAttribute("aria-label",t+" online");
 if(t===shown||reduce){shown=t;drawLed(t);return;}
 var i=0,iv=setInterval(function(){i++;if(i>=7){clearInterval(iv);shown=t;drawLed(t);el.classList.remove("hit");void el.offsetWidth;el.classList.add("hit");return;}
  var s="";for(var k=0;k<t.length;k++)s+=String(Math.floor(Math.random()*10));drawLed(s);},45);}

/* htop meter */
function cols(el,cw){return Math.max(8,Math.floor(el.clientWidth/cw));}
function meter(el,v,max){if(!el)return;var w=cols(el,7.9)-2,n=max>0?Math.round(Math.min(1,Math.max(0,Number(v)||0)/max)*w):0;n=Math.max(0,Math.min(w,n|0));
 el.innerHTML="["+"<i>"+"|".repeat(n)+"</i>"+" ".repeat(Math.max(0,w-n))+"]";}

/* sparklines from this viewer's own samples */
function load(k){try{return JSON.parse(localStorage.getItem(k)||"[]").filter(function(p){return Date.now()-p[0]<HIST*PERIOD*1000;});}catch(e){return [];}}
function keep(k,a){try{localStorage.setItem(k,JSON.stringify(a));}catch(e){}}
var hist=load("ml-online-hist"),lath=load("ml-lat-hist");
var BARS=["▁","▂","▃","▄","▅","▆","▇","█"];
function sparkStr(el,vals,cw){var w=cols(el,cw),v=vals.slice(-w),mx=Math.max(1,Math.max.apply(null,v.concat([0])));
 return '<span class="dd">'+"▁".repeat(Math.max(0,w-v.length))+"</span>"+v.map(function(x){return x<=0?'<span class="dd">▁</span>':BARS[Math.min(7,Math.max(1,Math.round(x/mx*7)))];}).join("");}
function spark(){var el=$("spark");el.innerHTML=sparkStr(el,hist.map(function(p){return p[1];}),8.4);$("ax0").textContent="-"+Math.round(cols(el,8.4)*PERIOD/60)+"m";
 var l=$("lat");l.innerHTML=sparkStr(l,lath.map(function(p){return p[1];}),7.3);}

function renderSteps(list,j){var w=$("steps");j=j||{};var html="";
 if(list&&list.length){var mx=Math.max.apply(null,list.map(function(s){return s.n;})),tot=list.reduce(function(a,s){return a+s.n;},0);
  html+=list.map(function(s,i){return '<div class="m m4"><span class="k" title="'+esc(s.step)+'">'+esc(s.step)+'</span><span class="bar" id="sb'+i+'"></span><span class="v">'+s.n+'</span><span class="pc">'+Math.round(s.n/tot*100)+'%</span></div>';}).join("");}
 else html+='<div class="empty">-- no data</div>';
 var ps=j.probeStates||[],pt=ps.reduce(function(a,s){return a+s.n;},0);
 if(ps.length){html+='<div class="sep"></div><div class="sub">probe quality <span class="dd">· '+pt+' desensitized probes</span></div>'+
  ps.map(function(s,i){return '<div class="m m4"><span class="k">'+esc(s.state)+'</span><span class="bar" id="qb'+i+'"></span><span class="v">'+s.n+'</span><span class="pc">'+Math.round(s.n/Math.max(1,pt)*100)+'%</span></div>';}).join("");}
 var f=j.full||{},fg=f.games|0;
 html+='<div class="sep"></div><div class="kv">'+
  '<span class="k">vndb matched</span><span><span class="h">'+fmt(j.vndbMatched)+'</span><span class="d"> / '+fmt(j.probedGames)+'</span></span>'+
  '<span class="k">github issues</span><span class="h">'+fmt(j.issues)+'</span>'+
  '<span class="k">adapted</span><span><span class="h">'+(f.done|0)+'</span><span class="d"> / '+fg+' full dumps · '+(fg?Math.round((f.done|0)/fg*100):0)+'%</span></span></div>';
 w.innerHTML=html;
 (list||[]).forEach(function(s,i){meter($("sb"+i),s.n,mx);});
 ps.forEach(function(s,i){meter($("qb"+i),s.n,Math.max.apply(null,ps.map(function(x){return x.n;})));});}
/* ---- wide aggregates (relay ext, refreshed every 5 min server side) ---- */
function K(n){n=Number(n)||0;return n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e4?(n/1e3).toFixed(1)+"k":String(n);}
function H(sec){var h=(Number(sec)||0)/3600;return h>=100?Math.round(h)+"h":h.toFixed(1)+"h";}
function kvs(rows){return '<div class="kv">'+rows.map(function(r){return '<span class="k">'+r[0]+'</span><span>'+r[1]+'</span>';}).join("")+'</div>';}
function hv(v){return '<span class="h">'+v+'</span>';}
function p7(n){return n?' <span class="r">+'+K(n)+'</span><span class="d"> 7d</span>':' <span class="d">+0 7d</span>';}
var barQ=[];
function bars(list,lab,id){if(!list||!list.length)return "";var tot=list.reduce(function(a,s){return a+(s.n|0);},0),mx=Math.max.apply(null,list.map(function(s){return s.n|0;}));
 return list.map(function(s,i){barQ.push([id+i,s.n|0,mx]);return '<div class="m m4"><span class="k">'+esc(s[lab])+'</span><span class="bar" id="'+id+i+'"></span><span class="v">'+K(s.n)+'</span><span class="pc">'+Math.round((s.n|0)/Math.max(1,tot)*100)+'%</span></div>';}).join("");}
function flushBars(){barQ.forEach(function(q){var el=$(q[0]);if(el)meter(el,q[1],q[2]);});barQ=[];}
function sub(t){return '<div class="sep"></div><div class="sub">'+t+'</div>';}
function renderExt(x){if(!x)return;barQ=[];
 var hs=x.hourly||[],mx=Math.max(1,Math.max.apply(null,hs.map(function(h){return h.n;}).concat([0]))),pk=null,sum=0,zero=0;
 $("hist").innerHTML=hs.map(function(h,i){sum+=h.n;if(!h.n)zero++;if(!pk||h.n>pk.n)pk=h;var d=new Date(h.at*1000),lab=String(d.getHours()).padStart(2,"0")+":00 · "+h.n;
  return '<i class="'+(h.n?"":"z ")+(i===hs.length-1?"now":"")+'" style="height:'+(h.n?Math.max(6,Math.round(h.n/mx*100)):2)+'%" title="'+lab+'"></i>';}).join("");
 $("hPeak").innerHTML=pk&&pk.n?hv(pk.n)+' <span class="d">at '+String(new Date(pk.at*1000).getHours()).padStart(2,"0")+':00</span>':"--";
 $("hAvg").innerHTML=hs.length?hv((sum/hs.length).toFixed(1)):"--";$("hZero").innerHTML=hv(zero)+'<span class="d"> / 24</span>';
 var a=x.accounts||{},s=x.sync||{};
 $("acc").innerHTML=kvs([["accounts",hv(K(a.total))+p7(a.new7d)],["logged in 7d",hv(K(a.active7d))],["live sessions",hv(K(a.sessions))],["synced records",hv(K(s.records))],["synced users",hv(K(s.accounts))]])+
  (s.kinds&&s.kinds.length?sub("sync by kind")+bars(s.kinds,"kind","sk"):"");
 var l=x.leaderboard||{},f=x.forum||{},so=x.social||{},lk=x.lookups||{};
 $("com").innerHTML=kvs([["board users",hv(K(l.users))+' <span class="d">'+K(l.sharing)+' share games</span>'],["board active",hv(K(l.active7d))+'<span class="d"> 7d</span>'],
  ["chars read",hv(K(l.characters))],["time read",hv(H(l.seconds))],["games tracked",hv(K(l.games))]])+
  sub("forum")+kvs([["posts",hv(K(f.posts))+p7(f.posts7d)],["replies",hv(K(f.replies))+p7(f.replies7d)],["authors",hv(K(f.authors))]])+
  (f.tags&&f.tags.length?'<div class="chips">'+f.tags.map(function(t){return '<span>'+esc(t.tag)+' <b>'+t.n+'</b></span>';}).join("")+'</div>':"")+
  sub("social")+kvs([["profiles",hv(K(so.profiles))+' <span class="d">'+K(so.public)+' public</span>'],["follows",hv(K(so.follows))],
   ["lookups",hv(K(lk.count))+' <span class="d">'+K(lk.terms)+' words · '+K(lk.users)+' users</span>']])+
  ((x.avatars||[]).length?'<div class="chips">'+x.avatars.map(function(v){return '<span>avatar '+esc(v.status)+' <b>'+v.n+'</b></span>';}).join("")+'</div>':"");
 var mr=x.mostRead||[];
 $("most").innerHTML=mr.length?'<table><thead><tr><th>#</th><th>title</th><th class="rt">ppl</th><th class="rt">chars</th><th class="rt hide-s">time</th></tr></thead><tbody>'+mr.map(function(g,i){
  return '<tr><td class="n">'+(i+1)+'</td><td class="t">'+esc(g.title)+'</td><td class="z rt">'+g.readers+'</td><td class="v rt">'+K(g.characters)+'</td><td class="s rt hide-s">'+H(g.seconds)+'</td></tr>';}).join("")+'</tbody></table>':'<div class="empty">-- no rows</div>';
 var ad=x.adapters||{},dg=x.diagnostics||{},bd=x.bundles||{};
 $("adp").innerHTML=kvs([["packs",hv(K(ad.packs))+' <span class="d">'+K(ad.ids)+' games · '+K(ad.withdrawn)+' withdrawn</span>'],["shared records",hv(K(ad.records))+p7(ad.records7d)],
  ["record reports",hv(K(ad.recordReports))],["probe requests",hv(K(ad.openRequests))+' <span class="d">open / '+K(ad.requests)+'</span>']])+
  ((ad.reports||[]).length?sub("pack reports")+bars(ad.reports,"state","pr"):"")+
  ((x.contrib||[]).length?sub("contrib uploads")+bars(x.contrib,"state","cu"):"")+
  sub("uploads")+kvs([["diagnostics",hv(K(dg.total))+p7(dg.n7d)+' <span class="d">'+mb(dg.mb||0)+'</span>'],["diag issues",hv(K(dg.issues))],["probe bundles",hv(K(bd.total))+p7(bd.n7d)+' <span class="d">'+mb(bd.mb||0)+'</span>']]);
 flushBars();
 $("extAt").textContent="ext "+ago(x.at);}
function renderFullMore(j){var f=j.full||{},el=$("fMore");if(!el){renderStorage(j);return;}
 el.innerHTML=kvs([["size range",hv(mb(f.minMB||0))+'<span class="d"> → </span>'+hv(mb(f.maxMB||0))],["reporters",hv(K(f.reporters))],
  ["uploads 24h",hv(K(f.d1))+' <span class="d">'+K(f.d7)+' in 7d · '+K(f.games)+' total</span>'],
  ["expiring 7d",(f.expiring?'<span class="r">'+f.expiring+'</span>':hv(0))+' <span class="d">kept 30d</span>'],
  ["oldest ready",f.oldestAt?hv(ago(f.oldestAt).replace(" ago",""))+'<span class="d"> waiting</span>':hv("--")],
  ["vndb matched",hv(K(f.vndb))+'<span class="d"> / '+K(f.games)+'</span>']]);
 renderStorage(j);}
function renderStorage(j){var f=j.full||{},x=j.ext||{},el=$("stor");if(!el)return;barQ=[];var html="";
 var bdm=(x.bundles||{}).mb||0,dgm=(x.diagnostics||{}).mb||0,cum=(x.contrib||[]).reduce(function(a,c){return a+(c.mb||0);},0),tot=(f.storedMB||0)+bdm+dgm+cum;
 html+='<div class="m"><span class="k">r2 used</span><span class="bar" id="fr2"></span><span class="v">'+(tot/10240*100).toFixed(1)+'%</span></div>'+
  kvs([["full dumps",hv(mb(f.storedMB||0))],["contrib",hv(mb(cum))],["probe bundles",hv(mb(bdm))],["diagnostics",hv(mb(dgm))],["total",hv(mb(tot))+'<span class="d"> / 10 GB free</span>']]);
 barQ.push(["fr2",tot,10240]);
 var fl=f.inflight||[];html+=sub("in flight");
 if(fl.length)fl.forEach(function(u,i){barQ.push(["fi"+i,u.pct,100]);
  html+='<div class="m m4"><span class="k" title="'+esc(u.title)+'">'+esc(u.title)+'</span><span class="bar" id="fi'+i+'"></span><span class="v">'+u.pct+'%</span><span class="pc">'+u.got+'/'+u.parts+'</span></div>'+
   '<div class="sub" style="margin:-2px 0 4px">'+mb(u.mb)+' · last part '+ago(u.at)+'</div>';});
 else html+='<div class="empty">-- idle</div>';
 if((f.apps||[]).length)html+=sub("dumps by app version")+bars(f.apps,"app","fa");
 el.innerHTML=html;flushBars();}
function renderPlaying(list){var w=$("playing");
 if(!list||!list.length){w.innerHTML='<div class="empty">-- nobody on the board read this week</div>';return;}
 w.innerHTML='<table><thead><tr><th>seen</th><th>title</th><th class="rt">ppl</th><th class="rt">chars</th></tr></thead><tbody>'+list.map(function(g){
  return '<tr><td class="s">'+ago(g.at).replace(" ago","")+'</td><td class="t">'+esc(g.title)+'</td><td class="z rt">'+g.readers+'</td><td class="v rt">'+K(g.characters)+'</td></tr>';}).join("")+'</tbody></table>';}
/* ---- quota: usage against the free plans, with reset times ---- */
function bytes(b){b=Number(b)||0;return b>=1073741824?(b/1073741824).toFixed(2)+" GB":b>=1048576?(b/1048576).toFixed(1)+" MB":Math.round(b/1024)+" KB";}
function bshort(b){b=Number(b)||0;return b>=1073741824?(b/1073741824).toFixed(b>=10737418240?0:1)+'G':b>=1048576?Math.round(b/1048576)+'M':Math.round(b/1024)+'K';}
function renderQuota(j){var el=$("quota");if(!el)return;var q=j.quota||{},it=q.items||{},L=q.limits||{},f=j.full||{},x=j.ext||{};barQ=[];
 var r2est=(((f.storedMB||0)+((x.bundles||{}).mb||0)+((x.diagnostics||{}).mb||0)+(x.contrib||[]).reduce(function(a,c){return a+(c.mb||0);},0))*1048576);
 var rows=[
  ["workers req","day",it.workersReq,L.workersReq,K],
  ["d1 reads","day",it.d1Read,L.d1Read,K],
  ["d1 writes","day",it.d1Write,L.d1Write,K],
  ["d1 storage","",it.d1Bytes,L.d1Bytes,bshort],
  ["r2 storage",it.r2Bytes!=null?"":"est",it.r2Bytes!=null?it.r2Bytes:r2est,L.r2Bytes,bshort],
  ["r2 class a","mo",it.r2A,L.r2A,K],
  ["r2 class b","mo",it.r2B,L.r2B,K],
  ["ai neurons","day",it.aiNeurons,L.aiNeurons,K],
  ["github api","hr",it.ghUsed,it.ghLimit||5000,K]];
 var html=rows.map(function(r,i){var has=r[2]!=null&&!isNaN(r[2]),pct=has&&r[3]?r[2]/r[3]*100:0;if(has)barQ.push(["qb"+i,r[2],r[3]]);
  return '<div class="m m5'+(pct>=80?' hot':'')+'"><span class="k" title="per '+(r[1]||'total')+'">'+r[0]+'</span><span class="bar" id="qb'+i+'"></span>'+
   '<span class="v">'+(has?(pct<10?pct.toFixed(1):Math.round(pct))+'%':'--')+'</span><span class="pc">'+(has?r[4](r[2])+'/'+r[4](r[3]):'')+'</span></div>';}).join("");
 var now=new Date(),utc0=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)),left=Math.max(0,Math.round((utc0-now)/60000));
 html+='<div class="sub" style="margin-top:6px">daily reset '+Math.floor(left/60)+'h'+String(left%60).padStart(2,"0")+'m · r2 ops monthly · github hourly</div>';
 if(!q.token)html+='<div class="sub"><span class="r">cf usage offline</span> · needs CF_API_TOKEN</div>';
 var errs=Object.keys(q.errors||{});if(errs.length)html+='<div class="sub">'+errs.map(function(k){return '<span class="r">'+esc(k)+'</span> '+esc(q.errors[k]);}).join(" · ")+'</div>';
 el.innerHTML=html;flushBars();}
function renderRow1(j){
 var se=j.series||[],mx=Math.max(1,Math.max.apply(null,se.map(function(p){return p.n;}).concat([0]))),sum=0;
 $("h6").innerHTML=se.map(function(p,i){sum+=p.n;var d=new Date(p.at*1000);return '<i class="'+(p.n?"":"z ")+(i===se.length-1?"now":"")+'" style="height:'+(p.n?Math.max(8,Math.round(p.n/mx*100)):3)+'%" title="'+String(d.getHours()).padStart(2,"0")+':'+String(d.getMinutes()).padStart(2,"0")+' \u00b7 '+p.n+'"></i>';}).join("");
 $("oNow").innerHTML=hv(fmt(j.online))+'<span class="d"> / '+fmt(j.active1h)+'</span>';$("o6").innerHTML=hv(se.length?(sum/se.length).toFixed(1):"--")+'<span class="d"> per 10 min</span>';
 meter($("bA24"),j.active24h,Math.max(j.active24h|0,j.today|0,1));$("vA24").textContent=fmt(j.active24h);
 $("vP10").textContent=fmt(j.peak10);$("vAvg").textContent=j.avgMinToday!=null?(j.avgMinToday>=60?Math.floor(j.avgMinToday/60)+"h"+String(j.avgMinToday%60).padStart(2,"0"):j.avgMinToday+"m"):"--";$("vLong").textContent=fmt(j.longToday);
 var hs=(j.ext||{}).hourly||[];if(hs.length){var last=hs[hs.length-1].n,avg=hs.reduce(function(a,h){return a+h.n;},0)/hs.length,best=0,bi=0;
  for(var i=0;i+3<=hs.length;i++){var w=hs[i].n+hs[i+1].n+hs[i+2].n;if(w>best){best=w;bi=i;}}
  $("hNow").innerHTML=hv(last)+' <span class="'+(last>=avg?"r":"d")+'">'+(last>=avg?"\u25b2":"\u25bc")+' vs '+avg.toFixed(1)+' avg</span>';
  $("h3").innerHTML=best?hv(best)+' <span class="d">'+String(new Date(hs[bi].at*1000).getHours()).padStart(2,"0")+':00\u2013'+String((new Date(hs[bi].at*1000).getHours()+3)%24).padStart(2,"0")+':00</span>':"--";}}
function stateTag(s){return '<span class="st '+esc(s)+'">'+esc(s||"-")+'</span>';}
function renderTop(list){var w=$("top");
 if(!list||!list.length){w.innerHTML='<div class="empty">-- no rows</div>';return;}
 w.innerHTML='<table><thead><tr><th>#</th><th>title</th><th class="hide-s">why</th><th class="rt hide-s">size</th><th>state</th><th class="rt">ppl</th></tr></thead><tbody>'+list.map(function(g,i){
  return '<tr><td class="n">'+(i+1)+'</td><td class="t">'+esc(g.title)+(g.full?'<span class="tag">full</span>':'')+'</td><td class="s hide-s">'+esc(g.step||"-")+'</td><td class="z rt hide-s">'+(g.mb!=null?mb(g.mb):"-")+'</td><td>'+stateTag(g.state)+'</td><td class="v rt">'+fmt(g.reporters)+'</td></tr>';}).join("")+'</tbody></table>';}
function renderRecent(list){var w=$("recent");
 if(!list||!list.length){w.innerHTML='<div class="empty">-- no uploads yet</div>';return;}
 w.innerHTML='<table><tbody>'+list.map(function(g){return '<tr><td class="s">'+ago(g.at)+'</td><td>'+stateTag(g.state)+'</td><td class="z rt">'+mb(g.mb)+'</td><td class="t">'+esc(g.title)+'</td></tr>';}).join("")+'</tbody></table>';}

var logs=[];
function log(level,msg){logs.unshift('<div><span class="d">'+new Date().toTimeString().slice(0,8)+'</span> <span class="lv '+(level==="ERR"?"e":"i")+'">'+level+'</span> '+msg+'</div>');logs=logs.slice(0,14);$("log").innerHTML=logs.join("");}
function kick(){if(reduce)return;var n=$("name");n.classList.remove("kick");void n.offsetWidth;n.classList.add("kick");}

/* both relay nodes are hit every poll; the first good answer is shown, each node's latency is kept */
var lat={};
function poll(){var t0=performance.now();
 var reqs=NODES.map(function(n){var ac=window.AbortController?new AbortController():null;if(ac)setTimeout(function(){ac.abort();},12000);return fetch(n[1],{cache:"no-store",signal:ac?ac.signal:undefined}).then(function(r){var ms=Math.round(performance.now()-t0);lat[n[0]]=r.ok?ms:-1;if(!r.ok)throw 0;
  return r.json().then(function(j){j.__node=n[0];j.__ms=ms;j.__code=r.status;return j;});},function(e){lat[n[0]]=-1;throw e;});});
 return {first:Promise.any(reqs),all:Promise.allSettled(reqs)};}
var prev=null,peak=0,since=Date.now(),last=null;
function apply(j){
 var on=j.online|0;hist.push([Date.now(),on]);hist=hist.slice(-HIST);keep("ml-online-hist",hist);
 lath.push([Date.now(),j.__ms]);lath=lath.slice(-HIST);keep("ml-lat-hist",lath);
 peak=Math.max(peak,Math.max.apply(null,hist.map(function(p){return p[1];})));
 if(prev!=null){var d=on-prev;$("delta").innerHTML=d>0?'<span class="r">+'+d+'</span>':d<0?'<span class="r">'+d+'</span>':'<span class="d">0</span>';if(d!==0){kick();since=Date.now();}}
 else $("delta").innerHTML='<span class="d">0</span>';
 prev=on;setBig(on);$("peak").textContent=peak;last=j;render(j);
 $("host").textContent="relay ─ "+j.__node;$("code").textContent=j.__code+" · "+j.__ms+"ms";$("mode").textContent="LINK";$("mode").className="md";
 log("INF",'GET /api/probe/stats <span class="h">'+j.__code+'</span> <span class="ms">'+j.__ms+'ms '+j.__node+'</span> online=<span class="r">'+on+'</span> 1h='+j.active1h+' ready='+((j.full||{}).ready|0));}
/* 2026-11-21 one panel throwing (e.g. a negative size) used to abort render() and was reported as "failed on every
   node"; now each panel draws on its own and a broken one logs "ERR render <panel>" while the others keep updating */
var badPanels={};
function safe(name,fn){try{fn();if(badPanels[name]){delete badPanels[name];log("INF","render "+name+" ok again");}}catch(e){if(!badPanels[name])log("ERR","render "+esc(name)+": "+esc(String(e&&e.message||e).slice(0,80)));badPanels[name]=1;}}
function render(j){safe("spark",spark);safe("stats",function(){renderStats(j);});safe("seed",function(){renderSeed(j.seed);});safe("probe packs",function(){renderPacks(j);});
 safe("why",function(){renderSteps(j.steps,j);});safe("targets",function(){renderTop(j.top);});safe("now playing",function(){renderPlaying(j.playing);});
 safe("ext",function(){renderExt(j.ext);});safe("storage",function(){renderFullMore(j);});safe("quota",function(){renderQuota(j);});safe("online",function(){renderRow1(j);});
 var er=j.errors||{};Object.keys(er).forEach(function(k){log("ERR","server "+esc(k)+": "+esc(er[k]));});
 if(!j.ext)["acc","com","most","adp"].forEach(function(id){$(id).innerHTML='<div class="empty"><span class="r">-- aggregates unavailable</span>, retry in '+PERIOD+'s</div>';});}
function renderStats(j){
 var today=Math.max(j.today|0,1);
 meter($("b1"),j.active1h,today);$("v1").textContent=fmt(j.active1h);
 $("b2").innerHTML='<span class="d">1h/today '+(j.today?Math.round((j.active1h|0)/j.today*100):0)+'%</span>';$("v2").textContent=fmt(j.today);
 var f=j.full||{};
 $("b3").innerHTML='<span class="d">'+(f.games|0)+' with full dump</span>';$("v3").textContent=fmt(j.probedGames);
 $("v4").textContent=fmt(j.reporters);$("v5").textContent=j.probedGames?(j.reporters/j.probedGames).toFixed(2):"--";}
function renderPacks(j){var f=j.full||{};
 $("fReady").textContent=fmt(f.ready);$("fUp").textContent=fmt(f.uploading);$("fDone").textContent=fmt(f.done);
 meter($("bR2"),f.storedMB||0,f.limitMB||8192);$("vR2").textContent=((f.storedMB||0)/(f.limitMB||8192)*100).toFixed(1)+"%";
 $("fMB").innerHTML=mb(f.storedMB||0)+' <span class="d">/ '+mb(f.limitMB||8192)+'</span>';
 $("fAvg").textContent=f.ready?mb((f.storedMB||0)/f.ready):"--";$("fLast").textContent=ago(f.lastAt);}
/* THE SEED: games + versions, confirmed (verified / owner-ok) vs waiting for more players (skeleton / read) */
function renderSeed(s){var el=$("seed");
 if(!s||!s.sources||!s.sources.length){el.innerHTML='<div class="empty">-- counting The Seed/ (first count runs in the background)</div>';return;}
 var st=s.status||{},tot=Math.max(1,s.games|0),ok=s.confirmed|0,wait=s.waiting|0;
 var html='<div class="seed-top"><span class="seed-n">'+(s.games|0)+'</span><span class="seed-u">部游戏的 seed<br><b>'+(s.versions|0)+'</b> 个 exe 版本</span></div>'+
  '<div class="m m4 seed-ok"><span class="k">已确认</span><span class="bar" id="sdOk"></span><span class="v">'+ok+'</span><span class="pc">'+Math.round(ok/tot*100)+'%</span></div>'+
  '<div class="m m4"><span class="k">等更多人传火</span><span class="bar" id="sdWait"></span><span class="v">'+wait+'</span><span class="pc">'+Math.round(wait/tot*100)+'%</span></div>'+
  '<div class="chips gold">'+[["verified",st.verified],["owner-ok",st["owner-ok"]],["read",st.read],["skeleton",st.skeleton]].map(function(c){return '<span>'+c[0]+' <b>'+(c[1]|0)+'</b></span>';}).join("")+
  (s.other?'<span>other <b>'+s.other+'</b></span>':'')+'</div>'+
  '<div class="sub" style="margin-top:6px">已确认 = verified + owner-ok · 等传火 = read + skeleton</div>'+
  '<div class="sub">'+s.sources.map(function(x){return esc(x.source)+' '+x.games;}).join(" · ")+' · 更新 '+ago(s.at)+'</div>';
 el.innerHTML=html;meter($("sdOk"),ok,tot);meter($("sdWait"),wait,tot);}
function nodesLine(){$("node").innerHTML=NODES.map(function(n){var v=lat[n[0]];return n[0]+" "+(v==null?"--":v<0?'<span class="r">down</span>':v+"ms");}).join(" · ");
 var ok=NODES.filter(function(n){return lat[n[0]]>0;}).map(function(n){return lat[n[0]];});$("latT").textContent=ok.length?"latency "+Math.min.apply(null,ok)+"ms":"latency";}
function tick(){var p=poll();p.first.then(function(j){try{apply(j);}catch(e){log("ERR","render: "+esc(String(e&&e.message||e).slice(0,80)));}},function(){$("mode").textContent="DOWN";$("mode").className="md err";$("code").textContent="timeout";log("ERR","GET /api/probe/stats failed on every node · retry in "+PERIOD+"s");});p.all.then(nodesLine);}
addEventListener("resize",function(){drawLed(shown||"--");if(last)render(last);else spark();});

var LINES=[['$ ssh op@relay.megulit.com',''],['  authenticated · ed25519','ok'],['$ tmux attach -t megulit',''],['  attached','ok']];
function boot(){var b=$("boot"),tw=$("tw");if(reduce){b.className="off";start();return;}
 var li=0,ci=0,done="";(function step(){if(li>=LINES.length){setTimeout(function(){b.className="off";start();},180);return;}
  var t=LINES[li][0],cls=LINES[li][1];if(ci<=t.length){tw.innerHTML=done+'<div class="'+cls+'">'+esc(t.slice(0,ci))+'█</div>';ci++;setTimeout(step,ci===1?90:18);}
  else{done+='<div class="'+cls+'">'+esc(t)+'</div>';li++;ci=0;setTimeout(step,110);}})();}
function start(){var left=PERIOD;
 setInterval(function(){$("clock").textContent=new Date().toTimeString().slice(0,8);$("since").textContent=Math.floor((Date.now()-since)/1000)+"s";
  if(last)$("fLast").textContent=ago((last.full||{}).lastAt);
  if(--left<=0){left=PERIOD;tick();}$("count").textContent=left;},1000);
 setInterval(kick,6200);setBig("--");spark();log("INF","session attached");tick();}
boot();
</script>

</body>
</html>`;
