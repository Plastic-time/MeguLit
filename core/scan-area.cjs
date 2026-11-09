// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E331 automatic scan area (user 2026-11-10: "扫描区自动跟随窗口大小和位置实时调整 兼容全屏游戏"). The scan area (where the
// wait marker, original-text mask and hook check look) used to be four numbers the user set by hand. With scanAuto (the
// default) it follows the reader text box instead: both are percentages of the game window, so moving, resizing or going
// full screen moves it too. Full-screen text-page games (the flow-page list) scan the whole window, because their wait
// marker walks down the page and jumps back to the top on a new page.
const flowExe=name=>require('./hook-native.cjs').FLOW_PAGE_EXES.test(String(name||''));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;

function area(p={},flow=flowExe(p.gameProcess)){
 if(p.scanAuto===false)return {scanX:num(p.scanX,2),scanY:num(p.scanY,60),scanWidth:num(p.scanWidth,96),scanHeight:num(p.scanHeight,38)};
 if(flow)return {scanX:0,scanY:0,scanWidth:100,scanHeight:100};
 // The text box with a margin: a little to each side, more above (name plates sit over the box), down to the bottom.
 const x=num(p.x,4),y=num(p.y,70),w=num(p.width,92),h=num(p.height,27);
 const scanX=clamp(Math.round(x-2),0,95),scanY=clamp(Math.round(y-10),0,95);
 return {scanX,scanY,scanWidth:clamp(Math.round(x+w+2)-scanX,5,100-scanX),scanHeight:clamp(Math.min(100,Math.round(y+h+2))-scanY,5,100-scanY)};
}
const apply=(p,flow)=>({...p,...area(p,flow)});
module.exports={area,apply};
