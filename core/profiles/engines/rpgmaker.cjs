// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* RPG Maker's CDP wrappers require explicit draw.roles or draw.embed permission in addition to ownTextOutput.
   A canvas/NW.js detection alone must not install message or Bitmap hooks. */
module.exports={
 engine:'rpgmaker',
 settings:{draw:{roles:false,embed:false}},
};
