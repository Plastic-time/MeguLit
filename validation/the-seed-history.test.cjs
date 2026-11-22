// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),path=require('node:path'),assert=require('node:assert/strict');
test('reserved The Seed history is signed append-only release data, independently validated',async()=>{const feed=require('../services/auto-profile-feed.cjs'),keys={profileKeys:feed.keys(),releaseKeys:feed.keys(),reviewKeys:require('../services/torch-review-keys.json').keys};const counts=await require('../tools/torch-release.cjs').checkRepositoryHistory(path.join(__dirname,'../The Seed'),{keys});assert.ok(Number.isSafeInteger(counts.games)&&Number.isSafeInteger(counts.releases));});
