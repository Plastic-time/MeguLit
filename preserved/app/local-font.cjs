'use strict';
const fs=require('node:fs');
const {repairLegacyFont}=require('./font-map.cjs');
const gameFontPath='E:/GAL/素晴日/素晴らしき日々HD版/font.ttf';
function localFontScript(file=gameFontPath){
  let data;
  try{const info=fs.statSync(file);if(!info.isFile()||info.size<12||info.size>16000000)return '';data=repairLegacyFont(fs.readFileSync(file),fs.readFileSync('C:/Windows/Fonts/simhei.ttf')).buffer.toString('base64');}catch{return '';}
  return `(async()=>{if(window.__tomoyoGameFontLoaded)return;try{const face=new FontFace('TomoyoSubahibiCN','url(data:font/ttf;base64,${data})',{weight:'400',style:'normal'});await face.load();document.fonts.add(face);window.__tomoyoGameFontLoaded=true;if(window.__tomoyoChinese){window.__tomoyoChinese.fontMessage='中文字体：已加载本机素晴日汉化 font.ttf';window.__tomoyoChinese.alignText?.();}}catch{if(window.__tomoyoChinese)window.__tomoyoChinese.fontMessage='汉化字体加载失败，暂用系统黑体';}})();`;
}
module.exports={localFontScript,gameFontPath};
