'use strict';
/* Source-pattern tests read long modules joined back into their original one-line statements: the splitter only
   breaks lines after , ; { and indents the continuation, so removing exactly those breaks restores the old lines. */
const fs=require('node:fs');
module.exports=file=>fs.readFileSync(file,'utf8').replace(/(?<=[,;{])\r?\n[ \t]+/g,'');