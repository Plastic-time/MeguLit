# SPDX-License-Identifier: GPL-3.0-or-later
param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
function New-OwnerTestEnvironment([string]$ownerRoot, [string]$stamp) {
  $childEnv = @{}
  foreach ($name in 'SystemRoot','SystemDrive','windir','ComSpec','PATHEXT','OS','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER','NUMBER_OF_PROCESSORS') { $value = [Environment]::GetEnvironmentVariable($name, 'Process'); if ($value) { $childEnv[$name] = $value } }
  $childEnv.PATH = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
  $childEnv.TEMP = Join-Path $ownerRoot 'env\temp'; $childEnv.TMP = $childEnv.TEMP
  $childEnv.LOCALAPPDATA = Join-Path $ownerRoot 'env\local'; $childEnv.APPDATA = Join-Path $ownerRoot 'env\roaming'
  $childEnv.PSModuleAnalysisCachePath = Join-Path $childEnv.LOCALAPPDATA 'ModuleAnalysisCache'
  $childEnv.USERPROFILE = Join-Path $ownerRoot "profile\user\run-$stamp"; $childEnv.HOME = $childEnv.USERPROFILE
  $childEnv.MEGULIT_SETUP_TEST_ROOT = $ownerRoot
  $childEnv.MEGULIT_SETUP_TEST = Join-Path $ownerRoot "log\events-$stamp.jsonl"
  $childEnv.MEGULIT_SETUP_UILOG = Join-Path $ownerRoot "log\ui-$stamp.log"
  $childEnv.MEGULIT_SETUP_TARGET = Join-Path $ownerRoot 'installed\MeguLit'
  $childEnv.MEGULIT_SETUP_STAGING = Join-Path $ownerRoot 'staging\packs'
  $childEnv.MEGULIT_SETUP_WEBVIEW2_DATA = Join-Path $ownerRoot 'profile\webview2'
  $childEnv.WEBVIEW2_USER_DATA_FOLDER = $childEnv.MEGULIT_SETUP_WEBVIEW2_DATA
  $childEnv.MEGULIT_SETUP_WEB = '1'; $childEnv.MEGULIT_SETUP_WEB_HOLD = '1'
  return $childEnv
}
function Assert-OwnerPayloadFiles([string]$SourceRoot, [object[]]$Files) {
  $seen = @{}
  foreach ($file in $Files) {
    $relative = [string]$file.path
    if ($relative -notmatch '^[^\\/:]+(/[^\\/:]+)*$' -or $relative -match '(^|/)(data|userdata|user-data|cache|logs|\.git|\.env)(/|$)|(^|/)(secrets\.dpapi|credentials[^/]*|.*\.(sqlite|db))$') { throw '清单包含非发布文件或用户数据' }
    $fullPath = Join-Path $SourceRoot $relative
    Assert-SetupPath $fullPath 'source'
    if ($seen.ContainsKey($relative)) { throw '清单路径重复' }; $seen[$relative] = $true
    $item = Get-Item -LiteralPath $fullPath
    if ($item.PSIsContainer -or $file.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or $item.Length -ne [long]$file.size -or (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash -ine $file.sha256) { throw ('候选文件核对失败：' + $relative) }
  }
  $actual = @(Get-ChildItem -LiteralPath $SourceRoot -File -Recurse -Force)
  if ($actual.Count -ne $seen.Count) { throw 'source 含有清单外文件' }
  foreach ($file in $actual) { $relative = $file.FullName.Substring($SourceRoot.Length + 1).Replace('\','/'); if (-not $seen.ContainsKey($relative)) { throw 'source 含有清单外文件' } }
  return $seen
}
$ownerRoot = 'H:\MeguLit-Work\night-1423\installer-owner-test'
$source = Join-Path $ownerRoot 'source'
$scopeHelper = Join-Path $source 'setup\setup-test-scope.ps1'
if (-not (Test-Path -LiteralPath $scopeHelper)) { throw '最终候选尚未放入 source，请交给夜间负责人准备' }
$scopeHelperHash = (Get-FileHash -LiteralPath $scopeHelper -Algorithm SHA256).Hash
. $scopeHelper
$script:setupTestScope = @{ root = $ownerRoot; source = $source; installed = (Join-Path $ownerRoot 'installed'); staging = (Join-Path $ownerRoot 'staging'); env = (Join-Path $ownerRoot 'env'); profile = (Join-Path $ownerRoot 'profile'); log = (Join-Path $ownerRoot 'log') }
Write-Host '正在检查隔离目录…'
Assert-SetupPath $ownerRoot 'root' -Tree
$lockPath = Join-Path $ownerRoot 'log\installer-owner.lock'
Assert-SetupPath $lockPath 'log'
[IO.Directory]::CreateDirectory((Split-Path -Parent $lockPath)) | Out-Null
$ownerLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
if ((Get-FileHash -LiteralPath $scopeHelper -Algorithm SHA256).Hash -cne $scopeHelperHash) { throw 'OWNER_SETUP_SCOPE_CHANGED_RETRY' }
# Manifest, source and overlay are checked only while refresh/install/finalize share this same lock.
foreach ($drive in 'C','E','H') { if ((Get-PSDrive -Name $drive).Free -lt 10GB) { throw ('磁盘余量不足 10 GiB：' + $drive) } }
if ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1KB -lt 4GB) { throw '可用内存不足 4 GiB' }
$manifestFile = Join-Path $ownerRoot 'root-payload-manifest.json'
$payload = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($payload.schemaVersion -ne 1 -or ($payload.ready -isnot [bool] -or -not $payload.ready) -or $payload.candidateCommit -notmatch '^[0-9a-f]{40}$' -or -not $payload.packageVersion -or @($payload.files).Count -lt 1) { throw '最终候选清单尚未就绪' }
Write-Host '正在核对安装文件…'
$seen = Assert-OwnerPayloadFiles $source @($payload.files)
foreach ($required in 'MeguLit.exe','setup/setup-runtime.ps1','setup/setup-test-scope.ps1','setup/setup-web.ps1','setup/runtime.json','setup/ui-web/index.html','setup/ui-web/player.js','setup/ui-web/video/light/intro.mp4','setup/webview2/Microsoft.Web.WebView2.Core.dll','tools/installer-owner-test/finalize-runtime.ps1','tools/installer-owner-test/runtime-overlay/manifest.json') { if (-not $seen.ContainsKey($required)) { throw ('候选缺少安装文件：' + $required) } }
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $source 'MeguLit.exe')).FileVersion
if ($version -ne $payload.packageVersion) { throw 'exe 版本与候选清单不符' }
Write-Host '正在核对运行组件和可用空间…'
$runtime = Get-Content -LiteralPath (Join-Path $source 'setup\runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$peakBytes = 0L; foreach ($file in $payload.files) { $peakBytes += [long]$file.size }
foreach ($id in 'base','reading','voice') {
  $pack = $runtime.packs.$id
  if ([long]$pack.size -le 0 -or [long]$pack.unpacked -le 0) { throw '组件空间清单无效' }
  $peakBytes += [long]$pack.size + [long]$pack.unpacked
}
if ((Get-PSDrive -Name H).Free -lt 10GB + [long]($peakBytes * 1.1)) { throw 'H 盘不足以容纳程序副本、组件包和展开文件并保留 10 GiB' }
. (Join-Path $source 'tools\installer-owner-test\finalize-runtime.ps1') -ValidateOnly:$ValidateOnly
$finalizeScope = @{ owner = $ownerRoot; source = $source; target = (Join-Path $ownerRoot 'installed\MeguLit'); staging = (Join-Path $ownerRoot 'staging\runtime-finalize') }
$overlayCheck = Invoke-OwnerRuntimeFinalize $finalizeScope -OwnerLock $ownerLock
if ($ValidateOnly) { Write-Output ('候选文件及运行组件 overlay 已核对，未启动安装：' + $payload.candidateCommit + ' / ' + $version); return }
foreach ($area in 'installed','staging','env','profile','log') { [IO.Directory]::CreateDirectory($script:setupTestScope[$area]) | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$childEnv = New-OwnerTestEnvironment $ownerRoot $stamp
Assert-SetupPath $childEnv.USERPROFILE 'profile'
if (Test-Path -LiteralPath $childEnv.USERPROFILE) { throw 'OWNER_SETUP_PROFILE_ALREADY_EXISTS' }
foreach ($dir in $childEnv.TEMP,$childEnv.LOCALAPPDATA,$childEnv.APPDATA,$childEnv.USERPROFILE,$childEnv.MEGULIT_SETUP_STAGING,$childEnv.MEGULIT_SETUP_WEBVIEW2_DATA) { Assert-SetupPath $dir; [IO.Directory]::CreateDirectory($dir) | Out-Null }
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$start.Arguments = '-NoProfile -STA -WindowStyle Hidden -File "' + (Join-Path $source 'setup\setup-runtime.ps1') + '" -Root "' + $source + '"'
$start.WorkingDirectory = $source; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
$start.EnvironmentVariables.Clear()
foreach ($name in $childEnv.Keys) { $start.EnvironmentVariables[$name] = $childEnv[$name] }
$receipt = @{ candidateCommit = $payload.candidateCommit; packageVersion = $version; source = $source; target = $childEnv.MEGULIT_SETUP_TARGET; events = $childEnv.MEGULIT_SETUP_TEST; uiLog = $childEnv.MEGULIT_SETUP_UILOG; startedAt = (Get-Date -Format o); exitCode = $null }
$receiptPath = Join-Path $ownerRoot "log\launch-$stamp.json"
$receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Host '正在启动安装界面…'
$process = [Diagnostics.Process]::Start($start); $process.WaitForExit(); $receipt.exitCode = $process.ExitCode
if ($process.ExitCode -eq 3) {
  $receipt.installerExitCode = 3
  try {
    if (-not [IO.File]::Exists($childEnv.MEGULIT_SETUP_TEST) -or (Get-Item -LiteralPath $childEnv.MEGULIT_SETUP_TEST).Length -gt 4MB) { throw 'OWNER_RUNTIME_INSTALL_EVENTS' }
    $installedEvents = @(Get-Content -LiteralPath $childEnv.MEGULIT_SETUP_TEST -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.kind -eq 'installed' })
    if ($installedEvents.Count -ne 1 -or (Get-SetupLocalPath $installedEvents[0].root) -ine $childEnv.MEGULIT_SETUP_TARGET) { throw 'OWNER_RUNTIME_INSTALL_TARGET' }
    # Runs only after setup has finished copying and unpacking, never starts the installed app.
    $runtimeResult = Invoke-OwnerRuntimeFinalize $finalizeScope -Apply -OwnerLock $ownerLock
    if ($runtimeResult.ready -isnot [bool] -or -not $runtimeResult.ready) { throw 'OWNER_RUNTIME_FINALIZE_FAILED' }
    $receipt.runtimeFinalized = $true
  } catch { $receipt.exitCode = 1; $receipt.runtimeFinalized = $false; $receipt.runtimeError = 'OWNER_RUNTIME_FINALIZE_FAILED'; Write-Warning '安装器已结束，但运行组件核对未完成，暂时不要启动应用，请把 log 和 staging/runtime-finalize 交给负责人' }
}
$receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output ('安装测试退出码 ' + $receipt.exitCode + '，日志：' + $receiptPath)
exit $receipt.exitCode
} finally { $ownerLock.Dispose() }
