// SPDX-License-Identifier: GPL-3.0-or-later
(function installHookReader(){
 'use strict';if(!document.documentElement||!window.__tomoyoChinese?.galStatus){document.addEventListener('DOMContentLoaded',installHookReader,{once:true});return;}const b=window.__tomoyoChinese;if(b.hookReader)return;b.hookReader=true;if(!b.islandPage)window.TomeIslandPage?.install(window);let root,text='',active=false,recovering=false,sequence=0;
 window.TomeTypewriter?.bindBridge(b);
 // Speaker metadata belongs in LOG; the reading overlay and its character indexes contain only dialogue.
 b.splitDialogue=src=>{const value=String(src||''),trimmed=value.trim();
  let m=/^【([^【】\r\n]{1,40})】\s*([「『][\s\S]*)$/.exec(trimmed);if(m)return {name:m[1].trim(),text:m[2]};
  const lines=trimmed.split(/\r?\n/);if(lines.length>=2&&lines[0].length<=12&&!/[「『（(。、]/.test(lines[0])&&/^[「『（(]/.test(lines[1].trim()))return {name:lines[0].trim(),text:lines.slice(1).join('\n').trim()};
  m=/^([^\s「『（(]{1,10})([「『][\s\S]*[」』])$/.exec(trimmed);if(m)return {name:m[1],text:m[2]};
  return {name:'',text:value};};
 // Games that put several lines on one page (ISLAND) report per line whether it joins the page (hookPage, from the
 // engine draw hook, a few ms after the text). The page's earlier lines stay above the current one until the game
 // turns the page. A new line waits up to 150 ms for that report so the earlier lines never flash away and back.
 let page=[],pending=null,pageEngineAt=0,early=null,engine='',lastPageLine=0;
 const reports=new Map();
 const token=value=>{value=value.replace(/[ \u3000\r\n]/g,'');let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return h>>>0;};
 const decide=same=>{if(!pending)return;const p=pending;pending=null;clearTimeout(p.timer);page=same&&p.previous?p.page.concat(p.previous):[];paint();window.__tomeTextPosition?.refresh?.();};
 const resetPage=()=>{if(pending)clearTimeout(pending.timer);pending=null;page=[];early=null;reports.clear();lastPageLine=0;pageEngineAt=0;engine='';};
 b.hookPage=m=>{if(b.islandPage?.page(m))return;if(!m||typeof m.same!=='boolean')return;
  if(Number.isSafeInteger(m.line)){if(m.line<=lastPageLine)return;lastPageLine=m.line;}
  pageEngineAt=Date.now();
  if(Number.isSafeInteger(m.token)&&m.token>=0){
   // A draw for a previous/next sentence must never settle the current sentence merely because it arrived nearby.
   reports.set(m.token,{same:m.same,at:Date.now()});for(const [key,r]of reports)if(Date.now()-r.at>5000||reports.size>64)reports.delete(key);
   if(pending&&pending.token===m.token){reports.delete(m.token);decide(m.same);}return;
  }
  if(pending&&pending.token===null)decide(m.same);else early={same:m.same,at:Date.now()};
 };
 const previous=b.galStatus;b.galStatus=m=>{previous(m);if(typeof m.hookSourceRead==='boolean')document.body.classList.toggle('tome-line-read',m.hookSourceRead);if(b.islandPage?.accept(m)){active=recovering=false;text='';resetPage();root?.remove();root=null;return;}
  if(m.type==='gameClosed'||m.hookSource===null){document.body.classList.toggle('tome-line-read',false);resetPage();text='';}
  if(typeof m.hookActive==='boolean')active=m.hookActive;if(typeof m.hookRecovering==='boolean')recovering=m.hookRecovering;
  if(typeof m.hookSourceEngine==='string'&&m.hookSourceEngine!==engine){if(engine)resetPage();engine=m.hookSourceEngine;}
  if(typeof m.hookSource==='string'){const next=b.splitDialogue(m.hookSource).text,old=text,oldSequence=sequence;sequence=Number.isSafeInteger(m.hookSequence)?m.hookSequence:next===text?sequence:sequence+1;text=next;
   if(sequence!==oldSequence){if(pending)decide(false);const key=/^(?:cs2|krkr|renpy|ocr)$/.test(engine)?token(next):null,report=key!==null?reports.get(key):early&&Date.now()-early.at<300?early:null;early=null;
    if(report&&Date.now()-report.at<5000){if(key!==null)reports.delete(key);page=report.same&&old?page.concat(old):[];}
    else if((/^(?:cs2|krkr|renpy|ocr)$/.test(engine)||Date.now()-pageEngineAt<10*60*1000)&&next){pending={page,previous:old,token:key,timer:setTimeout(()=>decide(false),/^(?:cs2|krkr|renpy|ocr)$/.test(engine)?1200:150)};return;}else page=[];}}
  if(!pending){paint();window.__tomeTextPosition?.refresh?.();}};
 // Current native coordinates describe the current line. Earlier page lines occupy space above it in the DOM.
 b.pagePositionReady=()=>!pending;
 b.currentPageToken=()=>/^(?:cs2|krkr|renpy|ocr)$/.test(engine)?token(text):null;
 b.pageHistoryHeight=()=>{const host=root?.querySelector('.tome-page-lines');return host?.getBoundingClientRect?.().height||0;};
 function pageLines(sentence){let host=sentence.querySelector(':scope>.tome-page-lines');if(!page.length){host?.remove();return;}if(!host){host=document.createElement('div');host.className='tome-page-lines';host.__tomeKey='';}if(sentence.firstChild!==host)sentence.prepend(host);const key=page.join('\u0001');if(host.__tomeKey===key)return;host.__tomeKey=key;host.replaceChildren(...page.map(line=>{const d=document.createElement('div');d.textContent=line;return d;}));}
 function paint(){const native=[...document.querySelectorAll('.sentence-window')].find(n=>!n.classList.contains('tomoyo-hook-reader'));const use=(active||recovering)&&!!text&&!!native;document.body.classList.toggle('tomoyo-hook-reader-active',use);if(!use){if(root){window.TomeTypewriter?.stop(root.querySelector('.sentence-text'));root.remove();root=null;b.refresh?.();}return;}if(!root){root=document.createElement('div');root.className='sentence-window tomoyo-hook-reader';root.dataset.hookReader='';const sentence=document.createElement('div');sentence.className='sentence-text';root.append(sentence);native.before(root);}const sentence=root.querySelector('.sentence-text');if(sentence.dataset.sequence===String(sequence)&&sentence.__tomeHookText===text){pageLines(sentence);return;}sentence.dataset.sequence=String(sequence);sentence.__tomeHookText=text;window.TomeTypewriter?.stop(sentence);const nodes=[...text].map((c,i)=>{const span=document.createElement('span');span.className=/^\p{Script=Latin}$/u.test(c)?'char-token megulit-latin':'char-token';span.dataset.index=String(i);span.textContent=c;return span;});sentence.replaceChildren(...nodes);pageLines(sentence);window.TomeTypewriter?.reveal(sentence,nodes,{instant:recovering});b.refresh?.();b.alignText?.();}
 b.hookReaderStatus=()=>b.pageTranslationActive?.()?b.islandPage.status():({active,recovering,sequence,chars:text.length,rendered:!!root?.isConnected,typing:window.TomeTypewriter?.status(root?.querySelector('.sentence-text'))||null});
 const style=document.createElement('style');style.textContent='body.tomoyo-hook-reader-active .sentence-window:not(.tomoyo-hook-reader){display:none!important}.tomoyo-hook-reader .sentence-text{white-space:pre-wrap}.tomoyo-hook-reader .char-token{position:relative;cursor:pointer;display:inline}.tomoyo-hook-reader .tome-page-lines{display:block;text-indent:0}';document.head.append(style);new MutationObserver(()=>{if((active||recovering)&&text&&!root?.isConnected)paint();}).observe(document.documentElement,{childList:true,subtree:true});
})();
