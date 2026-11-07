// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Each original JMdict definitions[] item is a sense, not a separate synonym.
// Keep its boundary and deduplicate aliases without inventing semantic senses.
function definitionGroups(entry){const seen=new Set(),groups=[];for(const raw of entry.definitions||[]){const terms=String(raw).split(/[；;]/u).map(s=>s.trim()).filter(Boolean),unique=[];for(const term of terms){const key=term.replace(/[\s。．.]+$/u,'');if(!seen.has(key)){seen.add(key);unique.push(term);}}if(unique.length)groups.push({title:unique[0],terms:unique,text:unique.join('；'),source:'JMdict'});}return groups;}
module.exports={definitionGroups};
