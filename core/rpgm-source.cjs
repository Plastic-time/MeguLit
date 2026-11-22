/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
class RpgmSource{
 constructor(){this.line=0;this.text='';this.cleared=true;this.owner=Object.freeze({});}
 feed(rec){if(rec.engine!=='rpgm'||rec.role||!Number.isSafeInteger(rec.line)||rec.line<1)return null;
  if(!rec.text){if(rec.line!==this.line||this.cleared)return null;this.cleared=true;return {engine:'rpgm',clear:true,line:rec.line,owner:this.owner};}
  if(!rec.rects?.length||rec.line<this.line||rec.line===this.line&&rec.text===this.text&&!this.cleared)return null;
  this.line=rec.line;this.text=rec.text;this.cleared=false;return {engine:'rpgm',text:rec.text,line:rec.line,owner:this.owner};
 }
}
const owned=new WeakMap();
function clear(h,s,m){const old=owned.get(s);if(!old||m&&!(m.terminal===true&&s.stopped)&&(m.owner!==old.owner||m.line!==old.line)||h.textPath!==s||h.gamePid?.()!==old.pid||String(h.target?.started)!==old.birth||h.state?.hookSequence!==old.sequence||h.state?.hookSourceEngine!=='rpgm'||h.state?.hookSourceOrigin!=='rpgm')return false;owned.delete(s);h.lastSource='';h.lastSourceAt=0;h.notify({hookSource:'',hookSpeaker:'',hookSourceOrigin:'rpgm-clear',hookSequence:old.sequence+1});return true;}
function deliver(h,s,m){
 if(m?.engine!=='rpgm')return false;if(m.clear)return clear(h,s,m);
 const O=require('./owner-tests.cjs'),ctx={exe:h.profileInput?.exe,engine:'rpgmaker',capability:'roles'},pid=h.gamePid?.(),birth=String(h.target?.started||'');
 if(h.textPath!==s||s.stopped||h.disposed||h.stopPending||h.stopError||h.wanted!==true||h.profile?.engine!=='rpgmaker'||h.profile?.draw?.roles!==true||!O.privateMode()||!O.allowed(h.ownerTestGrant,ctx)||!O.matches(h.ownerTestGrant,{pid,birth})){clear(h,s);return false;}
 if(typeof m.text!=='string'||!m.text||m.text.length>4000||!Number.isSafeInteger(m.line)||m.line<1)return false;
 const before=h.state?.hookSequence||0;h.emitSource(m.text,'rpgm','rpgm',m.line);const sequence=h.state?.hookSequence;
 if(sequence>before&&h.state.hookSourceOrigin==='rpgm'&&h.state.hookSourceLine===m.line){owned.set(s,{pid,birth,sequence,line:m.line,owner:m.owner});return true;}return false;
}
module.exports={RpgmSource,deliver,clear};
