// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, RPG Maker MV / MZ (docs/engine-draw-protocol.md, owner 2026-11-21: the game's own renderer draws MeguLit's
   dialogue; buttons, menus and choices are recognised and annotated, never replaced, their click areas the game's).
   Engine layer of the web text path (core/text-paths-web.cjs injects RPGM_SCRIPT next to its DOM page script). The game
   draws everything on one canvas, so the reading happens in its own JavaScript (rpg_windows.js / rmmz_windows.js):
     - Window_Message: every glyph it draws goes through Bitmap.drawText on its contents; the sentence's characters and
       their boxes are reported at the pause (engine=rpgm, role line). With draw.embed the message waits up to HOLD ms for
       MeguLit's replacement of the sentence ({ruby, zh}, asked with {ask}); then the window draws the ruby above its base
       characters (45 % size, at a 15 % smaller main size) and the Chinese as extra rows under the Japanese (80 % size, 70 %
       when the box is short; left out when it would need a new page), and reports emb=1|2. No replacement in time: the
       game's own message, emb absent, the reader adds the translation.
     - every other open window of the scene (draw.roles): Window_NameBox -> name, Window_ChoiceList -> choice, title /
       menu / options / save windows and other selectables -> menu, other command windows -> button, Window_Help ->
       system; each item's rect (itemLineRect / itemRectForText / itemRect) mapped to client pixels; one snapshot per
       window, an empty snapshot when it closes.
   Coordinates: the contents sprite's worldTransform (stage px) -> the canvas' CSS box -> device px (same space as the DOM
   path: sw = innerWidth * devicePixelRatio). Every wrapper calls the game's own method first and swallows its own errors. */
const RPGM_SCRIPT=String.raw`(function(){
 if(window.__megulitRpgm)return;
 var HOLD=1200,MAXE=64;
 var S={cfg:{roles:false,embed:false,zh:true},emb:{},order:[],asked:{},line:0,ui:0,cur:null,msg:null,wins:{},seq:0,inRuby:false,patched:false};
 function send(o){o.engine='rpgm';try{window.__megulitReport(JSON.stringify(o));}catch(e){}}
 function plain(t){return String(t||'').replace(/\x1b[A-Za-z]+(\[[^\]]*\])?|\x1b[\$\.\|\^!><\{\}\\]/g,'').replace(/[\s　]/g,'');}
 function chars(t){return Array.from(String(t||''));}
 function dpr(){return window.devicePixelRatio||1;}
 function isMZ(){return !!(window.Utils&&Utils.RPGMAKER_NAME==='MZ');}
 function stageToClient(x,y){var c=(window.Graphics&&Graphics._canvas)||document.querySelector('canvas');if(!c)return [x,y,1,1];var r=c.getBoundingClientRect(),kx=r.width/((window.Graphics&&Graphics.width)||r.width||1),ky=r.height/((window.Graphics&&Graphics.height)||r.height||1),d=dpr();return [(r.left+x*kx)*d,(r.top+y*ky)*d,kx*d,ky*d];}
 function origin(w){var sp=w._windowContentsSprite||w._contentsSprite;if(sp&&sp.worldTransform){var t=sp.worldTransform;return [t.tx,t.ty];}var pad=w.padding||18,x=(w.x||0)+pad,y=(w.y||0)+pad,p=w.parent;while(p){x+=p.x||0;y+=p.y||0;p=p.parent;}return [x,y];}
 function rectOut(w,x,y,ww,h){var o=origin(w),c=stageToClient(o[0]+x,o[1]+y);return [c[0],c[1],ww*c[2],h*c[3]];}
 function winBox(w){var t=w.worldTransform,x=t?t.tx:(w.x||0),y=t?t.ty:(w.y||0),c=stageToClient(x,y);return [c[0],c[1],(w.width||0)*c[2],(w.height||0)*c[3]];}
 function scr(){var d=dpr();return [innerWidth*d,innerHeight*d];}
 function is(w,n){var C=window[n];return typeof C==='function'&&w instanceof C;}
 /* ---- the message: what it draws ---- */
 function newCur(w){S.cur={w:w,rects:[],text:'',n:0,lastY:null,k:'',spans:null,zh:false,sent:false,emb:0};}
 function track(bmp,text,x,y,mw,lh,align){
  var c=S.cur,fs=bmp.fontSize,cs=chars(text),tw=bmp.measureTextWidth(text),x0=x,acc=0,gy=y+((lh||fs)-fs)/2;
  if(align==='center')x0=x+(mw-tw)/2;else if(align==='right')x0=x+mw-tw;
  for(var i=0;i<cs.length;i++){var ch=cs[i],cw=bmp.measureTextWidth(ch);
   if(!/[\s　]/.test(ch)){if(c.lastY!==null&&Math.abs(gy-c.lastY)>fs/2)c.text+='\n';c.lastY=gy;c.text+=ch;c.rects.push([x0+acc,gy,cw,fs]);if(c.spans)ruby(bmp,c,x0+acc,gy,fs);c.n++;}
   acc+=cw;}
 }
 function ruby(bmp,c,x,gy,fs){
  for(var i=0;i<c.spans.length;i++){var s=c.spans[i];if(s[0]!==c.n)continue;
   var base=chars(c.k).slice(s[0],s[0]+s[1]).join(''),bw=bmp.measureTextWidth(base),of=bmp.fontSize,ow=bmp.outlineWidth,rs=Math.max(8,Math.round(fs*0.45));
   S.inRuby=true;try{bmp.fontSize=rs;if(typeof ow==='number')bmp.outlineWidth=Math.max(1,Math.round(ow*rs/fs));OD.call(bmp,s[2],x-Math.max(0,(rs*chars(s[2]).length-bw)/2),Math.max(0,gy-rs-1),Math.max(bw,rs*chars(s[2]).length),rs,'center');}catch(e){}
   bmp.fontSize=of;if(typeof ow==='number')bmp.outlineWidth=ow;S.inRuby=false;}
 }
 function flush(w){var c=S.cur;if(!c||c.sent||c.w!==w||!c.rects.length)return;c.sent=true;var s=scr();
  send({line:++S.line,hidden:false,sw:s[0],sh:s[1],rects:c.rects.map(function(r){return rectOut(w,r[0],r[1],r[2],r[3]);}),text:c.text,emb:c.emb||0});}
 function ask(k){if(S.asked[k])return;S.asked[k]=1;send({ask:k,text:k});}
 function rowH(w,fs){return Math.max(isMZ()&&w.lineHeight?w.lineHeight():0,fs+8);}
 function wrapZh(bmp,t,fs,width){var of=bmp.fontSize;bmp.fontSize=fs;var rows=[],row='';try{var cs=chars(String(t).replace(/\x1f/g,'\n'));for(var i=0;i<cs.length;i++){var ch=cs[i];if(ch==='\n'){rows.push(row);row='';continue;}
   if(row&&bmp.measureTextWidth(row+ch)>width&&'，。、！？；：」』）】…'.indexOf(ch)<0){rows.push(row);row='';}row+=ch;}if(row)rows.push(row);}catch(e){}bmp.fontSize=of;return rows;}
 /* the replacement is there: ruby at a smaller main size, Chinese rows appended behind a marker the window ignores */
 function applyEmbed(w){
  var c=S.cur,e=S.emb[c.k],ts=w._textState,cont=w.contents;if(!e||!ts||!cont)return;
  var base=w._mgBase||cont.fontSize,spans=(e.ruby||[]).filter(function(s){return s&&s[0]>=0&&s[1]>s[0]&&s[2];}).map(function(s){return [s[0],s[1]-s[0],String(s[2])];});
  var jpFs=spans.length?Math.round(base*0.85):base,rows=String(ts.text).split('\n').length,H=cont.height,off=spans.length?4:0;
  if(rows*rowH(w,jpFs)+off>H)off=0;
  var zh=null,zhFs=0,x0=ts.startX!==undefined?ts.startX:(ts.left||ts.x||0);
  if(S.cfg.zh&&e.zh){var sizes=[Math.round(base*0.8),Math.round(base*0.7)];for(var i=0;i<sizes.length;i++){var zr=wrapZh(cont,e.zh,sizes[i],cont.width-x0-4);if(zr.length&&rows*rowH(w,jpFs)+off+zr.length*rowH(w,jpFs)<=H){zh=zr;zhFs=sizes[i];break;}}}
  w._mgFs=jpFs;w._mgZh=zhFs;cont.fontSize=jpFs;ts.y=(ts.y||0)+off;if(typeof w.calcTextHeight==='function')try{ts.height=w.calcTextHeight(ts,false);}catch(er){}
  if(zh)ts.text+='\n\x1bMGZ'+zh.join('\n');
  c.spans=spans.length?spans:null;c.emb=zh?2:1;
 }
 var OD=null;
 function patch(){
  if(S.patched||!window.Window_Message||!window.Window_Base||!window.Bitmap||!window.SceneManager||!SceneManager._scene)return false;
  S.patched=true;var WM=Window_Message.prototype,WB=Window_Base.prototype;
  OD=Bitmap.prototype.drawText;
  Bitmap.prototype.drawText=function(text,x,y,maxWidth,lineHeight,align){var r=OD.apply(this,arguments);try{var c=S.cur;if(c&&!S.inRuby&&!c.zh&&!c.sent&&c.w&&this===c.w.contents)track(this,String(text),x,y,maxWidth,lineHeight,align);}catch(e){}return r;};
  var oSM=WM.startMessage;WM.startMessage=function(){this._mgFs=0;this._mgZh=0;this._mgHold=0;var r=oSM.apply(this,arguments);
   try{S.msg=this;newCur(this);this._mgBase=this.contents&&this.contents.fontSize;var ts=this._textState,k=plain(ts&&ts.text);S.cur.k=k;
    if(S.cfg.embed&&k){if(S.emb[k])applyEmbed(this);else{ask(k);this._mgHold=performance.now()+HOLD;}}}catch(e){}
   return r;};
  var oUM=WM.updateMessage;WM.updateMessage=function(){
   if(this._mgHold){var c=S.cur;if(c&&S.emb[c.k]){this._mgHold=0;try{applyEmbed(this);}catch(e){}}else if(performance.now()<this._mgHold)return true;else this._mgHold=0;}
   return oUM.apply(this,arguments);};
  var oRF=WB.resetFontSettings;if(oRF)WB.resetFontSettings=function(){var r=oRF.apply(this,arguments);try{if(this._mgFs&&this.contents)this.contents.fontSize=this._mgFs;}catch(e){}return r;};
  var oPE=WB.processEscapeCharacter;WB.processEscapeCharacter=function(code,textState){if(code==='MGZ'){try{if(this._mgZh&&this.contents)this.contents.fontSize=this._mgZh;if(S.cur&&S.cur.w===this){flush(this);S.cur.zh=true;}}catch(e){}return;}return oPE.apply(this,arguments);};
  var oNP=WM.newPage;if(oNP)WM.newPage=function(){var r=oNP.apply(this,arguments);try{var c=S.cur;if(c&&c.w===this&&c.sent&&!c.zh){var k=c.k,sp=c.spans;newCur(this);S.cur.k=k;S.cur.spans=null;}}catch(e){}return r;};
  var oSP=WM.startPause;WM.startPause=function(){var r=oSP.apply(this,arguments);try{flush(this);}catch(e){}return r;};
  var oTM=WM.terminateMessage;WM.terminateMessage=function(){try{flush(this);}catch(e){}return oTM.apply(this,arguments);};
  setInterval(function(){try{scan();}catch(e){}},250);
  send({status:'rpgm ok '+(isMZ()?'MZ':'MV')});
  return true;
 }
 /* ---- every other window: roles ---- */
 function roleOf(w){
  if(is(w,'Window_NameBox'))return 'name';if(is(w,'Window_ChoiceList'))return 'choice';if(is(w,'Window_Help'))return 'system';
  var menus=['Window_TitleCommand','Window_MenuCommand','Window_GameEnd','Window_Options','Window_SavefileList','Window_ItemCategory','Window_SkillType','Window_MenuStatus'];
  for(var i=0;i<menus.length;i++)if(is(w,menus[i]))return 'menu';
  if(is(w,'Window_Command'))return 'button';if(is(w,'Window_Selectable'))return 'menu';return 'system';}
 function clean(w,t){t=String(t||'');try{if(w.convertEscapeCharacters)t=w.convertEscapeCharacters(t);}catch(e){}return t.replace(/\x1b[A-Za-z]+(\[[^\]]*\])?|\x1b./g,'').replace(/\s+$/,'').replace(/^\s+/,'');}
 function itemText(w,i){var t='';try{if(typeof w.commandName==='function'&&w._list)t=w.commandName(i);else if(w._data&&w._data[i]&&w._data[i].name)t=w._data[i].name;}catch(e){}return clean(w,t);}
 function itemsOf(w){
  var role=roleOf(w),items=[];
  if(role==='name'||role==='system'&&!(typeof w.maxItems==='function')){var t=clean(w,w._name!==undefined?w._name:w._text);if(t)items.push({text:t,box:winBox(w)});return {role:role,items:items};}
  if(typeof w.maxItems!=='function'||typeof w.itemRect!=='function')return {role:role,items:items};
  var n=Math.min(w.maxItems()||0,40),ch=w.contents?w.contents.height:1e9,sel=typeof w.index==='function'?w.index():-1;
  for(var i=0;i<n;i++){var t=itemText(w,i);if(!t)continue;var f=w.itemLineRect||w.itemRectForText||w.itemRect,r=f.call(w,i);if(!r||r.y+r.height<0||r.y>ch)continue;items.push({text:t,box:rectOut(w,r.x,r.y,r.width,r.height),sel:sel===i});}
  return {role:role,items:items};}
 function collect(node,d,out){if(!node||d>4)return;var ch=node.children||[];for(var i=0;i<ch.length;i++){var c=ch[i];if(window.Window_Base&&c instanceof Window_Base){if(c!==S.msg&&c.visible&&(typeof c.isOpen!=='function'||c.isOpen()))out.push(c);}else collect(c,d+1,out);}}
 function scan(){
  if(!S.cfg.roles||!window.SceneManager)return;var list=[],seen={},s=scr();collect(SceneManager._scene,0,list);
  for(var i=0;i<list.length;i++){var w=list[i],snap=itemsOf(w);if(!snap.items.length)continue;var id=w.__mgId||(w.__mgId=++S.seq);seen[id]=1;
   var sig=JSON.stringify(snap.items.map(function(it){return [it.text,it.box.map(Math.round),it.sel];}));if(S.wins[id]&&S.wins[id].sig===sig)continue;S.wins[id]={sig:sig,role:snap.role};var line=++S.ui;
   snap.items.forEach(function(it,j){send({ui:true,line:line,hidden:false,sw:s[0],sh:s[1],role:snap.role,id:'W'+id+':'+j,box:it.box,rects:[],text:it.text,sel:it.sel===true});});}
  for(var k in S.wins)if(!seen[k]){send({ui:true,line:++S.ui,hidden:false,sw:s[0],sh:s[1],role:S.wins[k].role,id:'W'+k+':',box:[0,0,0,0],rects:[],text:''});delete S.wins[k];}
 }
 window.__megulitRpgm={
  config:function(c){c=c||{};S.cfg={roles:c.roles===true,embed:c.embed===true,zh:c.zh!==false};return S.cfg;},
  embed:function(k,e){k=String(k||'');if(!k)return;if(!S.emb[k])S.order.push(k);S.emb[k]={ruby:Array.isArray(e&&e.ruby)?e.ruby:[],zh:String(e&&e.zh||'')};while(S.order.length>MAXE)delete S.emb[S.order.shift()];},
  state:function(){return {patched:S.patched,line:S.line,ui:S.ui,cfg:S.cfg,emb:S.order.length};}
 };
 var tries=0,t=setInterval(function(){if(patch()||++tries>600)clearInterval(t);},200);
})();`;

module.exports={RPGM_SCRIPT};
