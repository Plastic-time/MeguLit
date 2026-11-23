/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* Existing transport/clock unit drivers have virtual OS files. Real file admission is exercised separately by cardinal-identity. */
module.exports=function syntheticFileBoundary(test){const I=require('../../services/cardinal/identity.cjs'),original={capture:I.capture,prepare:I.prepare,verify:I.verify,unchanged:I.unchanged};
 test.before(()=>{I.capture=({game,source,seedRev})=>({schema:1,key:game.sha,candidate:{source,seedRev,profileHash:'a'.repeat(64)},digest:'b'.repeat(64)});I.prepare=async captured=>captured;I.verify=async proof=>proof;I.unchanged=()=>{};});
 test.after(()=>Object.assign(I,original));
};
