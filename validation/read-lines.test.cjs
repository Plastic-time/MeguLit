'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GameStyleSync}=require('../core/game-style-sync.cjs');
// E335: a new line handed over again (voice end, repaint, other text in between) stays unread for this run.
test('a line first seen in this run stays unread when it comes back',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'read-')),s=Object.create(GameStyleSync.prototype);
 s.profileKey='game';s.profileFile=path.join(dir,'profiles.json');
 assert.equal(s.readLine('新しい台詞です。'),false);
 assert.equal(s.readLine('名前'),false);
 assert.equal(s.readLine('新しい\n台詞です。'),false,'same line with another line break, after other text');
 const next=Object.create(GameStyleSync.prototype);next.profileKey='game';next.profileFile=s.profileFile;next.readSets=s.readSets;
 assert.equal(next.readLine('新しい台詞です。'),true,'a later run sees it as read');
 clearTimeout(s.readTimer);fs.rmSync(dir,{recursive:true,force:true});
});
