// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert');
const fill=require('../services/original-engines/fill.cjs');
test('fill: a release gap takes the filled line, release lines stay, asset names are not text',()=>{
 const table=fill._entries();table[fill.key('テストの行です')]='测试行';
 const s=fill.scene({name:'a',lines:['いち','テストの行です','ギター.tga','まだない'],zh:['一','','','']});
 assert.deepEqual(s.zh,['一','测试行','','']);
 assert.deepEqual(s.zhSource,['release','filled','asset','']);
 delete table[fill.key('テストの行です')];});
test('fill: the shipped table holds only hashes and Chinese',()=>{
 const t=fill._entries();const keys=Object.keys(t);assert.ok(keys.length>=20);
 for(const k of keys){assert.match(k,/^[0-9a-f]{40}$/);assert.ok(/[一-鿿]|^[^ぁ-ゖ]*$/.test(t[k]));}});
test('fill: scenes without a Chinese column are left alone',()=>{
 const s={name:'b',lines:['あ']};assert.equal(fill.scene(s),s);});
test('fill: ASSET matches standalone resource names only and never swallows dialogue mentioning filenames',()=>{
 for(const ok of ['ギター.tga','ライブシーン.ani','bg/cg_01.png','se\\click-1.ogg','a'.repeat(40)+'.bmp','OP.WMV','layer.psd']){
  assert.deepEqual(fill.lookup(ok),{zh:'',source:'asset'},ok);
 }
 const dialogue=[
  'photo.pngを見せて',
  'bgm01.oggは名曲',
  'お姉ちゃんの写真、photo.png',
  'これ見て！image.bmp',
  '本当に？bg01.png',
  '終わりました。se01.wav',
  '……BGMはtrack01.ogg',
  '音楽・bgm01.ogg',
  'ファイル名：test.png',
  '注意；cg01.jpg',
  '【システム】logo.tga',
  '[BGM]track.ogg',
  '(注)a.png',
  'a,b.png',
  'a．b.png',
  'a"b.png',
  'a<tag>.png',
  'a?b.png',
  'a*b.png',
  'a|b.png',
  'a:b.png',
  'a\x07b.png',
  '再生中\\nintro.wmv',
  '※cg01.png',
  '♪opening.ogg',
  '→next.bmp',
  '～title.jpg',
  '―end.wav',
  '—fin.mpg',
  '“quote”.png',
  '‘single’.png',
  'あ'.repeat(41)+'.png',
 ];
 const table=fill._entries();
 try{
  for(const line of dialogue){
   assert.equal(fill.ASSET.test(line),false,line);
   assert.equal(fill.lookup(line),null,line);
  }
  const sample='これ見て！image.bmp';
  table[fill.key(sample)]='看这个！image.bmp';
  const s=fill.scene({name:'c',lines:[sample,'ギター.tga'],zh:['','']});
  assert.deepEqual(s.zh,['看这个！image.bmp','']);
  assert.deepEqual(s.zhSource,['filled','asset']);
 }finally{
  delete table[fill.key('これ見て！image.bmp')];
 }
});
