// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Authored incomplete instruction tails; these are not game-version fixtures */
function commitTail(){
 const b=Buffer.alloc(0x61,0x90);Buffer.from('558bec3905000000000f86','hex').copy(b);
 Buffer.from('0fb71445','hex').copy(b,0x5d);return b;
}
function presentTail(){
 const b=Buffer.alloc(0x91,0x90);Buffer.from('0fb70500100000','hex').copy(b);
 Buffer.from('c1e804','hex').copy(b,0x3d);Buffer.from('8d04c0','hex').copy(b,0x6b);
 Buffer.from('0fb705','hex').copy(b,0x8e);return b;
}
module.exports={commitTail,presentTail};
