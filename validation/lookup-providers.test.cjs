const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {cleanLookup,lookupOptions,presets}=require('../core/lookup-models.cjs');
test('all explanation providers resolve to their own URL and retain independent profiles',()=>{
 let saved=cleanLookup({lookupProvider:'qwen',lookupProfiles:{qwen:{baseUrl:'https://custom.example/compatible-mode/v1',model:'my-qwen'},kimi:{model:'my-kimi'}}});
 assert.equal(lookupOptions(saved).model,'my-qwen');assert.equal(lookupOptions(saved).baseUrl,'https://custom.example/compatible-mode/v1');saved=cleanLookup({...saved,lookupProvider:'kimi'});assert.equal(lookupOptions(saved).model,'my-kimi');assert.equal(saved.lookupProfiles.qwen.model,'my-qwen');
 for(const name of Object.keys(presets)){const p=lookupOptions({lookupProvider:name});assert.equal(p.baseUrl,presets[name].baseUrl);}
 assert.throws(()=>cleanLookup({lookupProfiles:{qwen:{baseUrl:'https://key:secret@example.com'}}}));
});
class Element{
 constructor(tag,cls='',text=''){this.tag=tag;this.className=cls;this.textContent=text;this.children=[];this.dataset={};this.style={};this.listeners={};this.value='';}
 append(...items){this.children.push(...items);}
 addEventListener(type,fn){this.listeners[type]=fn;}
 querySelector(s){return this.querySelectorAll(s)[0];}
 querySelectorAll(s){return this.children.flatMap(c=>[...(s.startsWith('.')&&c.className.split(' ').includes(s.slice(1))?[c]:[]),...c.querySelectorAll(s)]);}
}
test('the actual generated learning panel displays one provider and keeps edits when switching',()=>{
 const code=fs.readFileSync(require.resolve('../web/reader/modules/selection.js'),'utf8'),start=code.indexOf(' function modelPanel(panel)'),end=code.indexOf(" const style=el('style')",start);assert(start>0&&end>start);
 const sent=[],saved=[],panel=new Element('div'),sandbox={el:(...a)=>new Element(...a),button:(caption,fn)=>{const b=new Element('button','',caption);b.click=fn;return b;},b:{options:()=>({lookupProvider:'deepseek',lookupProfiles:{}}),updateLearningSettings:v=>saved.push(v)},send:v=>sent.push(v),modelPanels:new Set(),window:{}};
 sandbox.panel=panel;vm.runInNewContext(code.slice(start,end)+';modelPanel(panel);',sandbox);
 const details=panel.children[0],choose=details.children[1].children[0],profiles=details.querySelectorAll('.megulit-lookup-profile');assert.equal(profiles.length,Object.keys(presets).length);const shown=()=>profiles.filter(x=>!x.hidden);assert.equal(shown().length,1);assert.equal(shown()[0].dataset.provider,'deepseek');
 const qwen=profiles.find(p=>p.dataset.provider==='qwen'),model=qwen.children[2].children[0];choose.value='qwen';choose.listeners.change();assert.equal(shown()[0],qwen);model.value='edited-qwen';choose.value='local';choose.listeners.change();assert.equal(shown().length,0);choose.value='qwen';choose.listeners.change();assert.equal(model.value,'edited-qwen');details.children.find(c=>c.tag==='button').click();assert.equal(sent[0].settings.lookupProfiles.qwen.model,'edited-qwen');assert.equal(sent[0].settings.lookupProvider,'qwen');
});
