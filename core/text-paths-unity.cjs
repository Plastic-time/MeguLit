// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture ③, Unity path (docs/text-architecture.md). Unity games draw text from their own font atlases
   (TextMeshPro, uGUI), so Windows never sees a glyph. MeguLit loads a small BepInEx 5 plugin (native/unitytext,
   MeguLitUnityText.dll) that draws the dialogue component at alpha 0 and reports each character's box.
   The game folder is never touched: the game is started from a shadow folder that mirrors it (every folder a
   directory junction, every file a hard link, or a copy when the volume differs) and adds only UnityDoorstop
   (winhttp.dll + doorstop_config.ini) and BepInEx with the plugin, from the on-demand runtime pack "unity-text".
   Unity resolves <exe>_Data next to the program it was started as, so the shadow program loads the real data
   through the junction. BepInEx writes its config, cache and log inside the shadow folder only.
   IL2CPP games (GameAssembly.dll) get BepInEx 6 (IL2CPP build) and MeguLitUnityText.IL2CPP.dll from il2cpp-x64 / il2cpp-x86.
   A game that already ships its own BepInEx / doorstop is left alone (no mixing with someone else's mods). */
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {formatChars,parseChars}=require('./text-paths.cjs');

const OURS=new Set(['winhttp.dll','doorstop_config.ini','.doorstop_version','bepinex','dotnet','megulit-shadow.json','steam_appid.txt']);
function unityGame(exe){const dir=path.dirname(String(exe||'')),stem=path.basename(String(exe||''),path.extname(String(exe||'')));const data=path.join(dir,stem+'_Data');
 if(!fs.existsSync(data))return null;if(fs.existsSync(path.join(dir,'GameAssembly.dll')))return 'il2cpp';
 if(fs.existsSync(path.join(data,'Managed','Assembly-CSharp.dll'))||fs.existsSync(path.join(data,'Managed','UnityEngine.dll')))return 'mono';return null;}
function modded(exe){const dir=path.dirname(exe);return ['winhttp.dll','doorstop_config.ini','BepInEx','version.dll'].some(n=>fs.existsSync(path.join(dir,n)));}
/* PE machine: 0x14c x86, 0x8664 x64 */
function bits(exe){try{const fd=fs.openSync(exe,'r');try{const b=Buffer.alloc(4096);fs.readSync(fd,b,0,4096,0);const pe=b.readUInt32LE(0x3c);const m=b.readUInt16LE(pe+4);return m===0x8664?64:m===0x14c?32:0;}finally{fs.closeSync(fd);}}catch{return 0;}}

function linkFile(from,to,linkOnly=false){try{fs.linkSync(from,to);return "link";}catch(e){if(linkOnly)throw e;fs.copyFileSync(from,to);const s=fs.statSync(from);fs.utimesSync(to,s.atime,s.mtime);return "copy";}}
function linkDir(from,to){fs.symlinkSync(from,to,'junction');}
/* Mirror the game folder into shadow: every folder a junction, every file a hard link (a copy when the volume differs,
   unless linkOnly: then a failed link throws). Entries gone from the game are removed from the shadow (never anything
   inside a junction); names in OURS are left alone. */
function mirror(dir,shadow,{linkOnly=false,ours=OURS}={}){
 fs.mkdirSync(shadow,{recursive:true});
 /* entries that no longer exist in the game are removed from the shadow */
 const want=new Set(fs.readdirSync(dir).map(n=>n.toLowerCase()));
 /* never a recursive delete here: a junction removed that way would take the game's own files with it. A stale
    junction is removed as a link only (rmdir of the reparse point); a stale file is unlinked. */
 const stats={links:0,copies:0,junctions:0};
 const lst=p=>{try{return fs.lstatSync(p);}catch{return null;}};
 const drop=(p,t)=>{if(t.isSymbolicLink())fs.rmdirSync(p);else if(t.isFile())fs.unlinkSync(p);};
 for(const n of fs.readdirSync(shadow)){if(ours.has(n.toLowerCase())||want.has(n.toLowerCase()))continue;const p=path.join(shadow,n),t=lst(p);if(t)drop(p,t);}
 for(const n of fs.readdirSync(dir)){if(ours.has(n.toLowerCase()))continue;const from=path.join(dir,n),to=path.join(shadow,n),st=fs.statSync(from),t=lst(to);
  if(t){if(st.isDirectory()&&t.isSymbolicLink())continue;if(st.isFile()&&t.isFile()&&t.size===st.size&&Math.floor(t.mtimeMs/1000)===Math.floor(st.mtimeMs/1000))continue;if(t.isSymbolicLink()||t.isFile())drop(to,t);else continue;}
  if(st.isDirectory()){linkDir(from,to);stats.junctions++;}else if(st.isFile()){linkFile(from,to,linkOnly)==='link'?stats.links++:stats.copies++;}}
 return stats;
}
/* (Re)build the shadow folder for one game. pack: the unpacked "unity-text" pack folder holding x86\ and x64\
   (each: winhttp.dll, doorstop_config.ini, BepInEx\core\...) and MeguLitUnityText.dll. Returns the shadow program. */
function makeShadow({exe,shadowRoot,pack,port,steamAppId=null}){
 const dir=path.dirname(exe),b=bits(exe),kind=unityGame(exe),arch=b===64?'x64':b===32?'x86':null;if(!arch)throw Error('UNITY_BITS');
 if(!kind)throw Error('UNITY_NOT_UNITY');
 /* IL2CPP: BepInEx 6 (IL2CPP build, own .NET runtime, interop assemblies generated on the first start inside the shadow) */
 const flavour=kind==='il2cpp'?'il2cpp-'+arch:arch,pluginFile=kind==='il2cpp'?'MeguLitUnityText.IL2CPP.dll':'MeguLitUnityText.dll';
 if(!fs.existsSync(path.join(pack,flavour))||!fs.existsSync(path.join(pack,pluginFile)))throw Error('UNITY_PACK_MISSING '+flavour);if(modded(exe))throw Error('UNITY_ALREADY_MODDED');
 const key=path.basename(exe).replace(/[^A-Za-z0-9._-]/g,'_')+'-'+fs.statSync(exe).size,shadow=path.join(shadowRoot,key);
 const stats=mirror(dir,shadow);
 /* ours: doorstop + BepInEx (real files in the shadow) */
 const src=path.join(pack,flavour);
 for(const f of ['winhttp.dll','doorstop_config.ini'])fs.copyFileSync(path.join(src,f),path.join(shadow,f));
 fs.cpSync(path.join(src,'BepInEx'),path.join(shadow,'BepInEx'),{recursive:true}); if(fs.existsSync(path.join(src,'dotnet')))fs.cpSync(path.join(src,'dotnet'),path.join(shadow,'dotnet'),{recursive:true});
 const plugins=path.join(shadow,'BepInEx','plugins','MeguLit');fs.mkdirSync(plugins,{recursive:true});
 fs.copyFileSync(path.join(pack,pluginFile),path.join(plugins,pluginFile));
 fs.writeFileSync(path.join(plugins,'MeguLitUnityText.port'),String(port));
 /* quiet BepInEx: no console window, no log file growth beyond the default */
 const cfgDir=path.join(shadow,'BepInEx','config');fs.mkdirSync(cfgDir,{recursive:true});const cfg=path.join(cfgDir,'BepInEx.cfg');
 if(!fs.existsSync(cfg))fs.writeFileSync(cfg,'[Logging.Console]\nEnabled = false\n\n[Logging.Disk]\nEnabled = true\n');
 /* a Steam game started from the shadow must not be restarted by Steam from its real folder (SteamAPI_RestartAppIfNecessary):
    steam_appid.txt in the shadow (and SteamAppId in the start environment, services/bridge.cjs) keep it here */
 if(/^\d+$/.test(String(steamAppId||'')))fs.writeFileSync(path.join(shadow,'steam_appid.txt'),String(steamAppId));
 fs.writeFileSync(path.join(shadow,'megulit-shadow.json'),JSON.stringify({game:dir,exe:path.basename(exe),flavour,at:Date.now(),...stats}));
 return {exe:path.join(shadow,path.basename(exe)),shadow,flavour,...stats};
}

/* The plugin's control socket: MeguLit listens on loopback, the plugin connects (Unity's Mono has no reliable named
   pipes on Windows). Lines in: ToMe_CHARS / ToMe_UNITY status. Lines out: HIDE 0|1, WANT <text>,
   and for engine-draw (docs/engine-draw-protocol.md): DRAW roles= embed= zh=, EMB <sentence> TAB <ruby> TAB <Chinese>; in: ToMe_UNITY ask <sentence>. */
class UnityTextPath{
 constructor({onChars=()=>{},onStatus=()=>{},onAsk=()=>{},onSource=()=>{},canary=null}={}){Object.assign(this,{onChars,onStatus,onAsk,onSource,canary});this.sock=null;this.on=false;this.wanted='';this.armed=false;this.drawCfg=null;this.embeds=new Map();this.kemco=new(require('./unity-kemco-source.cjs').UnityKemcoSource)({onSource:m=>this.onSource(m)});}
 listen(){return new Promise((resolve,reject)=>{this.server=net.createServer(s=>this.accept(s));this.server.on('error',reject);this.server.listen(0,'127.0.0.1',()=>resolve(this.server.address().port));});}
 negotiateKemco(){try{this.kemco?.configure(!this.stopped&&this.drawCfg?.kemcoSprites===true,{force:true});}catch{try{this.onStatus('kemco source negotiation unavailable');}catch{}}}
 accept(s){if(this.stopped){s.destroy();return;}if(this.sock)this.sock.destroy();this.sock=s;this.negotiateKemco();s.setEncoding('utf8');s.setNoDelay(true);let buf='';
  s.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).replace(/\r$/,'');buf=buf.slice(i+1);this.line(line);}if(buf.length>200000)buf='';});
  s.on('close',()=>{if(this.sock===s){this.sock=null;this.negotiateKemco();}});s.on('error',()=>{});this.push(true);}
 line(l){if(this.stopped)return;if(this.kemco?.accept(l))return;if(l.startsWith('ToMe_UNITY status ')){this.onStatus(l.slice(18));return;}
  if(l.startsWith('ToMe_UNITY ask ')){const k=l.slice(15).trim();if(k)this.onAsk({key:k,text:k,engine:'unity'});return;}
  const r=parseChars(l);if(!r||r.engine!=='unity')return;
  if(r.hidden&&this.canary){if(!this.armed){this.canary.arm('unity');this.armed=true;}else this.canary.alive('unity');}
  this.onChars(l);}
 push(reset=false){if(this.stopped||!this.sock)return;const controls=this.drawCfg&&(!this.drawCfg.kemcoSprites||reset)?this.drawLine()+(this.kemco?.command()||''):'';this.sock.write('WANT '+this.wanted.replace(/\r?\n/g,'\x1f')+'\nHIDE '+(this.on?1:0)+'\n'+controls+[...this.embeds.values()].join(''));}
 drawLine(){const c=this.drawCfg;return 'DRAW roles='+(c.roles?1:0)+' embed='+(c.embed?1:0)+' zh='+(c.zh?1:0)+(c.kemcoSprites?' kemcoSprites=1':'')+'\n';}
 /* engine-draw: the switches, and one sentence's replacement (kept for a reconnect, newest 64) */
 drawConfig(cfg){if(this.stopped)return;const c={roles:cfg?.roles===true,embed:cfg?.embed===true,zh:cfg?.zh!==false,kemcoSprites:cfg?.kemcoSprites===true};if(JSON.stringify(c)===JSON.stringify(this.drawCfg))return;this.drawCfg=c;if(this.kemco)UnityTextPath.prototype.negotiateKemco.call(this);if(this.sock){this.sock.write(this.drawLine());const command=this.kemco?.command();if(command)this.sock.write(command);}}
 blockSource(message,owner){return this.kemco.block(message,owner);}
 drawEmbed(key,o={}){if(this.stopped)return;const {krkrControlText}=require('./engine-draw.cjs');const body=krkrControlText({roles:false,embed:true,zh:true},new Map([[String(key||''),{ruby:o.ruby||[],zh:o.zh||''}]])).split('\r\n')[1]||'';if(!body)return;
  const l='EMB '+body+'\n';this.embeds.delete(key);this.embeds.set(key,l);while(this.embeds.size>64)this.embeds.delete(this.embeds.keys().next().value);if(this.sock)this.sock.write(l);}
 hide(on){if(this.stopped)return;this.on=!!on;if(this.on&&this.canary&&!this.canary.allowed('unity')){this.on=false;this.onStatus('unity invisible drawing off for this game (crash canary)');}this.push();}
 want(text){if(this.stopped)return;this.wanted=String(text||'');this.push();}
 exited(code){if(this.canary&&this.armed)this.canary.exited('unity',code);}
 stop(){if(this.stopping)return this.stopping;this.stopped=true;this.kemco.configure(false);this.on=false;this.drawCfg={roles:false,embed:false,zh:false};this.embeds.clear();const s=this.sock,server=this.server;this.stopping=new Promise((resolve,reject)=>{let timer;const finish=error=>{clearTimeout(timer);if(error)reject(error);else resolve();};timer=setTimeout(()=>{s?.destroy();finish(Error('READER_STOP_INCOMPLETE'));},2000);const close=()=>{if(!server?.listening){finish();return;}server.close(error=>finish(error));};if(s&&!s.destroyed){s.once('close',close);s.end('HIDE 0\nDRAW roles=0 embed=0 zh=0\n');}else close();});this.stopping.catch(()=>{});return this.stopping;}
}

module.exports={unityGame,modded,bits,mirror,makeShadow,UnityTextPath,formatChars};
