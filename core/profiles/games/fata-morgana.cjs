// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Game diff: ファタモルガーナの館 (The House in Fata Morgana), KiriKiri (804x604). The Steam/DL builds ship fata.exe plus
   language variants (fata_jp.exe, fata_cn.exe, fata_en.exe). Steam app 303310. */
module.exports={
 engine:'kirikiri',
 title:'ファタモルガーナの館',
 match:{
  exe:['fata.exe','fata_jp.exe','fata_cn.exe','fata_en.exe'],
  titles:['ファタモルガーナの館','The House in Fata Morgana','魔女之馆','法塔莫尔加纳之馆'],
  steamAppId:303310,
 },
 /* 2026-11-21 owner's run 22:51-22:53Z (incr9): the shuffled per-character fade (tTVPNativeBaseBitmap::DrawText) and the KiriKiri2
    hook cut at its waits left 20 lines dropped, page lines paired with the wrong hook piece, the only option 「……おはよう………………」
    taken for an effect frame, and the reader's own read-mode count at 5-11 % (validation/fixtures/games/fata-morgana) */
 /* incr11 23:33:42Z the choice screen's side streams also carried its UI labels and the music title: 「選択肢選択肢選択肢」「選択ライン選択ライン」
    「女中のテーマピアノソロ」; they are no options (OCR found none of them, so the one real option had no company and was never shown) */
 settings:{page:{pairByDrawn:true,keepHeld:true},choice:{contentInterleave:true,dropEffectFrames:true,filters:['^(選択肢|選択ライン)','のテーマ']},safeMode:{effectJudge:true}},
};
