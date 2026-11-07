// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
exports.adapt=(name,text)=>{
 if(name==='gal'){
  const old="if(/gal(X|Y|Width|Height|ScanX|ScanY|ScanWidth|ScanHeight)$/.test(input.name))input.step='0.1';";
  if(!text.includes(old))throw Error('CONTINUOUS_GAL_SLIDER_ANCHOR');
  text=text.replace(old,"input.step='any';").replace("else if(!input.hasAttribute('step'))input.step='1';",'');
  text=text.replace('const update=()=>{output.value=input.value;output.textContent=input.value;};',"const update=()=>{input.value=String(Number(Number(input.value).toFixed(3)));output.value=input.value;output.textContent=input.value;};");
 }
 if(name==='background'){
  text=text.replaceAll('i.step=1;',"i.step='any';");
  text=text.replaceAll('Number(i.value)', 'Number(Number(i.value).toFixed(3))');
  text=text.replace('step="0.01"','step="any"');
  text=text.replace("Math.round(c.zoom*100)+'%'","Number((c.zoom*100).toFixed(2))+'%'");
  text=text.replace('zoom:Math.round(c.zoom*100)/100','zoom:Math.round(c.zoom*10000)/10000');
 }
 return text;
};
