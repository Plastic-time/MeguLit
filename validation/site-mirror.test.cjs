// Website download mirror (site/mirror): change detection, latest.json / releases.json shaping, and the site's
// download source order. Pure functions only; the Worker I/O around them is not exercised here.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const load=p=>import(pathToFileURL(path.join(__dirname,'..',p)).href);
const SHA_A='59d34289bca48ceb07687c49b4360880db494c5cd22ad5fd5c6bc942e94e68e3',SHA_B='a'.repeat(64);
const NOTES='> **[⬇ 下载 MeguLit v1.2.8 安装包](https://github.com/ilynthn/MeguLit/releases/download/v1.2.8/MeguLit-v1.2.8-win-x64.zip)**\n\n## MeguLit v1.2.8\n\n<details>\n<summary><b>中文</b></summary>\n\n### 新功能\n- 中文一\n\n</details>\n\n---\n\n<details>\n<summary><b>English</b></summary>\n\n### New\n- English one\n\n</details>\n';
function release(over={}){return {name:'MeguLit v1.2.8',tag_name:'v1.2.8',draft:false,prerelease:false,published_at:'2026-11-10T00:07:35Z',html_url:'https://github.com/ilynthn/MeguLit/releases/tag/v1.2.8',body:NOTES,
 assets:[{name:'MeguLit-v1.2.8-win-x64.zip',size:21023572,digest:'sha256:'+SHA_A.toUpperCase(),browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v1.2.8/MeguLit-v1.2.8-win-x64.zip'}],...over};}

test('picks the installer zip and reads its digest',async()=>{
 const m=await load('site/mirror/src/release.mjs');
 const r=release({assets:[{name:'runtime.zip',digest:'sha256:'+SHA_B},...release().assets]});
 assert.equal(m.pickAsset(r).name,'MeguLit-v1.2.8-win-x64.zip');
 assert.equal(m.assetSha256(m.pickAsset(r)),SHA_A);
 assert.equal(m.pickAsset({...r,draft:true}),null);
 assert.equal(m.pickAsset({name:'MeguLit 运行组件 runtime-v1.0.0',assets:[{name:'runtime-pack.zip'}]}),null);
 assert.equal(m.assetSha256({digest:'md5:abc'}),null);
});

test('version label comes from the release title so hotfix letters survive',async()=>{
 const m=await load('site/mirror/src/release.mjs');
 assert.equal(m.versionLabel(release({name:'MeguLit v1.2.8d'})),'1.2.8d');
 assert.equal(m.versionLabel(release()),'1.2.8');
 assert.equal(m.versionLabel(release({name:'Some title'})),'1.2.8');
});

test('change detection: first run, hotfix digest, renamed asset, metadata-only and unchanged',async()=>{
 const m=await load('site/mirror/src/release.mjs');
 const r=release(),asset=m.pickAsset(r);
 assert.equal(m.syncDecision(null,r).reason,'first');
 const prev=m.shapeLatest(r,asset,SHA_A);
 assert.deepEqual(m.syncDecision(prev,r),{sync:false,reason:'same'});
 // Hotfix: same file name, new digest, title gains a letter.
 const hot=release({name:'MeguLit v1.2.8d',assets:[{...asset,digest:'sha256:'+SHA_B}]});
 const d=m.syncDecision(prev,hot);assert.equal(d.sync,true);assert.equal(d.reason,'digest');assert.equal(d.sha256,SHA_B);assert.equal(d.label,'1.2.8d');
 // New version.
 const next=release({name:'MeguLit v1.2.9',tag_name:'v1.2.9',assets:[{...asset,name:'MeguLit-v1.2.9-win-x64.zip',digest:'sha256:'+SHA_B}]});
 assert.equal(m.syncDecision(prev,next).reason,'asset');
 // Title or notes edited, same bytes: refresh metadata, do not download again.
 const meta=m.syncDecision(prev,release({name:'MeguLit v1.2.8a'}));assert.equal(meta.sync,false);assert.equal(meta.metaOnly,true);
 assert.equal(m.syncDecision(prev,release({body:NOTES+'\n- edited'})).metaOnly,true);
 // A release without a usable digest is never mirrored (nothing to verify against).
 assert.deepEqual(m.syncDecision(prev,release({assets:[{...asset,digest:null}]})),{sync:false,reason:'no-digest'});
 assert.equal(m.syncDecision(prev,release({assets:[]})).reason,'no-asset');
});

test('latest.json shape: content-addressed key, bilingual notes, GitHub fallback url',async()=>{
 const m=await load('site/mirror/src/release.mjs');
 const r=release({name:'MeguLit v1.2.8d'}),l=m.shapeLatest(r,m.pickAsset(r),SHA_A,{syncedAt:'2026-11-10T01:00:00Z'});
 assert.equal(l.label,'1.2.8d');assert.equal(l.version,'1.2.8');assert.equal(l.tag,'v1.2.8');
 assert.equal(l.size,21023572);assert.equal(l.sha256,SHA_A);
 assert.equal(l.key,`files/${SHA_A}/MeguLit-v1.2.8-win-x64.zip`);
 assert.equal(l.url,'https://dl.megulit.com/latest');
 assert.match(l.github,/^https:\/\/github\.com\/ilynthn\/MeguLit\/releases\/download\/v1\.2\.8\//);
 assert.match(l.notes.zh,/^### 新功能\n- 中文一$/);assert.match(l.notes.en,/^### New\n- English one$/);
 assert.doesNotMatch(l.notes.zh,/details|下载 MeguLit/);
 assert.throws(()=>m.objectKey('nothex','MeguLit-v1.2.8-win-x64.zip'));
 assert.throws(()=>m.objectKey(SHA_A,'../evil.zip'));
});

test('notes without language blocks go to both languages; releases.json skips runtime packs and drafts',async()=>{
 const m=await load('site/mirror/src/release.mjs');
 const plain=m.splitNotes('## MeguLit v1.0.1\n\n- fix one');assert.equal(plain.zh,'- fix one');assert.equal(plain.en,'- fix one');
 const list=m.shapeReleases([release({tag_name:'v1.2.7',name:'MeguLit v1.2.7',published_at:'2026-11-09T23:07:20Z'}),release(),{name:'runtime',tag_name:'runtime-v1.0.0',assets:[{name:'pack.zip'}]},release({tag_name:'v9',draft:true})]);
 assert.deepEqual(list.map(x=>x.tag),['v1.2.8','v1.2.7']);assert.equal(list[0].sha256,SHA_A);
});

test('site download order: R2 mirror, gh-proxy mirrors, then GitHub',async()=>{
 const m=await load('site/mirror/src/release.mjs'),site=await load('site/public/assets/js/core.mjs');
 const r=release(),l=m.shapeLatest(r,m.pickAsset(r),SHA_A);
 const s=site.downloadSources(l);
 assert.deepEqual(s.map(x=>x.id),['mirror','proxy','proxy','github']);
 assert.equal(s[0].url,`https://dl.megulit.com/files/${SHA_A}/MeguLit-v1.2.8-win-x64.zip`);
 assert.equal(s[1].url,'https://gh-proxy.com/'+l.github);assert.equal(s[2].url,'https://ghproxy.net/'+l.github);assert.equal(s[3].url,l.github);
 assert.deepEqual(site.downloadSources({}),[]);
});

test('site helpers: language pick and safe Markdown',async()=>{
 const site=await load('site/public/assets/js/core.mjs');
 assert.equal(site.pickLang(null,['ja-JP']),'ja');assert.equal(site.pickLang(null,['en-US']),'en');assert.equal(site.pickLang(null,['fr']),'zh');assert.equal(site.pickLang('en',['ja']),'en');
 const html=site.renderMarkdown('### New\n- **bold** <script>x</script> [ok](https://a.b) [bad](javascript:alert(1))');
 assert.match(html,/<h4>New<\/h4><ul><li><strong>bold<\/strong> &lt;script&gt;/);
 assert.match(html,/<a href="https:\/\/a\.b"/);assert.doesNotMatch(html,/href="javascript/);
});
