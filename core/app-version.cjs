'use strict';
/* Shared by the updater and relay so minimum-version decisions use the same ordering */
const base=v=>String(v||'').trim().replace(/^v/,'').replace(/[a-z]+$/i,'');
const parse=v=>{const s=String(v||'').trim().replace(/^v/,''),b=/^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/i.exec(s);if(b)return [+b[1],+b[2],+b[3],-1000+ +b[4]];const m=/^(\d+)\.(\d+)\.(\d+)([a-z]?)$/i.exec(s);if(!m)return base(v).split('.').map(n=>Number(n)||0).concat(0);return [+m[1],+m[2],+m[3],m[4]?m[4].toLowerCase().charCodeAt(0)-96:0];};
const newer=(a,b)=>{const x=parse(a),y=parse(b);for(let i=0;i<4;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};
const valid=v=>/^(?:v)?\d+\.\d+\.\d+(?:[a-z]|-beta\.\d+)?$/i.test(String(v||''));
module.exports={base,newer,valid};
