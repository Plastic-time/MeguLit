// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');
const { startEdge } = require('./library-views-perf.cjs');

const web = path.join(__dirname, '..', 'web');
const types = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2'};
const backgroundKey = 'tome-menu-background';
const menu = '.tomoyo-cn-dialog[open]';
const textTab = `${menu} [data-menu-category=text]`;
const hasEdge = [process.env.MEGULIT_EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(file => file && fs.existsSync(file));
const white = {home:[255,255,255], backdrop:'#fff'};

function readerStub(fixture) {
 return `<script>(${function ({ state, home, game, themeMode, accent }) {
  localStorage.clear();
  const pictures = window.panelFixturePictures = {home,game};
  function image(value) {
   if (!Array.isArray(value)) return value || '';
   const canvas = document.createElement('canvas');
   canvas.width = canvas.height = 16;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = `rgb(${value.join(',')})`;
   ctx.fillRect(0, 0, 16, 16);
   return canvas.toDataURL();
  }
  window.__TAURI_INTERNALS__ = {transformCallback: () => 1, invoke: async (cmd, args) => {
   if (cmd !== 'service') return null;
   const { action, message } = args.request;
   if (action === 'home') return {preferences:{language:'zh',themeMode,accent}, games:[]};
   if (action === 'ui_state') return state;
   if (action === 'reader_bootstrap') return {engines:[],native:{}};
   if (action === 'reader_message') {
    if (message.type === 'v4') {
     const result = message.action === 'backgroundGet' ? {image:image(pictures[message.args.slot === 'game' ? 'game' : 'home'])} : {};
     return {replies:[{method:'v4Deliver',args:[message.id,result,'']}]};
    }
    return {replies:[]};
   }
   return {};
  }};
 }.toString()})(${JSON.stringify(fixture)});</script>`;
}

async function waitFor(cdp, condition) {
 for (let i = 0; i < 120; i++) {
  if (await cdp.evaluate(condition).catch(() => false)) return;
  await sleep(50);
 }
 const status = await cdp.evaluate('document.querySelector("#reader-status")?.textContent');
 assert.fail(`${condition} did not become true. Reader status: ${status}`);
}

async function withReader(run) {
 const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-panel-contrast-'));
 let fixture, cdp, page = 0;
 const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(web, rel);
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
   res.writeHead(404).end();
   return;
  }
  const content = fs.readFileSync(file);
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  res.end(rel === '/reader/index.html' ? String(content).replace('<head>', '<head>' + readerStub(fixture)) : content);
 });
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cdp = await startEdge(path.join(temp, 'edge'));
  async function load({home, game, backdrop, state = {}, themeMode = 'dark', accent, width = 1280, height = 720}) {
   fixture = {home, game, state, themeMode, accent};
   await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
   await cdp.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   const url = `http://127.0.0.1:${server.address().port}/reader/index.html?fixture=${++page}`;
   await cdp.send('Page.navigate', {url});
   await waitFor(cdp, `location.href === ${JSON.stringify(url)} && !!window.__TOME_READER_READY__`);
   await cdp.evaluate(`(${function (backdrop) {
    const frame = document.createElement('div');
    frame.style.cssText = 'position:fixed;inset:0;z-index:-2147483647;pointer-events:none';
    frame.style.background = backdrop;
    document.body.prepend(frame);
    const b = window.__tomoyoChinese;
    window.__tomoyoMode.set('translation');
    b.galStatus({bound:true,interfaceMode:'translation'});
    b.galLayout({clientX:0,clientY:0,clientWidth:innerWidth,clientHeight:innerHeight,surfaceWidth:innerWidth,surfaceHeight:innerHeight});
   }})(${JSON.stringify(backdrop)})`);
   if (home || game) await waitFor(cdp, `getComputedStyle(document.documentElement).getPropertyValue('--tome-menu-image').startsWith('url(')`);
  }
  await run(cdp, load);
 } finally {
  await cdp?.stop();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, {recursive:true, force:true, maxRetries:4, retryDelay:150});
 }
}

async function openMenu(cdp) {
 const key = {code:'KeyT', key:'t', modifiers:1, windowsVirtualKeyCode:84};
 await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', ...key});
 await cdp.send('Input.dispatchKeyEvent', {type:'keyUp', ...key});
 await waitFor(cdp, `!!document.querySelector('${menu} [data-menu-key=text]')`);
 await cdp.evaluate(`document.querySelector('${menu} [data-menu-key=text]').click();
  dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth,surfaceHeight:innerHeight}}))`);
 await waitFor(cdp, `(() => {
  const panel = document.querySelector('${menu}');
  return !panel.dataset.surfacePending && !panel.classList.contains('tome-menu-enter') && getComputedStyle(panel).opacity === '1';
 })()`);
}

const menuText = [`${textTab} label:has([name=galTypewriter])`, `${textTab} .tome-ac-switch-slider + small`,
 `${textTab} .mg-subtabs button[aria-selected=false]`, `${menu} [data-menu-key=misc]`];
const logText = ['.tome-log-src','.tome-log-tr:not([hidden])'];
const cardText = ['.tomoyo-sense > div','.tomoyo-word-reading','.tomoyo-word-pos'];
const logState = () => ({'tomoyo-backlog-session':JSON.stringify([{src:'窓を開ける。',tr:'打开窗户。',at:Date.now()}])});
const phraseText = ['.tomoyo-word-row:not(.tomoyo-word-minor)>summary>strong','.tomoyo-chunk-role','.tomoyo-row-meaning','.tomoyo-row-pos'];
const speakerState = () => ({'tomoyo-backlog-session':JSON.stringify([
 {src:'窓を開ける。',tr:'打开窗户。',at:Date.now()-5000},
 {src:'司\n「明日は晴れる。」',tr:'明天会放晴。',at:Date.now()}
])});
const opaquePictures = {'tome-menu-background':JSON.stringify({
 panels:Object.fromEntries(['menu','log','card'].map(panel => [panel,{alpha:100,dim:0,blur:0,saturate:100}]))
})};

function luminance(rgb) {
 return rgb.slice(0,3).map(value => {
  const s = value / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
 }).reduce((sum,value,i) => sum + value * [.2126,.7152,.0722][i], 0);
}

// Remove the glyphs after taking their positions and colors, leaving the composited background in the screenshot.
async function contrastDetails(cdp, selectors, directText = false) {
 const probes = await cdp.evaluate(`(${function (selectors,directText) {
  const text = new Set();
  const palette = new OffscreenCanvas(1,1).getContext('2d',{willReadFrequently:true});
  const probes = selectors.map(selector => {
   const target = document.querySelector(selector);
   if (!target) throw Error('Missing text: ' + selector);
   const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
   const areas = [];
   for (let node; (node = walker.nextNode());) {
    if (!node.textContent.trim() || directText && node.parentElement !== target) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const parent = node.parentElement;
    const style = getComputedStyle(parent);
    if (style.visibility !== 'visible' || style.display === 'none') continue;
    const color = style.color;
    palette.clearRect(0,0,1,1);
    palette.fillStyle = color;
    palette.fillRect(0,0,1,1);
    const fg = Array.from(palette.getImageData(0,0,1,1).data);
    let alpha = fg[3]/255;
    for (let ancestor=parent; ancestor; ancestor=ancestor.parentElement) alpha *= Number(getComputedStyle(ancestor).opacity);
    if (!alpha) continue;
    for (const {left,top,right,bottom} of range.getClientRects()) {
     if (left >= 0 && top >= 0 && right <= innerWidth && bottom <= innerHeight && right-left > 2 && bottom-top > 2)
      areas.push({fg,alpha,color,text:node.textContent.trim(),box:[Math.ceil(left),Math.ceil(top),Math.floor(right)-Math.ceil(left),Math.floor(bottom)-Math.ceil(top)]});
    }
    text.add(parent);
   }
   if (!areas.length) throw Error('No visible text: ' + selector);
   return areas;
  });
  const savedStyles = [...text].map(node => [node,node.getAttribute('style')]);
  for (const node of text) {
   node.style.setProperty('color','transparent','important');
   node.style.setProperty('text-shadow','none','important');
   node.style.setProperty('transition','none','important');
  }
  window.restoreContrastProbe = () => {
   for (const [node,style] of savedStyles) {
    if (style === null) node.removeAttribute('style');
    else node.setAttribute('style',style);
   }
  };
  return probes;
 }})(${JSON.stringify(selectors)},${directText})`);
 try {
  const result = await screenshotPixels(cdp,probes.flat().map(area => area.box));
  const readings = probes.map(areas => areas.map(({fg,alpha,color,text}) => {
   const pixels = result.shift();
   let min = Infinity;
   for (let i=0; i<pixels.length; i+=4) {
    const rgb = pixels.slice(i,i+3);
    const back = luminance(rgb);
    const front = luminance(rgb.map((channel,k) => channel*(1-alpha)+fg[k]*alpha));
    min = Math.min(min,(Math.max(front,back)+.05)/(Math.min(front,back)+.05));
   }
   return {ratio:min,color,rgb:fg.slice(0,3),alpha,text};
  }).reduce((worst,reading) => reading.ratio < worst.ratio ? reading : worst));
  return Object.fromEntries(selectors.map((selector,i) => [selector,readings[i]]));
 } finally {
  await cdp.evaluate('window.restoreContrastProbe(); delete window.restoreContrastProbe;');
 }
}
async function contrast(cdp,selectors) {
 return Object.fromEntries(Object.entries(await contrastDetails(cdp,selectors)).map(([selector,reading]) => [selector,reading.ratio]));
}

async function screenshotPixels(cdp, boxes) {
 const {data} = await cdp.send('Page.captureScreenshot',{format:'png'});
 return cdp.evaluate(`(${async function (data, boxes) {
  const image = new Image();
  image.src = 'data:image/png;base64,' + data;
  await image.decode();
  const canvas = new OffscreenCanvas(image.width,image.height);
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0);
  return boxes.map(box => Array.from(ctx.getImageData(...box).data));
 }})(${JSON.stringify(data)},${JSON.stringify(boxes)})`);
}

async function openLog(cdp) {
 await cdp.evaluate(`window.__tomoyoChinese.openBacklog();
  dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth,surfaceHeight:innerHeight}}));`);
 await waitFor(cdp, `(() => {
  const panel = document.querySelector('.tome-backlog[data-shown]');
  return panel && getComputedStyle(panel).opacity === '1' && getComputedStyle(panel.querySelector('.tome-log-list')).opacity === '1';
 })()`);
}

async function openCard(cdp) {
 await cdp.evaluate(`(() => {
  const b = window.__tomoyoChinese;
  b.localLookup = async () => ({entries:[{spellings:['窓'],readings:['まど'],pos:['名詞'],definitions:['窗户']}]});
  b.openLocalSelection({text:'窓を開ける',start:0,end:1},{left:500,right:526,top:480,bottom:510,width:26,height:30});
 })()`);
 await waitFor(cdp, `!!document.querySelector('.tomoyo-selection-card .tomoyo-sense')`);
}

async function openPhrase(cdp) {
 await cdp.evaluate(`(${async function () {
  const b = window.__tomoyoChinese,phrase = '明日は晴れる';
  const part = (surface,reading,pos,definition) => ({surface,entries:[{spellings:[surface],readings:[reading],pos:[pos],definitions:[definition]}]});
  const parts = [part('明日','あした','名詞','明天'),part('は','は','助詞','主题助词'),part('晴れる','はれる','動詞','放晴')];
  b.localLookup = async () => ({selection_analysis:{surface:phrase,exact:false,parts}});
  await b.openLocalSelection({text:phrase,start:0,end:phrase.length},{left:500,right:560,top:480,bottom:510,width:60,height:30});
 }})()`);
 await waitFor(cdp, `!!document.querySelector('.tomoyo-selection-card .tomoyo-chunk-role')`);
}

async function menuPixel(cdp) {
 const point = await cdp.evaluate(`(() => {
  const panel = document.querySelector('${menu}').getBoundingClientRect();
  return [Math.floor(panel.left + panel.width * .68), Math.floor(panel.top+14),1,1];
 })()`);
 return (await screenshotPixels(cdp,[point]))[0].slice(0,3);
}

function assertAA(ratios) {
 assert.ok(Object.values(ratios).every(ratio => ratio >= 4.5),
  Object.entries(ratios).map(([selector,ratio]) => `${selector}: ${ratio.toFixed(2)}:1`).join(', '));
}

if (require.main === module) {
 const options = {skip:!hasEdge && 'Edge not installed',timeout:60000};
 test('Alt+T text and secondary controls meet 4.5:1 over a white game',options,() => withReader(async (cdp,load) => {
  for (const fixture of [white,{...white,themeMode:'light'},{...white,home:[30,30,30]}]) {
   await load(fixture);
   await openMenu(cdp);
   assertAA(await contrast(cdp,menuText));
  }
 }));
 test('backlog text and secondary translation meet 4.5:1 over a white picture and game',options,() => withReader(async (cdp,load) => {
  await load({...white,state:logState()});
  await openLog(cdp);
  assertAA(await contrast(cdp,logText));
 }));
 test('lookup definition and reading meet 4.5:1 over a white picture and game',options,() => withReader(async (cdp,load) => {
  await load(white);
  await openCard(cdp);
  assertAA(await contrast(cdp,cardText));
 }));
 test('both themes keep lookup accents and speaker names readable over white',options,() => withReader(async (cdp,load) => {
  for (const themeMode of ['dark','light']) {
   await load({...white,themeMode,state:opaquePictures});
   await openPhrase(cdp);
   const lookup = await contrast(cdp,phraseText);
   await load({...white,themeMode,state:{...opaquePictures,...speakerState()}});
   await openLog(cdp);
   assertAA({...lookup,...await contrast(cdp,['.tome-log-name b',...logText])});
  }
  await load({...white,themeMode:'light',accent:'#ffffff',state:{...opaquePictures,...speakerState()}});
  await openLog(cdp);
  await cdp.evaluate(`(() => {
   const search = document.querySelector('.tome-backlog input[type=search]');
   search.value = '晴';
   search.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await waitFor(cdp, `!!document.querySelector('.tome-backlog .tome-log-hit')`);
  assertAA(await contrast(cdp,['.tome-backlog .tome-log-hit']));
 }));
 test('dark grey and dark blue pictures stay within a few RGB levels of the original',options,() => withReader(async (cdp,load) => {
  for (const [home,alpha,expected] of [
   [[48,48,48],30,[48,48,48]],
   [[10,21,80],30,[37,40,58]],
   [[10,21,80],100,[10,20,79]],
  ]) {
   const state = {[backgroundKey]:JSON.stringify({panels:{menu:{alpha,dim:0,blur:0,saturate:100}}})};
   await load({home,backdrop:'#303030',state});
   await openMenu(cdp);
   const pixel = await menuPixel(cdp);
   assert.ok(pixel.every((channel,i) => Math.abs(channel-expected[i]) <= 4), `at ${alpha}% with ${home}, got ${pixel}; expected ${expected}`);
  }
 }));
 test('clearing a picture restores the saved opacity and plain composite',options,() => withReader(async (cdp,load) => {
  const saved = JSON.stringify({panels:{menu:{alpha:30}}});
  await load({home:[255,255,255],backdrop:'#3c405e',state:{[backgroundKey]:saved}});
  await openMenu(cdp);
  await cdp.evaluate(`window.panelFixturePictures.home = ''; window.__tomoyoChinese.hostRefreshAppearance()`);
  await waitFor(cdp,`getComputedStyle(document.querySelector('${menu} .tome-menu-bg>i')).backgroundImage === 'none'`);
  const result = await cdp.evaluate(`(() => {
   const layer = document.querySelector('${menu} .tome-menu-bg');
   return {alpha:getComputedStyle(layer).opacity,saved:localStorage.getItem('${backgroundKey}')};
  })()`);
  assert.deepEqual(result,{alpha:'0.3',saved});
  const pixel = await menuPixel(cdp);
  assert.ok(pixel.every((channel,i) => Math.abs(channel-[45,48,69][i]) <= 1), JSON.stringify(pixel));
 }));
 test('other panel modes keep their original opacity even when a picture is loaded',options,() => withReader(async (cdp,load) => {
  for (const [surface,expected] of [['plain','0.3'],['glass','1'],['both','1']]) {
   const state = {[backgroundKey]:JSON.stringify({surfaces:{menu:surface},panels:{menu:{alpha:30}}})};
   await load({...white,state});
   await openMenu(cdp);
   const alpha = await cdp.evaluate(`getComputedStyle(document.querySelector('${menu} .tome-menu-bg')).opacity`);
   assert.equal(alpha,expected,surface);
  }
 }));
 test('picture contrast respects saved values and keeps the full range of the opacity control',options,() => withReader(async (cdp,load) => {
  const saved = {custom:true,panels:{menu:{alpha:20,dim:0,saturate:172},log:{alpha:71,dim:42},card:{alpha:93,dim:60}}};
  const stored = JSON.stringify(saved);
  await load({home:[12,12,12],game:[235,235,235],backdrop:'#ddd',state:{[backgroundKey]:stored}});
  await openMenu(cdp);
  const low = await menuPixel(cdp);
  const lowRatios = await contrast(cdp,menuText);
  assert.equal(await cdp.evaluate(`localStorage.getItem('${backgroundKey}')`),stored);
  const updated = await cdp.evaluate(`(() => {
   const dialog = document.querySelector('${menu}');
   dialog.querySelector('[data-menu-key=misc]').click();
   const opacity = dialog.querySelector('[data-game-panel=menu][data-game-key=alpha]');
   if (opacity.value !== '20') throw Error('Opacity control did not show the saved value');
   opacity.value = '100';
   opacity.dispatchEvent(new Event('input',{bubbles:true}));
   dialog.querySelector('[data-menu-key=text]').click();
   return JSON.parse(localStorage.getItem('${backgroundKey}'));
  })()`);
  assert.equal(updated.custom,saved.custom);
  for (const [panel,values] of Object.entries(saved.panels)) {
   for (const [key,value] of Object.entries(values)) assert.equal(updated.panels[panel][key],panel === 'menu' && key === 'alpha' ? 100 : value);
  }
  assert.notDeepEqual(await menuPixel(cdp),low,'the opacity slider still changes the picture blend');
  assertAA(lowRatios);
  assertAA(await contrast(cdp,menuText));
 }));
}

module.exports = {contrast,contrastDetails,menuPixel,menuText,logText,cardText,logState,phraseText,speakerState,opaquePictures,openMenu,openLog,openCard,openPhrase,waitFor,withReader};
