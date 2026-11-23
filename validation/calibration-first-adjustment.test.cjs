// SPDX-License-Identifier: GPL-3.0-or-later
// Replay the two windowed calibrations with the real Alt+T form and fallback layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('the first position edit after calibration moves only the edited axis', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [game, cx, cy, cw, ch, x, y] of [
      ['WHITE ALBUM2', 220, 186, 1280, 720, 21.875, 72.89930555555554],
      ['Subarashiki Hibi HD', 175, 50, 1280, 960, 16.953125, 73.75],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.route('http://reader.test/', route => route.fulfill({ contentType:'text/html', body:
        '<main><div class="sentence-window"></div></main><dialog open class="tomoyo-cn-dialog"><form><label><input name="enabled"></label><label><input name="contextLines"></label></form></dialog>' }));
      await page.goto('http://reader.test/');
      await page.evaluate(() => {
        window.__tomoyoChinese = { openSettings(){}, setTranslationVisible(){}, textPlaceAnchorActive:()=>true };
        window.__tomoyoTranslateRequest = () => {};
      });
      for (const file of ['game-style.js','gal.js'])
        await page.addScriptTag({ path: path.join(__dirname,'../web/reader/modules',file) });
      await page.evaluate(({cx,cy,cw,ch,x,y}) => {
        const b=window.__tomoyoChinese;
        b.galStatus({bound:true});
        document.body.classList.add('megulit-anchor-mode');
        b.galLayout({clientX:cx,clientY:cy,clientWidth:cw,clientHeight:ch,readerX:cx+x*cw/100,readerY:cy+y*ch/100,readerWidth:768,readerHeight:150});
        b.openSettings();
      }, {cx,cy,cw,ch,x,y});
      for (const [axis,delta] of [['X',1],['X',-1],['Y',1],['Y',-1]]) {
        const {before,after,prefs} = await page.evaluate(({x,y,axis,delta}) => {
          const b=window.__tomoyoChinese, field=document.querySelector('[name=gal'+axis+']');
          const pos=()=>{const r=document.querySelector('.sentence-window').getBoundingClientRect();return [r.left,r.top];};
          b.galAnchorOffsetReset();
          b.applyGalPreferences({x,y},{preview:true});
          const before=pos();
          field.value=Number(field.value)+delta;
          field.dispatchEvent(new Event('input',{bubbles:true}));
          return {before,after:pos(),prefs:b.galPreferences()};
        }, {x,y,axis,delta});
        assert.deepEqual([prefs.anchorDX,prefs.anchorDY], axis==='X'?[delta,0]:[0,delta],game+' '+axis);
        for (const [i,expected] of (axis==='X'?[cw*delta/100,0]:[0,ch*delta/100]).entries())
          assert.ok(Math.abs(after[i]-before[i]-expected)<0.1, game+' '+axis+' '+JSON.stringify({before,after,expected}));
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
