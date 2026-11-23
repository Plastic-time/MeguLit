// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user test copy: 千恋＊万花 kept 「实测只能读取」 after its hide was fixed the same day): a verdict this PC saw
   ("readonly", original.library.hook, E359) belongs to the build that saw it. It is stamped with that build's version
   (hookReadonlyBuild); a readonly verdict from another build, or one written before the stamp existed, is shown as
   "untested" until this build has run the game again. The game itself never reads the verdict: every launch tries the hide. */
const {appVersion}=require('./shared-adaptation.cjs');

function stale(library,version){return library?.hook==='readonly'&&String(library.hookReadonlyBuild||'')!==String(version||'');}
/* The hook support to show for a game: a stale readonly verdict becomes 'unverified' (web/embed-status.js: 内嵌待实测). */
function shown(library,version,fallback='unknown'){const hook=String(library?.hook||fallback);return stale(library,version)?'unverified':hook;}
/* A readonly verdict may be written over when it is missing, or stale (the stamp moves to this build); verified wins. */
function mayMarkReadonly(library,version){const hook=library?.hook;return hook!=='verified'&&(hook!=='readonly'||stale(library,version));}

module.exports={stale,shown,mayMarkReadonly,appVersion};
