// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 guard (owner: 共享差分不能带用户偏好): no key of the shared-diff domains (core/profiles/domains.cjs) is a user preference of the
   game text (font, colour, size, position, translation style: the keys of services/settings-schema.cjs in the text / position / embedding /
   background scopes). A preference must never travel in a game diff, so one added there fails this test. lang.fontFallback stays inside
   the lang block (a fallback font list for a language's glyphs, not the player's font choice). */
const test=require('node:test'),assert=require('node:assert/strict');
const {DOMAINS,langMap}=require('../core/profiles/domains.cjs'),schema=require('../services/settings-schema.cjs'),defaults=require('../core/profiles/defaults.cjs');
const PREF_SCOPES=new Set(['text','position','embedding','background']);
const prefKeys=()=>new Set(schema.fields.filter(f=>PREF_SCOPES.has(f.scope)).map(f=>String(f.key).toLowerCase()));
const leaves=(o,at='')=>Object.entries(o||{}).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof RegExp)?leaves(v,at+k+'.'):[at+k]);
test('the preference key list is not empty (the guard has something to compare)',()=>{const p=prefKeys();assert.ok(p.size>20);for(const k of ['japanesefont','translationsize','textcolor'])assert.ok(p.has(k),k);});
test('no domain key is a user preference of the game text',()=>{const p=prefKeys(),bad=[];for(const key of Object.keys(DOMAINS)){const parts=key.toLowerCase().split('.');if(parts.some(x=>p.has(x)))bad.push(key);}
 assert.deepEqual(bad,[],'a shared diff must not carry user preferences: '+bad.join(', '));});
test('no key of the kernel defaults (what a diff can set) is a user preference either, except inside lang',()=>{const p=prefKeys();const bad=leaves(defaults.DEFAULTS||defaults,'').filter(k=>!k.startsWith('lang.')&&k.toLowerCase().split('.').some(x=>p.has(x)));assert.deepEqual(bad,[],bad.join(', '));});
test('fontFallback appears only in the lang block',()=>{const stray=Object.keys(DOMAINS).filter(k=>/fontfallback/i.test(k));assert.deepEqual(stray,[]);
 const kernel=leaves(defaults.DEFAULTS||defaults,'').filter(k=>/fontfallback/i.test(k)&&!k.startsWith('lang.'));assert.deepEqual(kernel,[]);
 assert.ok(langMap({ja:{fontFallback:['Yu Gothic']}}),'lang.<tag>.fontFallback is accepted');assert.equal(langMap({ja:{fontFallback:'Yu Gothic'}}),null);
 assert.ok('lang' in DOMAINS);});
