// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const check=require('./artemis-prepare.cjs');
const variants=Object.freeze([
 Object.freeze({id:'amakano3-trial-lua-input-v1',exe:'ca1fe32160ee8557acc0af712cd5eaf642eb29cc14f0ec06715824675d3c05a5',modules:Object.freeze({
  'system/msg/message.lua':'a2257f0db2a6db99568b87c8ea985763b23275decd1b305a96c8bf4bd960133f',
  'system/msg/ui.lua':'909d133b15e50f7694453bc79c54b37b98c5bf28e4c69906c836dc833c8c9588',
  'system/adv/select.lua':'87f5a39eb4498cc2ac36aaa8f85e77c1062d8d47c4637b12533547ebba3b65fa'})}),
 Object.freeze({id:'the-shell1-lua-input-v1',exe:'7f256e7395b62ba2298b1cde30e68097a23ce36e9f8f31753c64257d8181b68c',modules:Object.freeze({
  'system/msg/message.lua':'78525cf838b6ce0fb438ea66f966c51cf6faa511040d0141c2e9c1345e6f0fdd',
  'system/msg/ui.lua':'4611f6dc36812d3fba03360ed79e42c3983e440fd80f6a379f92283cee5e0267',
  'system/adv/select.lua':'e239ac3e2f7a72b20e7631bceffd1c3fa33bbd95b08659c95d6d29337676cf99'})}),
 Object.freeze({id:'the-shell1-ja-lua-input-v1',exe:'7f256e7395b62ba2298b1cde30e68097a23ce36e9f8f31753c64257d8181b68c',modules:Object.freeze({
  'system/msg/message.lua':'27468a8db7e18326d9a8253db0e68a2ca764f1158d5e8403142fff2ec669b492',
  'system/msg/ui.lua':'4611f6dc36812d3fba03360ed79e42c3983e440fd80f6a379f92283cee5e0267',
  'system/adv/select.lua':'2dffde1429dd7edde42297f527ecfe8d9491b553597bab18976187397455bd7a'})})
]);
function prepare(input){return check(variants,input);}
module.exports={prepare,variants};
