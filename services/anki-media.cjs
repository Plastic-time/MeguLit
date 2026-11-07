'use strict';
const sounds=value=>[...String(value||'').matchAll(/\[sound:([^\]\r\n]+)\]/g)].map(m=>m[1]);
// Enumerate audio in template order, not note-field order. Unsupported filters keep the native replay fallback.
function templateSounds(template,fields){
 const stack=[{active:true}],parts=[];let last=0,safe=true;
 for(const m of String(template||'').matchAll(/\{\{([^{}]+)\}\}/g)){
  if(stack.at(-1).active)parts.push(template.slice(last,m.index));last=m.index+m[0].length;const tag=m[1].trim(),kind=tag[0],name=tag.slice(1).trim();
  if(kind==='#'||kind==='^'){if(!Object.hasOwn(fields,name))safe=false;const present=!!String(fields[name]?.value??'').trim();stack.push({name,active:stack.at(-1).active&&(kind==='#'?present:!present)});continue;}
  if(kind==='/'){if(stack.length===1||stack.at(-1).name!==name){safe=false;continue;}stack.pop();continue;}
  if(!stack.at(-1).active||tag==='FrontSide')continue;
  const bits=tag.split(':'),field=bits.pop();if(bits.some(filter=>!['text','furigana','kanji','kana'].includes(filter))){safe=false;continue;}
  if(Object.hasOwn(fields,field))parts.push(String(fields[field]?.value??''));
 }
 if(stack.at(-1).active)parts.push(String(template||'').slice(last));if(stack.length!==1)safe=false;
 const rendered=parts.join('');if(/\[anki:tts|\{\{tts:/i.test(rendered))safe=false;
 return {safe,names:sounds(rendered)};
}
function playMap(card,templates,html){
 const template=templates?.[typeof card.template==='string'?card.template:card.template?.name];if(!template)return new Map();
 const result=new Map();for(const[side,key]of [['q','Front'],['a','Back']]){
  const markers=[...html.matchAll(new RegExp('\\[anki:play:'+side+':(\\d+)\\]','g'))].map(m=>Number(m[1]));if(!markers.length)continue;
  const audio=templateSounds(template[key],card.fields||{});if(!audio.safe||audio.names.length!==Math.max(...markers)+1)continue;
  for(const index of markers)result.set(side+':'+index,audio.names[index]);
 }return result;
}
const icon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 5v14l11-7z"/></svg>';
function player(src,name){
 const channel=/^tomoyo_g_/i.test(name)?'game':/^tomoyo_s_/i.test(name)?'sentence':/^tomoyo_[a-f0-9]+_[a-f0-9]+\.wav$/i.test(name)?'word':'';
 return '<span data-anki-media><button type="button" class="tome-anki-play" data-anki-play aria-label="Play audio">'+icon+'</button><audio controls preload="none" data-anki-channel="'+channel+'" src="'+src+'"></audio></span>';
}
function replay(){return '<button type="button" class="tome-anki-play" data-anki-replay aria-label="Replay card audio">'+icon+'</button>';}
module.exports={sounds,templateSounds,playMap,player,replay};
