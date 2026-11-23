/* SPDX-License-Identifier: GPL-3.0-or-later */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
test('scoped installer rejects path escapes at real logic boundaries without GUI', { skip: process.platform !== 'win32', timeout: 30000 }, () => {
  const base = process.env.MEGULIT_TEST_TMP || (fs.existsSync('H:/MeguLit-Work') ? 'H:/MeguLit-Work/night-1423/installer-owner-test' : os.tmpdir());
  fs.mkdirSync(base, { recursive:true });
  const work = fs.mkdtempSync(path.join(base, 'fixture-'));
  const junction = path.join(work, 'installed/junction');
  try {
    for (const dir of ['source','installed','staging','env','profile','log','link-destination']) fs.mkdirSync(path.join(work, dir));
    const zipScript = `import zipfile,sys\nfrom pathlib import Path\np=Path(sys.argv[1])/'staging'\nfor case,name in {'good':'runtime/node.exe','traversal':'runtime/../../escape','absolute':'H:/escape','symlink':'runtime/link','stream':'runtime/a:stream','outside':'other/a','alias':'runtime/name.'}.items():\n with zipfile.ZipFile(p/(case+'.zip'),'w') as z:\n  info=zipfile.ZipInfo(name)\n  if case=='symlink': info.create_system=3;info.external_attr=(0o120777<<16)\n  z.writestr(info,'fixture only')\n`;
    const py = spawnSync('python', ['-c', zipScript, work], { encoding: 'utf8', windowsHide: true });
    assert.equal(py.status, 0, py.stderr);
    const result = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repo,'validation/helpers/setup-scope/driver.ps1'),'-Repo',repo,'-Work',work], { encoding: 'utf8', windowsHide: true, timeout: 25000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const cases = JSON.parse(result.stdout.trim());
    assert.ok(cases.length >= 40, JSON.stringify(cases));
    assert.deepEqual(fs.readdirSync(path.join(work,'link-destination')), []);
    assert.deepEqual(fs.readdirSync(path.join(work,'source')), []);
    fs.unlinkSync(junction);
    const startup = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-STA','-File',path.join(repo,'setup/setup-runtime.ps1'),'-Root',path.join(work,'source')], { env: { ...process.env, MEGULIT_SETUP_TEST_ROOT:work, MEGULIT_SETUP_TEST:path.join(work,'log/never-created.jsonl'), MEGULIT_SETUP_TARGET:'E:\\MeguLit', MEGULIT_SETUP_STAGING:path.join(work,'staging') }, encoding:'utf8', windowsHide:true, timeout:10000 });
    assert.equal(startup.status, 1, startup.stdout + startup.stderr);
    assert.match(startup.stderr, /SETUP_TEST_OUTSIDE_|SETUP_TEST_LOCAL_PATH_REQUIRED/);
    assert.equal(fs.existsSync(path.join(work,'log/never-created.jsonl')), false, 'startup rejected before logging or GUI initialization');
    console.log(`${cases.length} boundary cases passed, no GUI/download/copy/unpack executed`);
  } finally {
    if (fs.existsSync(junction)) fs.unlinkSync(junction);
    assert.ok(path.resolve(work).startsWith(path.resolve(base) + path.sep));
    fs.rmSync(work, { recursive: true, force: true });
  }
});
