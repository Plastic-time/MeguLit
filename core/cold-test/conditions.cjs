// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 闲时冷测试，默认开) when the idle-time cold test may start, and when it has to stop at once.
   Pure: the readings come from native/ColdDesk.exe status (idle ms from GetLastInputInfo, AC / battery from
   GetSystemPowerStatus, full screen from SHQueryUserNotificationState, CPU load over one second) and from the service
   (a game MeguLit has bound, a library game running, today's budget). docs/cold-test.md */

const DEFAULTS=Object.freeze({
 idleMinutes:10,        /* no keyboard or mouse input for this long */
 cpuBusy:.35,           /* whole-machine CPU load above this = busy */
 perGameMinutes:6,      /* one game never runs longer */
 dailyMinutes:30,       /* all cold tests of one day together */
 dailyGames:4,          /* games per day */
 minFreeMb:2048         /* free space on the MeguLit drive for the save snapshots */
});

const REASONS=Object.freeze({
 off:'冷测试已关闭',
 notWindows:'只在 Windows 上运行',
 noHelper:'缺少 ColdDesk 组件',
 active:'电脑还在使用中',
 battery:'笔记本在用电池',
 fullscreen:'有全屏应用或游戏在前台',
 gameRunning:'有游戏正在运行',
 busy:'CPU 正忙',
 dailyTime:'今天的冷测试时长已用完',
 dailyGames:'今天测的游戏数已到上限',
 disk:'磁盘空间不足',
 running:'已有一部游戏在冷测试',
 unknown:'读不到电脑状态'
});

function config(over={}){const c={...DEFAULTS};for(const [k,v] of Object.entries(over||{}))if(k in DEFAULTS&&Number.isFinite(+v)&&+v>=0)c[k]=+v;return c;}

/* reading: {idleMs, ac:true|false|null (null = no battery, a desktop), fullscreen, gameRunning, cpu (0..1), freeMb}
   today: {ms, games}; -> {ok, reason, why} (reason: a REASONS key) */
function check(reading,{cfg=DEFAULTS,today={ms:0,games:0},enabled=true,helper=true,platform=process.platform,busy=false}={}){
 const no=reason=>({ok:false,reason,why:REASONS[reason]});
 if(!enabled)return no('off');
 if(platform!=='win32')return no('notWindows');
 if(!helper)return no('noHelper');
 if(busy)return no('running');
 const r=reading||{};
 if(!Number.isFinite(r.idleMs))return no('unknown');
 if(r.idleMs<cfg.idleMinutes*60000)return no('active');
 if(r.ac===false)return no('battery');
 if(r.fullscreen===true)return no('fullscreen');
 if(r.gameRunning===true)return no('gameRunning');
 if(Number.isFinite(r.cpu)&&r.cpu>cfg.cpuBusy)return no('busy');
 if(Number.isFinite(r.freeMb)&&r.freeMb<cfg.minFreeMb)return no('disk');
 if((today.ms||0)>=cfg.dailyMinutes*60000)return no('dailyTime');
 if((today.games||0)>=cfg.dailyGames)return no('dailyGames');
 return {ok:true,reason:'',why:''};}

/* the time one game may take: the per-game cap, never past what is left of today's budget */
function budgetMs(cfg=DEFAULTS,today={ms:0}){return Math.max(0,Math.min(cfg.perGameMinutes*60000,cfg.dailyMinutes*60000-(today.ms||0)));}

/* while a game runs: anything here ends it at once (the user came back, unplugged, started something full screen) */
function mustStop(event){if(!event)return '';
 if(event.type==='input')return 'input';
 if(event.type==='power'&&event.ac===false)return 'battery';
 if(event.type==='fullscreen'&&event.on===true)return 'fullscreen';
 return '';}

/* the local day a time belongs to (the daily budget resets at local midnight) */
const dayOf=(t=Date.now())=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

module.exports={DEFAULTS,REASONS,config,check,budgetMs,mustStop,dayOf};
