// SPDX-License-Identifier: GPL-3.0-or-later
// Shared UTF-16 token and speaker split matching ToMeIslandFlow::Spoken/Token.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TomeIslandSource=api;})(typeof window==='object'?window:this,function(){
 'use strict';
 function split(input){
  const text=String(input||''),ch=[...text],n=ch.length,open=v=>v==='「'||v==='『',close=v=>v==='」'||v==='』',blank=v=>v===' '||v==='\u3000'||v==='\r';
  const at=(j,name)=>({name,text:ch.slice(j).join('')});
  if(n>2&&ch[0]==='【'){for(let k=1;k<n&&k<=41;k++)if(ch[k]==='】'){let j=k+1;while(j<n&&blank(ch[j]))j++;return j<n&&open(ch[j])?at(j,ch.slice(1,k).join('')):{name:'',text};}return {name:'',text};}
  for(let k=0;k<n&&k<=12;k++){
   if(open(ch[k]))return k&&close(ch[n-1])?at(k,ch.slice(0,k).join('')):{name:'',text};
   if(ch[k]==='\n'){let j=k+1;while(j<n&&blank(ch[j]))j++;return k&&j<n&&open(ch[j])?at(j,ch.slice(0,k).join('')):{name:'',text};}
   if(blank(ch[k])||['（','(','、','。'].includes(ch[k]))return {name:'',text};
  }return {name:'',text};
 }
 const spoken=text=>split(text).text;
 function token(text){text=spoken(text).replace(/[ \u3000\r\n]/g,'');let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
 return {split,spoken,token};
});
