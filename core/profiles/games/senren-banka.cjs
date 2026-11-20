// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Game diff: 千恋＊万花 (Senren＊Banka), KiriKiri Z. Retail/DL and Steam (app 1144400) ship SenrenBanka.exe; Chinese patches
   rename it (SenrenBanka_chs.exe, Senren_chs.exe, Senren_jp.exe). A renamed copy is still found by its title. */
module.exports={
 engine:'kirikiri',
 title:'千恋＊万花',
 match:{
  exe:['SenrenBanka.exe','SenrenBanka_chs.exe','Senren_chs.exe','Senren_jp.exe','senren.exe'],
  titles:['千恋＊万花','千恋万花','Senren Banka','Senren＊Banka'],
  steamAppId:1144400,
 },
 /* incr9 2026-11-21 (owner): short lines showed the translation alone (the game hid them, no hidden glyph came back);
    the Japanese sat over the name box 【運転手】 when two translation rows did not fit */
 settings:{placement:{drawWhileBlanking:true,translationGrowsDown:true}},
};
