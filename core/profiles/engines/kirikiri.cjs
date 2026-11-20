// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: KiriKiri / KiriKiri Z (TVP, krkr). Only keys of core/profiles/defaults.cjs; what every KiriKiri game needs and
   no other engine does. A fix for one KiriKiri game goes to its game file, not here (千恋＊万花 and ファタモルガーナの館 are both
   KiriKiri and broke each other while their fixes lived in the shared code).
   Draw roles (core/draw-role.cjs, draw.roleMap), by the engine's own identity of the draw:
     line    the KAG message path: TextRender (KiriKiri Z text renderer), the message-layer hooks (KiriKiriZ, KiriKiri1/2/4,
             Krkr2wcs, EmbedKrkrZ) and a message layer the native layer reader wrapped (layer:msg, native/krkrtext)
     choice  KAG links: [link] / [glink] / selectLink calls and LinkButtonLayer (choices and in-text links)
     button  [button] calls and ButtonLayer (system buttons)
     menu    CheckBoxLayer / EditLayer / SliderLayer (config pages)
     system  Bitmap DrawText (tTVPNativeBaseBitmap::DrawText: config pages, titles, text effects drawn on art layers) and every
             other layer a native reader wrapped (layer:art) */
const roleMap={};
for(const h of ['TextRender','KiriKiriZ','KiriKiri1','KiriKiri2','KiriKiri4','Krkr2wcs','EmbedKrkrZ'])roleMap['hook:'+h]='line';
roleMap['layer:msg']='line';roleMap['class:MessageLayer']='line';
for(const c of ['link','glink','selectLink'])roleMap['call:'+c]='choice';roleMap['class:LinkButtonLayer']='choice';
roleMap['call:button']='button';roleMap['class:ButtonLayer']='button';
for(const c of ['CheckBoxLayer','EditLayer','SliderLayer'])roleMap['class:'+c]='menu';
roleMap['hook:tTVPNativeBaseBitmap::DrawText']='system';roleMap['layer:art']='system';
module.exports={
 engine:'kirikiri',
 settings:{draw:{roleMap}},
};
