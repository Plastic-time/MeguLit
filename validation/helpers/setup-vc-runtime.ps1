# SPDX-License-Identifier: GPL-3.0-or-later
param([string]$Repo, [string]$Package, [string]$Work)
$ErrorActionPreference = 'Stop'
. (Join-Path $Repo 'tools/package-vc-runtime.ps1')
$min = [version]'14.51.36247.0'
function Assert-Equal($Actual, $Expected) {
  if ($Actual -ne $Expected) { throw "Expected $Expected, got $Actual" }
}
Assert-Equal (Get-VcRuntimeAction $null $min) 'install'
Assert-Equal (Get-VcRuntimeAction ([version]'14.44.35211.0') $min) 'install'
Assert-Equal (Get-VcRuntimeAction $min $min) 'skip'
Assert-Equal (Get-VcRuntimeAction ([version]'14.52.37029.0') $min) 'skip'
Assert-Equal (Get-VcRuntimeOutcome 0 $null $min) 'failed'
Assert-Equal (Get-VcRuntimeOutcome 1223 $min $min) 'cancelled'
Assert-Equal (Get-VcRuntimeOutcome -2147023673 $min $min) 'cancelled'
Assert-Equal (Get-VcRuntimeOutcome 3010 $null $min) 'restart-pending'
Assert-Equal (Get-VcRuntimeOutcome 3010 $min $min) 'restart-required'
Assert-Equal (Get-VcRuntimeOutcome 1638 $min $min) 'ready'
$testLog = 'fixture'
function Start-Process { throw 'SYSTEM_INSTALL_FORBIDDEN_IN_FIXTURE' }
Assert-Equal (Invoke-SetupVcRuntime 'unused' -Required) 'isolated'
if ($Package) {
  $files = New-VcRuntimeReleaseFiles $Work $Package
  $meta = Get-Content -Raw $files['setup/vc-runtime.json'] | ConvertFrom-Json
  Assert-Equal $meta.architecture 'x64'
  Assert-Equal $meta.sha256 (Get-FileHash -Algorithm SHA256 -LiteralPath $Package).Hash.ToLowerInvariant()
  $testLog = $null
  function Write-VcRuntimeLog($message) {}
  function Get-InstalledVcRuntimeVersion { [version]$meta.minimumVersion }
  Assert-Equal (Invoke-SetupVcRuntime $Work -Required) 'skip'
  function Get-InstalledVcRuntimeVersion {}
  # A simulated missing runtime reaches the signed package boundary. Stop before UAC.
  $caught = $false
  try { Invoke-SetupVcRuntime $Work -Required | Out-Null }
  catch { if ($_.Exception.Message -ne 'SYSTEM_INSTALL_FORBIDDEN_IN_FIXTURE') { throw }; $caught = $true }
  Assert-Equal $caught $true
}
Write-Output 'VC runtime fixture passed'
