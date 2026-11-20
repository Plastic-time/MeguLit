// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 千恋＊万花 runs with the KiriKiri engine diff and its own game diff. Replays of this game go in more *.case.cjs files here. */
module.exports=async({profile,assert})=>{assert.equal(profile.gameKey,'senren-banka');assert.equal(profile.engine,'kirikiri');assert.equal(profile.layers,'core+engine+game');};
