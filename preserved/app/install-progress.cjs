'use strict';
class InstallProgress {
 constructor(emit,clock=()=>Date.now()){this.emit=emit;this.clock=clock;this.buffers={};this.file='';this.previous=null;}
 update(value){this.value=value;this.emit(value);}
 feed(chunk,channel='out'){
  const parts=((this.buffers[channel]||'')+String(chunk)).split(/[\r\n]+/);this.buffers[channel]=parts.pop().slice(-10000);
  for(const line of parts)this.line(line.trim());
 }
 line(line){
  let match;
  if((match=/^Progress\s+(\d+)\s+of\s+(\d+)$/.exec(line))){
   const current=Number(match[1]),total=Number(match[2]),now=this.clock();
   const speed=this.previous&&now>this.previous.at&&current>=this.previous.current?(current-this.previous.current)*1000/(now-this.previous.at):null;
   this.previous={current,at:now};
   this.update({stage:'download',file:this.file,current,total:total>0?total:null,percent:total>0?Math.min(100,current*100/total):null,speed});return;
  }
  if((match=/(?:Downloading|Using cached)\s+([A-Za-z0-9_.+-]+\.(?:whl|tar\.gz|zip))/i.exec(line))){
   this.file=match[1];this.previous=null;this.update({stage:/Using cached/i.test(line)?'cached':'download',file:this.file,percent:null,current:0,total:null});return;
  }
  if(/^Collecting\s/.test(line)){this.update({stage:'resolve',file:this.file,percent:null});return;}
  if(/Installing collected packages|Building wheel|Preparing metadata|Installing build dependencies/i.test(line)){this.update({stage:'install',file:this.file,percent:null});return;}
  if(/^Successfully installed/i.test(line))this.update({stage:'verify',file:this.file,percent:null});
 }
 finish(ok){this.update({stage:ok?'ready':'error',file:this.file,percent:ok?100:null});}
}
module.exports={InstallProgress};
