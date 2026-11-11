'use strict';
/* #112: a speech request never waits forever; past the deadline it fails with a message the UI can show */
function withDeadline(promise,ms,message){let timer;const limit=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);});return Promise.race([promise,limit]).finally(()=>clearTimeout(timer));}
const SPEECH_START_MS=240000,SPEECH_SYNTH_MS=60000;
async function speakWithin(start,synth,{startMs=SPEECH_START_MS,synthMs=SPEECH_SYNTH_MS}={}){
 await withDeadline(Promise.resolve().then(start),startMs,'语音引擎启动超时：模型下载或加载太久，请检查网络后重试（详情见 speech-engine.log）');
 return withDeadline(Promise.resolve().then(synth),synthMs,'语音合成超时：引擎没有响应，请稍后重试或在设置里重启语音');
}
module.exports={withDeadline,speakWithin,SPEECH_START_MS,SPEECH_SYNTH_MS};
