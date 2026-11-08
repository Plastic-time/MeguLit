const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assets=require('../services/assets.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE7sAAAAASUVORK5CYII=','base64');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-assets-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('preview and saving use the real image format even when a download has the wrong extension',t=>{
 const root=fixture(t),file=path.join(root,'download.jpg');fs.writeFileSync(file,png);const preview=assets.preview(file);assert.match(preview,/^data:image\/png;base64,/);
 const saved=assets.set(root,'home',file);assert.equal(saved.src,preview);assert.equal(assets.get(root,'home'),preview);assert.equal(path.extname(assets.find(root,'home')),'.png');assert.deepEqual(fs.readFileSync(assets.find(root,'home')),png);
});
test('bad preview/save requests leave the saved background intact',t=>{
 const root=fixture(t),good=path.join(root,'good.png'),bad=path.join(root,'bad.png');fs.writeFileSync(good,png);fs.writeFileSync(bad,'not an image');assets.set(root,'home',good);const before=assets.get(root,'home');
 for(const file of [bad,path.join(root,'missing.png'),root]){assert.throws(()=>assets.preview(file),/INVALID_IMAGE/);assert.throws(()=>assets.set(root,'home',file),/INVALID_IMAGE/);assert.equal(assets.get(root,'home'),before);}
});
test('oversized and unsupported files fail before replacing a saved image',t=>{
 const root=fixture(t),big=path.join(root,'big.png'),other=path.join(root,'one.txt');fs.writeFileSync(big,png);fs.truncateSync(big,40*1024*1024+1);fs.writeFileSync(other,png);assert.throws(()=>assets.preview(big),/INVALID_IMAGE/);assert.throws(()=>assets.set(root,'home',big),/INVALID_IMAGE/);assert.throws(()=>assets.preview(other),/INVALID_IMAGE/);
});
