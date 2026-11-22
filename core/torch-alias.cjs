// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Keep this order in sync with the persisted assignment in migration 0030.
// Official Japanese character pages: sao-alicization.net and konosuba.com.
const POOL=Object.freeze([
 'ユージオ','ダクネス','アスナ','バニル','セルカ','クレア',
 'キリト','ゆんゆん','ロニエ・アラベル','ミツルギ','シノン','アクア',
 'アリス','ルナ','エルドリエ','レイン','リーファ','アイリス',
 'ティーゼ・シュトリーネン','ウィズ','シリカ','クリス','リズベット','カズマ'
]);

// The numbered receipts from older relays use the same assignment as the backfill.
function fallbackAlias(torchNo){
 if(!Number.isSafeInteger(torchNo)||torchNo<0)return null;
 const slot=(torchNo%POOL.length+7*Math.floor(torchNo/POOL.length))%POOL.length;
 return POOL[slot];
}

module.exports={fallbackAlias};
