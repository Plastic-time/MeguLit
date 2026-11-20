// SPDX-License-Identifier: GPL-3.0-or-later
// TJS run by KrkrText.cpp through Scripts.eval on the game's own thread. It wraps each KAG message layer's processCh
// and clear and the window's showLineBreak / showPageBreak, and reports one sentence at a time (begin: first character
// drawn; end: the click wait or the layer being cleared) with where the game drew it, in game-screen pixels:
//   ToMe_KRKR begin|end line=N same=0|1 nvl=0|1 x0= y0= x1= y1= size= sw= sh= n= [text=...]
// same=0 when the layer was cleared since its last sentence (a new page). nvl=1 for message layers at least 45 % of the
// screen high (full-screen pages); layers under 20 % (name plates) are not reported. Nothing the game saves is
// touched: the state lives in global.__megulitKrkrState and every wrapper falls back to the game's own method.
// Field names follow the KAG3 MessageLayer (lineLayer, lineLayerPos, lineLayerOriginY, lineLayerBase, fontSize,
// marginR, vertical); a layer without lineLayer is measured with its x / y cursor. Vertical text is not reported.
// The end text keeps the game's own line breaks: a character drawn on a new row starts with a newline.
// E321/E550: begin and end lines carry color=rrggbb, the layer's chColor for the sentence's last character: games draw read and
// unread text in different colours, and the reader paints each page line in the colour the game used.
// Text architecture ③ (docs/text-architecture.md): every sentence also ends with one record holding the box of each
// character it drew (x, y, the drawing font's width of the character, the font size), in game-screen pixels:
//   ToMe_CHARS engine=krkr line=N hidden=0|1 sw= sh= vx=0 vy=0 vw=0 vh=0 n= rects=x,y,w,h;... text=...
// hidden=1 only when the sentence's glyphs really went through the opacity-0 drawing below (st.hid grew) and it is still on.
LR"MGLT((function(){
 try {
  if(typeof global.kag!='Object' || global.kag===void || global.kag===null) return 'wait kag';
  var k=global.kag;
  if(typeof k.fore!='Object' || k.fore===void) return 'wait fore';
  /* 2026-11-12 (ファタモルガーナの館: "メンバ __megulitKrkrState が見つかりません"): reading a missing member throws on some
     KiriKiri builds; typeof does not */
  var st=(typeof global.__megulitKrkrState=='Object')?global.__megulitKrkrState:void;
  if(st===void) {
   st=%['skipped'=>0,'drawArgs'=>void,'drawOp'=>0,'drawLo'=>256,'drawQuiet'=>0,'lastEnd'=>void,'charsSent'=>0,'charsErr'=>'','trWrapped'=>0,'trLine'=>0,'trText'=>'','trKey'=>'','trOp'=>void,'trT'=>void,'trOwner'=>void,'trRec'=>void,'skippedCls'=>'','lastFont'=>'','pfontName'=>void,'art'=>0,'artText'=>'','artSeen'=>[],'calls'=>0,'hid'=>0,'link'=>0,'wrapped'=>[],'recs'=>[],'active'=>void,'lastVis'=>-1,'timer'=>void,'line'=>0,'report'=>global.__megulitKrkrReport,'kag'=>k,'hooked'=>0,'oldLB'=>void,'oldPB'=>void,'oldPBC'=>void];
   st.screen=function(){
    var sw=+this.kag.scWidth,sh=+this.kag.scHeight;
    if(!(sw>0) || !(sh>0)) {sw=+this.kag.primaryLayer.width;sh=+this.kag.primaryLayer.height;}
    return [sw,sh];
   } incontextof st;
   st.abs=function(L){
    var ax=0,ay=0,l=L;
    for(var i=0;i<16;i++) {var p=l.parent;if(p===void || p===null) break;ax+=l.left;ay+=l.top;l=p;}
    return [ax,ay];
   } incontextof st;
   st.send=function(kind,rec,x0,x1){
    var s='ToMe_KRKR '+kind+' line='+rec.line+' same='+rec.same+' nvl='+rec.nvl+' x0='+int(x0)+' y0='+int(rec.y0)+' x1='+int(x1)+' y1='+int(rec.y1)+' size='+int(rec.size)+' sw='+int(rec.sw)+' sh='+int(rec.sh)+' n='+rec.n;
    if(rec.color>=0) {var h='',v=rec.color;for(var i=0;i<6;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;} s+=' color='+h;}
    if(typeof rec.paint=='String' && rec.paint!='') s+=' paint='+rec.paint;
    if(kind=='end') s+=' text='+rec.text;
    this.report(s);
   } incontextof st;
   /* What this sentence is really drawn with, for the reader to paint it the same (read / unread colours, dimming, outline):
      paint=f:rrggbbaa[,e:rrggbbaa:width][,s:rrggbbaa:dx:dy]. From the arguments of the line layer's own drawText call
      (this.drawArgs, kept by __megulitDraw before anything is changed); a layer that is not wrapped reports the KAG fields
      processCh draws from (chColor, edge / edgeColor / edgeExtent / edgeEmphasis, shadow / shadowColor). */
   st.hex=function(v,n){var h='';v=int(v);for(var i=0;i<n;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;} return h;} incontextof st;
   st.paintOf=function(L){
    try {
     var a=this.drawArgs;this.drawArgs=void;
     if(a!==void && a.count>=4) {
      /* a game that fades each character in draws it several times with a rising opacity: the sentence's opacity is the
         highest one it was drawn with (a dimmed read line is drawn at one constant opacity) */
      var op=a.count>4?+a[4]:255;if(op<this.drawOp) op=this.drawOp;if(op<0) op=0;if(op>255) op=255;
      var s='f:'+this.hex(+a[3]&0xffffff,6)+this.hex(op,2);
      var lv=a.count>6?+a[6]:0;if(lv>255) lv=255;
      if(lv>0) {
       var sc=a.count>7?(+a[7]&0xffffff):0,sw=a.count>8?+a[8]:0,ox=a.count>9?+a[9]:0,oy=a.count>10?+a[10]:0;
       if(ox==0 && oy==0) s+=',e:'+this.hex(sc,6)+this.hex(lv,2)+':'+int(sw);
       else s+=',s:'+this.hex(sc,6)+this.hex(lv,2)+':'+int(ox)+':'+int(oy);
      }
      return op<255?s+',a:1':s; /* not settled until st.fade says so */
     }
     if(typeof L.chColor!='Integer') return '';
     var s='f:'+this.hex(L.chColor&0xffffff,6)+'ff';
     if(L.edge && typeof L.edgeColor=='Integer') {var em=(typeof L.edgeEmphasis=='Integer')?+L.edgeEmphasis:255;if(em>255) em=255;if(em>0) s+=',e:'+this.hex(L.edgeColor&0xffffff,6)+this.hex(em,2)+':'+((typeof L.edgeExtent=='Integer')?int(L.edgeExtent):1);}
     else if(L.shadow && typeof L.shadowColor=='Integer') s+=',s:'+this.hex(L.shadowColor&0xffffff,6)+'ff:2:2';
     return s;
    } catch(e) {return '';}
   } incontextof st;
   st.track=function(rec,ch,lm,p0,oy){
    var L=rec.target;
    if(L.vertical) return;
    var scr=this.screen(),sw=scr[0],sh=scr[1];
    if(!(sw>0) || !(sh>0) || L.height<sh*0.2) return;
    var size=+L.fontSize;
    if(!(size>0)) {size=+L.font.height;if(size<0) size=-size;} /* no Math here: in a function bound to the state dictionary a bare global name reads as void */
    if(!(size>0)) return;
    var cx,cy;
    if(lm) {
     var ll=L.lineLayer;
     if(+L.lineLayerOriginY!=oy) p0=4;
     else if(+L.lineLayerPos==p0) return;
     cx=ll.left+p0;cy=ll.top+(+L.lineLayerBase)-size;
    } else {
     if(+L.y!=oy) {cx=+L.x-L.font.getTextWidth(ch);cy=+L.y;}
     else {if(+L.x==p0) return;cx=p0;cy=oy;}
    }
    var a=this.abs(L);cx+=a[0];cy+=a[1];
    if(rec.n==0) {
     this.fontReport(L);
     rec.line=++this.line;this.active=rec;rec.x0=cx;rec.y0=cy;rec.x1=cx;rec.y1=cy;rec.size=size;rec.text='';rec.sw=sw;rec.sh=sh;
     rec.nvl=L.height>=sh*0.45?1:0;rec.same=rec.cleared?0:1;rec.cleared=false;rec.rs='';rec.cn=0;rec.hc=0;rec.ct='';
     rec.color=-1;rec.paint=''; /* a missing colour belongs to this sentence, never the previous draw */
     {var pt=this.paintOf(L);if(pt!='') rec.paint=pt;}
     if(typeof L.chColor=='Integer') rec.color=L.chColor&0xffffff; /* E550: begin carries the colour too (narration grey / speech white), before the line is shown */
     var right=a[0]+L.width-(+L.marginR)-size;
     if(!(right>cx)) right=cx;
     rec.bx0=cx;rec.bx1=right;rec.settled=0;
     this.send('begin',rec,cx,right);
    }
    if(ch!='\n' && ch!='\r') {
     if(rec.n>0 && cy!=rec.ly) rec.text+='\n';rec.text+=ch;
     var cw=size;try {cw=+this.drawFont(L).getTextWidth(ch);} catch(e) {cw=size;}if(!(cw>0)) cw=size;
     /* blanks get no box (the record's text has none); a character counts as hidden when it was drawn while hiding was on */
     if(ch!=' ' && ch!='　' && ch!="\t") {rec.rs+=(rec.cn>0?';':'')+int(cx)+','+int(cy)+','+int(cw)+','+int(size);rec.cn++;rec.ct+=ch;if(this.hideOn()) rec.hc++;} else rec.ct+='';
    }
    rec.ly=cy;
    rec.n++;
    {var pt=this.paintOf(L);if(rec.settled && this.drawLo!=this.drawOp) rec.settled=0;if(pt!='') rec.paint=rec.settled?this.settle(pt):pt;}
    if(typeof L.chColor=='Integer') rec.color=L.chColor&0xffffff;
    if(cx<rec.x0) rec.x0=cx;
    if(cx>rec.x1) rec.x1=cx;
    if(cy<rec.y0) rec.y0=cy;
    if(cy>rec.y1) rec.y1=cy;
   } incontextof st;
   st.chars=function(rec){
    if(!(rec.cn>0)) return;
    /* the glyphs stay as drawn: a sentence is hidden when every one of its characters went through the opacity-0 draw */
    var h=(rec.hc>=rec.cn)?1:0;this.charsSent++;
    var t='',row='',c;
    for(var j=0;j<rec.text.length;j++) {c=rec.text.charAt(j);if(c=="\n") {if(row!='') t+=(t!=''?"\n":'')+row;row='';} else if(c!=' ' && c!='　' && c!="\t") row+=c;}
    if(row!='') t+=(t!=''?"\n":'')+row;
    this.report('ToMe_CHARS engine=krkr line='+rec.line+' hidden='+h+' sw='+int(rec.sw)+' sh='+int(rec.sh)+' vx=0 vy=0 vw=0 vh=0 n='+rec.cn+' rects='+rec.rs+' text='+t);
   } incontextof st;
)MGLT" LR"MGLT(
   st.flush=function(rec){
    /* kept for st.fade: a game that fades characters in is still raising their opacity after the click wait began */
    if(rec.n>0) {try {this.lastEnd=%['line'=>rec.line,'same'=>rec.same,'nvl'=>rec.nvl,'y0'=>rec.y0,'y1'=>rec.y1,'size'=>rec.size,'sw'=>rec.sw,'sh'=>rec.sh,'n'=>rec.n,'color'=>rec.color,'paint'=>rec.paint,'text'=>rec.text,'x0'=>rec.x0,'x1'=>rec.x1,'op'=>this.drawOp,'lo'=>this.drawLo,'q'=>0,'done'=>(this.drawOp>=255 || rec.settled)?1:0];} catch(e) {this.lastEnd=void;}}
    if(rec.n>0) {this.send('end',rec,rec.x0,rec.x1);try {this.chars(rec);} catch(e) {this.charsErr=e.message;}}
    rec.n=0;rec.text='';rec.rs='';rec.cn=0;rec.hc=0;rec.ct='';rec.settled=0;this.drawOp=0;this.drawLo=256;this.drawQuiet=0;
   } incontextof st;
   /* the finished sentence was drawn again with a higher opacity (fade-in still running): its end record is sent again with the
      opacity it has now, so the reader never keeps a sentence at the faint first step */
   /* Is a sentence drawn below full opacity dimmed (read text) or still fading in? One draw cannot tell, so the paint carries
      a:1 ("opacity not settled") until it is known, and the reader paints such a sentence opaque:
        - draws at different opacities = a fade-in: it settles only at full opacity;
        - every draw at one opacity and nothing drawn for three ticks (0.3 s) = dimmed: settled, a:1 dropped, sent again
          (as a begin while the sentence is still being typed, as an end after its click wait began).
      Run every 100 ms from the visibility timer. */
   st.settle=function(p){p=''+p;var n=p.length;return (n>4 && p.substring(n-4)==',a:1')?p.substring(0,n-4):p;} incontextof st;
   st.fade=function(){
    var a=this.active;
    if(a!==void && a!==null && a.n>0) {
     this.lastEnd=void;
     if(this.drawQuiet<1000) this.drawQuiet++;
     if(!a.settled && this.drawQuiet>=3 && this.drawOp>0 && this.drawOp<255 && this.drawLo==this.drawOp && (''+a.paint).substring(0,2)=='f:') {a.settled=1;a.paint=this.settle(a.paint);this.send('begin',a,a.bx0,a.bx1);}
     return;
    }
    var r=this.lastEnd;if(r===void || r===null) return;
    var p=''+r.paint;if(p.length<10 || p.substring(0,2)!='f:') return;
    if(this.drawOp>0) {
     if(this.drawLo<r.lo) r.lo=this.drawLo;
     var up=this.drawOp>r.op;if(up) r.op=this.drawOp;
     this.drawOp=0;this.drawLo=256;r.q=0;
     if(up) {p=this.settle(p);r.paint=p.substring(0,8)+this.hex(r.op>255?255:r.op,2)+p.substring(10)+(r.op<255?',a:1':'');r.done=r.op>=255?1:0;this.send('end',r,r.x0,r.x1);}
     return;
    }
    if(r.done) return;
    if(++r.q>=3 && r.op<255 && r.lo==r.op) {r.done=1;r.paint=this.settle(p);this.send('end',r,r.x0,r.x1);}
   } incontextof st;
   st.flushAll=function(){for(var i=0;i<this.recs.count;i++) this.flush(this.recs[i]);} incontextof st;
   /* 2026-11-12 (user: the game must think it draws its text while the output is ours): while MeguLit asks for it
      (__megulitKrkrHide()==1, only with HookBridge connected), a message layer draws its glyphs, ruby and shadows at opacity
      0. Layout, wrapping and the click wait are the engine's own; MeguLit draws the readable text at the reported place.
      Never break the game (a probe that wrapped a layer twice once raised "メンバ old が見つかりません"): each layer is
      wrapped once, its own method is kept on the layer (__mgOld), the wrapper is bound to that layer, and when it is called
      on anything else, or anything fails, the engine's native Layer.drawText draws with the game's own arguments. */
   st.hideOn=function(){try {return typeof global.__megulitKrkrHide=='Object' && global.__megulitKrkrHide()==1;} catch(e) {return false;}} incontextof st;
   if(typeof global.__megulitDraw!='Object') global.__megulitDraw=function(args*){
    var self=this,old=void;
    try {if(typeof self.__mgOld=='Object') old=self.__mgOld;} catch(e) {}
    if(old===void) old=global.Layer.drawText;
    try {
     var st=global.__megulitKrkrState;
     if(typeof st=='Object' && st!==void) {
      if(self.__mgKind=='msg') {
       st.calls++;
       {var d=[];d.assign(args);st.drawArgs=d;var o=d.count>4?+d[4]:255;if(o>st.drawOp) st.drawOp=o;if(o<st.drawLo) st.drawLo=o;st.drawQuiet=0;}
       /* 2026-11-21 (ファタモルガーナの館 incr11 23:33:41Z: the option 「……おはよう………………」 was drawn at opacity 0 with the dialogue and
          nothing drew it back: link text has no click wait, so no sentence end, no box). Text drawn while the message layer is
          inside a link (KAG MessageLayer.inLink >= 0) is a choice button: the game draws it as it is (its text and its click area
          stay), the choice overlay adds ruby and translation next to it */
       var inLink=false;try {var m=self.parent;if(m!==void && m!==null && isvalid m && typeof m.inLink!='undefined' && +m.inLink>=0) inLink=true;} catch(e) {}
       if(inLink) st.link++;
       if(st.hideOn() && !inLink) {
        var a=[];a.assign(args);
        while(a.count<7) a.add(a.count==4?255:(a.count==5?true:0));
        a[4]=0;a[6]=0;st.hid++;
        return (old incontextof self)(a*);
       }
      } else st.art++;
     }
    } catch(e) {}
    return (old incontextof self)(args*);
   };
   st.wrapAs=function(o,kind){
    try {
     if(o===void || o===null || !isvalid o || typeof o.drawText!='Object') return;
     if(typeof o.__mgKind=='String') {if(kind=='msg') o.__mgKind='msg';return;}
     /* 2026-11-12 (千恋＊万花: "Member checkUpdate does not exist" at start.ks 43 after a custom message-layer class got our
        drawText): only the plain Layer a message layer draws its line on (lineLayer, new Layer in KAG) is touched, never a
        message-layer class (a game's own subclass keeps its methods; such a game is embedded the other ways). */
     var isL=0,isK=0,isM=0;
     try {isL=(o instanceof "Layer")?1:0;} catch(e) {isL=2;}
     try {isK=(o instanceof "KAGLayer")?1:0;} catch(e) {isK=2;}
     try {isM=(o instanceof "MessageLayer")?1:0;} catch(e) {isM=2;}
     if(isL!=1 || isM!=0) {this.skipped++;this.skippedCls='L'+isL+'K'+isK+'M'+isM;return;}
     o.__mgOld=o.drawText;o.__mgKind=kind;
     o.drawText=(global.__megulitDraw incontextof o);
     if(kind=='msg') this.wrapped.add(o); else this.artSeen.add(o);
    } catch(e) {}
   } incontextof st;
   st.wrapDraw=function(o){this.wrapAs(o,'msg');} incontextof st;
   st.artWalk=function(L,d){
    try {
     if(L===void || L===null || d>8 || !isvalid L) return;
     this.wrapAs(L,'art');
     var c=L.children;if(typeof c!='Object' || c===void) return;
     for(var i=0;i<c.count && i<64;i++) this.artWalk(c[i],d+1);
    } catch(e) {}
   } incontextof st;
)MGLT" LR"MGLT(
   st.install=function(L){
    try {if(typeof L.lineLayer=='Object') this.wrapDraw(L.lineLayer);} catch(e) {}
    for(var i=0;i<this.recs.count;i++) if(this.recs[i].target===L) return;
    if(typeof L.processCh!='Object') return;
    var rec=%['target'=>L,'st'=>this,'oldCh'=>L.processCh,'oldClear'=>void,'n'=>0,'text'=>'','line'=>0,'same'=>0,'cleared'=>true,'nvl'=>0,'x0'=>0,'y0'=>0,'x1'=>0,'y1'=>0,'size'=>0,'sw'=>0,'sh'=>0,'ly'=>0,'color'=>-1,'paint'=>''];
    rec.ch=function(ch){
     var L=this.target,lm=false,p0=0,oy=0;
     try {
      var t=typeof L.lineLayerPos;
      if(typeof L.lineLayer=='Object' && L.lineLayer!==void && L.lineLayer!==null && (t=='Integer' || t=='Real')) {lm=true;p0=+L.lineLayerPos;oy=+L.lineLayerOriginY;}
      else {p0=+L.x;oy=+L.y;}
     } catch(e) {}
     if(typeof this.oldCh!='Object') return (global.MessageLayer.processCh incontextof this)(...);
     var result=(this.oldCh incontextof L)(...);
     try {this.st.track(this,ch,lm,p0,oy);} catch(e) {}
     return result;
    } incontextof rec;
    rec.clr=function(){
     try {this.st.flush(this);this.cleared=true;} catch(e) {}
     if(typeof this.oldClear!='Object') return (global.MessageLayer.clear incontextof this)(...);
     return (this.oldClear incontextof this.target)(...);
    } incontextof rec;
    L.processCh=rec.ch;
    if(typeof L.clear=='Object') {rec.oldClear=L.clear;L.clear=rec.clr;}
    this.recs.add(rec);
   } incontextof st;
   st.lb=function(){if(typeof this.oldLB!='Object') return (global.KAGWindow.showLineBreak incontextof this)(...);try {this.flushAll();} catch(e) {} return (this.oldLB incontextof this.kag)(...);} incontextof st;
   st.pb=function(){if(typeof this.oldPB!='Object') return (global.KAGWindow.showPageBreak incontextof this)(...);try {this.flushAll();} catch(e) {} return (this.oldPB incontextof this.kag)(...);} incontextof st;
   st.pbc=function(){if(typeof this.oldPBC!='Object') return (global.KAGWindow.showPageBreakAndClear incontextof this)(...);try {this.flushAll();} catch(e) {} return (this.oldPBC incontextof this.kag)(...);} incontextof st;
   /* 2026-11-12 (user, ファタモルガーナの館: the last line stayed on screen through the opening, where the game had hidden its
      text window): every 100 ms the layer of the latest sentence is checked on the front page, itself and every parent
      visible and not transparent; a change is reported as ToMe_DIALOG engine=krkr visible=0|1. */
   st.shown=function(L){
    try {
     var fore=this.kag.fore.messages,on=false;
     for(var i=0;i<fore.count;i++) if(fore[i]===L) {on=true;break;}
     if(!on) return 0;
     var l=L;
     for(var i=0;i<16;i++) {
      if(!l.visible) return 0;
      if(typeof l.opacity!='undefined' && +l.opacity<=0) return 0;
      var p=l.parent;if(p===void || p===null) break;l=p;
     }
     return 1;
    } catch(e) {return 1;}
   } incontextof st;
   /* Text architecture ③, engines on the TextRender plugin (textrender.dll; Yuzusoft KiriKiri Z, live 千恋＊万花
      2026-11-14): the message layer's text is drawn natively into its textLayer, never through processCh / drawText.
      TextRender.done (wrapped once on the class, which reaches every instance) is followed by getCharacters(0, n):
      each entry has text, x, y (render box), cw, size. The box sits at the message layer's margins; PreRenderFontEx
      pads its glyph cells by resizePadding. Hiding = that textLayer at opacity 0 (only the dialogue is on it), back
      to the game's own opacity as soon as MeguLit stops asking. */
   st.trLayer=function(){
    try {
     var c=this.kag.current;if(c!==void && c!==null && isvalid c && typeof c.textLayer=='Object' && c.textLayer!==void && c.textLayer!==null) return c;
     var ms=this.kag.fore.messages;for(var i=0;i<ms.count;i++) {var L=ms[i];if(L.visible && typeof L.textLayer=='Object' && L.textLayer!==void && L.textLayer!==null) return L;}
    } catch(e) {}
    return void;
   } incontextof st;
   st.trOwn=function(inst,L){
    try {if(inst===L.textLayer || (typeof inst.textLayer=='Object' && inst.textLayer!==void && inst.textLayer===L.textLayer)) return true;
     /* 2026-11-19 live 千恋＊万花: the plugin's renderers are bound to no layer (no textLayer member); one is the dialogue's
        only while KAG is writing to that very message layer */
     return typeof inst.textLayer=='undefined' && L===this.kag.current;} catch(e) {return false;}
   } incontextof st;
   st.trRestore=function(){
    try {if(this.trOp!==void && isvalid this.trT) {if(this.trT.opacity==0) this.trT.opacity=this.trOp;}} catch(e) {}
    this.trOp=void;this.trT=void;
   } incontextof st;
   st.trHide=function(){
    try {
     var L=this.trLayer();
     if(L===void || this.trOwner!==L || this.trRec===void) {this.trRestore();return;}
     var T=L.textLayer,on=this.hideOn();
     if(this.trT!==void && this.trT!==T) this.trRestore();
     if(on) {if(this.trOp===void || this.trT!==T) {this.trT=T;this.trOp=T.opacity;}
      /* a value other than 0 was set by the game since the last tick (its text window came back after a scene change): that is the game's own opacity now */
      if(T.opacity!=0) this.trOp=T.opacity;if(T.opacity!=0) T.opacity=0;}
     else this.trRestore();
     /* the line on screen changes its hidden state without a new render: send its record again */
     var h=(on && T.opacity==0)?1:0;
     if(this.trRec!==void && h!=this.trRec[0]) {this.trRec[0]=h;var r=this.trRec;this.trKey='';this.report('ToMe_CHARS engine=krkr line='+r[1]+' hidden='+h+r[2]);}
    } catch(e) {}
   } incontextof st;
   st.trNote=function(k){
    try {if(typeof this.trWhy!='Object' || this.trWhy===void) this.trWhy=%[];var n=(+this.trWhy[k])+1;this.trWhy[k]=n;
     if(n==1 || n==2 || n==4 || n==8 || n==16 || n==64 || n==256) this.report('ToMe_KRKR status trwhy '+k+'='+n+' sent='+(+this.charsSent));} catch(e) {}
   } incontextof st;
)MGLT" LR"MGLT(
   st.trDone=function(inst){
    try {
     /* 2026-11-19 why a TextRender line was not reported (live 千恋＊万花: no record at all, the reader stayed in its own box): counted per reason, on the status line */
     if(typeof this.trWhy!='Object' || this.trWhy===void) this.trWhy=%[];
     var L=this.trLayer();if(L===void) {this.trNote('layer');return;}if(!this.trOwn(inst,L)) {this.trNote('own');return;}
     var scr=this.screen();if(!(scr[1]>0)) {this.trNote('scr');return;}if(L.height<scr[1]*0.2) {this.trNote('small');return;}if(!this.shown(L)) {this.trNote('hid');return;}
     var cs=(inst.getCharacters incontextof inst)(0,100000);if(typeof cs!='Object' || cs===null || cs.count==0) {this.trNote('empty');return;}
     var a=this.abs(L),ox=a[0]+(+L.marginL),oy=a[1]+(+L.marginT),pad=0;
     try {var pf=L.textLayer._preRenderFontEx;if(typeof pf=='Object' && pf!==void && typeof pf.resizePadding=='Integer') pad=pf.resizePadding;} catch(e) {}
     var rs='',n=0,t='',ly=void,all=[],pts=[];
     for(var i=0;i<cs.count;i++) {
      var c=cs[i],ch=''+c.text;if(ch=='' || ch==' ' || ch=='　' || ch=="\t" || ch=="\n") continue;
      var y=+c.y;if(ly!==void && y!=ly) t+="\n";ly=y;t+=ch;
      rs+=(n>0?';':'')+int(ox+(+c.x))+','+int(oy+y+pad)+','+int(+c.cw)+','+int(+c.size);n++;
      if(all.count<400) all.add([ox+(+c.x),oy+y+pad,+c.cw,+c.size]);
     }
     /* 2026-11-21 (owner incr9, 千恋＊万花): a line written back blank (the hide fell back to write-back) lays out only spaces: counted, so the status line says so */
     if(n==0) {this.trNote('blank');return;}
     if(this.trOwner!==L) {this.trRestore();this.trRec=void;this.trOwner=L;this.trText='';this.trKey='';}
     var flat=t.replace(/\n/g,'');
     var from=0;
     if(!(this.trText!='' && (flat.indexOf(this.trText)==0 || this.trText.indexOf(flat)==0))) {this.trLine++;this.trCol=void;this.trTry=0;}
     /* a page that grew by a sentence: its colour is that sentence's own (a read line above a new one keeps its yellow) */
     else if(flat.length>this.trText.length+1 && flat.indexOf(this.trText)==0) {from=this.trText.length;this.trCol=void;this.trTry=0;}
     for(var i=from;i<all.count && pts.count<6;i++) pts.add(all[i]);
     var T=L.textLayer,h=(this.hideOn() && T.opacity==0)?1:0,scr=this.screen();
     var key=this.trLine+'|'+h+'|'+rs;if(key==this.trKey) return;this.trKey=key;this.trText=flat;this.charsSent++;
     this.trPts=pts;this.trAbsL=a;this.trTailA=' sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n='+n+' rects='+rs;this.trTailB=' text='+t;
     var tail=this.trTailA+(this.trCol!==void?' color='+this.trCol:'')+this.trTailB;
     this.trRec=[h,100000+this.trLine,tail];
     this.report('ToMe_CHARS engine=krkr line='+(100000+this.trLine)+' hidden='+h+tail);
     this.trHide();
    } catch(e) {this.charsErr='tr '+e.message;}
   } incontextof st;
)MGLT" LR"MGLT(
   /* 2026-11-19 live 死に逝く君、館に芽吹く憎悪: a TextRender game paints read lines yellow and new ones white without touching
      chColor, so the record carries the colour the glyphs really have: the most common opaque pixel inside the first
      characters' boxes of the (possibly opacity-0) text layer, sampled once the typewriter has drawn them. */
   st.trSample=function(){
    if(this.trRec===void || this.trCol!==void || this.trPts===void || this.trOwner===void) return;
    if(this.trTry===void) this.trTry=0;if(++this.trTry>40) return;
    var T=this.trOwner.textLayer;if(typeof T!='Object' || T===void || T===null) return;
    /* a text layer that is not a child of its message layer is that layer's own buffer, laid at the message layer's origin */
    var at=T.parent===this.trOwner?this.abs(T):this.trAbsL,cnt=%[],rep=%[],best='',bn=0,bestL='',bnL=0,lit=0,lv=-1,lb=0,w=+T.imageWidth,hh=+T.imageHeight,amin=this.trTry>10?0x40:0xc0,need=this.trPts.count<=4?3:6;
    for(var i=0;i<this.trPts.count;i++) {
     var p=this.trPts[i];
     for(var gy=1;gy<=6;gy++) for(var gx=1;gx<=6;gx++) {
      var x=int(p[0]-at[0]+p[2]*gx/7),y=int(p[1]-at[1]+p[3]*gy/7);
      if(x<0 || y<0 || x>=w || y>=hh) continue;
      var px=T.getMainPixel(x,y),rgb=px&0xffffff;
      /* a buffer drawn with holdAlpha keeps alpha 0: there the glyph body is its brightest pixel (edges blend to the background) */
      if(rgb!=0) {lit++;var lum=((rgb>>16)&255)+((rgb>>8)&255)+(rgb&255);if(lum>lv) {lv=lum;lb=rgb;}}
      /* a short sentence that fades in (live 死に逝く君: 窃盗。 器物破損。 got no colour) has few glyph pixels, still half transparent,
         in several anti-aliased shades: after a second half-transparent pixels count too (their colour is already the glyph's),
         and near shades are one colour (5 bits a channel, reported as the first full value seen) */
      if(((px>>24)&255)<amin) continue;
      var k=''+(((rgb>>19)&31)<<10 | ((rgb>>11)&31)<<5 | ((rgb>>3)&31)),c=cnt[k];if(c===void) {c=0;rep[k]=rgb;}c++;cnt[k]=c;if(c>bn) {bn=c;best=''+rep[k];}
      /* the most common colour that is not near black, kept apart: a dark outline can outnumber a thin fill */
      if(((rgb>>16)&255)+((rgb>>8)&255)+(rgb&255)>=144 && c>bnL) {bnL=c;bestL=''+rep[k];}
     }
    }
    /* opaque glyph pixels already have their final colour: taken at the first tick (live 死に逝く君: 父親が死んだ。 was on screen for
       170 ms and got none); the brightest-pixel fallback still waits for the typewriter and any fade-in */
    /* ToMe_KRKR colorlog: one diagnostic record a sentence, what the sampler saw (HookBridge writes it to the log). Its own
       record: the status line is left alone (a status change stopped this path on live 千恋＊万花, see the report). */
    if(this.trTry==20 && bn<need && lit<3) this.report('ToMe_KRKR colorlog line='+this.trRec[1]+' col=- try=20 opaque='+bn+'/'+need+' lit='+lit);
    if(bn<need && (lit<3 || this.trTry<3)) return; /* a few ticks in: the typewriter and any fade-in have drawn the first glyphs */
    var h='',v=bn>=need?+best:lb,dk=0;
    /* the outline or shadow pass is drawn first and is near black; the reader drops a near-black colour as an outline, which
       leaves the sentence with no colour at all. A brighter colour holding a third as many pixels is the text. */
    if(bn>=need && bestL!='' && bnL*3>=bn) {var bd=+best;if(((bd>>16)&255)+((bd>>8)&255)+(bd&255)<144) {v=+bestL;dk=1;}}
    for(var i=0;i<6;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;}
    this.report('ToMe_KRKR colorlog line='+this.trRec[1]+' col='+h+' try='+this.trTry+' opaque='+bn+'/'+need+' lit='+lit+' bright='+bnL+' dark='+dk);
    this.trCol=h;var r=this.trRec;r[2]=this.trTailA+' color='+h+this.trTailB;this.trKey='';
    this.report('ToMe_CHARS engine=krkr line='+r[1]+' hidden='+r[0]+r[2]);
   } incontextof st;
   st.trWrap=function(){
    try {
     if(this.trWrapped || typeof global.TextRender!='Object' || global.TextRender===void) return;
     if(typeof global.TextRender.done!='Object' || typeof global.TextRender.getCharacters!='Object') return;
     /* bound to no context, so `this` is the TextRender instance the game calls done on; installed once per run */
     if(typeof global.__megulitTrHook!='Object') global.__megulitTrHook=function(args*){
      var r=(global.__megulitTrDone incontextof this)(args*);
      try {var st=global.__megulitKrkrState;if(typeof st=='Object' && st!==void) st.trDone(this);} catch(e) {}
      return r;
     };
     var d=global.TextRender.done;
     if(typeof global.__megulitTrDone!='Object') global.__megulitTrDone=d;
     global.TextRender.done=(global.__megulitTrHook incontextof null);
     this.trWrapped=1;
    } catch(e) {this.charsErr='trwrap '+e.message;}
   } incontextof st;
)MGLT" LR"MGLT(
   st.vis=function(){
    try {this.trHide();} catch(e) {}
    try {this.fade();} catch(e) {}
    try {this.trSample();} catch(e) {this.trTry=99;}
    try {
     var r=this.active;if(r===void || r===null || !isvalid r.target) return;
     var v=this.shown(r.target);
     if(v!=this.lastVis) {this.lastVis=v;this.report('ToMe_DIALOG engine=krkr visible='+v);}
    } catch(e) {}
   } incontextof st;
   /* the face the latest sentence was drawn with, reported when it changes (checked with every refresh) */
   /* E475: the font that draws is the KAG lineLayer's (MessageLayer.userFace, e.g. ＭＳ Ｐ明朝), not the message layer's own
      (ＭＳ Ｐゴシック in ファタモルガーナの館); a game may also map pre-rendered glyphs over it with [mappfont storage=x.tft]
      (KAGWindow.mapPrerenderedFont), found read-only in first.ks. Nothing is wrapped or written. */
   st.drawFont=function(L){var f=void;try {if(typeof L.lineLayer=='Object' && L.lineLayer!==void && L.lineLayer!==null) f=L.lineLayer.font;} catch(e) {f=void;}if(f===void || f===null) f=L.font;return f;} incontextof st;
   st.pfont=function(){if(this.pfontName!==void) return this.pfontName;this.pfontName='';try {var a=[].load('first.ks');for(var i=0;i<a.count && i<4000;i++) {var t=''+a[i],j=t.indexOf('mappfont');if(j<0 || t.charAt(0)==';') continue;var m=/storage\s*=\s*["']?([^"'\s\]]+)/.exec(t.substring(j));if(m!==void && m!==null && m.count>1) {this.pfontName=''+m[1];break;}}} catch(e) {}return this.pfontName;} incontextof st;
   st.fontReport=function(L){try {var f=this.drawFont(L),face=''+f.face,h=+f.height;if(h<0) h=-h;h=int(h);var b=f.bold?1:0,key=face+'/'+h+'/'+b;if(face!='' && key!=this.lastFont) {this.lastFont=key;var pf=this.pfont();this.report('ToMe_KRKR font size='+h+' bold='+b+(pf!=''?' pfont='+pf:'')+' face='+face);}return key;} catch(e) {return 'err '+e.message;}} incontextof st;
   st.fontCheck=function(){var r=this.active;if(r===void || r===null) return;this.fontReport(r.target);} incontextof st;
   st.fontNow=function(){var r=this.active;if(r===void || r===null) return '-';return this.fontReport(r.target);} incontextof st;
   st.refresh=function(){
    try {
     var k=this.kag;
     if(global.kag!==k) return 'kag changed';
     if(!this.hooked) {
      if(typeof k.showLineBreak=='Object') {this.oldLB=k.showLineBreak;k.showLineBreak=this.lb;}
      if(typeof k.showPageBreak=='Object') {this.oldPB=k.showPageBreak;k.showPageBreak=this.pb;}
      if(typeof k.showPageBreakAndClear=='Object') {this.oldPBC=k.showPageBreakAndClear;k.showPageBreakAndClear=this.pbc;}
      this.hooked=1;
     }
     if(!this.trWrapped) {this.trWrap();
     }
     if(this.timer===void && typeof global.Timer=='Object') {
      try {this.timer=new global.Timer(this.vis,'');this.timer.interval=100;this.timer.enabled=true;} catch(e) {this.timer=null;}
     }
     for(var i=this.recs.count-1;i>=0;i--) if(!isvalid this.recs[i].target) this.recs.erase(i);
     for(var i=this.wrapped.count-1;i>=0;i--) if(!isvalid this.wrapped[i]) this.wrapped.erase(i);
     for(var i=this.artSeen.count-1;i>=0;i--) if(!isvalid this.artSeen[i]) this.artSeen.erase(i);
     var pages=[k.fore,k.back];
     for(var i=0;i<pages.count;i++) {
      var ms=pages[i].messages;
      if(typeof ms!='Object' || ms===void || ms===null) continue;
      for(var j=0;j<ms.count && j<32;j++) this.install(ms[j]);
     }
     return 'ok layers='+this.recs.count+' lines='+this.line+' wait='+(this.oldLB!==void?1:0)+(this.oldPB!==void?1:0)+' wrapped='+this.wrapped.count+' tr='+(this.trWrapped?1:0)+(typeof this.trWhy=='Object' && this.trWhy!==void?'/layer'+(+this.trWhy.layer)+'/own'+(+this.trWhy.own)+'/scr'+(+this.trWhy.scr)+'/small'+(+this.trWhy.small)+'/hid'+(+this.trWhy.hid)+'/empty'+(+this.trWhy.empty)+'/blank'+(+this.trWhy.blank):'')+'/sent'+(+this.charsSent)+(this.charsErr!==void?'/err:'+this.charsErr:'')+' draws='+this.calls+' hidden='+this.hid+' link='+this.link+' art='+this.art+' artLayers='+this.artSeen.count+' font='+this.fontNow()+' chars='+this.charsSent+(this.charsErr!=''?' charsErr='+this.charsErr:'')+' skipped='+this.skipped+(this.skippedCls!=''?'('+this.skippedCls+')':'');
    } catch(e) {return 'error '+e.message;}
   } incontextof st;
   global.__megulitKrkrState=st;
  }
  return st.refresh();
 } catch(e) {return 'error '+e.message;}
})())MGLT"
