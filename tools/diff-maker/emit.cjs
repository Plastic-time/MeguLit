// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: the products of one probe, all unsigned drafts (signing: tools/sign-profile.cjs; the shipped format, the relay
   and client loading are diff-layers', docs/diff-layers.md). Owner 2026-11-21 (传火不能只靠 exe 哈希): two core/game-diff.cjs documents
     version layer  version-<exeSha256>.json   layer 'version', key = the exe SHA-256, prints exe/head/pe (core/game-print.cjs); only
                                               the keys domains.cjs puts in layer 'version'; no mode (the game layer decides)
     game layer     game-<gameKey>.json        layer 'game', key = the game identity (relay gidFor: SHA-256('game|'+kind+':'+print)
                                               of the strongest of pack / script / steam / vndb / title), prints = those game prints:
                                               every exe build of the work gets it; every other key (layout, effects, choices, hide)
     line data      lines-<gameKey>.json       engine-draw replacements [{k, ruby:[[start,len,reading]], zh}] (game layer: by script)
     fixture        validation/fixtures/games/<gameKey>/probe-<sha8>.{version.json,game.json,lines.json,replay.json,case.cjs,report.md}
     report.md / report.json
   A measured value that does not look like a measurement (suspect()) stays out of the settings and goes to the report. */
const fs=require('node:fs'),path=require('node:path');
const {METRICS,REASONS}=require('../../core/self-check.cjs');
const GameDiff=require('../../core/game-diff.cjs'),Domains=require('../../core/profiles/domains.cjs'),GP=require('../../core/game-print.cjs');
const TOOL='diff-maker/5';
const ROLE_ZH={line:'台词',name:'名字',choice:'选项',button:'按钮',menu:'菜单',system:'系统'},KIND_ZH={dialogue:'台词（替换）',ui:'UI（旁注）',system:'系统（旁注）'};

const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function deepMerge(a,b){const out={...a};for(const [k,v] of Object.entries(b||{}))out[k]=plain(v)&&plain(out[k])?deepMerge(out[k],v):v;return out;}
function cleanOrThrow(settings,what){const c=Domains.clean(settings);if(c.rejected.length)throw new Error(what+' uses keys or values outside core/profiles/domains.cjs: '+c.rejected.join(', '));return c.value;}

/* measured values that do not look like a measurement -> [{key, value, why}] (kept out of the settings, listed in the report).
   calibrate.textBox is the union of the engine's first-glyph boxes (where dialogue lines start): one glyph box only, taller than
   45 % of the client, starting in the top 15 % of the client or leaving the client was not measured on dialogue */
function suspect(measured){const out=[];const b=measured?.calibrate?.textBox;
 if(b&&Array.isArray(b.client)){const [cw,ch]=b.client,why=[];
  if(b.w<=64&&b.h<=64)why.push('只有一个字框（'+b.w+'x'+b.h+'），不是整段的样本');if(b.h>0.45*ch)why.push('高 '+b.h+' 超过客户区 45%');if(b.y<0.15*ch)why.push('顶部 y='+b.y+' 贴顶');
  if(b.x+b.w>cw*1.02||b.y+b.h>ch*1.02)why.push('超出客户区');
  if(why.length)out.push({key:'calibrate.textBox',value:b,why:why.join('，')});}
 return out;}
function withoutSuspect(measured,list){const m=JSON.parse(JSON.stringify(measured||{}));for(const {key} of list){const p=key.split('.');let o=m;for(const k of p.slice(0,-1))o=o?.[k];if(o)delete o[p.at(-1)];}return m;}

const pick=(prints,kinds)=>Object.fromEntries(Object.entries(prints||{}).filter(([k])=>kinds.includes(k)));
/* the version and game documents of settings (the version one gets only version-layer keys, the game one only game keys) */
function docs({prints,exeSha,exeName,engine,mode,settings,gid}){
 const all=cleanOrThrow(settings,'the draft');const {version:v}=Domains.split(all);
 const version=GameDiff.build({key:exeSha,layer:'version',prints:pick(prints,GP.VERSION_KINDS),source:'official',settings:v,exe:exeName,engine,app:TOOL,issuedAt:''});
 if(!gid)throw new Error('no game print (pack / script / steam / vndb / title): the game layer has no identity');
 const game=GameDiff.build({key:gid,layer:'game',prints:pick(prints,GP.GAME_KINDS),source:'official',mode,settings:all,engine,app:TOOL,issuedAt:''});
 for(const [n,d] of [['version',version],['game',game]]){const r=GameDiff.validate(d);if(!r.ok)throw new Error(n+' draft invalid: '+r.error+(r.rejected?' '+r.rejected.join(','):''));}
 return {version,game};}

/* -> {version, game, covers, knownExe, suspect} */
function diffsOf(probe,key,result,gameFile){const measured=require('./search.cjs').settingsOf(result);const sus=suspect(measured);
 const all=deepMerge(JSON.parse(JSON.stringify(gameFile?.settings||{})),withoutSuspect(measured,sus));const mode=result.best.params.hideMethod==='read'?'read':'hide';
 const d=docs({prints:probe.prints,exeSha:probe.exe.sha256,exeName:probe.exe.name,engine:probe.engine,mode,settings:all,gid:require('./probe.cjs').gameId(probe.prints)});
 return {...d,covers:probe.versions.map(x=>({exe:x.exe,sha256:x.sha256,probed:x.probed})),knownExe:(gameFile?.match?.exe||[]).map(String),suspect:sus};}

/* pairing data per language pair (owner: 汉化/翻译配对按 源语言→目标语言 区分): one file per pair, source = the game's text, target = the
   translation's language (BCP 47); a game can have several (ja->zh-Hans, en->zh-Hans, en->ja) */
function linesOf(probe,key,entries,gid,{source=(probe.manifest?.sourceLang||'ja'),target=(probe.manifest?.targetLang||'zh-Hans')}={}){return {schema:'megulit.lines',version:1,key:gid||require('./probe.cjs').gameId(probe.prints),source,target,script:probe.game.script,lines:entries};}

function replayOf(probe,key,rep,result,name){return {schema:1,tool:TOOL,gameKey:key,exeSha256:probe.exe.sha256,engine:probe.engine,title:probe.title,
 version:name+'.version.json',game:name+'.game.json',lines:name+'.lines.json',
 events:rep.events,records:rep.records.map(r=>({at:r.at,raw:r.raw})),
 expect:{params:result.best.params,pass:result.best.pass,over:result.best.over,metrics:result.best.metrics,
  hideBest:result.hideBest&&{params:result.hideBest.params,pass:result.hideBest.pass,over:result.hideBest.over},
  draw:result.draw.roles.map(r=>({role:r.role,kind:r.kind,records:r.records,unique:r.unique,emb:r.emb,hidden:r.hidden,boxOnly:r.boxOnly,violations:r.violations})),
  items:result.draw.items.length,scriptPair:result.scriptPair}};}

const CASE=name=>`// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* generated by tools/diff-maker: replays ${name}.replay.json with ${name}.diff.json and checks the self-check verdict, every
   metric (version layer over game layer), the engine-draw roles of every record and the line replacement data. Regenerate: node tools/diff-maker/index.cjs <probe> --write-repo */
module.exports=ctx=>require('../../../helpers/diff-replay.cjs')(ctx,'${name}');
`;

const f3=v=>v==null?'-':typeof v==='number'?String(Math.round(v*1000)/1000):String(v);
function report(probe,key,result,diffs,profile,lines){const diff={settings:deepMerge(diffs.game.settings,diffs.version.settings)};const t=result.thresholds,b=result.best,look=[];
 const limit={hideVisible:'≤ '+t.hideVisible,dropRate:'≤ '+t.dropRate,repeatRate:'≤ '+t.repeatRate,choiceMismatch:'≤ '+t.choiceMismatch,positionPx:'≤ max('+t.positionPx+', '+t.positionGlyphs+'×字高)',pairRate:'≥ '+t.pairRate};
 const hb=result.hideBest;
 const rows=METRICS.map(k=>{const v=b.metrics[k],hv=hb?.metrics?.[k];const st=b.over.includes(k)?'超线':v==null?'无样本':'过';if(v==null&&b.params.hideMethod==='hide')look.push('指标 '+k+' 没有样本（'+REASONS[k]+'），回放证明不了它');
  return '| '+k+' | '+f3(v)+' | '+f3(hv)+(hb?.over?.includes(k)?' 超线':'')+' | '+limit[k]+' | '+st+' |';});
 if(b.params.hideMethod==='read')look.push('没有隐藏组合过线，差分为读模式（原文留着、只显示译文）。超线：'+(hb?.over||[]).map(k=>k+'（'+REASONS[k]+'）').join('；'));
 const keyRows=Object.entries(result.perKey).map(([k,vals])=>'| '+k+' | '+Object.entries(vals).map(([v,r])=>v+'：'+(r.pass?'过':'不过')+' cost '+f3(r.cost)+(r.over.length?' ('+r.over.join(',')+')':'')).join('；')+' |');
 const d=result.draw;
 if(!d.roles.length)look.push('运行时样本里没有 engine-draw 记录（ToMe_CHARS role=…）：旧版探针，或这个引擎差分还没开 draw.roles；画字角色要等新探针');
 const roleRows=d.roles.map(r=>{const s=r.script,n=s.dialogue+s.choice+s.ui+s.none;
  if(r.violations)look.push(r.violations+' 条 role='+r.role+' 记录被隐藏或带 emb（只有 line 可以替换/隐藏）：引擎差分的上报有错');
  if(r.role==='line'&&n&&s.choice+s.ui>n*0.3)look.push('role=line 的 '+(s.choice+s.ui)+' 段文字在剧本里是选项/UI 用语：引擎差分可能把选项当台词报了');
  if(r.kind==='ui'&&n&&s.dialogue>n*0.3)look.push('role='+r.role+' 的 '+s.dialogue+' 段文字在剧本里是台词：引擎差分可能把台词当 UI 报了');
  return '| '+r.role+' | '+KIND_ZH[r.kind]+' | '+r.records+' | '+r.unique+' | '+r.emb[0]+'/'+r.emb[1]+'/'+r.emb[2]+' | '+r.hidden+' | '+r.boxOnly+' | '+r.violations+' | '+(n?`台词${s.dialogue} 选项${s.choice} UI${s.ui} 无${s.none}`:'-')+' | '+r.texts.slice(0,3).map(x=>x.replace(/\|/g,'¦')).join(' / ')+' |';});
 for(const x of diffs.suspect||[])look.push('可疑量测值没写进差分：'+x.key+' '+JSON.stringify(x.value)+'（'+x.why+'）');
 if(!probe.game.archive&&!probe.game.script)look.push('游戏层没有主封包哈希也没有剧本指纹，只能按 Steam/VNDB/标题认：探针需带封包 sha256 或剧本');
 const sp=result.scriptPair;if(!sp)look.push('探针没带剧本（scripts/），台词配对没法离线核对');else if(sp.rate<0.8)look.push('阅读层画出的台词只有 '+Math.round(sp.rate*100)+'% 能在剧本里找到（'+sp.found+'/'+sp.lines+'）：可能是 OCR 句或特效帧');
 if(!lines.length)look.push('没有台词替换数据：探针剧本没带游戏 ruby，也没有汉化补丁译文（scripts/patch.json），内嵌替换只能等在线翻译');
 const withRuby=lines.filter(l=>l.ruby.length).length,withZh=lines.filter(l=>l.zh).length;
 const md=['# 差分草稿报告：'+(probe.title||key),'',
  '- 游戏 key：`'+key+'`'+(profile.layers.includes('game')?'（已有手写游戏差分 core/profiles/games/'+key+'.cjs，草稿已并入其设置）':''),
  '- exe：`'+probe.exe.name+'` SHA-256 `'+probe.exe.sha256+'`（整个文件，显示 `'+probe.exe.sha256.slice(0,8)+'`）',
  '- 引擎：`'+probe.engine+'`（'+probe.engineWhy.join('；')+'）',
  '- 回放：'+result.lines+' 句台词行，'+result.windowCount+' 个自检窗口，'+d.roles.reduce((a,r)=>a+r.records,0)+' 条 engine-draw 记录',
  '- 结论：**'+(b.params.hideMethod==='read'?'读模式':'隐藏重画')+'**，参数 `'+JSON.stringify(b.params)+'`，cost '+f3(b.cost),
  '- 草稿未签名：签名用 tools/game-diff.cjs sign，下发格式和目录归 diff-layers','',
  '## 两层','','- 版本层 `version-'+probe.exe.sha256+'.json`（key `'+probe.exe.sha256.slice(0,8)+'…`，指纹 '+Object.keys(diffs.version.prints||{}).join('/')+'）：'+(Object.keys(diffs.version.settings).length?'`'+JSON.stringify(diffs.version.settings)+'`':'这个 exe 没有版本层的键'),
  '- 游戏层 `game-'+key+'.json`（key `'+diffs.game.key.slice(0,8)+'…`，指纹 '+Object.keys(diffs.game.prints||{}).join('/')+'）：按 '+[probe.game.archive&&'主封包 `'+probe.game.archive.path+'` `'+probe.game.archive.sha256.slice(0,8)+'`',probe.game.script&&'剧本指纹 `'+probe.game.script.slice(0,8)+'`',probe.game.steamAppId&&'Steam '+probe.game.steamAppId,probe.game.vndb&&'VNDB '+probe.game.vndb,probe.game.title&&'标题「'+probe.game.title+'」'].filter(Boolean).join('、')+' 认',
  '- 游戏层覆盖的已知版本：'+diffs.covers.map(c=>'`'+c.exe+'` `'+c.sha256.slice(0,8)+'`'+(c.probed?'（本探针）':'（同目录，未实测）')).join('；')+(diffs.knownExe.length?'；手写游戏差分登记的程序名：'+diffs.knownExe.join('、'):''),'',
  '## 自检指标（每个窗口取最差值）','','| 指标 | 选中方案 | 最好的隐藏方案 | 阈值 | 状态 |','|---|---|---|---|---|',...rows,'',
  '## 可调键离线搜索','','| 键 | 各取值的最好结果 |','|---|---|',...keyRows,'| textBox | '+(result.textBox?JSON.stringify(result.textBox):'无引擎字框样本')+' |','',
  '## 绘制角色（engine-draw 上报）','',d.roles.length?['| role | 处理 | 记录 | 去重后 | emb 0/1/2 | 隐藏 | 只有 box | 违规 | 剧本归属 | 样例 |','|---|---|---|---|---|---|---|---|---|---|',...roleRows].join('\n'):'没有记录','',
  'UI 项（按 role、id、文字去重）：'+d.items.length+' 个','',
  '## 剧本配对','',sp?'阅读层画出的 '+sp.lines+' 句里 '+sp.found+' 句在剧本里（'+Math.round(sp.rate*100)+'%）':'探针没带剧本','',
  '## 台词替换数据','',lines.length+' 句（带游戏 ruby '+withRuby+'，带译文 '+withZh+'）','',
  '## 需要人看','',...(look.length?[...new Set(look)].map(x=>'- '+x):['- 无']),'',
  '## 差分草稿 settings','','```json',JSON.stringify(diff.settings,null,1),'```',''].join('\n');
 return {md,look:[...new Set(look)]};}

function writeJson(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,1)+'\n');}
module.exports={deepMerge,suspect,withoutSuspect,docs,diffsOf,linesOf,replayOf,report,CASE,writeJson,TOOL,ROLE_ZH};
