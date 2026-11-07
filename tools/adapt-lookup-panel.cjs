// Explicit host adaptation of the preserved learning settings panel.
'use strict';
const {presets,titles}=require('../core/lookup-models.cjs');
function adaptLookup(text){
 const start=text.indexOf("for(const [value,text]of [['local'"),end=text.indexOf('){const o=',start);
 if(start<0||end<0)throw Error('LOOKUP_OPTIONS_ANCHOR_MISSING');
 const options=[['local','只用本地词典（不需要 Key）'],['follow','跟随台词翻译引擎'],...Object.keys(presets).map(k=>[k,titles[k]])];
 text=text.slice(0,start)+'for(const [value,text]of '+JSON.stringify(options)+text.slice(end);
 const a=text.indexOf('for(const [name,title,base,model]of '),z=text.indexOf('){const group=',a);
 if(a<0||z<0)throw Error('LOOKUP_FIELDS_ANCHOR_MISSING');
 text=text.slice(0,a)+'for(const [name,title,base,model]of '+JSON.stringify(Object.entries(presets).map(([k,p])=>[k,titles[k],p.baseUrl,p.model]))+text.slice(z);
 text=text.replace("const group=el('details'),header=el('summary','',title);group.append(header);","const group=el('section','megulit-lookup-profile'),header=el('strong','',title);group.dataset.provider=name;group.append(header);");
 text=text.replace("baseInput.readOnly=name!=='gpt';","baseInput.readOnly=['deepseek','gemini'].includes(name);");
 const marker="  const state=el('div','tomoyo-muted');modelPanels.add";
 if(!text.includes(marker))throw Error('LOOKUP_SWITCH_ANCHOR_MISSING');
 text=text.replace(marker,"  const switchProvider=()=>{for(const group of details.querySelectorAll('.megulit-lookup-profile')){group.hidden=group.dataset.provider!==choose.value;group.style.display=group.hidden?'none':'';}window.__tomoyoHitRegionsRefresh?.(true);};choose.addEventListener('change',switchProvider);switchProvider();\n"+marker);
 return text;
}
module.exports={adaptLookup};
