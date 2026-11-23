'use strict';
// Automatic hiding of the reading layer when the game shows no dialogue.
// CS2 (ISLAND) reports its message sprite's visibility (ToMe_DIALOG). The sprite blinks off and on within one draw
// burst for every line, so only an "off" that lasts 600 ms with no "on" and no new line hides the layer (OP, CG,
// window hidden); markers and screen comparison are not used while the engine reports this.
// Never hides on a reading pause alone. Modes:
//  hook   – only an explicit empty-text signal from the hook hides it
//  visual – calibrated dialog-box edge comparison
//  marker – the game's waiting marker (▼): once it has been seen for the current line and then
//           disappears without a new line following, the dialogue box is gone (CG, menu, transition).
//           If the marker is never seen for a line, nothing is hidden.
/* 2026-11-19 (user: Alt+T kept switching the subtitles and the game's text box, after more than twenty fixes). One place
   decides whether the reading layer shows: set(). Every caller names its source. FACT sources are what the game or the
   player really did (engine signal, hook text, a new line, choices, settings, a key or click); every other source, also
   one added later and not listed here, is an INFERENCE from what the screen looks like (wait marker, box probes, scene
   compare). While the context is frozen (MeguLit's menu or a word card is open, the game is not in front, and SETTLE ms
   after the game is back) an inference can neither hide nor show the layer and collects no evidence: opening or closing
   the Alt+T menu changes focus, z-order and the picture the probes read, and each earlier fix closed only the one probe
   that had just misread it. */
const FACT=new Set(['engine','hook','line','choices','config','bind','input','return']),SETTLE=500;
class Immersion{
 constructor(emit,now=Date.now){this.emit=emit;this.now=now;this.thawAt=0;this.deferred={};this.visible=true;this.pending=null;this.enabled=false;this.mode='hook';this.target='';this.markerPresent=false;this.resetLine();}
 // markerPresent mirrors the screen and is kept: the native side reports only changes, and a new line's marker is
 // often detected a little before the hook text arrives.
 resetLine(){this.lineAt=this.now?this.now():0;/* 2026-11-19 (1.4.17 live, 千恋＊万花 / 死に逝く君: the subtitle vanished ~30 s into a line the player was still reading, the animated wait marker no longer detected) a line the player's own click or key brought up is read by hand: no marker loss alone closes it */this.manualLine=this.inputAt!=null&&this.lineAt-this.inputAt<3000;this.lineLength=0;this.markerSeen=false;this.markerGoneAt=0;this.drawnAt=0;this.typing=false;this.lineReadyAt=this.lineAt;this.currentText='';}
 frozen(){return this.contextActive===false||this.menuOpen===true||this.thawAt>0&&this.now()<this.thawAt;}
 /* 2026-11-19 (user, 千恋＊万花: the original showed for a moment now and then). The reading layer is away because the game's text window is
    not on screen: the game took it away for a staged pause (log 11:20:44.415 "text window hidden: box 73%, picture 0%", the next line 2.8 s
    later) or changed the scene (11:20:32.916 "scene changed 80%, box 59%"). There is no text to give back to the game then, and giving it
    back made the game draw the next line itself before the hide was on again. Not this: a skip (the game shows its own fast-forward),
    a marker or a focus change, where the layer is away while the game's text is still there to read. */
    /* 2026-11-21 (owner's recording 08:28, 千恋＊万花 incr11, hook-diagnostics 23:28:17.47-21.31): a skip counts too, until the next line shows the
    layer. The hide layers stand down while the key is held anyway (the game shows its own fast-forward); the layer was hidden for the skip at
    17.88, the key let go at 19.06, the next line delivered after the skip burst settled (20.07) and shown 0.7 s later (20.80): 1.6 s of
    "lost" samples had passed, the bridge gave the text back at 20.49 and the game drew 「観光に来たわけじゃないんだから…」 itself under the
    returning layer until 21.31. A layer away for a skip has nothing to give back either. */
 awayByDialog(){return this.visible===false&&(this.reason==='skip'||this.skipAt==null&&(this.windowHidden===true||this.sceneHidden===true));}
 /* an inference that arrived while frozen: a hide is dropped, a "shown again" of the text window or the scene is kept for the thaw */
 refuse(source,visible,why=''){if(visible&&(source==='window'||source==='scene'))this.deferred[source]=why;else delete this.deferred[source];this.onDecision?.({refused:true,source,visible,why,frozen:this.contextActive===false?'context':this.menuOpen?'menu':'settling'});return false;}
 /* the menu was opened or closed (reader service): frozen while it is open and for a while after, with or without a native context report */
 menu(open){this.menuOpen=open===true;this.freeze();}
 freeze(ms=900){this.thawAt=Math.max(this.thawAt,this.now()+ms);this.forget();}
 forget(){this.markerSeen=false;this.markerGoneAt=0;this.drawnAt=0;this.inputAt=null;if(this.pending&&!FACT.has(this.pending.source))this.pending=null;}
 /* 2026-11-19 16:17 (user: back from another window, nothing was left). A hide that rested only on a missing wait marker
    (the weakest inference) does not outlive leaving and coming back: its evidence was thrown away when the context
    froze, so nothing could ever lift it again before the next line. The player coming back is a fact: the current line
    shows; the probes start over and may hide it again on fresh evidence. A hide the engine, the scene or the text
    window asked for stays, and so does one while the player holds skip. */
 thaw(){this.thawAt=0;this.forget();const d=this.deferred;this.deferred={};if('window' in d)this.window(true,d.window);if('scene' in d)this.scene(true,d.scene);
  if(!this.visible&&this.hiddenByMarker&&!this.sceneHidden&&!this.windowHidden&&this.skipAt==null&&!(this.engineLive()&&this.engineSignal===false)){this.hiddenByMarker=false;this.set(true,'','return');}
  if(this.markerPresent)this.marker(true);}
 configure(v){const enabled=v.immersion===true,mode=['hook','visual','marker'].includes(v.dialogDetection)?v.dialogDetection:'hook';if(enabled!==this.enabled||mode!==this.mode){this.enabled=enabled;this.mode=mode;this.pending=null;this.skipAt=null;this.sceneHidden=false;this.resetLine();if(enabled&&this.engineSignal===false)this.evidence(false,'engine');else this.set(true,'','config');}}
 bind(target){if(target!==this.target){this.target=target;this.resumeAt=0;this.pending=null;this.markerPresent=false;this.engineSignal=null;this.engineText=undefined;this.skipAt=null;this.sceneHidden=false;this.thawAt=0;this.menuOpen=false;this.deferred={};this.resetLine();this.set(true,'','bind');}}
 /* 2026-11-13 choices on screen (hookChoices): MeguLit draws over them, so the reader is not hidden while they are up */
 choices(on){this.choiceUp=on===true;if(this.choiceUp&&!this.visible){this.set(true,'','choices');this.choiceOnly=true;this.emit({dialogVisible:true,choiceOnly:true});}else if(!this.choiceUp&&this.choiceOnly){this.choiceOnly=false;this.emit({dialogVisible:true,choiceOnly:false});}}
 /* a hide while choices are up keeps the reader for them but not its dialogue line (the game hid its text box) */set(visible,why='',source='unknown'){if(this.visible!==visible&&!FACT.has(source)&&this.frozen())return this.refuse(source,visible,why);if(!visible&&this.choiceUp){if(!this.choiceOnly){this.choiceOnly=true;this.emit({dialogVisible:true,choiceOnly:true});}return;}if(visible&&this.choiceOnly&&!this.choiceUp)this.choiceOnly=false;this.reason=visible?'':why;this.showAt=0;if(visible){this.hiddenByMarker=false;this.hiddenByAuto=false;this.resumeAt=0;}if(this.visible!==visible){this.visible=visible;this.onDecision?.({source,visible,why});this.emit(visible?{dialogVisible:true}:{dialogVisible:false,reason:why||'unknown'});}}
 // CS2 re-sends the current line's text several times per line and again on redraws: only a different line counts as
 // a new line, or a repeat would cancel every pending hide (OP, CG) right after the sprite went off.
 input(){this.inputAt=this.now();}
 /* A game may stop drawing its waiting marker while unfocused or under our menu; that is not a hidden dialogue box. */
 context(active){if(typeof active!=='boolean'||active===this.contextActive)return;this.contextActive=active;this.markerPresent=false;this.thawAt=active?Math.max(this.thawAt,this.now()+SETTLE):0;this.forget();}
 /* Issue 127 (user: with blurred translations, hovering back and forth over them sometimes lost the subtitles). The pointer on
    MeguLit's own text means the line is being read: a marker that left meanwhile (many engines drop it while the pointer
    moves) does not hide the layer, and a marker hide already in place is lifted. */
 reading(){this.readingAt=this.now();if(this.enabled&&this.hiddenByMarker&&!this.visible&&!this.sceneHidden&&this.skipAt==null){this.hiddenByMarker=false;this.markerGoneAt=0;this.set(true,'','input');}}
 skip(held){if(!this.enabled)return;if(held){this.skipAt??=this.now();}else this.skipAt=null;}
 /* E422 (user, WoH: the layer still hid by itself; reader log: "scene changed 98%"). A scene hide that came before the first
    page line stayed: once the game was known as a page game every "scene back" was ignored. The page game is known from
    the hook (flowGame) before any line, and a hide already in place is lifted. */
 isFlow(){return this.flow===true||this.flowGame?.()===true;}
 /* E578 (live beta39, ダストマニア, immersion off): the player hid the game's text window and MeguLit's line stayed on the bare
    picture. The text window is followed whatever the immersion switch says; a flow page has no text window. */
 window(visible,why='window'){if(typeof visible!=='boolean'||this.isFlow())return;if(this.frozen())return this.refuse('window',visible,why);this.windowHidden=!visible;if(!visible){this.pending=null;this.set(false,why,'window');}else if(!this.sceneHidden&&this.skipAt==null)this.set(true,'','window');}
 scene(visible,why='scene'){if(!this.enabled||typeof visible!=='boolean')return;if(this.frozen())return this.refuse('scene',visible,why);if(this.isFlow()){if(this.sceneHidden){this.sceneHidden=false;if(this.skipAt==null)this.set(true,'','scene');}return;}this.sceneHidden=!visible;if(!visible){this.pending=null;this.resumeAt=0;this.set(false,why,'scene');}else if(this.skipAt==null)this.set(true,'','scene');}
 /* E323: a flow page (WoH) has no dialogue box; the box probes (auto box, scene) hid and showed the layer at random there. */
 source(text,engine,origin){const flow=engine==='nvl';if(flow&&this.sceneHidden){this.sceneHidden=false;this.hiddenByMarker=false;this.hiddenByAuto=false;}this.flow=flow;if(this.sceneHidden&&text===this.currentText)return;/* E282 (user: 爱上火车 kept the layer on the title screen): KiriKiri redraws hand the same line over again and again; only a different line restarts the line timers */if(engine!=='cs2'&&typeof text==='string'&&text.trim()&&text===this.currentText&&this.now()-this.lineAt<60000)return;if(engine==='cs2'&&typeof text==='string'){if(text===this.engineText)return;this.engineText=text;}if(engine==='cs2'){this.engineSignal=true;this.pending=null;}if(typeof text==='string'&&text.trim()){this.pending=null;this.resetLine();this.currentText=text;this.lineLength=[...text].length;this.lineReadyAt=this.lineAt+Math.min(15000,Math.max(0,(this.lineLength-40)*35));this.sceneHidden=false;if(this.skipAt==null)this.showWhenDrawn();}else if(typeof text==='string'&&text==='')this.evidence(false,origin==='leave'?'leave':'hook');}
 /* E277 (user, 2026-11-09): the hook often reads the next line while the game is still in a transition or on a black
    screen, and the layer showed before the game drew a single character. While the layer is auto-hidden, a new line
    shows it only once something proves it is on screen (wait marker, dialog box, engine signal, scene) or after
    0.7 s at the latest, so games without those signals still show it. */
 showWhenDrawn(){if(!this.enabled||this.visible){this.set(true,'','line');return;}this.showAt=this.now()+700;}
 drawn(){if(this.showAt&&!this.sceneHidden&&this.skipAt==null)this.set(true,'','line');}
 reveal(text,typing){if(text!==this.currentText||typeof typing!=='boolean')return;this.typing=typing;if(typing){this.markerSeen=false;this.markerGoneAt=0;this.drawnAt=0;}else this.lineReadyAt=Math.min(this.lineReadyAt,this.now());}
 /* E411 (user, WoH: the layer kept hiding by itself). A full-screen page has no dialogue box to see: the visual box edge
    and the auto box never hide it. */
 evidence(visible,source){if(!FACT.has(source)&&this.frozen())return this.refuse(source,visible);if(!this.enabled||visible&&(this.sceneHidden||this.skipAt!=null))return;if(!visible&&this.isFlow()&&(source==='visual'||source==='auto'))return;if(this.engineLive()&&source!=='engine')return;if(visible){this.pending=null;this.set(true,'',source);}else if(!this.pending||this.pending.source!==source)this.pending={at:this.now(),source};}
 // A marker that comes back after a marker-based hide means the same line's dialogue box is back (window restored
 // after Hide W., a menu or the backlog closed): show the layer again instead of waiting for the next line.
 // The engine signal covers only the window it watches (ISLAND: the narration page). Lines drawn elsewhere (ADV box,
 // OP credits) report no visibility at all: for those lines fall back to the wait marker instead of never hiding.
 engineLive(){return this.engineSignal!=null&&(this.engineAt||0)>=this.lineAt-1500;}
 engine(visible,engine){if(!/^[a-z][a-z0-9_-]{1,40}$/i.test(engine||'')||typeof visible!=='boolean')return;this.engineAt=this.now();this.engineSignal=visible;/* 2026-11-12 (user: our text must do what the game's does) when the engine itself shows or hides its text window, so do our lines, whatever the immersion setting */if(!this.enabled){this.set(visible,visible?'':'engine','engine');return;}if(visible){this.drawn();if(this.sceneHidden||this.skipAt!=null)return;this.pending=null;if(this.visible)this.set(true,'','engine');else if(!this.resumeAt)this.resumeAt=this.now()+150;}else{this.resumeAt=0;this.evidence(false,'engine');}}
 // E263: the auto-calibrated box probe (any game, no setup). A visible wait marker or an engine signal wins.
 autoBox(visible){if(!this.enabled||typeof visible!=='boolean'||this.engineLive()||this.isFlow())return;if(this.frozen())return this.refuse('auto',visible);if(visible){this.drawn();if(this.hiddenByAuto){this.hiddenByAuto=false;if(!this.sceneHidden&&this.skipAt==null)this.set(true,'','auto');}if(this.pending?.source==='auto')this.pending=null;return;}if(this.typing||this.present())return;this.hiddenByAuto=true;this.evidence(false,'auto');}
 marker(present){if(this.contextActive===false||this.engineLive())return;/* the mirror of the screen is kept while settling, what follows from it waits for the thaw */this.markerPresent=!!present;if(this.frozen())return;if(present)this.drawn();if(this.typing||this.now()<this.lineReadyAt)return;if(present){this.markerSeen=true;if(this.hiddenByMarker&&this.enabled&&this.mode==='marker'&&!this.sceneHidden&&this.skipAt==null){this.hiddenByMarker=false;this.set(true,'','marker');}}else if(this.markerSeen)this.markerGoneAt=this.now();}
 markerDrawn(){if(this.frozen())return;this.drawn();if(this.engineLive()||this.typing||this.now()<this.lineReadyAt)return;this.drawnAt=this.now();this.markerSeen=true;}
 present(){return this.markerPresent||this.now()-this.drawnAt<1500;}
 tick(){
  if(this.thawAt&&this.contextActive!==false&&!this.menuOpen&&this.now()>=this.thawAt)this.thaw();
  if(!this.enabled)return;
  if(this.skipAt!=null&&this.now()-this.skipAt>=350){this.set(false,'skip','input');return;}
  if(this.sceneHidden)return;
  if(this.showAt&&this.now()>=this.showAt){this.set(true,'','line');return;}
  // A show precedes a new line. Let its confirmed source replace the old page before restoring the layer.
  if(this.resumeAt&&this.now()>=this.resumeAt){this.resumeAt=0;this.set(true,'','engine');}
  if(this.pending&&this.now()-this.pending.at>=(this.pending.source==='engine'?600:350)){const why=this.pending.source;this.pending=null;this.set(false,why,why);return;}
  if(this.engineLive()||this.frozen())return;
  /* E411: on a full-screen page the wait marker leaves at every click while the page's text stays (reader log: "marker"
     hides every few seconds); its absence is no sign that the text is gone. Skip and the page's own lines still decide. */
  if(this.isFlow())return;
  if(this.typing||this.now()<this.lineReadyAt)return;
  // A marker still on screen 0.4 s into a line belongs to this line (the previous one is cleared when the game advances).
  if(this.mode==='marker'&&!this.markerSeen&&this.markerPresent&&this.now()-this.lineAt>=400)this.markerSeen=true;
  if(this.mode!=='marker'||!this.visible||!this.markerSeen||this.present())return;
  // The marker has left: give the next line time to arrive (clicking on normally produces it within ~0.2 s).
  const gone=Math.max(this.markerGoneAt,this.drawnAt?this.drawnAt+1500:0);
  /* E277: 0.6 s, not 1.2 s (user: the layer stayed up well into the transition) */
  /* #114 (user: hovering a game's own settings button, or a button outside the window, made the layer vanish): many
     engines drop the wait marker while the pointer is over their buttons. Without a click, Space or Enter in the game
     shortly before, a missing marker only hides after 8 s (auto mode, a long hover); after such an advance input 0.6 s. */
  const advanced=this.inputAt!=null&&this.inputAt>=gone-2500&&this.inputAt<=gone+600;
  if(this.readingAt!=null&&this.now()-this.readingAt<3000)return;
  if(gone&&this.now()-gone>=(advanced?600:this.manualLine?Infinity:8000)){if(this.set(false,'marker','marker')!==false)this.hiddenByMarker=true;}
 }
}
module.exports={Immersion,FACT,SETTLE};
