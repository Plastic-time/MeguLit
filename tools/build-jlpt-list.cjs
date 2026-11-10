// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Builds core/jlpt-words.json from the n5..n1 CSV files of jamsinclair/open-anki-jlpt-decks (MIT; word lists from
   Jonathan Waller's JLPT Resources, CC BY). Usage: node tools/build-jlpt-list.cjs <folder with n5.csv..n1.csv> */
const fs=require('node:fs'),path=require('node:path');
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];
 if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
 if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;}
function build(folder){const seen=new Set(),levels={};
 for(const level of ['N5','N4','N3','N2','N1']){const rows=parseCsv(fs.readFileSync(path.join(folder,level.toLowerCase()+'.csv'),'utf8')).slice(1);levels[level]=[];
  for(const [expression,reading] of rows){const clean=v=>v.replace(/[(（][^)）]*[)）]/g,'').replace(/[～〜~]/g,'').replace(/s+/g,'').trim(),forms=String(expression||'').split(/[;；、,]/).map(clean).filter(f=>f&&/[぀-ヿ㐀-鿿]/.test(f)),r=clean(String(reading||'').split(/[;；、,]/)[0]);if(!forms.length)continue;
   const key=forms[0]+'|'+r;if(seen.has(key))continue;seen.add(key);levels[level].push(forms.join('/')+'|'+r);}}
 return {schema:1,source:'jamsinclair/open-anki-jlpt-decks (MIT) from Jonathan Waller, JLPT Resources, tanos.co.uk (CC BY)',levels};}
if(require.main===module){const out=path.join(__dirname,'..','core','jlpt-words.json');fs.writeFileSync(out,JSON.stringify(build(process.argv[2]))+'\n');console.log(out);}
module.exports={build,parseCsv};
