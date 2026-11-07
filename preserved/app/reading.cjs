'use strict';
const fs=require('node:fs');
const {kana}=require('./furigana.js');
const hasKanji=s=>/[\p{Script=Han}々〆]/u.test(s||'');
function pronunciation(s){return kana(s).replace(/([おこそとのほもよろごぞどぼぽょ])(?:う|お)/g,'$1ー').replace(/([うくすつぬふむゆるぐずづぶぷゅ])う/g,'$1ー').replace(/([いきしちにひみりぎじぢびぴ])い/g,'$1ー').replace(/[びぴ]/g,'ひ').replace(/[ぶぷ]/g,'ふ');}
function createReadingResolver(file=require('node:path').join(require('./paths.cjs').resources,'jmdict.json')){
  let index;
  function load(){
    if(index)return;index=new Map();
    try{for(const entry of JSON.parse(fs.readFileSync(file,'utf8'))){
      if(!Array.isArray(entry.spellings)||!Array.isArray(entry.readings))continue;
      for(const spelling of entry.spellings){if(typeof spelling!=='string'||!hasKanji(spelling))continue;const list=index.get(spelling)||[];
        for(const r of entry.readings)if(typeof r==='string'&&!list.includes(kana(r)))list.push(kana(r));
        if(list.length)index.set(spelling,list);
      }
    }}catch{}
  }
  function choose(surface,expected,strict=false){
    const list=index.get(surface);if(!list?.length)return '';
    const target=pronunciation(expected);return list.find(r=>pronunciation(r)===target)||(strict||list.length!==1?'':list[0]);
  }
  function resolve(tokens){
    load();if(!Array.isArray(tokens)||tokens.length>4000)return [];
    const result=[];
    for(let i=0;i<tokens.length;i++){
      const token=tokens[i];if(!token||typeof token.surface!=='string')continue;
      let surface=token.surface,expected=token.reading||'',best,stop=i;
      if(hasKanji(surface)){
        let merged=surface,pron=expected;
        // Compound words such as 月曜日 must not become 月曜 + 日(ひ).
        for(let j=i+1;j<Math.min(tokens.length,i+6);j++){
          const next=tokens[j]?.surface;if(!next||/[\s。、！？「」『』]/u.test(next)||merged.length+next.length>16)break;
          merged+=next;pron+=tokens[j].reading||'';
          const reading=choose(merged,pron,true);if(reading){best={surface:merged,reading};stop=j;}
        }
      }
      if(best){result.push({...token,...best});i=stop;continue;}
      if(!hasKanji(surface)){result.push(token);continue;}
      let reading=choose(surface,expected);
      if(!reading&&typeof token.base_form==='string'){
        const base=token.base_form,baseReading=choose(base,expected);let prefix=0;
        while(prefix<base.length&&prefix<surface.length&&base[prefix]===surface[prefix])prefix++;
        const oldTail=kana(base.slice(prefix)),newTail=kana(surface.slice(prefix));
        if(baseReading&&oldTail&&!hasKanji(oldTail)&&!hasKanji(newTail)&&baseReading.endsWith(oldTail))reading=baseReading.slice(0,-oldTail.length)+newTail;
      }
      // Unknown names keep their supplied reading; an unresolved pronunciation
      // long mark on kanji is omitted instead of inventing う/お/い spellings.
      result.push({...token,reading:reading||(String(expected).includes('ー')?'':expected)});
    }
    return result;
  }
  return {resolve};
}
module.exports={createReadingResolver,pronunciation};
