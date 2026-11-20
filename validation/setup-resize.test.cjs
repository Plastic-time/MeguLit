// SPDX-License-Identifier: GPL-3.0-or-later
// Setup skin window resizing (setup/setup-web.ps1, class SetupWin): the pure maths only, no window is created.
// The C# of SetupWin is cut out of the script, compiled with Add-Type in a throw-away PowerShell and its static helpers are called:
// zoom factor of the page for a client width, min/max clamps (480x307 logical minimum, at most the work area, 1000:640 ratio), WM_SIZING aspect lock.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const repo = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(repo, 'setup', 'setup-web.ps1'), 'utf8');
const cs = src.slice(src.indexOf("-TypeDefinition @'") + "-TypeDefinition @'".length, src.indexOf("\n'@ }"));
let out;
test.before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-')), csf = path.join(dir, 'w.cs'), ps = path.join(dir, 't.ps1');
  fs.writeFileSync(csf, cs);
  fs.writeFileSync(ps, `
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition (Get-Content -Raw -Encoding UTF8 '${csf.replace(/\\/g, '/')}')
$r = [ordered]@{}
$r.zoom = @(@(600,1.0), @(1000,1.0), @(480,1.0), @(1500,1.5), @(900,1.5), @(3000,2.0)) | ForEach-Object { [SetupWin]::ZoomFor($_[0], $_[1]) }
$a = 0; $b = 0; $c = 0; $d = 0
[SetupWin]::SizeLimits(1.0, 1920, 1040, [ref]$a, [ref]$b, [ref]$c, [ref]$d); $r.lim100 = @($a, $b, $c, $d)
[SetupWin]::SizeLimits(1.5, 2560, 1400, [ref]$a, [ref]$b, [ref]$c, [ref]$d); $r.lim150 = @($a, $b, $c, $d)
[SetupWin]::SizeLimits(1.0, 800, 900, [ref]$a, [ref]$b, [ref]$c, [ref]$d); $r.limNarrow = @($a, $b, $c, $d)
function Lock($l, $t, $rr, $bb, $edge, $mn, $mx) { $x = [int]$l; $y = [int]$t; $z = [int]$rr; $w = [int]$bb; [SetupWin]::LockAspect([ref]$x, [ref]$y, [ref]$z, [ref]$w, $edge, $mn, $mx); return @($x, $y, $z, $w) }
$r.right = Lock 100 100 900 500 2 480 1800       # dragged right edge to 800 wide: height follows
$r.left = Lock 50 100 900 500 1 480 1800         # left edge: right side stays
$r.bottom = Lock 100 100 700 600 6 480 1800      # bottom edge: width follows the height
$r.topleft = Lock 0 0 1000 640 4 480 1800        # corner keeps bottom-right
$r.tooSmall = Lock 100 100 300 200 8 480 1800
$r.tooBig = Lock 0 0 3000 2000 8 480 1800
$r | ConvertTo-Json -Compress
`);
  out = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  fs.rmSync(dir, { recursive: true, force: true });
});

test('page zoom = client width / (1000 x DPI scale), so the design box always fits exactly', () => {
  const z = out.zoom; assert.deepEqual(z.map((x) => +x.toFixed(4)), [0.6, 1, 0.48, 1, 0.6, 1.5]);
});

test('size limits: 480x307 logical minimum, at most the work area, ratio kept', () => {
  assert.deepEqual(out.lim100, [480, 307, 1625, 1040]);   // 1040 / 0.64 = 1625 wide fits the 1920 width
  assert.deepEqual(out.lim150, [720, 460, 2187, 1400]);   // height-bound: 1400 / 0.64 = 2187
  assert.deepEqual(out.limNarrow, [480, 307, 800, 512]);   // width-bound
});

test('WM_SIZING keeps 1000:640 and clamps the width to [min, max]', () => {
  const ratioOk = (r) => Math.abs((r[3] - r[1]) - (r[2] - r[0]) * 0.64) <= 1;
  assert.deepEqual(out.right, [100, 100, 900, 612]); assert.ok(ratioOk(out.right));
  assert.deepEqual(out.left, [50, 100, 900, 644]); assert.ok(ratioOk(out.left));
  assert.equal(out.bottom[2] - out.bottom[0], Math.round(500 / 0.64)); assert.ok(ratioOk(out.bottom));
  assert.equal(out.topleft[2], 1000); assert.equal(out.topleft[3], 640); assert.ok(ratioOk(out.topleft));
  assert.equal(out.tooSmall[2] - out.tooSmall[0], 480); assert.ok(ratioOk(out.tooSmall));
  assert.equal(out.tooBig[2] - out.tooBig[0], 1800); assert.ok(ratioOk(out.tooBig));
});

test('the scripts still parse', () => {
  for (const f of ['setup/setup-web.ps1', 'setup/setup-runtime.ps1']) {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${path.join(repo, f).replace(/'/g, "''")}',[ref]$null,[ref]$e);if($e){$e|%{$_.Message};exit 1}`], { encoding: 'utf8' });
    assert.equal(r.trim(), '', f);
  }
});
