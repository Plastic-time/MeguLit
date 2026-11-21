// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Game diff: BALDR SKY (バルドスカイ) Dive1 "Lost Memory" + Dive2 "Recordare", GIGA, NeXAS. Steam app 741140 (Sekai Project,
   2019, installdir "Baldr Sky", one launch option BaldrSky.exe). The Steam/GOG build keeps the main program and all *.pac in the
   install root and a second program of the same name in Dive1\ with only Dive1's Visual.pac/Voice.pac and no steam_api.dll
   (gogdb manifest 4ef57bc9...; saves GIGA\BALDRSKY_EN and GIGA\BALDRSKY_DIVE2). The root program is Dive2, which plays Dive1's
   story too when Dive1 is installed (retail "+Dive1"); this naming is read from the retail release, not from a Steam run.
   Text in the Steam build: English / Simplified Chinese only (Japanese is voice only). */
module.exports={
 engine:'nexas',
 title:'BALDR SKY',
 match:{
  exe:['BaldrSky.exe'],
  titles:['BALDR SKY','Baldr Sky','バルドスカイ','BALDR SKY Dive1','BALDR SKY Dive2'],
  notTitles:['BALDR SKY Zero','BALDR HEART','BALDR FORCE','BALDR BRINGER'],
  steamAppId:741140,
 },
 settings:{library:{partLabels:{'.':'Dive2','Dive1':'Dive1'}}},
};
