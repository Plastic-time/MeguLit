// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classify,validateRatings,hasAdultMarker}=require('../services/story-content-rating.cjs');
const gallery=category=>({kind:'gallery-group',file:'data.xp3',entry:'gallery/table.ks',category,marker:category==='adult'?'Hシーン回想':'通常CG'});
const scene={kind:'scene-marker',file:'data.xp3',entry:'scenario/route_h01.ks',marker:'route_h01'};
const audio={kind:'adult-audio',file:'data.xp3',entry:'scenario/route_h01.ks',marker:'bgm/h_scene01.ogg'};
const exclusive={kind:'adult-only',file:'data.xp3',entry:'scenario/route_h01.ks',contextProof:'scene-and-audio',occurrences:3,adultOccurrences:3};
const gameRating={rating:'all-ages',vndb:'v123',release:'r123'};

test('actual gallery categories take precedence over script inference and whole-game fallback',()=>{
 assert.equal(classify({name:'cg01.png',gallery:[gallery('adult')],gameRating}).adult,true);
 const normal=classify({name:'cg01.png',gallery:[gallery('general')],script:[scene,audio],gameRating:{rating:'adult',vndb:'v123'}});
 assert.equal(normal.adult,false);assert.equal(normal.basis,'gallery');assert.equal(validateRatings([normal]),true);
 const conflict=classify({name:'cg01.png',gallery:[gallery('general'),gallery('adult')]});assert.equal(conflict.adult,true);assert.equal(conflict.reasons.length,2);
});

test('two distinct script features are required; two H labels do not count twice',()=>{
 const one=classify({name:'cg01.png',script:[scene],gameRating});assert.equal(one.adult,false);assert.equal(one.basis,'game');
 const duplicate=classify({name:'cg01.png',script:[scene,{...scene,marker:'route_h02'}],gameRating});assert.equal(duplicate.adult,false);
 for(const pair of [[scene,audio],[scene,exclusive],[audio,exclusive]]){const row=classify({name:'cg01.png',script:pair,gameRating});assert.equal(row.adult,true);assert.equal(row.basis,'script');assert.equal(validateRatings([row]),true);}
});

test('adult-only occurrences require complete counts and independently established adult context',()=>{
 for(const invalid of [{...exclusive,occurrences:0},{...exclusive,adultOccurrences:2},{...exclusive,contextProof:'self'},{...exclusive,occurrences:Infinity}])assert.throws(()=>classify({name:'cg01.png',script:[scene,invalid]}),/STORY_CONTENT_FACTS/);
});

test('known all-ages fallback is visible, adult and unknown fallbacks stay veiled without a model',()=>{
 for(const rating of ['all-ages','adult','unknown']){const row=classify({name:'cg01.png',gameRating:{rating,vndb:'v123'}});assert.equal(row.adult,rating!=='all-ages');assert.equal(row.basis,'game');assert.equal(validateRatings([row]),true);}
 assert.equal(classify({name:'cg01.png'}).reasons[0].rating,'unknown');
 assert.throws(()=>classify({name:'cg01.png',gameRating:{rating:'all-ages'}}),/STORY_CONTENT_GAME_RATING/);
});

test('marker recognition does not label SHIRO, hero or HD as H scenes',()=>{
 for(const marker of ['H','Ｈシーン','h01','route_h02','エッチ回想','濡れ場','sex_01','ero-scene'])assert.equal(hasAdultMarker(marker),true,marker);
 for(const marker of ['SHIRO','hero','HD','school','where','shero'])assert.equal(hasAdultMarker(marker),false,marker);
 assert.equal(hasAdultMarker('evh001',['evh']),true);assert.equal(hasAdultMarker('evh001'),false);
});

test('shared records reject private fields, foreign CGs, duplicate names and forged decisions',()=>{
 const row=classify({name:'cg01.png',script:[scene,audio]});assert.equal(validateRatings([row],{names:['CG01.PNG']}),true);
 const clone=()=>JSON.parse(JSON.stringify(row));
 for(const mutate of [r=>{r.progress=1;},r=>{r.adult=false;},r=>{r.basis='game';},r=>{r.reasons[0].file='C:/Users/player/save.dat';},r=>{r.reasons[0].entry='../personal';},r=>{r.reasons[0].email='person@example.test';}]){const bad=clone();mutate(bad);assert.equal(validateRatings([bad]),false);}
 assert.equal(validateRatings([row],{names:['other.png']}),false);assert.equal(validateRatings([row,{...row,name:'CG01.PNG'}]),false);
 assert.equal(validateRatings([{...row,reasons:[scene]}]),false);
});
