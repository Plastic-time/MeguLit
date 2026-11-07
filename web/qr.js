// SPDX-License-Identifier: GPL-3.0-or-later
// Minimal QR encoder (byte mode, ECC M, versions 1-10) for the MOJi sign-in code. No dependencies.
const TOTAL=[0,26,44,70,100,134,172,196,242,292,346];
const ECC=[0,10,16,26,18,24,16,18,22,22,26];
const BLOCKS=[0,1,1,1,2,2,4,4,4,5,5];
const ALIGN=[[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
const mul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z&255;};
function divisor(n){const r=new Array(n).fill(0);r[n-1]=1;let root=1;for(let i=0;i<n;i++){for(let j=0;j<n;j++){r[j]=mul(r[j],root);if(j+1<n)r[j]^=r[j+1];}root=mul(root,2);}return r;}
function remainder(data,div){const r=new Array(div.length).fill(0);for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>{r[i]^=mul(c,f);});}return r;}

export function qrMatrix(text){
 const bytes=[...new TextEncoder().encode(text)];
 let v=1;for(;v<=10;v++){const cap=(TOTAL[v]-ECC[v]*BLOCKS[v])*8;if(4+(v<10?8:16)+bytes.length*8<=cap)break;}
 if(v>10)throw Error('QR_TOO_LONG');
 const dataLen=TOTAL[v]-ECC[v]*BLOCKS[v],bits=[];
 const push=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1);};
 push(4,4);push(bytes.length,v<10?8:16);bytes.forEach(b=>push(b,8));
 push(0,Math.min(4,dataLen*8-bits.length));while(bits.length%8)bits.push(0);
 for(let pad=0xEC;bits.length<dataLen*8;pad^=0xEC^0x11)push(pad,8);
 const words=[];for(let i=0;i<bits.length;i+=8)words.push(bits.slice(i,i+8).reduce((a,b)=>a<<1|b,0));
 const nb=BLOCKS[v],short=Math.floor(TOTAL[v]/nb),nShort=nb-TOTAL[v]%nb,div=divisor(ECC[v]),blocks=[];
 for(let i=0,k=0;i<nb;i++){const len=short-ECC[v]+(i<nShort?0:1),d=words.slice(k,k+len);k+=len;blocks.push([d,remainder(d,div)]);}
 const out=[];const maxD=Math.max(...blocks.map(b=>b[0].length));
 for(let i=0;i<maxD;i++)for(const [d] of blocks)if(i<d.length)out.push(d[i]);
 for(let i=0;i<ECC[v];i++)for(const [,e] of blocks)out.push(e[i]);
 const size=v*4+17,m=[...Array(size)].map(()=>new Array(size).fill(false)),fn=[...Array(size)].map(()=>new Array(size).fill(false));
 const set=(x,y,dark)=>{m[y][x]=dark;fn[y][x]=true;};
 for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy,d=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4);}
 const al=ALIGN[v],last=al.length-1;
 al.forEach((ax,i)=>al.forEach((ay,j)=>{if((i===0&&j===0)||(i===0&&j===last)||(i===last&&j===0))return;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}));
 const format=mask=>{const data=mask;let r=data;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=((data<<10)|r)^0x5412,bit=i=>((b>>>i)&1)===1;
  for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));
  for(let i=0;i<8;i++)set(size-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,size-15+i,bit(i));set(8,size-8,true);};
 format(0);
 if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=(v<<12)|r;for(let i=0;i<18;i++){const d=((b>>>i)&1)===1,a=size-11+i%3,c=Math.floor(i/3);set(a,c,d);set(c,a,d);}}
 let i=0;
 for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;if(!fn[y][x]&&i<out.length*8){m[y][x]=((out[i>>>3]>>>(7-(i&7)))&1)===1;i++;}}}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y][x]&&(x+y)%2===0)m[y][x]=!m[y][x];
 format(0);
 return m;
}

export function qrSvg(text,quiet=4){
 const m=qrMatrix(text),n=m.length+quiet*2;let d='';
 m.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)d+=`M${x+quiet} ${y+quiet}h1v1h-1z`;}));
 return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#1b120d"/></svg>`;
}
