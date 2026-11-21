// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const crypto=require('node:crypto');
const normalize=value=>String(value??'').normalize('NFKC').replace(/[｜|]([^《\[｜|]+)[《\[][^》\]]*[》\]]/g,'$1').replace(/《[^》]*》|\[[^\]]*\]|<[^>]*>/g,'').replace(/[\s\u3000\u200b\u001f]+/g,'').replace(/^[「『“"（(【]+|[」』”"）)】]+$/g,'');
function spoken(value){const text=String(value||'').trim();let m=/^【([^【】\r\n]{1,40})】\s*([「『][\s\S]*)$/.exec(text);if(m)return m[2];const lines=text.split(/\r?\n/);if(lines.length>=2&&lines[0].length<=12&&!/[「『（(。、]/.test(lines[0])&&/^[「『（(]/.test(lines[1].trim()))return lines.slice(1).join('\n').trim();m=/^([^\s「『（(]{1,10})([「『][\s\S]*[」』])$/.exec(text);return m?m[2]:String(value||'');}
const key=value=>crypto.createHash('sha256').update(normalize(spoken(value))).digest('hex');
const targetOf=value=>/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(String(value||''))?String(value).toLowerCase():'zh';
class DisplayPairs{
 constructor(){this.session=crypto.randomBytes(8).toString('hex');this.serial=0;this.generation=0;this.target='zh';this.policy=null;this.current=null;this.entries=[];this.available=new Map();}
 descriptor(entry){return entry?{schema:1,episode:entry.id,scope:entry.scope,target:entry.target,sourceKey:entry.key,body:entry.body}:null;}
 source(text,{target='zh',sequence=null}={}){const next=targetOf(target);if(next!==this.target)this.change(next,null);const body=spoken(text),fingerprint=key(body);let entry=this.current;
  if(!entry||!Number.isSafeInteger(sequence)||entry.sequence!==sequence||entry.key!==fingerprint){entry={id:this.session+':'+(++this.serial),sequence,key:fingerprint,body,scope:this.session+':'+this.generation,target:this.target,observation:null};this.entries.push(entry);this.current=entry;if(this.entries.length>420)this.entries.shift();}
  return this.descriptor(entry);}
 change(target,policy){this.target=target;this.policy=policy;this.generation++;if(this.current){this.current.scope=this.session+':'+this.generation;this.current.target=target;this.current.observation=null;}}
 setPolicy(message,expectedTarget){if(message?.schema!==1||typeof message.enabled!=='boolean'||typeof message.visible!=='boolean'||typeof message.client!=='string'||!/^[a-z0-9-]{8,80}$/i.test(message.client)||!Number.isSafeInteger(message.revision)||message.revision<1||message.target!==targetOf(expectedTarget))return null;
  if(this.policy?.client===message.client&&message.revision<this.policy.revision)return null;
  const next={client:message.client,revision:message.revision,enabled:message.enabled,visible:message.visible};const changed=this.target!==targetOf(expectedTarget)||!this.policy||this.policy.client!==next.client||this.policy.enabled!==next.enabled||this.policy.visible!==next.visible;
  if(changed)this.change(targetOf(expectedTarget),next);else this.policy=next;
  return {schema:1,client:next.client,revision:next.revision,descriptor:this.descriptor(this.current)};}
 availability(text,translation,{target='zh'}={}){const value=normalize(translation);if(!value)return;const id=targetOf(target)+'|'+key(text);let values=this.available.get(id);if(!values){values=new Set();this.available.set(id,values);}values.add(value);if(values.size>8)values.delete(values.values().next().value);if(this.available.size>800)this.available.delete(this.available.keys().next().value);}
 observe(message,expectedTarget){if(message?.schema!==1||typeof message.episode!=='string'||typeof message.scope!=='string'||typeof message.sourceKey!=='string'||typeof message.observed!=='boolean'||typeof message.paired!=='boolean'||typeof message.enabled!=='boolean'||typeof message.visible!=='boolean'||typeof message.translation!=='string'||message.translation.length>4000)return false;
  const entry=this.entries.find(x=>x.id===message.episode),policy=this.policy;if(!entry||!policy||entry.scope!==message.scope||entry.scope!==this.session+':'+this.generation||entry.target!==message.target||entry.target!==targetOf(expectedTarget)||entry.key!==message.sourceKey||policy.enabled!==message.enabled||policy.visible!==message.visible)return false;
  const eligible=policy.enabled&&policy.visible;if(message.paired&&(!message.observed||!eligible||!this.available.get(entry.target+'|'+entry.key)?.has(normalize(message.translation))))return false;
  const state=!eligible?'excluded':!message.observed?'unobserved':message.paired?'paired':'unpaired';
  // Repeated paint/progress acknowledgements are idempotent; a complete visible translation may settle a pending occurrence.
  if(entry.observation?.state==='paired'&&(state==='unpaired'||state==='unobserved'))return true;entry.observation={state};return true;}
 snapshot(n){const entries=this.entries.slice(-n),count=state=>entries.filter(x=>x.observation?.state===state).length;const excluded=count('excluded'),paired=count('paired'),unpaired=count('unpaired'),unobserved=entries.length-excluded-paired-unpaired;
  return {source:'live-display',schema:1,shown:entries.length-excluded,paired,unpaired,excluded,unobserved,reliable:entries.length>0&&unobserved===0};}
}
module.exports={DisplayPairs,normalize,spoken,key,targetOf};
