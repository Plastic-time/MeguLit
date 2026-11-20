// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* ファタモルガーナの館 runs with the KiriKiri engine diff and its own game diff. Replays of this game go in more *.case.cjs files here. */
module.exports=async({profile,assert})=>{assert.equal(profile.gameKey,'fata-morgana');assert.equal(profile.engine,'kirikiri');assert.equal(profile.layers,'core+engine+game');};
