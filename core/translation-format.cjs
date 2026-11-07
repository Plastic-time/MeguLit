// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
function normalizeTranslation(value){
 return typeof value==='string'?value.replace(/\\r\\n|\\n|<br\s*\/?>/gi,'\n'):value;
}
module.exports={normalizeTranslation};
