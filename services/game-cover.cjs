// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// A cover the user picked for one game. It is marked so that metadata refresh never replaces it.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_BYTES=12*1024*1024; // store.imageData shows covers up to this size
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function setCover(db,root,id,source){
 const row=db.prepare('SELECT id,cover,original FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');
 // Game covers are shown as PNG, JPEG or WebP only.
 const match=/^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(require('./assets.cjs').preview(source));if(!match)throw Error('INVALID_IMAGE');
 const bytes=Buffer.from(match[2],'base64');if(bytes.length>MAX_BYTES)throw Error('INVALID_IMAGE');
 const folder=path.join(root,'data','assets','covers'),file='custom-'+sha(row.id).slice(0,16)+'-'+sha(bytes).slice(0,12)+'.'+(match[1]==='jpeg'?'jpg':match[1]);
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,file),bytes);
 const original=JSON.parse(row.original||'{}');original.coverCustom=true;
 db.prepare('UPDATE games SET cover=?,original=? WHERE id=?').run(file,JSON.stringify(original),row.id);
 // Drop this game's previous custom cover; automatic covers stay where they are.
 if(row.cover!==file&&/^custom-[0-9a-f]+-[0-9a-f]+\.(png|jpg|webp)$/.test(row.cover))fs.rmSync(path.join(folder,row.cover),{force:true});
 return {cover:require('./store.cjs').imageData(root,'covers',file)};
}
module.exports={setCover};
