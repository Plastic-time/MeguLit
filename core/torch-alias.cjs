// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Keep this order in sync with the persisted assignment in migration 0030.
// Official Japanese character pages: sao-alicization.net and konosuba.com.
const OLD_POOL=Object.freeze([
 'ユージオ','ダクネス','アスナ','バニル','セルカ','クレア',
 'キリト','ゆんゆん','ロニエ・アラベル','ミツルギ','シノン','アクア',
 'アリス','ルナ','エルドリエ','レイン','リーファ','アイリス',
 'ティーゼ・シュトリーネン','ウィズ','シリカ','クリス','リズベット','カズマ'
]);

const POOL=Object.freeze(['桐ヶ谷和人', 'ダクネス', 'Asuna', 'バニル', '結城明日奈', 'クレア', 'Kirito', 'ゆんゆん', '朝田詩乃', '御剣響夜', 'Sinon', 'アクア', '桐ヶ谷直葉', 'ルナ', '綾野珪子', 'レイン', 'Leafa', 'アイリス', '篠崎里香', 'ウィズ', 'Silica', 'クリス', 'Lisbeth', '佐藤和真']);

function displayAlias(value, number){
 const slot=OLD_POOL.indexOf(value);
 return slot>=0?POOL[slot]:value||fallbackAlias(number);
}

// The numbered receipts from older relays use the same assignment as the backfill.
function fallbackAlias(torchNo){
 if(!Number.isSafeInteger(torchNo)||torchNo<0)return null;
 const slot=(torchNo%POOL.length+7*Math.floor(torchNo/POOL.length))%POOL.length;
 return POOL[slot];
}

module.exports={fallbackAlias,displayAlias};
