'use strict';
/* Minimal DOM for offline dialog interaction tests; selectors and events run against parsed markup */
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
class Element extends EventTarget{
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.open=false;this._text='';}
 get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
 get classList(){const el=this;return {contains:x=>el.className.split(/\s+/).includes(x),add(...xs){el.className=[...new Set([...el.className.split(/\s+/),...xs])].join(' ');},remove(...xs){el.className=el.className.split(/\s+/).filter(x=>!xs.includes(x)).join(' ');}};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);if(k==='hidden')this.hidden=true;if(k==='disabled')this.disabled=true;}
 getAttribute(k){return this.attrs[k]??null;}
 append(...xs){for(const el of xs){el.parent=this;this.children.push(el);}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 get isConnected(){return this===this.doc.body||!!this.parent?.isConnected;}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 set textContent(v){this._text=String(v);this.children=[];}
 set innerHTML(html){this._text='';this.children=[];const stack=[this];for(const token of String(html).match(/<[^>]*>|[^<]+/g)||[]){
  if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const tag=/^<([\w-]+)/.exec(token)?.[1];if(!tag)continue;const el=new Element(tag,this.doc);const attrs=token.slice(tag.length+1,-1);for(const m of attrs.matchAll(/([\w-]+)(?:="([^"]*)"|'([^']*)'|=([^\s>]+))?/g))el.setAttribute(m[1],decode(m[2]??m[3]??m[4]??''));stack.at(-1).append(el);if(!/^(input|img|br|hr|meta|link)$/i.test(tag)&&!token.endsWith('/>'))stack.push(el);
  }else stack.at(-1)._text+=decode(token);}}
 matches(selector){const tag=/^[\w-]+/.exec(selector)?.[0];if(tag&&tag.toUpperCase()!==this.tagName)return false;for(const m of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(m[1]))return false;for(const m of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)){if(m[1]==='open'){if(!this.open)return false;}else if(!(m[1] in this.attrs)||m[2]!==undefined&&this.attrs[m[1]]!==m[2])return false;}return true;}
 querySelectorAll(selector){const parts=selector.split(/\s+/);const all=[];const visit=el=>{for(const child of el.children){if(child.matches(parts.at(-1))){let ancestor=child.parent,i=parts.length-2;while(ancestor&&i>=0){if(ancestor.matches(parts[i]))i--;ancestor=ancestor.parent;}if(i<0)all.push(child);}visit(child);}};visit(this);return all;}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 focus(){this.doc.activeElement=this;}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 click(){if(this.disabled)return;this.onclick?.(new Event('click'));this.dispatchEvent(new Event('click',{cancelable:true}));}
}
function document(){const doc={documentElement:{lang:'zh'},createElement:tag=>new Element(tag,doc)};doc.body=new Element('body',doc);doc.querySelector=s=>doc.body.querySelector(s);return doc;}
module.exports={document};
