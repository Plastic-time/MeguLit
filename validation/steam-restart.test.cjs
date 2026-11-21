// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 (user: 石头门启动失败): a direct Steam start quit with 53 and Steam asked to confirm 'mages_sgate'. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const restart=require('../services/steam-restart.cjs'),{stamp}=restart._internal;

function steamWith(lines){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-steam-'));fs.mkdirSync(path.join(root,'logs'));
 fs.writeFileSync(path.join(root,'logs','console_log.txt'),lines.join('\r\n')+'\r\n');return root;}
/* The user's Steam console log of 2026-11-15 11:53, re-timed to now. */
function realLog(t,{answered=false}={}){const at=s=>'['+stamp(t+s*1000)+'] ';return [
 at(-600)+'GameAction [AppID 412830, ActionID 50] : LaunchApp waiting for user response to ShowGameArgs "mages_sgate"',
 at(0)+'ExecCommandLine: "E:\\Steam\\steam.exe steam://run/412830//mages_sgate"',
 at(0)+'ExecuteSteamURL: "steam://run/412830//mages_sgate"',
 at(0)+'GameAction [AppID 412830, ActionID 57] : LaunchApp changed task to ShowGameArgs with ""',
 at(0)+'GameAction [AppID 412830, ActionID 57] : LaunchApp waiting for user response to ShowGameArgs "mages_sgate"',
 at(1)+'ExecCommandLine: "E:\\Steam\\steam.exe steam://run/412830//"',
 at(1)+'GameAction [AppID 999999, ActionID 3] : LaunchApp waiting for user response to ShowEula ""',
 ...(answered?[at(5)+'GameAction [AppID 412830, ActionID 57] : LaunchApp continues with user response "ShowGameArgs"',
  at(5)+'GameAction [AppID 412830, ActionID 57] : LaunchApp changed task to CreatingProcess with ""',
  at(5)+'Game process added : AppID 412830 ""E:\\Steam\\steamapps\\common\\STEINS;GATE\\Launcher.exe" mages_sgate", ProcID 46268, IP 0.0.0.0:0']:[])];}

test('exit 53 is Steam taking over the start; other exits are not',()=>{
 assert.equal(restart.restarted({code:53,signal:null}),true);
 for(const exit of [null,{code:0},{code:1},{code:null,signal:'SIGTERM'}])assert.equal(restart.restarted(exit),false);
});
test('Steam waiting for the launch-argument confirmation is read from its console log',()=>{
 const t=Date.now();
 assert.equal(restart.pendingPrompt(steamWith(realLog(t)),'412830',t),'ShowGameArgs');
 assert.equal(restart.pendingPrompt(steamWith(realLog(t,{answered:true})),'412830',t),'');
 // older prompts and other games do not count
 assert.equal(restart.pendingPrompt(steamWith(realLog(t)),'412830',t+60000),'');
 assert.equal(restart.pendingPrompt(steamWith(realLog(t)),'999999',t),'ShowEula');
 assert.equal(restart.pendingPrompt('', '412830',t),'');assert.equal(restart.pendingPrompt(path.join(os.tmpdir(),'no-steam-here'),'412830',t),'');
});
test('companion start goes through the steam_appid.txt shadow; game folder untouched',()=>{
 const game=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sg-')),shadowRoot=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-shadow-'));
 fs.writeFileSync(path.join(game,'Game.exe'),'MZ game');fs.writeFileSync(path.join(game,'Launcher.exe'),'MZ\0WinExec\0Game.exe mages_sgate\0');fs.mkdirSync(path.join(game,'USRDIR'));
 const before=fs.readdirSync(game).sort();
 const sd=require('../core/text-paths-launch.cjs').steamDirect({exe:path.join(game,'Game.exe'),appid:'412830',shadowRoot});
 assert.ok(sd&&sd.shadow,'shadow made');assert.equal(fs.readFileSync(path.join(sd.shadow,'steam_appid.txt'),'utf8'),'412830');
 assert.equal(sd.env.SteamAppId,'412830');assert.deepEqual(fs.readdirSync(game).sort(),before);
 assert.deepEqual(require('../services/steam-companion.cjs').launchArgs(path.join(game,'Game.exe')),['mages_sgate']);
});
test('launch: companion uses the shadow, exit 53 waits for Steam instead of a locale retry, Steam prompts are named',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/let steamDirect=null;if\(steamApp&&!textPath&&\(companion\|\|part\|\|require\('\.\.\/core\/glyph-dots\.cjs'\)\.wanted\(root\)\)\)\{/);
 /* 2026-11-21 a part of the work in a subfolder (BALDR SKY Dive1) starts from the install root, and the wait follows the whole install tree */
 assert.match(src,/steamDirect\(\{exe:game\.executable,appid:steamAppid,base:part\?part\.root:null,trace\}\)/);
 assert.match(src,/const siblings=steamApp&&!textPath\?\(\(\)=>\{try\{return require\('\.\.\/core\/steam-owned\.cjs'\)\.installPrograms\(game\.executable\)/);
 const i=src.indexOf("if(error.message==='GAME_PROCESS_EXITED'&&steamApp&&restart.restarted(child.exit)){"),j=src.indexOf("trace('locale-fallback'");
 assert.ok(i>0&&j>i,'restart branch before the locale retry');
 assert.match(src.slice(i,j),/waitForVisibleGame\(anyProcess,\{helper:true,indirect:true,exit:\(\)=>null,trace,attempts:480,timeout:120000\}\)/);
 assert.match(src.slice(i,j),/Error\('STEAM_CONFIRM_ARGS'\)/);assert.match(src.slice(i,j),/\}else\{/);
 const feedback=fs.readFileSync(path.join(__dirname,'..','web','launch-feedback.js'),'utf8');
 assert.match(feedback,/STEAM_CONFIRM_ARGS:\['[^']*Continue/);assert.match(feedback,/STEAM_WAITING_USER:\[/);
});
