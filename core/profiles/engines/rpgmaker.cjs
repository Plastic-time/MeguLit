// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: RPG Maker MV / MZ (NW.js, the JS layer read by core/text-paths-rpgm.cjs). Before engine-draw this engine had
   no text path at all (the page is a canvas), so turning the engine-draw reading on changes no working behaviour: the
   message window draws MeguLit's ruby and Chinese itself, menus / choices / commands are only annotated. Only active when
   the web text path runs (the owner's 画进游戏画面 switch, preferences.ownTextOutput). */
module.exports={
 engine:'rpgmaker',
 settings:{draw:{roles:true,embed:true}},
};
