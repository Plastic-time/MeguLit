'use strict';
const POLICY=2;
const approved=source=>/^(?:VNDB|Official|官方|公式|Manual|用户)/i.test(String(source||''));
module.exports={POLICY,approved};
