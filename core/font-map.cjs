'use strict';
// The game's patch font uses legacy character codes. Recover Unicode using
// identical glyph outlines in the locally installed source font, in memory.
const {createHash}=require('node:crypto');
function tables(buffer){
  const result=new Map();
  for(let i=0;i<buffer.readUInt16BE(4);i++){
    const off=12+i*16,tag=buffer.toString('ascii',off,off+4),start=buffer.readUInt32BE(off+8),length=buffer.readUInt32BE(off+12);
    if(start+length>buffer.length)throw Error('Invalid font table');
    result.set(tag,Buffer.from(buffer.subarray(start,start+length)));
  }
  return result;
}
function glyphs(t){
  const count=t.get('maxp').readUInt16BE(4),long=t.get('head').readInt16BE(50)!==0,loca=t.get('loca'),glyf=t.get('glyf');
  const at=i=>long?loca.readUInt32BE(i*4):loca.readUInt16BE(i*2)*2;
  return Array.from({length:count},(_,i)=>glyf.subarray(at(i),at(i+1)));
}
function cmap(t){
  const c=t.get('cmap'),result=new Map();
  for(let i=0;i<c.readUInt16BE(2);i++){
    const platform=c.readUInt16BE(4+i*8),off=c.readUInt32BE(8+i*8),fmt=c.readUInt16BE(off);
    if(![0,3].includes(platform))continue;
    if(fmt===4){
      const count=c.readUInt16BE(off+6)/2,end=off+14,start=end+count*2+2,delta=start+count*2,ro=delta+count*2;
      for(let j=0;j<count;j++)for(let cp=c.readUInt16BE(start+j*2);cp<=Math.min(65534,c.readUInt16BE(end+j*2));cp++){
        const d=c.readInt16BE(delta+j*2),r=c.readUInt16BE(ro+j*2);let g=r?c.readUInt16BE(ro+j*2+r+(cp-c.readUInt16BE(start+j*2))*2):(cp+d)&65535;
        if(r&&g)g=(g+d)&65535;if(g)result.set(cp,g);
      }
    }else if(fmt===12){
      for(let j=0;j<c.readUInt32BE(off+12);j++){
        const p=off+16+j*12,a=c.readUInt32BE(p),z=c.readUInt32BE(p+4),g=c.readUInt32BE(p+8);
        for(let cp=a;cp<=z;cp++)result.set(cp,g+cp-a);
      }
    }
  }
  return result;
}
function checksum(data){let value=0;for(let i=0;i<data.length;i+=4){let word=0;for(let j=0;j<4;j++)word=word*256+(data[i+j]||0);value=(value+word)>>>0;}return value;}
function rebuild(t){
  const tags=[...t.keys()].sort(),count=tags.length,power=2**Math.floor(Math.log2(count));let offset=12+16*count;
  const length=offset+tags.reduce((n,tag)=>n+Math.ceil(t.get(tag).length/4)*4,0),out=Buffer.alloc(length);
  out.writeUInt32BE(0x10000);out.writeUInt16BE(count,4);out.writeUInt16BE(power*16,6);out.writeUInt16BE(Math.log2(power),8);out.writeUInt16BE(count*16-power*16,10);
  let headOffset;
  tags.forEach((tag,i)=>{
    const data=Buffer.from(t.get(tag));if(tag==='head'){data.writeUInt32BE(0,8);headOffset=offset;}
    const p=12+i*16;out.write(tag,p,4,'ascii');out.writeUInt32BE(checksum(data),p+4);out.writeUInt32BE(offset,p+8);out.writeUInt32BE(data.length,p+12);data.copy(out,offset);offset+=Math.ceil(data.length/4)*4;
  });
  out.writeUInt32BE((0xb1b0afba-checksum(out))>>>0,headOffset+8);return out;
}
function repairLegacyFont(game,reference){
  const original=tables(game),ref=tables(reference),a=glyphs(original),b=glyphs(ref),referenceMap=cmap(ref),reverse=new Map();
  for(const [cp,g] of referenceMap){if(!reverse.has(g)||cp<reverse.get(g))reverse.set(g,cp);}
  const hash=v=>createHash('sha256').update(v).digest('hex'),outlines=new Map();
  b.forEach((v,i)=>{if(v.length>12&&reverse.has(i))outlines.set(hash(v),reverse.get(i));});
  const repaired=new Map();
  a.forEach((v,i)=>{if(v.length>12){const cp=outlines.get(hash(v));if(cp!==undefined)repaired.set(cp,i);}});
  if(repaired.size<a.length*.9)throw Error('Unable to verify patch font Unicode mapping');
  // Keep ASCII space; all other codepoints are confirmed against source outlines.
  const old=cmap(original);if(old.has(32))repaired.set(32,old.get(32));
  const pairs=[...repaired].sort((x,y)=>x[0]-y[0]),sub=Buffer.alloc(16+pairs.length*12);
  sub.writeUInt16BE(12);sub.writeUInt32BE(sub.length,4);sub.writeUInt32BE(pairs.length,12);
  pairs.forEach(([cp,g],i)=>{const p=16+i*12;sub.writeUInt32BE(cp,p);sub.writeUInt32BE(cp,p+4);sub.writeUInt32BE(g,p+8);});
  const header=Buffer.alloc(20);header.writeUInt16BE(2,2);header.writeUInt16BE(0,4);header.writeUInt16BE(4,6);header.writeUInt32BE(20,8);header.writeUInt16BE(3,12);header.writeUInt16BE(10,14);header.writeUInt32BE(20,16);
  original.set('cmap',Buffer.concat([header,sub]));original.delete('DSIG');
  return {buffer:rebuild(original),mapped:repaired.size,coverage:repaired};
}
module.exports={repairLegacyFont,tables,cmap,glyphs,checksum};
