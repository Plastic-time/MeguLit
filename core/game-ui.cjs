// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const unit=value=>Number.isFinite(value)&&value>=0&&value<=1;
const color=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'';
const font=value=>typeof value==='string'&&/^[\p{L}\p{N} ._-]{1,80}$/u.test(value)?value:'';
function uiItems(items,kind='preview',preferences={}){
 if(!Array.isArray(items))return [];
 const result=[];
 for(const item of items.slice(0,50)){
  if(!item||typeof item.text!=='string'||!item.text.trim()||require('./text-noise.cjs').identifierNoise(item.text)||![item.x,item.y,item.width,item.height].every(unit)||item.width<.003||item.height<.003||item.x+item.width>1.001||item.y+item.height>1.001)continue;
  const record={text:item.text.trim().slice(0,300),x:item.x,y:item.y,width:item.width,height:item.height};
  if(kind==='preview'){result.push(record);continue;}
  // Only render over an engine-confirmed empty text box with known choice state.
  if(item.originalHidden!==true||kind==='choice'&&typeof item.selected!=='boolean')continue;
  const fonts={originalGothic:'MS Gothic',originalMincho:'MS Mincho',yuMincho:'Yu Mincho',yuGothic:'Yu Gothic',meiryo:'Meiryo'};
  record.selected=item.selected===true;
  record.color=(kind==='choice'&&color(record.selected?preferences.choiceSelectedColor:preferences.choiceUnselectedColor))||color(item.color);
  record.font=(kind==='choice'&&fonts[preferences.choiceFont])||font(item.font);
  if(record.color&&record.font)result.push(record);
 }
 return result;
}
function scanGameUi(layout,state,overlayPid,spawnProcess=spawn){
 const pid=Number(state?.gameProcessId),hwnd=String(state?.gameHwnd||'');
 if(!state?.bound||!Number.isSafeInteger(pid)||pid<=0||!/^\d{1,19}$/.test(hwnd))return Promise.reject(Error('GAME_UI_NOT_BOUND'));
 return new Promise((resolve,reject)=>{
  const child=spawnProcess(path.join(layout.native,'GameStyleProbe.exe'),[],{cwd:layout.native,windowsHide:true,stdio:['pipe','pipe','ignore']});
  let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(Error(error));else resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish('GAME_UI_SCAN_TIMEOUT');},7000);
  child.on('error',()=>finish('GAME_UI_SCAN_UNAVAILABLE'));
  child.on('close',()=>finish('GAME_UI_SCAN_UNAVAILABLE'));
  child.stdin.on('error',()=>{});
  createInterface({input:child.stdout}).once('line',line=>{
   try{
    if(line.length>50000)throw Error();
    const {result,error}=JSON.parse(line);
    if(error){finish(error==='Japanese OCR unavailable'?'GAME_UI_OCR_MISSING':'GAME_UI_CAPTURE_UNAVAILABLE');return;}
    const rows=uiItems(result?.items);
    finish(rows.length?'':'GAME_UI_NO_TEXT',rows);
   }catch{finish('GAME_UI_SCAN_UNAVAILABLE');}
  });
  child.stdin.end(JSON.stringify({id:1,mode:'screen-text',pid,hwnd,overlayPid,scanX:0,scanY:0,scanWidth:100,scanHeight:100})+'\n');
 });
}
module.exports={uiItems,scanGameUi};
