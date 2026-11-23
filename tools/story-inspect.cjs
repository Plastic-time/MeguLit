// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),discovery=require('../services/story-discovery.cjs');
const [executable,out]=process.argv.slice(2);if(!executable||!out)throw Error('Usage: node tools/story-inspect.cjs <game.exe> <rules.json>');
const rules=discovery.discover(executable);if(!discovery.validateRules(rules))throw Error('STORY_RULES_INVALID');fs.writeFileSync(out,JSON.stringify(rules,null,1)+'\n');console.log(JSON.stringify({engine:rules.engine,chapters:rules.chapters.length,gallery:rules.gallery.length,candidates:rules.candidates.length,progressIncluded:false}));
