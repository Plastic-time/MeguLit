param([string]$Repo, [string]$Work)
$ErrorActionPreference = 'Stop'
. (Join-Path $Repo 'tools\installer-owner-test\finalize-runtime.ps1')
$script:proofs = @()
function Check([string]$Name, [bool]$Value) { if (-not $Value) { throw ('CHECK_FAILED:' + $Name) }; $script:proofs += $Name }
function Reject([string]$Name, [scriptblock]$Run, [string]$Code) { $errorText = ''; try { & $Run | Out-Null } catch { $errorText = [string]$_.Exception.Message }; Check $Name ($errorText -like ('*' + $Code + '*')) }
function New-Fixture([string]$Name) {
  $owner = Join-Path $Work $Name; $scope = @{ owner = $owner; source = (Join-Path $owner 'source'); target = (Join-Path $owner 'installed\MeguLit'); staging = (Join-Path $owner 'staging\runtime-finalize') }
  $overlay = Join-Path $scope.source 'tools\installer-owner-test\runtime-overlay'; $dir = Join-Path $overlay 'files'; $hook = Join-Path $scope.target 'runtime\megulithook'
  [IO.Directory]::CreateDirectory($dir) | Out-Null; [IO.Directory]::CreateDirectory($hook) | Out-Null
  [IO.File]::WriteAllText((Join-Path $scope.target 'MeguLit.exe'), 'not executable, neutral fixture')
  [IO.File]::WriteAllText((Join-Path $scope.target 'runtime\node.exe'), 'not executable, neutral fixture')
  $rows = @(); foreach ($n in 'LunaTmpFontLoader.dll','MeguLitHook32.dll','MeguLitHook64.dll','MeguLitHost64.dll') { $p = Join-Path $dir $n; [IO.File]::WriteAllText($p, ('new neutral ' + $n)); $rows += @{ name = $n; size = (Get-Item $p).Length; sha256 = (Get-OwnerFinalizeHash $p) }; [IO.File]::WriteAllText((Join-Path $hook $n), ('old neutral ' + $n)) }
  $p = Join-Path $dir 'components.json'; [IO.File]::WriteAllText($p, (@{ files = $rows } | ConvertTo-Json -Depth 5)); $rows += @{ name = 'components.json'; size = (Get-Item $p).Length; sha256 = (Get-OwnerFinalizeHash $p) }; [IO.File]::WriteAllText((Join-Path $hook 'components.json'), 'old neutral metadata')
  $manifest = Join-Path $overlay 'manifest.json'; [IO.File]::WriteAllText($manifest, (@{ schemaVersion = 1; candidateCommit = ('b' * 40); files = $rows } | ConvertTo-Json -Depth 5))
  $pins = @(@{ path = 'tools/installer-owner-test/runtime-overlay/manifest.json'; size = (Get-Item $manifest).Length; sha256 = (Get-OwnerFinalizeHash $manifest) })
  foreach ($r in $rows) { $pins += @{ path = ('tools/installer-owner-test/runtime-overlay/files/' + $r.name); size = $r.size; sha256 = $r.sha256 } }
  [IO.File]::WriteAllText((Join-Path $owner 'root-payload-manifest.json'), (@{ schemaVersion = 1; ready = $true; candidateCommit = ('b' * 40); files = $pins } | ConvertTo-Json -Depth 6))
  return $scope
}
function Target-Hashes($s) { return @('LunaTmpFontLoader.dll','MeguLitHook32.dll','MeguLitHook64.dll','MeguLitHost64.dll','components.json') | ForEach-Object { Get-OwnerFinalizeHash (Join-Path $s.target ('runtime\megulithook\' + $_)) } }
function Invoke-FixtureFinalize($Scope, [switch]$Apply, [scriptblock]$ProcessInventory = { Get-CimInstance Win32_Process }) {
  $file = Assert-OwnerFinalizePath $Scope (Join-Path $Scope.owner 'log\installer-owner.lock') 'owner'
  [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
  $held = [IO.File]::Open($file, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try { return Invoke-OwnerRuntimeFinalize $Scope -Apply:$Apply -OwnerLock $held -ProcessInventory $ProcessInventory } finally { $held.Dispose() }
}

$s = New-Fixture 'dry-run'; $before = (Target-Hashes $s) -join ','
Reject 'apply cannot bypass the shared installer lock with no handle' { Invoke-OwnerRuntimeFinalize $s -Apply -ProcessInventory { @() } } 'OWNER_RUNTIME_INSTALLER_LOCK_REQUIRED'
$r = Invoke-FixtureFinalize $s
Check 'default readonly reports stale target as not ready' (-not $r.ready -and -not $r.written -and $r.state -eq 'validated-only')
Check 'default readonly preserves all target bytes' (((Target-Hashes $s) -join ',') -ceq $before)
Check 'default readonly creates no staging' (-not [IO.Directory]::Exists($s.staging))
$r = Invoke-FixtureFinalize $s -Apply -ProcessInventory { @() }; $journal = Get-Content -Raw -LiteralPath $r.journal | ConvertFrom-Json
Check 'real helper publishes five neutral files' ($r.ready -and $r.written -and $journal.files.Count -eq 5)
Check 'all original files were backed up' (@($journal.files | Where-Object { (Get-OwnerFinalizeHash $_.backup) -ceq $_.before }).Count -eq 5)
Check 'all new files pass readback' (@($journal.files | Where-Object { (Get-OwnerFinalizeHash $_.target) -ceq $_.after }).Count -eq 5)
Check 'verified journal closes only after publication' ($journal.state -eq 'verified' -and $journal.closed -and $journal.ready)
Check 'no app is started by the tool result' (-not $r.appStarted -and -not $journal.appStarted)
Check 'subsequent default check is ready and does not write' ((Invoke-FixtureFinalize $s).ready)
$s = New-Fixture 'source-changed'; $before = (Target-Hashes $s) -join ','; [IO.File]::AppendAllText((Join-Path $s.source 'tools\installer-owner-test\runtime-overlay\files\MeguLitHook32.dll'), 'changed')
Reject 'source mutation is rejected before backup or writes' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @() } } 'OWNER_RUNTIME_OVERLAY_SOURCE_CHANGED'
Check 'source rejection keeps target bytes' (((Target-Hashes $s) -join ',') -ceq $before)
Check 'source rejection does not create staging' (-not [IO.Directory]::Exists($s.staging))
$s = New-Fixture 'running'; Reject 'owned running target is rejected' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @(@{ Name = 'node.exe'; ExecutablePath = (Join-Path $s.target 'runtime\node.exe') }) } } 'OWNER_RUNTIME_TARGET_RUNNING'
Reject 'unknown relevant process identity is rejected' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @(@{ Name = 'MeguLit.exe'; ExecutablePath = $null }) } } 'OWNER_RUNTIME_PROCESS_UNKNOWN'
$s = New-Fixture 'target-link'; $hook = Join-Path $s.target 'runtime\megulithook'; $real = Join-Path $s.owner 'retained-real-target'; [IO.Directory]::Move($hook, $real); New-Item -ItemType Junction -Path $hook -Value $real | Out-Null
$linkBefore = Get-OwnerFinalizeHash (Join-Path $real 'MeguLitHook32.dll')
Reject 'actual NTFS target junction is rejected before writes' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @() } } 'REPARSE'
Check 'rejected junction destination remains unchanged' ((Get-OwnerFinalizeHash (Join-Path $real 'MeguLitHook32.dll')) -ceq $linkBefore)
Check 'rejected junction creates no staging' (-not [IO.Directory]::Exists($s.staging))
$s = New-Fixture 'partial-failure'; $before = (Target-Hashes $s) -join ','; $script:copies = 0
function Copy-OwnerFinalizeBytes([string]$Source, [string]$Destination) { $script:copies++; if ($script:copies -eq 2) { throw 'CONTROLLED_SECOND_COPY_FAILURE' }; [IO.File]::Copy($Source, $Destination, $false) }
Reject 'mid-publication I/O failure reports not ready' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @() } } 'OWNER_RUNTIME_FINALIZE_FAILED'
Check 'mid-publication restores every original target byte' (((Target-Hashes $s) -join ',') -ceq $before)
$j = @(Get-OwnerFinalizeTreeFiles $s.staging | Where-Object { [IO.Path]::GetFileName($_) -eq 'journal.json' })[0]; $journal = Get-Content -Raw $j | ConvertFrom-Json
Check 'failed but restored journal does not claim ready' ($journal.state -eq 'failed' -and -not $journal.ready -and $journal.closed -and $journal.rollbackRestored)
Check 'failure retains all original backups' (@($journal.files | Where-Object { (Get-OwnerFinalizeHash $_.backup) -ceq $_.before }).Count -eq 5)
$s = New-Fixture 'unknown-concurrent-change'; $script:copies = 0
$script:changedTarget = Join-Path $s.target 'runtime\megulithook\LunaTmpFontLoader.dll'
function Copy-OwnerFinalizeBytes([string]$Source, [string]$Destination) { $script:copies++; if ($script:copies -eq 2) { [IO.File]::WriteAllText($script:changedTarget, 'unknown user edit'); throw 'CONTROLLED_CONCURRENT_CHANGE' }; [IO.File]::Copy($Source, $Destination, $false) }
Reject 'unknown concurrent change fails publication' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @() } } 'OWNER_RUNTIME_FINALIZE_FAILED'
Check 'unknown target bytes are preserved rather than overwritten' ([IO.File]::ReadAllText($script:changedTarget) -ceq 'unknown user edit')
$j = @(Get-OwnerFinalizeTreeFiles $s.staging | Where-Object { [IO.Path]::GetFileName($_) -eq 'journal.json' })[0]; $journal = Get-Content -Raw $j | ConvertFrom-Json
Check 'incomplete rollback leaves recoverable unready journal' (-not $journal.closed -and -not $journal.ready -and -not $journal.rollbackRestored)
Reject 'pending transaction blocks another automatic apply' { Invoke-FixtureFinalize $s -Apply -ProcessInventory { @() } } 'OWNER_RUNTIME_FINALIZE_PENDING'
@{ checks = $script:proofs.Count; proofs = $script:proofs; realPayloadTouched = $false; appStarted = $false } | ConvertTo-Json -Depth 4 -Compress
