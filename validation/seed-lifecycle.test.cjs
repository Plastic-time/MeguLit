// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {database}=require('./helpers/torch-release.cjs');

test('migration links prior signed scans to the exact report across property order and preserves legacy bytes',async t=>{
  const dir=path.join(__dirname,'../relay/migrations');
  const files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0040').sort();
  const db=database(files.map(n=>fs.readFileSync(path.join(dir,n),'utf8')).join('\n'));
  t.after(()=>db.raw.close());
  const candidate={key:'a'.repeat(64),mode:'hide',settings:{page:{effectFrames:true,presentation:'adv'}},prints:{script:'b'.repeat(64)}};
  const body=JSON.stringify(candidate);
  const insert=db.raw.prepare("INSERT INTO seed_admin_items(id,kind,layer,game_key,body,updated_at) VALUES(?,'report','version',?,?,?)");
  for(const [id,script,presentation] of [['correct',candidate.prints.script,'adv'],['other-script','c'.repeat(64),'adv'],['other-settings',candidate.prints.script,'nvl']])
    insert.run(id,candidate.key,JSON.stringify({settings:{page:{presentation,effectFrames:true}},mode:candidate.mode,script}),new Date().toISOString());
  db.raw.prepare("INSERT INTO ordinary_seed_jobs(id,game_key,revision,candidate,issued_at,state,profile_hash) VALUES('legacy',?,12,?,'old','published','old-hash')").run(candidate.key,body);
  db.raw.prepare("INSERT INTO enhanced_seed_jobs(id,candidate) VALUES('correct',?)").run(body);
  db.raw.exec(fs.readFileSync(path.join(dir,'0040_seed_lifecycle.sql'),'utf8'));
  const old=db.raw.prepare('SELECT * FROM ordinary_seed_jobs').get();
  assert.equal(old.seed_id,'correct');assert.equal(old.candidate,body);assert.equal(old.profile_hash,'old-hash');assert.equal(old.revision,12);
  const {pendingSeeds,seedStatus}=await import('../relay/src/seed-lifecycle.js');
  assert.equal((await seedStatus(db,'correct')).notificationKey,'correct');
  assert.equal(await pendingSeeds(db),1);
  db.raw.exec("UPDATE ordinary_seed_jobs SET state='quarantined'");
  assert.equal((await seedStatus(db,'correct')).state,'quarantined');assert.equal(await pendingSeeds(db),0);
});
