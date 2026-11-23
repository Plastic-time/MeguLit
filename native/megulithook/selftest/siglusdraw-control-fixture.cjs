// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const ED=require('../../../core/engine-draw.cjs');
const tmp=process.argv[2];if(!tmp)throw new Error('missing task temporary directory');
const t=new ED.KrkrTransport(733173,{tmp});t.flush(ED.settings({draw:{roles:true}}),new Map());process.stdout.write(t.file);
