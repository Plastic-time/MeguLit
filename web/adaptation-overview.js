// SPDX-License-Identifier: GPL-3.0-or-later
/* E362 adaptation overview: every library game with reading / embed / zero-latency states, engine and last evidence.
   Filter and sort locally; clicking a row opens the game page; each row can build a diagnostic package. */
import {embedStatus} from './embed-status.js';
import {openDiagnostics,diagnosticsLabel} from './diagnostics-ui.js';
const T={
 zh:{button:'适配总览',kicker:'游戏库',title:'适配总览',hint:'每个游戏能不能读到文字、能不能内嵌、零延迟翻译是否就绪，以及最近一次的实测记录',search:'搜索游戏或引擎',all:'全部',sort:'排序',sorts:{seen:'最近记录',title:'名称',engine:'引擎',state:'状态'},cols:{game:'游戏',reading:'读取',embed:'内嵌',zero:'零延迟',seen:'最近记录'},reading:{reads:'能读取',['no-text']:'启动过但没读到',untested:'未启动过'},zero:{patch:'汉化就绪',machine:'提前机翻',['needs-japanese']:'需日文原版',preparing:'读取中',none:'暂不支持',unknown:'未检测'},filters:{problems:'有问题',reads:'能读取',['no-text']:'没读到',untested:'未测试',verified:'内嵌已验证',readonly:'只能读取',hidden:'含隐藏'},never:'从未',empty:'没有符合条件的游戏',failed:'总览加载失败',close:'关闭',diag:'诊断包',hiddenTag:'已隐藏',missing:'程序不存在',launch:'最近启动',stream:'文本流',chars:'已读字数',evidence:'依据'},
 ja:{button:'対応状況一覧',kicker:'ライブラリ',title:'対応状況一覧',hint:'各ゲームで文字を読めるか、埋め込めるか、ゼロ遅延翻訳の準備ができているか、最後の実測記録',search:'ゲーム名やエンジンで検索',all:'すべて',sort:'並べ替え',sorts:{seen:'最近の記録',title:'名前',engine:'エンジン',state:'状態'},cols:{game:'ゲーム',reading:'読み取り',embed:'埋め込み',zero:'ゼロ遅延',seen:'最近の記録'},reading:{reads:'読み取り可',['no-text']:'起動したが未取得',untested:'未起動'},zero:{patch:'翻訳あり',machine:'先行機械翻訳',['needs-japanese']:'日本語版が必要',preparing:'読み取り中',none:'未対応',unknown:'未確認'},filters:{problems:'問題あり',reads:'読み取り可',['no-text']:'未取得',untested:'未テスト',verified:'埋め込み確認済み',readonly:'読み取りのみ',hidden:'非表示も含む'},never:'なし',empty:'条件に合うゲームはありません',failed:'一覧を読み込めませんでした',close:'閉じる',diag:'診断',hiddenTag:'非表示',missing:'実行ファイルなし',launch:'最近の起動',stream:'テキストストリーム',chars:'読んだ文字数',evidence:'根拠'},
 en:{button:'Adaptation overview',kicker:'Library',title:'Adaptation overview',hint:'For each game: can its text be read, can it be embedded, is zero-latency translation ready, and the latest evidence',search:'Search games or engines',all:'All',sort:'Sort',sorts:{seen:'Latest evidence',title:'Title',engine:'Engine',state:'State'},cols:{game:'Game',reading:'Reading',embed:'Embed',zero:'Zero-latency',seen:'Last seen'},reading:{reads:'Reads text',['no-text']:'Launched, no text',untested:'Never launched'},zero:{patch:'Translation ready',machine:'Machine ahead',['needs-japanese']:'Needs Japanese build',preparing:'Reading script',none:'Not supported',unknown:'Not checked'},filters:{problems:'Problems',reads:'Reads text',['no-text']:'No text',untested:'Untested',verified:'Embed verified',readonly:'Read only',hidden:'Include hidden'},never:'never',empty:'No games match',failed:'Could not load the overview',close:'Close',diag:'Diagnostics',hiddenTag:'Hidden',missing:'Program missing',launch:'Last launch',stream:'Text stream',chars:'Characters read',evidence:'Evidence'}};
export const overviewLabel=locale=>(T[locale]||T.en).button;
const tone={reads:'ok','no-text':'bad',untested:'wait',verified:'ok',supported:'ok',pending:'wait',readonly:'bad',unsupported:'bad',unknown:'wait',patch:'ok',machine:'ok','needs-japanese':'bad',preparing:'wait',none:'bad'};
const rank={bad:0,wait:1,ok:2};
export async function openAdaptationOverview({api,locale,esc,toast,relativeTime,onOpenGame}){
 const t=T[locale]||T.en,dialog=document.createElement('dialog');dialog.className='game-dialog adapt-dialog';
 let rows=[],filter='all',sort='seen',query='',hidden=false;
 dialog.innerHTML=`<div class="game-dialog-head"><span class="game-dialog-kicker">${t.kicker}</span><h2>${t.title}</h2><p>${t.hint}</p></div>
<div class="adapt-tools"><input type="search" class="form-input adapt-search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}">
<label class="adapt-sort"><span>${t.sort}</span><select data-sort>${Object.entries(t.sorts).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label></div>
<div class="adapt-filters" role="group">${['all','problems','reads','no-text','untested','verified','readonly'].map(k=>`<button type="button" data-filter="${k}" aria-pressed="${k==='all'}">${esc(k==='all'?t.all:t.filters[k])}<span></span></button>`).join('')}<label class="adapt-hidden"><input type="checkbox" data-hidden> ${esc(t.filters.hidden)}</label></div>
<div class="adapt-head" aria-hidden="true"><span>${t.cols.game}</span><span>${t.cols.reading}</span><span>${t.cols.embed}</span><span>${t.cols.zero}</span><span>${t.cols.seen}</span><span></span></div>
<div class="adapt-list" role="list" aria-busy="true"></div>
<div class="dialog-actions"><button class="text-button" data-close>${t.close}</button></div>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 const list=dialog.querySelector('.adapt-list');
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 const derive=g=>{const embed=embedStatus(g,locale);return {...g,embed,tones:[tone[g.reading],tone[embed.kind],tone[g.zeroLatency]]};};
 const problem=g=>g.tones.includes('bad');
 const matches=g=>(hidden||!g.hidden)&&(filter==='all'||(filter==='problems'?problem(g):filter===g.reading||filter===g.embed.kind))&&(!query||(g.title+' '+g.engine).toLowerCase().includes(query));
 const compare={seen:(a,b)=>(b.lastSeenAt||0)-(a.lastSeenAt||0),title:(a,b)=>a.title.localeCompare(b.title,locale),engine:(a,b)=>(a.engine||'~').localeCompare(b.engine||'~')||a.title.localeCompare(b.title,locale),state:(a,b)=>a.tones.reduce((n,x)=>n+rank[x],0)-b.tones.reduce((n,x)=>n+rank[x],0)||a.title.localeCompare(b.title,locale)};
 const pill=(kind,label,title='')=>`<span class="adapt-pill" data-tone="${tone[kind]||'wait'}"${title?` title="${esc(title)}"`:''}>${esc(label)}</span>`;
 const evidence=g=>{const e=g.evidence||{},lines=[];if(e.launch)lines.push(`${t.launch}: ${e.launch.stage}${e.launch.error?' · '+e.launch.error:''}`);const s=e.hookStream||(e.hookVerifiedStream?{name:e.hookVerifiedStream}:null);if(s?.name)lines.push(`${t.stream}: ${s.name}${s.embeddable===false?' (read only)':''}`);if(e.characters)lines.push(`${t.chars}: ${e.characters}`);return lines.join('\n');};
 function render(){
  const visible=rows.filter(matches).sort(compare[sort]);
  dialog.querySelectorAll('[data-filter]').forEach(b=>{const k=b.dataset.filter;b.setAttribute('aria-pressed',String(k===filter));b.querySelector('span').textContent=String(rows.filter(g=>(hidden||!g.hidden)&&(k==='all'||(k==='problems'?problem(g):k===g.reading||k===g.embed.kind))).length);});
  list.innerHTML=visible.length?visible.map(g=>`<div class="adapt-row" role="listitem"><button type="button" class="adapt-open" data-open="${esc(g.id)}" title="${esc(evidence(g))}"><strong>${esc(g.title)}</strong><small>${esc(g.engine||'—')}${g.hidden?` · ${t.hiddenTag}`:''}${g.available?'':` · ${t.missing}`}</small></button>${pill(g.reading,t.reading[g.reading]||g.reading)}${pill(g.embed.kind,g.embed.label,g.embed.tooltip)}${pill(g.zeroLatency,t.zero[g.zeroLatency]||g.zeroLatency)}<span class="adapt-seen" title="${esc(evidence(g))}">${g.lastSeenAt?esc(relativeTime(Math.floor(g.lastSeenAt/1000))):t.never}</span><button type="button" class="text-button adapt-diag" data-diag="${esc(g.id)}" title="${esc(diagnosticsLabel(locale))}">${esc(t.diag)}</button></div>`).join(''):`<p class="adapt-empty">${t.empty}</p>`;
  list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{dialog.close();onOpenGame(b.dataset.open);});
  list.querySelectorAll('[data-diag]').forEach(b=>b.onclick=()=>openDiagnostics({api,id:b.dataset.diag,locale,esc,toast}));
 }
 dialog.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});
 dialog.querySelector('[data-sort]').onchange=e=>{sort=e.target.value;render();};
 dialog.querySelector('[data-hidden]').onchange=e=>{hidden=e.target.checked;render();};
 let timer=0;dialog.querySelector('.adapt-search').oninput=e=>{clearTimeout(timer);timer=setTimeout(()=>{query=e.target.value.trim().toLowerCase();render();},120);};
 try{const data=await api('adaptation_overview',{});rows=data.games.map(derive);}catch{if(dialog.isConnected){dialog.close();toast(t.failed);}return;}
 if(!dialog.isConnected)return;list.removeAttribute('aria-busy');render();
}
