'use strict';
// Start notice: a 以后不再提示 box at the bottom left; the The Seed dialog keeps its buttons inside a small window.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=f=>fs.readFileSync(path.join(__dirname,'../web',f),'utf8');

test('the start notice has a 以后不再提示 box that stops it opening by itself',()=>{
 const js=web('feedback-ui.js');
 for(const word of ["noticeOff: '以后不再提示'","noticeOff: '次回から表示しない'","noticeOff: \"Don't show this again\""])assert.ok(js.includes(word),word);
 assert.match(js,/const noticeOffKey = 'megulit\.startupNoticeOff';/);
 assert.match(js,/if \(\(\(shownThisLaunch \|\| noticeOff\(\)\) && !force\) \|\| document\.querySelector\('\.dev-notice'\) \|\| !canShow\(\)\) return;/,'ticked: no start-up notice, an explicit open still works');
 assert.match(js,/<label class="dev-notice-off" title="\$\{esc\(t\.noticeOffTip\)\}"><input type="checkbox" data-notice-off\$\{noticeOff\(\) \? ' checked' : ''\}>/);
 assert.match(js,/\[data-notice-off\]'\)\.onchange = event => setNoticeOff\(event\.target\.checked\);/,'unticking turns the notice back on');
});

test('the box sits bottom left, level with the button row, in every page-1 layout',()=>{
 const css=web('unify.css');
 assert.match(css,/"succ upd" "more upd" "\. note" "off act";align-items:start\}/);
 assert.equal((css.match(/"more" "off" "act"\}\}/g)||[]).length,2,'both one-column layouts keep the box above the buttons');
 assert.match(css,/>\.dev-notice-off\{grid-area:off;align-self:end;justify-self:start;margin:0 0 18px;min-height:46px;position:sticky;bottom:18px;z-index:2\}/);
 assert.match(css,/body \.dev-notice-off\{display:inline-flex;[^}]*color:var\(--g-gold,#edb56e\)/,'lit in the theme gold');
});

test('the The Seed dialog scrolls its body so the title and buttons stay inside',()=>{
 const css=web('the-seed.css');
 assert.match(css,/\.dev-notice\.seed-panel>\.dev-notice-scroll\{flex:1 1 0;min-height:0;overflow-y:auto\}/);
 assert.match(css,/\.dev-notice\.seed-panel>h2,\.dev-notice\.seed-panel>\.dev-notice-actions\{flex:none\}/);
});
