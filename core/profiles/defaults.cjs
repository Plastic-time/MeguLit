// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「做引擎适配差分和游戏差分，每个游戏都不要互相影响」) the kernel layer of the game profile.
   Every place where MeguLitHook behaves differently per engine or per game reads one of these keys (core/profiles/index.cjs
   profileFor). A value here is the kernel's own behaviour for every game; null means "the kernel decides as before".
   An engine file (engines/<id>.cjs) or a game file (games/<gameKey>.cjs) may only set keys that exist here: a new branch in
   the kernel first adds its key here with the old behaviour as default, then the one engine or game that needs it sets it.
   Arrays replace, they never merge: a game that sets choice.filters owns the whole list. */
module.exports={
 placement:{
  /* where the first line of a page is anchored: null = kernel (glyph records, then the text box); 'glyph' | 'box' | 'page' */
  firstLineAnchor:null,
  /* extra pixels (game client) added to the Japanese line's top, after the kernel placed it */
  lineOffsetY:0,
 },
 page:{
  /* the game draws one line over several frames (fade, wipe, per-character effects): null = kernel heuristics; true = every
     repaint of the same line is one line (never a new line, never a skip); false = frames are not effects */
  effectFrames:null,
 },
 choice:{
  /* RegExp sources (flags 'u'); a choice candidate whose text matches one of them is never offered as an option */
  filters:[],
 },
 hide:{
  /* the game's text effect cannot be hidden line by line: start this game in read mode (the original stays, MeguLit shows
     the translation), like the per-exe memory of services/text-effects.cjs */
  textEffectsRead:false,
 },
 safeMode:{
  /* reader redraws per second while the game is in a page effect; null = kernel default */
  redrawRate:null,
 },
};
