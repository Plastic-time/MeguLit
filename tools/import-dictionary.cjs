// SPDX-License-Identifier: GPL-3.0-or-later
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {openStore}=require('../services/store.cjs');
const root=path.resolve(__dirname,'..');
const source=process.argv[2];
if(!source)throw Error('Pass the existing JMdict data file, not application source');
const bytes=fs.readFileSync(source),entries=JSON.parse(bytes.toString('utf8'));
const db=openStore(root);
try{
  if(db.prepare("SELECT value FROM meta WHERE key='dictionary-sha256'").get())throw Error('Dictionary already imported');
  const add=db.prepare('INSERT INTO dictionary_entries VALUES (?,?,?,?,?)');
  const form=db.prepare('INSERT OR IGNORE INTO dictionary_forms VALUES (?,?)');
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const entry of entries){
      add.run(entry.id,entry.spellings?.[0]||entry.readings?.[0]||'',(entry.readings||[]).join(' · '),(entry.definitions||[]).join('\n'),entry.freq_rank||999999);
      for(const key of [...(entry.spellings||[]),...(entry.readings||[])])form.run(key,entry.id);
    }
    db.prepare('INSERT INTO meta VALUES (?,?)').run('dictionary-sha256',crypto.createHash('sha256').update(bytes).digest('hex'));
    db.exec('COMMIT');console.log(JSON.stringify({dictionaryEntries:entries.length}));
  }catch(error){db.exec('ROLLBACK');throw error;}
}finally{db.close();}
