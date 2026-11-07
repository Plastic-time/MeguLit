// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// tauri-codegen uses the FIRST .ico frame as the runtime window/taskbar icon. Keep all frames but put the largest
// first so Windows downsamples 256px instead of upscaling 16px (blurry taskbar). Usage: node order-icon-frames.cjs file.ico
const fs=require('node:fs'),file=process.argv[2];const b=fs.readFileSync(file),n=b.readUInt16LE(4);
const frames=[...Array(n)].map((_,i)=>{const o=6+i*16;return {dir:b.subarray(o,o+16),w:b[o]||256,data:b.subarray(b.readUInt32LE(o+12),b.readUInt32LE(o+12)+b.readUInt32LE(o+8))};}).sort((x,y)=>y.w-x.w);
const head=Buffer.alloc(6+16*n);b.copy(head,0,0,6);let offset=head.length;
frames.forEach((f,i)=>{const d=Buffer.from(f.dir);d.writeUInt32LE(offset,12);d.copy(head,6+i*16);offset+=f.data.length;});
fs.writeFileSync(file,Buffer.concat([head,...frames.map(f=>f.data)]));console.log(frames.map(f=>f.w).join(','));
