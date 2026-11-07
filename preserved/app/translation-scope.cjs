// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// A spatial page owns several simultaneous sentences; the classic reader still owns only the latest sentence.
function translationCurrent(latest,contextId,request){return typeof request.pageKey==='string'&&request.pageKey?latest.get('page:'+contextId)===request.pageKey:latest.get(contextId)===request.id;}
module.exports={translationCurrent};
