const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
test('E407: MeguLit history never paints a line as read; only engine flags do',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../core/gal-native.cjs'),'utf8');
  assert.ok(!/hookSourceRead:read,hookSourceReadOrigin:'tome-history'/.test(s));
  assert.ok(s.includes("hookSourceRead:false,hookSourceReadOrigin:read?'tome-history-ignored':'tome-history'"));
  assert.ok(s.includes("hookSourceReadOrigin:'engine'"));
});
