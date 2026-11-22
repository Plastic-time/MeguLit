# SPDX-License-Identifier: GPL-3.0-or-later
param([string]$Repo, [string]$Work)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
. (Join-Path $Repo 'setup\setup-test-scope.ps1')
$results = New-Object Collections.ArrayList
function Check([string]$CaseLabel, [scriptblock]$Body) { & $Body; [void]$results.Add($CaseLabel) }
function Reject([scriptblock]$Body, [string]$Expected = 'SETUP_TEST_') {
  $caught = $false
  try { & $Body | Out-Null } catch { if ($_.Exception.Message -notlike ('*' + $Expected + '*')) { throw }; $caught = $true }
  if (-not $caught) { throw ('Expected rejection: ' + $Expected) }
}
function Load-Function([string]$File, [string[]]$Names) {
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $Repo $File), [ref]$null, [ref]$null)
  foreach ($name in $Names) {
    $fn = $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true) | Select-Object -First 1
    if (-not $fn) { throw ('Missing function: ' + $name) }
    . ([scriptblock]::Create($fn.Extent.Text.Replace(('function ' + $name), ('function script:' + $name))))
  }
}
$env:MEGULIT_SETUP_TEST_ROOT = $Work
foreach ($name in 'MEGULIT_SETUP_PREVIEW','MEGULIT_SETUP_WEB_TEST','MEGULIT_SETUP_THEME','MEGULIT_SETUP_AUTOSTART','MEGULIT_SETUP_PREFETCH','MEGULIT_SETUP_FREE','MEGULIT_SPLASH_FLAG') { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
$env:MEGULIT_SETUP_TEST = Join-Path $Work 'log\events.jsonl'; $env:MEGULIT_SETUP_UILOG = Join-Path $Work 'log\ui.log'
$env:MEGULIT_SETUP_TARGET = Join-Path $Work 'installed\MeguLit'; $env:MEGULIT_SETUP_STAGING = Join-Path $Work 'staging\packs'
$env:MEGULIT_SETUP_WEBVIEW2_DATA = Join-Path $Work 'profile\webview2'; $env:WEBVIEW2_USER_DATA_FOLDER = $env:MEGULIT_SETUP_WEBVIEW2_DATA
$env:USERPROFILE = Join-Path $Work 'profile\user'; $env:TEMP = Join-Path $Work 'env\temp'; $env:TMP = $env:TEMP
$env:LOCALAPPDATA = Join-Path $Work 'env\local'; $env:APPDATA = Join-Path $Work 'env\roaming'
$sourceRoot = Join-Path $Work 'source'; $runtimeDir = Join-Path $env:MEGULIT_SETUP_TARGET 'runtime'; $Root = $env:MEGULIT_SETUP_TARGET
Check 'explicit scope initializes without writing' { Initialize-SetupTestScope $sourceRoot }
Check 'valid nested target and staging' { Assert-SetupPath $Root 'installed'; Assert-SetupPath $env:MEGULIT_SETUP_STAGING 'staging' }
$bad = @('E:\MeguLit','C:\Users\Megumin','H:\', '\\server\share\MeguLit', '\\?\H:\MeguLit', 'H:relative', 'relative', $Work, ($Work + '-neighbor\installed\MeguLit'), (Join-Path $Work 'installed-neighbor\MeguLit'), (Join-Path $Work 'source'), ($Root + '\..\escape'), ($Root + ':stream'), ($Root + '\name.'), ($Root + '\name '), ($Root + '\NUL.txt'), ($Root + '\a*'))
foreach ($path in $bad) { Check ('reject target ' + $path) { Reject { Assert-SetupPath $path 'installed' } } }
Check 'scope requires explicit log' { $saved = $env:MEGULIT_SETUP_TEST; $env:MEGULIT_SETUP_TEST = ''; try { Reject { Initialize-SetupTestScope $sourceRoot } 'EXPLICIT_LOG' } finally { $env:MEGULIT_SETUP_TEST = $saved } }
Check 'startup rejects external staging' { $saved = $env:MEGULIT_SETUP_STAGING; $env:MEGULIT_SETUP_STAGING = 'E:\MeguLit'; try { Reject { Initialize-SetupTestScope $sourceRoot } 'OUTSIDE_staging' } finally { $env:MEGULIT_SETUP_STAGING = $saved } }
Check 'startup rejects inherited profile' { $saved = $env:USERPROFILE; $env:USERPROFILE = 'C:\Users\Megumin'; try { Reject { Initialize-SetupTestScope $sourceRoot } 'OUTSIDE_profile' } finally { $env:USERPROFILE = $saved } }
Check 'owner scope rejects demo and autostart' { $env:MEGULIT_SETUP_AUTOSTART = 'now'; try { Reject { Initialize-SetupTestScope $sourceRoot } 'INTERACTIVE_ONLY' } finally { $env:MEGULIT_SETUP_AUTOSTART = '' } }
Initialize-SetupTestScope $sourceRoot
Load-Function 'setup\setup-runtime.ps1' @('Use-Target','Confirm-Install','Install-Pack','Remove-Staged','Stop-RuntimeProcesses','Make-Shortcuts','Register-Uninstall','Writable')
Load-Function 'setup\setup-web.ps1' @('Web-Writable','Web-Check','Web-List','Web-Act','Web-Close')
$script:messages = @(); $script:failures = @(); $script:posts = @(); $script:closed = $false
function Say($text) { $script:messages += $text }
function Fail($kind, $text) { $script:failures += $text }
function Web-Log($text) {}
function Web-Post($value) { $script:posts += $value }
function Start-Process { throw 'UNEXPECTED_PROCESS_START' }
function New-Object { throw 'UNEXPECTED_OBJECT_CREATION' }
$pathBox = [pscustomobject]@{ Text = 'E:\MeguLit' }; $script:confirmed = $false
Check 'edited classic target rejected before copy' { if (Use-Target) { throw 'Unexpected acceptance' } }
Check 'confirm rejects edited target before free-space or writes' { Confirm-Install; if ($script:confirmed) { throw 'Unexpected confirmation' } }
Check 'web check rejects external path before write probe' { if ((Web-Check 'E:\MeguLit').state -ne 'readonly') { throw 'Unexpected acceptance' } }
Check 'web write probe cannot fall back to outside ancestor' { if (Web-Writable 'E:\MeguLit') { throw 'Unexpected probe' } }
Check 'editing a path leaves the selected folder uncreated' {
  $parent = Join-Path $Work 'installed'
  [void][IO.Directory]::CreateDirectory($parent)
  $fresh = Join-Path $parent 'unconfirmed\MeguLit'
  if (-not (Web-Writable $fresh) -or (Test-Path (Split-Path $fresh))) { throw 'Path probe changed the target' }
}
Check 'web list rejects external directory' { Reject { Web-List 'C:\Users\Megumin' } }
Check 'web mkdir rejects external directory before create' { Web-Act @{ type = 'mkdir'; via = 'shim'; id = 1; path = 'E:\MeguLit'; name = 'must-not-create' }; if ($script:posts[-1].r.ok) { throw 'Unexpected mkdir' } }
Check 'staged cleanup rejects outside path' { Reject { Remove-Staged 'E:\MeguLit\runtime-base.setup.part' } }
Check 'unpack rejects source role before process' { $Root = $sourceRoot; if (Install-Pack 'base' (Join-Path $Work 'staging\packs\base.zip')) { throw 'Unexpected unpack' }; if ($script:failures[-1] -notmatch 'OUTSIDE_installed') { throw 'Wrong unpack failure' }; $Root = $env:MEGULIT_SETUP_TARGET }
Check 'runtime process stop rejects outside target' { $runtimeDir = 'E:\MeguLit\runtime'; Reject { Stop-RuntimeProcesses }; $runtimeDir = Join-Path $Root 'runtime' }
Check 'integration functions return in test mode' { $testLog = 'explicit'; Make-Shortcuts; Register-Uninstall }
$form = [pscustomobject]@{}; $form | Add-Member ScriptMethod Close { $script:closed = $true }
Check 'cancel closes without install or process launch' { Web-Act @{ type = 'close'; via = 'shim' }; if (-not $script:closed -or $script:confirmed) { throw 'Cancel did not remain unconfirmed' } }
Remove-Item Function:\New-Object
Load-Function 'setup\setup-web.ps1' @('Web-State')
Check 'one unpacked component out of three retains fractional progress' {
  function Got-Bytes { 3 }
  function Total-Bytes { 3 }
  $packs = @{ base = @{ size = 1 }; reading = @{ size = 1 }; voice = @{ size = 1 } }
  $script:dl = @('base','reading','voice')
  $script:dlPos = 3
  $script:busy = $true
  $script:ready = @(@{ id = 'reading' }, @{ id = 'voice' })
  $state = Web-State
  if ($state.pack -ne 'reading' -or [math]::Floor(100 * $state.unpack) -ne 33) { throw 'Incorrect live unpack progress' }
  $script:busy = $false
}
Load-Function 'tools\installer-owner-test\launch-installer-test.ps1' @('New-OwnerTestEnvironment','Assert-OwnerPayloadFiles')
Load-Function 'setup\setup-runtime.ps1' @('Need-Bytes')
Check 'a second session ignores archived profile state and validates its own profile' {
  $first = (New-OwnerTestEnvironment $Work 'first').USERPROFILE
  $second = (New-OwnerTestEnvironment $Work 'second').USERPROFILE
  [void][IO.Directory]::CreateDirectory($first)
  [void][IO.Directory]::CreateDirectory($second)
  $saved = $env:USERPROFILE
  $oldLink = Join-Path $first 'Content.IE5'
  $activeLink = Join-Path $second 'unexpected-link'
  $outsideProfile = Join-Path $Work 'profile\unexpected-link'
  $destination = Join-Path $Work 'link-destination'
  try {
    $env:USERPROFILE = $first; Initialize-SetupTestScope $sourceRoot
    New-Item -ItemType Junction -Path $oldLink -Target $destination | Out-Null
    $env:USERPROFILE = $second; Initialize-SetupTestScope $sourceRoot
    Reject { Assert-SetupPath (Join-Path $oldLink 'child') 'profile' } 'REPARSE'
    New-Item -ItemType Junction -Path $activeLink -Target $destination | Out-Null
    Reject { Initialize-SetupTestScope $sourceRoot } 'REPARSE'
    [IO.Directory]::Delete($activeLink)
    New-Item -ItemType Junction -Path $outsideProfile -Target $destination | Out-Null
    Reject { Initialize-SetupTestScope $sourceRoot } 'REPARSE'
  } finally {
    foreach ($link in $oldLink,$activeLink,$outsideProfile) {
      if ([IO.Directory]::Exists($link)) { [IO.Directory]::Delete($link) }
    }
    $env:USERPROFILE = $saved; Initialize-SetupTestScope $sourceRoot
  }
}
Check 'scoped installation reserves headroom without changing unscoped need' {
  function Missing($dir) { @() }; function Sum($ids, $field) { 0 }; function Drive-Of($path) { 'H:' }; function Stage-Bytes { 0 }
  $appSize = 0; $want = @(); $stageDir = Join-Path $Work 'staging'
  $savedScope = $script:setupTestScope
  if ((Need-Bytes $Root) -lt 10GB) { throw 'Scope has no headroom' }
  try { $script:setupTestScope = $null; if ((Need-Bytes $Root) -ne 0) { throw 'Unscoped calculation changed' } } finally { $script:setupTestScope = $savedScope }
}
Check 'launcher environment does not inherit keys or setup overrides' {
  $env:OPENAI_API_KEY = 'fixture-sentinel'; $env:MEGULIT_SETUP_AUTOSTART = 'now'; $env:GH_TOKEN = 'fixture-sentinel'
  $clean = New-OwnerTestEnvironment $Work 'fixture'
  foreach ($key in 'OPENAI_API_KEY','GH_TOKEN','MEGULIT_SETUP_AUTOSTART','MEGULIT_SETUP_PREVIEW','MEGULIT_SETUP_PREFETCH','MEGULIT_SETUP_FREE') { if ($clean.ContainsKey($key)) { throw 'Environment leaked' } }
  if ($clean.MEGULIT_SETUP_WEB -ne '1' -or $clean.MEGULIT_SETUP_WEB_HOLD -ne '1') { throw 'Web animation not held' }
  foreach ($key in 'TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','HOME','MEGULIT_SETUP_TARGET','MEGULIT_SETUP_STAGING','MEGULIT_SETUP_TEST','MEGULIT_SETUP_UILOG','MEGULIT_SETUP_WEBVIEW2_DATA','WEBVIEW2_USER_DATA_FOLDER') { Assert-SetupPath $clean[$key] }
  $env:MEGULIT_SETUP_AUTOSTART = ''
}
$proofFile = Join-Path $sourceRoot 'proof.txt'; [IO.File]::WriteAllText($proofFile, 'fixture only')
$proof = [pscustomobject]@{ path = 'proof.txt'; size = (Get-Item -LiteralPath $proofFile).Length; sha256 = (Get-FileHash -LiteralPath $proofFile -Algorithm SHA256).Hash }
Check 'payload file contract accepts exact hashes' { $seen = Assert-OwnerPayloadFiles $sourceRoot @($proof); if ($seen.Count -ne 1) { throw 'Wrong manifest count' } }
Check 'payload file contract rejects wrong hash' { $badProof = [pscustomobject]@{ path = $proof.path; size = $proof.size; sha256 = ('0' * 64) }; Reject { Assert-OwnerPayloadFiles $sourceRoot @($badProof) } '候选文件核对失败' }
Check 'payload file contract rejects wrong size' { $badProof = [pscustomobject]@{ path = $proof.path; size = ($proof.size + 1); sha256 = $proof.sha256 }; Reject { Assert-OwnerPayloadFiles $sourceRoot @($badProof) } '候选文件核对失败' }
Check 'payload file contract rejects duplicate paths' { Reject { Assert-OwnerPayloadFiles $sourceRoot @($proof,$proof) } '清单路径重复' }
Check 'payload file contract rejects unlisted files' { Reject { Assert-OwnerPayloadFiles $sourceRoot @() } '清单外文件' }
foreach ($relative in 'data/account.json','secrets.dpapi','credentials.json','settings.db','../escape.txt','C:/escape') { Check ('payload file contract rejects ' + $relative) { $badProof = [pscustomobject]@{ path = $relative; size = 0; sha256 = ('0' * 64) }; Reject { Assert-OwnerPayloadFiles $sourceRoot @($badProof) } '' } }
Remove-Item -LiteralPath $proofFile
New-Item -ItemType Junction -Path (Join-Path $Work 'installed\junction') -Target (Join-Path $Work 'link-destination') | Out-Null
Check 'junction target and descendant rejected' { Reject { Assert-SetupPath (Join-Path $Work 'installed\junction\child') 'installed' } 'REPARSE'; Reject { Assert-SetupPath (Join-Path $Work 'installed') 'installed' -Tree } 'REPARSE' }
Check 'archive normal entries accepted' { Assert-SetupArchive (Join-Path $Work 'staging\good.zip') (Join-Path $Work 'installed\unpack') }
foreach ($name in 'traversal','absolute','symlink','stream','outside','alias') { Check ('archive rejects ' + $name) { Reject { Assert-SetupArchive (Join-Path $Work ('staging\' + $name + '.zip')) (Join-Path $Work 'installed\unpack') } } }
foreach ($file in 'setup\setup-runtime.ps1','setup\setup-web.ps1','setup\setup-test-scope.ps1','tools\installer-owner-test\launch-installer-test.ps1') { Check ('parse ' + $file) { $errors = $null; [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $Repo $file), [ref]$null, [ref]$errors); if ($errors) { throw ($errors.Message -join '; ') } } }
Check 'unscoped guard leaves ordinary install paths unchanged' { $script:setupTestScope = $null; Assert-SetupPath 'E:\MeguLit' 'installed'; Assert-SetupArchive 'unchanged.zip' 'unchanged' }
$results | ConvertTo-Json -Compress
