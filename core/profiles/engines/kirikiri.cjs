// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: KiriKiri / KiriKiri Z (TVP, krkr). Only keys of core/profiles/defaults.cjs; what every KiriKiri game needs and
   no other engine does. A fix for one KiriKiri game goes to its game file, not here (千恋＊万花 and ファタモルガーナの館 are both
   KiriKiri and broke each other while their fixes lived in the shared code).
   Draw roles (core/draw-role.cjs), by the engine's own identity of the draw:
     dialogue  the KAG message path: TextRender (KiriKiri Z text renderer), the message-layer hooks (KiriKiriZ, KiriKiri1/2/4,
               Krkr2wcs, EmbedKrkrZ) and a message layer the native layer reader wrapped (layer:msg, native/krkrtext)
     ui        KAG links and buttons: [link] / [glink] / selectLink calls and LinkButtonLayer / ButtonLayer / CheckBoxLayer /
               EditLayer / SliderLayer classes (system buttons, menus, choices)
     system    Bitmap DrawText (tTVPNativeBaseBitmap::DrawText: config pages, titles, text effects drawn on art layers) and every
               other layer a native reader wrapped (layer:art) */
const map={};
for(const h of ['TextRender','KiriKiriZ','KiriKiri1','KiriKiri2','KiriKiri4','Krkr2wcs','EmbedKrkrZ'])map['hook:'+h]='dialogue';
map['layer:msg']='dialogue';map['class:MessageLayer']='dialogue';
for(const c of ['link','glink','selectLink','button'])map['call:'+c]='ui';
for(const c of ['LinkButtonLayer','ButtonLayer','CheckBoxLayer','EditLayer','SliderLayer'])map['class:'+c]='ui';
map['hook:tTVPNativeBaseBitmap::DrawText']='system';map['layer:art']='system';
module.exports={
 engine:'kirikiri',
 settings:{role:{map,treat:{dialogue:'embed',ui:'annotate',system:'annotate'}}},
};
