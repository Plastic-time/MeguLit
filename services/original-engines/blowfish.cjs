// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E356 Blowfish (Schneier) for CatSystem2 archives. The initial P-array and S-boxes are the hexadecimal digits of pi,
// computed here once (Machin's formula with BigInt) instead of a 4 KB constant table. Words are little-endian, as the
// CatSystem2 engine reads them.
let INIT=null;
function piWords(count){
 const bits=BigInt(count*32+64),one=1n<<bits;
 const atanInv=x=>{const X=BigInt(x),X2=X*X;let term=one/X,sum=term,n=1n,sign=-1n;while(term!==0n){term/=X2;const t=term/(2n*n+1n);if(t===0n)break;sum+=sign*t;sign=-sign;n++;}return sum;};
 const pi=16n*atanInv(5)-4n*atanInv(239),frac=pi-(3n<<bits),words=[];
 for(let i=1;i<=count;i++)words.push(Number((frac>>(bits-BigInt(i*32)))&0xffffffffn));
 return words;}
function init(){if(!INIT){const w=piWords(18+1024);INIT={P:w.slice(0,18),S:[0,1,2,3].map(k=>w.slice(18+k*256,18+(k+1)*256))};}return INIT;}
class Blowfish{
 constructor(key){const {P,S}=init();this.P=P.slice();this.S=S.map(s=>s.slice());key=Buffer.from(key);
  for(let i=0,k=0;i<18;i++){let d=0;for(let j=0;j<4;j++){d=(d<<8|key[k])>>>0;k=(k+1)%key.length;}this.P[i]=(this.P[i]^d)>>>0;}
  let l=0,r=0;for(let i=0;i<18;i+=2){[l,r]=this.encrypt(l,r);this.P[i]=l;this.P[i+1]=r;}
  for(let s=0;s<4;s++)for(let i=0;i<256;i+=2){[l,r]=this.encrypt(l,r);this.S[s][i]=l;this.S[s][i+1]=r;}}
 F(x){const S=this.S;return ((((S[0][x>>>24]+S[1][(x>>>16)&255])>>>0)^S[2][(x>>>8)&255])+S[3][x&255])>>>0;}
 encrypt(l,r){for(let i=0;i<16;i++){l=(l^this.P[i])>>>0;r=(r^this.F(l))>>>0;[l,r]=[r,l];}[l,r]=[r,l];r=(r^this.P[16])>>>0;l=(l^this.P[17])>>>0;return [l,r];}
 decrypt(l,r){for(let i=17;i>1;i--){l=(l^this.P[i])>>>0;r=(r^this.F(l))>>>0;[l,r]=[r,l];}[l,r]=[r,l];r=(r^this.P[1])>>>0;l=(l^this.P[0])>>>0;return [l,r];}
 // In place, 8-byte blocks, little-endian words; a tail shorter than 8 bytes is left as is.
 decryptBuffer(buf){for(let i=0;i+8<=buf.length;i+=8){const [l,r]=this.decrypt(buf.readUInt32LE(i),buf.readUInt32LE(i+4));buf.writeUInt32LE(l,i);buf.writeUInt32LE(r,i+4);}return buf;}
}
module.exports={Blowfish,piWords};
