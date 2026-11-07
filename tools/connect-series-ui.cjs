const fs=require('node:fs');function edit(p,fn){const s=fs.readFileSync(p,'utf8'),n=fn(s);if(n===s)throw Error(p);fs.writeFileSync(p,n);}
edit('web/i18n.js',s=>"import {seriesMessages} from './series-i18n.js';\n"+s+"\nfor(const language of Object.keys(seriesMessages))messages[language].series=seriesMessages[language];\n");
edit('web/icons.js',s=>s.replace('const paths={',"const paths={\n layers:'m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',"));
edit('web/index.html',s=>s.replace('<link rel="stylesheet" href="controls.css">','<link rel="stylesheet" href="controls.css"><link rel="stylesheet" href="series.css">'));
edit('web/app.js',s=>{
 s="import {createSeriesLibrary} from './series-library.js';\n"+s;s=s.replace("let selectedGameId='',gameOrigin='library';","let selectedGameId='',gameOrigin='library',selectedSeriesId='';");
 const marker='function library(){';const code=`const seriesUI=createSeriesLibrary({model:()=>model,locale:()=>locale,text:()=>text,esc,icon,api,invoke,card,modal,search:()=>search,toast,bindGames:attachGameActions,animate:animateGrid,openSeries:id=>{selectedSeriesId=id;navigate('series');},back:()=>navigate('library'),reload:async()=>{model=await api('home');const main=document.querySelector('#main'),scroll=main.scrollTop;if(route==='library')renderGames();else if(route==='series')seriesUI.renderDetail(main,selectedSeriesId);main.scrollTop=scroll;}});\n`;
 s=s.replace(marker,code+marker);s=s.replace('<button class="icon-button" id="add-game"', '<button class="icon-button" id="select-games" aria-label="${text.series.select}" title="${text.series.select}">${icon(\'check\')}</button><button class="icon-button" id="add-game"');
 s=s.replace("main.querySelector('#add-game').addEventListener('click',()=>editGame());", "main.querySelector('#select-games').onclick=()=>seriesUI.toggleSelection(main.querySelector('#library-results'));main.querySelector('#add-game').addEventListener('click',()=>editGame());");
 const a=s.indexOf('function renderGames(){'),b=s.indexOf('let stopGridMotion=',a);if(a<0||b<0)throw Error('LIBRARY_RENDER_ANCHOR');s=s.slice(0,a)+"function renderGames(){seriesUI.renderLibrary(document.querySelector('#library-results'));}\n"+s.slice(b);
 s=s.replace("gameOrigin=route==='home'?'home':'library';", "gameOrigin=route==='home'?'home':route==='series'?'series':'library';");
 s=s.replace("else if(route==='library')library();else if(route==='game')", "else if(route==='library')library();else if(route==='series')seriesUI.renderDetail(main,selectedSeriesId);else if(route==='game')");
 s=s.replace("route==='game'&&button.dataset.route==='library'", "(route==='game'||route==='series')&&button.dataset.route==='library'");
 return s;
});
