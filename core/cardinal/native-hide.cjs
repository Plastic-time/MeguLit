// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {parseChars}=require('../text-paths.cjs');
function dialogue(raw){const record=parseChars(raw);if(!record||(record.role||'line')!=='line'||!Number.isSafeInteger(record.line)||record.line<1||!Number.isFinite(record.sw)||record.sw<=0||!Number.isFinite(record.sh)||record.sh<=0||!/[぀-ヿ㐀-鿿]/.test(record.text)||!record.rects.length||!record.rects.some(rect=>rect[2]>0&&rect[3]>0))return null;return record;}
function collector({modeled=false}={}){const lines=new Map();return {report(raw,enabled){if(!enabled)return;const r=dialogue(raw);if(!r)return;const key=r.engine+':'+r.line;lines.set(key,lines.get(key)===true||!r.hidden);},snapshot(){return {source:'native-dialogue',modeled,lines:lines.size,visible:[...lines.values()].filter(Boolean).length};}};}
function validCounts(value){return !!value&&value.source==='native-dialogue'&&value.modeled===false&&Number.isSafeInteger(value.lines)&&value.lines>0&&Number.isSafeInteger(value.visible)&&value.visible>=0&&value.visible<=value.lines;}
module.exports={dialogue,collector,validCounts};
