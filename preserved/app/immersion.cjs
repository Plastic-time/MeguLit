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
class Immersion{
 constructor(emit,now=Date.now){this.emit=emit;this.now=now;this.visible=true;this.pending=null;this.enabled=false;this.mode='hook';this.target='';this.markerPresent=false;this.resetLine();}
 // markerPresent mirrors the screen and is kept: the native side reports only changes, and a new line's marker is
 // often detected a little before the hook text arrives.
 resetLine(){this.lineAt=this.now?this.now():0;this.lineLength=0;this.markerSeen=false;this.markerGoneAt=0;this.drawnAt=0;}
 configure(v){const enabled=v.immersion===true,mode=['hook','visual','marker'].includes(v.dialogDetection)?v.dialogDetection:'hook';if(enabled!==this.enabled||mode!==this.mode){this.enabled=enabled;this.mode=mode;this.pending=null;this.resetLine();if(enabled&&this.engineSignal===false)this.evidence(false,'engine');else this.set(true);}}
 bind(target){if(target!==this.target){this.target=target;this.resumeAt=0;this.pending=null;this.markerPresent=false;this.engineSignal=null;this.engineText=undefined;this.resetLine();this.set(true);}}
 set(visible){if(visible){this.hiddenByMarker=false;this.resumeAt=0;}if(this.visible!==visible){this.visible=visible;this.emit({dialogVisible:visible});}}
 // CS2 re-sends the current line's text several times per line and again on redraws: only a different line counts as
 // a new line, or a repeat would cancel every pending hide (OP, CG) right after the sprite went off.
 source(text,engine){if(engine==='cs2'&&typeof text==='string'){if(text===this.engineText)return;this.engineText=text;}if(engine==='cs2'){this.engineSignal=true;this.pending=null;this.set(true);}if(typeof text==='string'&&text.trim()){this.pending=null;this.resetLine();this.lineLength=[...text].length;this.set(true);}else if(typeof text==='string'&&text==='')this.evidence(false,'hook');}
 evidence(visible,source){if(!this.enabled)return;if(this.engineLive()&&source!=='engine')return;if(visible){this.pending=null;this.set(true);}else if(!this.pending||this.pending.source!==source)this.pending={at:this.now(),source};}
 // A marker that comes back after a marker-based hide means the same line's dialogue box is back (window restored
 // after Hide W., a menu or the backlog closed): show the layer again instead of waiting for the next line.
 // The engine signal covers only the window it watches (ISLAND: the narration page). Lines drawn elsewhere (ADV box,
 // OP credits) report no visibility at all: for those lines fall back to the wait marker instead of never hiding.
 engineLive(){return this.engineSignal!=null&&(this.engineAt||0)>=this.lineAt-1500;}
 engine(visible,engine){if(engine!=='cs2'||typeof visible!=='boolean')return;this.engineAt=this.now();this.engineSignal=visible;if(!this.enabled)return;if(visible){this.pending=null;if(this.visible)this.set(true);else if(!this.resumeAt)this.resumeAt=this.now()+150;}else{this.resumeAt=0;this.evidence(false,'engine');}}
 marker(present){if(this.engineLive())return;this.markerPresent=!!present;if(present){this.markerSeen=true;if(this.hiddenByMarker&&this.enabled&&this.mode==='marker'){this.hiddenByMarker=false;this.set(true);}}else if(this.markerSeen)this.markerGoneAt=this.now();}
 markerDrawn(){if(this.engineLive())return;this.drawnAt=this.now();this.markerSeen=true;}
 present(){return this.markerPresent||this.now()-this.drawnAt<1500;}
 tick(){
  if(!this.enabled)return;
  // A show precedes a new line. Let its confirmed source replace the old page before restoring the layer.
  if(this.resumeAt&&this.now()>=this.resumeAt){this.resumeAt=0;this.set(true);}
  if(this.pending&&this.now()-this.pending.at>=(this.pending.source==='engine'?600:350)){this.pending=null;this.set(false);return;}
  if(this.engineLive())return;
  // A marker still on screen 0.4 s into a line belongs to this line (the previous one is cleared when the game advances).
  if(this.mode==='marker'&&!this.markerSeen&&this.markerPresent&&this.now()-this.lineAt>=400)this.markerSeen=true;
  if(this.mode!=='marker'||!this.visible||!this.markerSeen||this.present())return;
  // The marker has left: give the next line time to arrive (clicking on normally produces it within ~0.2 s).
  const gone=Math.max(this.markerGoneAt,this.drawnAt?this.drawnAt+1500:0);
  if(gone&&this.now()-gone>=1200){this.hiddenByMarker=true;this.set(false);}
 }
}
module.exports={Immersion};
