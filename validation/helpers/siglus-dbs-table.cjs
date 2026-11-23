'use strict';
module.exports=function table(cells,ids=cells[0].map((_,i)=>i)){
 const I=require('../../core/japanese-restore.cjs')._internal,rows=cells.length,cols=cells[0].length,fmt=28,data=fmt+cols*8,text=data+rows*cols*4,head=Buffer.alloc(text),pool=[];let offset=0;
 [0,rows,cols,0,fmt,data,text].forEach((v,i)=>head.writeUInt32LE(v,i*4));
 for(let c=0;c<cols;c++){head.writeUInt32LE(ids[c],fmt+c*8);head.writeUInt32LE(typeof cells[0][c]==='number'?0x56:0x53,fmt+c*8+4);}
 cells.forEach((row,r)=>row.forEach((v,c)=>{if(typeof cells[0][c]==='number'){head.writeUInt32LE(v,data+(r*cols+c)*4);return;}const b=Buffer.from(v+'\0','utf16le');head.writeUInt32LE(offset,data+(r*cols+c)*4);pool.push(b);offset+=b.length;}));
 const raw=Buffer.concat([head,...pool]);raw.writeUInt32LE(raw.length,0);return I.encrypt(1,raw);
};
