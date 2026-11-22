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
   path: sw = innerWidth * devicePixelRatio). Wrappers preserve the game's return values and exceptions; observation
   errors are bounded diagnostics. Nothing is installed until an explicit draw.roles or draw.embed grant. */
const RPGM_SCRIPT=String.raw`(function(){
 if(window.__megulitRpgm)return;
 var HOLD=1200,MAXE=64;
 var S={cfg:{roles:false,embed:false,zh:true},emb:Object.create(null),order:[],asked:Object.create(null),asks:[],line:0,ui:0,cur:null,msg:null,wins:{},seq:0,inRuby:false,patched:false,errors:0};
 function send(o){o.engine='rpgm';try{window.__megulitReport(JSON.stringify(o));}catch(e){}}
 function observe(f){try{f();}catch(e){if(S.errors++<3)send({status:'rpgm observation failed'});}}
 function active(){return S.cfg.roles||S.cfg.embed;}
 function plain(t){return String(t||'').replace(/\x1b[A-Za-z]+(\[[^\]]*\])?|\x1b[\$\.\|\^!><\{\}\\]/g,'').replace(/[\s　]/g,'');}
 function chars(t){var s=String(t||''),out=[];for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);if(c>=0xd800&&c<=0xdbff&&i+1<s.length){var d=s.charCodeAt(i+1);if(d>=0xdc00&&d<=0xdfff){out.push(s.substr(i,2));i++;continue;}}out.push(s.charAt(i));}return out;}
 function dpr(){return window.devicePixelRatio||1;}
 function isMZ(){return !!(window.Utils&&Utils.RPGMAKER_NAME==='MZ');}
 function stageToClient(x,y){var c=window.Graphics&&Graphics._canvas;if(!c||!(Graphics.width>0&&Graphics.height>0))throw Error('rpgm canvas unavailable');var r=c.getBoundingClientRect(),kx=r.width/Graphics.width,ky=r.height/Graphics.height,d=dpr();if(!(kx>0&&ky>0&&d>0))throw Error('rpgm canvas hidden');return [(r.left+x*kx)*d,(r.top+y*ky)*d,kx*d,ky*d];}
 function affineBox(t,x,y,ww,h){
  var a=t.a===undefined?1:t.a,b=t.b===undefined?0:t.b,c=t.c===undefined?0:t.c,d=t.d===undefined?1:t.d;
  var points=[[x,y],[x+ww,y],[x,y+h],[x+ww,y+h]].map(function(p){return stageToClient(a*p[0]+c*p[1]+t.tx,b*p[0]+d*p[1]+t.ty);});
  var xs=points.map(function(p){return p[0];}),ys=points.map(function(p){return p[1];});
  var out=[Math.min.apply(Math,xs),Math.min.apply(Math,ys),Math.max.apply(Math,xs)-Math.min.apply(Math,xs),Math.max.apply(Math,ys)-Math.min.apply(Math,ys)];
  if(!out.every(Number.isFinite)||out[2]<=0||out[3]<=0)throw Error('rpgm geometry');return out;
 }
 function rectOut(w,x,y,ww,h){
  var sp=w._windowContentsSprite||w._contentsSprite;
  if(!sp||!sp.worldTransform)throw Error('rpgm contents transform unavailable');
  var f=sp._frame||{x:0,y:0};return affineBox(sp.worldTransform,x-f.x,y-f.y,ww,h);
 }
 function winBox(w){if(!w.worldTransform)throw Error('rpgm window transform unavailable');return affineBox(w.worldTransform,0,0,w.width,w.height);}
 function scr(){var d=dpr();return [innerWidth*d,innerHeight*d];}
 function is(w,n){var C=window[n];return typeof C==='function'&&w instanceof C;}
 /* ---- the message: what it draws ---- */
 function newCur(w,old){S.cur={w:w,rects:[],text:'',n:old?old.n:0,lastY:null,k:old?old.k:'',spans:old?old.spans:null,zh:old?old.zh:false,sent:false,emb:old?old.emb:0,line:0,cleared:false,originalText:old?old.originalText:undefined};}
 function track(bmp,text,x,y,mw,lh,align){
  var c=S.cur,fs=bmp.fontSize,cs=chars(text),tw=bmp.measureTextWidth(text),width=mw||0xffffffff,k=tw>width?width/tw:1,drawn=tw*k,x0=x,prev=0,prefix='',gy=y+((lh||fs)-fs)/2;
  if(align==='center')x0=x+(width-drawn)/2;else if(align==='right')x0=x+width-drawn;
  for(var i=0;i<cs.length&&c.rects.length<4000;i++){var ch=cs[i];prefix+=ch;var end=bmp.measureTextWidth(prefix)*k,cw=end-prev;
   if(!/[\s　]/.test(ch)&&cw>0){var newline=c.lastY!==null&&Math.abs(gy-c.lastY)>fs/2;if(c.text.length+ch.length+(newline?1:0)>4000)break;if(newline)c.text+='\n';c.lastY=gy;c.text+=ch;c.rects.push([x0+prev,gy,cw,fs]);if(c.spans)ruby(bmp,c,x0+prev,gy,fs);c.n++;}
   prev=end;}
 }
 function ruby(bmp,c,x,gy,fs){
  for(var i=0;i<c.spans.length;i++){var s=c.spans[i];if(s[0]!==c.n)continue;
   var base=chars(c.k).slice(s[0],s[0]+s[1]).join(''),bw=bmp.measureTextWidth(base),of=bmp.fontSize,ow=bmp.outlineWidth,rs=Math.max(8,Math.round(fs*0.45));
   S.inRuby=true;try{bmp.fontSize=rs;if(typeof ow==='number')bmp.outlineWidth=Math.max(1,Math.round(ow*rs/fs));OD.call(bmp,s[2],x-Math.max(0,(rs*chars(s[2]).length-bw)/2),Math.max(0,gy-rs-1),Math.max(bw,rs*chars(s[2]).length),rs,'center');}catch(e){}
   bmp.fontSize=of;if(typeof ow==='number')bmp.outlineWidth=ow;S.inRuby=false;}
 }
 function publish(c){var s=scr(),rs=c.rects.map(function(r){return rectOut(c.w,r[0],r[1],r[2],r[3]);}),sig=JSON.stringify([s,rs.map(function(r){return r.map(Math.round);})]);
  if(c.sent&&!c.cleared&&c.sig===sig)return;if(!c.sent)c.line=++S.line;c.sent=true;c.cleared=false;c.sig=sig;send({line:c.line,hidden:false,sw:s[0],sh:s[1],rects:rs,text:c.text,emb:c.emb||0});}
 function flush(w){var c=S.cur;if(!active()||!c||c.sent||c.w!==w||!c.rects.length)return;publish(c);}
 function clearLine(){var c=S.cur;if(!c||!c.sent||c.cleared)return;var s=scr();send({line:c.line,hidden:false,sw:s[0],sh:s[1],rects:[],text:''});c.cleared=true;}
 function sceneContains(node,w,d){if(!node||d>8||node.visible===false||node.renderable===false||node.alpha===0)return false;if(node===w)return typeof w.isOpen!=='function'||w.isOpen();return (node.children||[]).some(function(c){return sceneContains(c,w,d+1);});}
 function syncLine(){var c=S.cur;if(!active()||!c||!c.sent)return;if(!sceneContains(SceneManager._scene,c.w,0)||c.w.contentsOpacity===0)clearLine();else publish(c);}
 function ask(k){if(k.length>4000||S.asked[k])return;S.asked[k]=1;S.asks.push(k);while(S.asks.length>MAXE*4)delete S.asked[S.asks.shift()];send({ask:k,text:k});}
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
  c.originalText=ts.text;c.offset=off;if(zh)ts.text+='\n\x1bMGZ'+zh.join('\n');
  c.spans=spans.length?spans:null;c.emb=zh?2:spans.length?1:0;
 }
 var OD=null;
 function releaseEmbed(){
  var w=S.msg,c=S.cur;if(!w)return;w._mgHold=0;
  if(w._mgFs&&w.contents)w.contents.fontSize=w._mgBase;w._mgFs=0;w._mgZh=0;
  if(c&&c.w===w){var ts=w._textState;if(ts&&c.originalText!==undefined){ts.text=c.originalText;ts.index=Math.min(ts.index,ts.text.length);if(!c.n)ts.y-=c.offset||0;if(w.calcTextHeight)ts.height=w.calcTextHeight(ts,false);}c.spans=null;if(!c.sent)c.emb=0;}
 }
 function patch(){
  if(S.patched)return true;
  if(!active()||!window.Utils||['MV','MZ'].indexOf(Utils.RPGMAKER_NAME)<0||!window.Window_Message||!window.Window_Base||!window.Bitmap||!window.SceneManager||!SceneManager._scene)return false;
  var required=[Bitmap.prototype.drawText,Bitmap.prototype.measureTextWidth,Window_Message.prototype.startMessage,Window_Message.prototype.updateMessage,Window_Message.prototype.startPause,Window_Message.prototype.terminateMessage,Window_Base.prototype.processEscapeCharacter];
  if(!required.every(function(f){return typeof f==='function';}))return false;
  S.patched=true;var WM=Window_Message.prototype,WB=Window_Base.prototype;
  OD=Bitmap.prototype.drawText;
  Bitmap.prototype.drawText=function(text,x,y,maxWidth,lineHeight,align){var r=OD.apply(this,arguments),self=this;observe(function(){var c=S.cur;if(text!==undefined&&active()&&c&&!S.inRuby&&!c.zh&&!c.sent&&c.w&&self===c.w.contents)track(self,String(text),x,y,maxWidth,lineHeight,align);});return r;};
  var oSM=WM.startMessage;WM.startMessage=function(){if(!active())return oSM.apply(this,arguments);var self=this;observe(function(){releaseEmbed();clearLine();S.cur=null;self._mgFs=0;self._mgZh=0;self._mgHold=0;});var r=oSM.apply(this,arguments);
   observe(function(){S.msg=self;newCur(self);self._mgBase=self.contents&&self.contents.fontSize;var ts=self._textState,k=plain(ts&&ts.text);S.cur.k=k;
    if(S.cfg.embed&&k){if(S.emb[k])applyEmbed(self);else{ask(k);self._mgHold=performance.now()+HOLD;}}});
   return r;};
  var oUM=WM.updateMessage;WM.updateMessage=function(){
   if(!active())return oUM.apply(this,arguments);
   if(S.cfg.embed&&this._mgHold){var c=S.cur;if(c&&c.w===this&&S.emb[c.k]){this._mgHold=0;var self=this;observe(function(){applyEmbed(self);});}else if(performance.now()<this._mgHold)return true;else this._mgHold=0;}
   return oUM.apply(this,arguments);};
  var oRF=WB.resetFontSettings;if(oRF)WB.resetFontSettings=function(){var r=oRF.apply(this,arguments),self=this;observe(function(){if(S.cfg.embed&&self._mgFs&&self.contents)self.contents.fontSize=self._mgFs;});return r;};
  var oPE=WB.processEscapeCharacter;WB.processEscapeCharacter=function(code,textState){if(S.cfg.embed&&code==='MGZ'&&this._mgZh){var self=this;observe(function(){if(self.contents)self.contents.fontSize=self._mgZh;if(S.cur&&S.cur.w===self){flush(self);S.cur.zh=true;}});return;}return oPE.apply(this,arguments);};
  var oNP=WM.newPage;if(oNP)WM.newPage=function(){var r=oNP.apply(this,arguments),self=this;observe(function(){var c=S.cur;if(active()&&c&&c.w===self){flush(self);clearLine();newCur(self,c);}});return r;};
  var oSP=WM.startPause;WM.startPause=function(){var r=oSP.apply(this,arguments),self=this;observe(function(){flush(self);});return r;};
  var oTM=WM.terminateMessage;WM.terminateMessage=function(){var self=this;observe(function(){flush(self);});var r=oTM.apply(this,arguments);observe(function(){if(S.cur&&S.cur.w===self){clearLine();releaseEmbed();S.cur=null;S.msg=null;}});return r;};
  setInterval(function(){observe(syncLine);observe(scan);},250);
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
 function collect(node,d,out){if(!node||d>8||node.visible===false||node.renderable===false||node.alpha===0)return;var ch=node.children||[];for(var i=0;i<ch.length;i++){var c=ch[i];if(window.Window_Base&&c instanceof Window_Base){if(c!==S.msg&&c.visible&&c.renderable!==false&&c.alpha!==0&&c.contentsOpacity!==0&&(typeof c.isOpen!=='function'||c.isOpen()))out.push(c);}else collect(c,d+1,out);}}
 function clearUi(){var s=scr();for(var k in S.wins){send({ui:true,line:++S.ui,hidden:false,sw:s[0],sh:s[1],role:S.wins[k].role,id:'W'+k+':',box:[0,0,0,0],rects:[],text:''});delete S.wins[k];}}
 function scanWindow(w,seen,s){var snap=itemsOf(w);if(!snap.items.length)return;var id=w.__mgId||(w.__mgId=++S.seq);seen[id]=1;
  var sig=JSON.stringify([snap.role,s,snap.items.map(function(it){return [it.text,it.box.map(Math.round),it.sel];})]);if(S.wins[id]&&S.wins[id].sig===sig)return;S.wins[id]={sig:sig,role:snap.role};var line=++S.ui;
  snap.items.forEach(function(it,j){send({ui:true,line:line,hidden:false,sw:s[0],sh:s[1],role:snap.role,id:'W'+id+':'+j,box:it.box,rects:[],text:it.text,sel:it.sel===true});});}
 function scan(){
  if(!S.cfg.roles||!window.SceneManager)return;var list=[],seen={},s=scr();collect(SceneManager._scene,0,list);
  list.forEach(function(w){observe(function(){scanWindow(w,seen,s);});});
  for(var k in S.wins)if(!seen[k]){send({ui:true,line:++S.ui,hidden:false,sw:s[0],sh:s[1],role:S.wins[k].role,id:'W'+k+':',box:[0,0,0,0],rects:[],text:''});delete S.wins[k];}
 }
 window.__megulitRpgm={
  config:function(c){c=c||{};var next={roles:c.roles===true,embed:c.embed===true,zh:c.zh!==false};observe(function(){if(!next.embed)releaseEmbed();if(!next.roles)clearUi();if(!next.roles&&!next.embed){clearLine();S.cur=null;S.msg=null;if(t){clearInterval(t);t=0;}}});S.cfg=next;if(active())startInstaller();return S.cfg;},
  embed:function(k,e){k=String(k||'');if(!k||k.length>4000)return;var n=chars(k).length,end=0,spans=[];
   (Array.isArray(e&&e.ruby)?e.ruby:[]).slice(0,64).forEach(function(s){if(!Array.isArray(s)||!Number.isInteger(s[0])||!Number.isInteger(s[1])||s[0]<end||s[1]<=s[0]||s[1]>n||typeof s[2]!=='string'||!s[2]||chars(s[2]).length>160||/[\x00-\x1f\x7f]/.test(s[2]))return;spans.push([s[0],s[1],s[2]]);end=s[1];});
   if(!S.emb[k])S.order.push(k);S.emb[k]={ruby:spans,zh:String(e&&e.zh||'').slice(0,4000).replace(/[\x00-\x09\x0b-\x1e\x7f]/g,'')};while(S.order.length>MAXE)delete S.emb[S.order.shift()];},
  state:function(){return {patched:S.patched,line:S.line,ui:S.ui,cfg:S.cfg,emb:S.order.length};}
 };
 var tries=0,t=0;
 function startInstaller(){if(patch()||t)return;tries=0;t=setInterval(function(){if(patch()||++tries>600){clearInterval(t);t=0;}},200);}
})();`;

module.exports={RPGM_SCRIPT};
