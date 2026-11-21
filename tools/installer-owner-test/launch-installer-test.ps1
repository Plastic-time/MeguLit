# SPDX-License-Identifier: GPL-3.0-or-later
param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
function New-OwnerTestEnvironment([string]$ownerRoot, [string]$stamp) {
  $childEnv = @{}
  foreach ($name in 'SystemRoot','SystemDrive','windir','ComSpec','PATHEXT','OS','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER','NUMBER_OF_PROCESSORS') { $value = [Environment]::GetEnvironmentVariable($name, 'Process'); if ($value) { $childEnv[$name] = $value } }
  $childEnv.PATH = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
  $childEnv.TEMP = Join-Path $ownerRoot 'env\temp'; $childEnv.TMP = $childEnv.TEMP
  $childEnv.LOCALAPPDATA = Join-Path $ownerRoot 'env\local'; $childEnv.APPDATA = Join-Path $ownerRoot 'env\roaming'
  $childEnv.USERPROFILE = Join-Path $ownerRoot 'profile\user'; $childEnv.HOME = $childEnv.USERPROFILE
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
. $scopeHelper
$script:setupTestScope = @{ root = $ownerRoot; source = $source; installed = (Join-Path $ownerRoot 'installed'); staging = (Join-Path $ownerRoot 'staging'); env = (Join-Path $ownerRoot 'env'); profile = (Join-Path $ownerRoot 'profile'); log = (Join-Path $ownerRoot 'log') }
Assert-SetupPath $ownerRoot 'root' -Tree
foreach ($drive in 'C','E','H') { if ((Get-PSDrive -Name $drive).Free -lt 10GB) { throw ('磁盘余量不足 10 GiB：' + $drive) } }
if ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1KB -lt 4GB) { throw '可用内存不足 4 GiB' }
$manifestFile = Join-Path $ownerRoot 'root-payload-manifest.json'
$payload = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($payload.schemaVersion -ne 1 -or ($payload.ready -isnot [bool] -or -not $payload.ready) -or $payload.candidateCommit -notmatch '^[0-9a-f]{40}$' -or -not $payload.packageVersion -or @($payload.files).Count -lt 1) { throw '最终候选清单尚未就绪' }
$seen = Assert-OwnerPayloadFiles $source @($payload.files)
foreach ($required in 'MeguLit.exe','setup/setup-runtime.ps1','setup/setup-test-scope.ps1','setup/setup-web.ps1','setup/runtime.json','setup/ui-web/index.html','setup/ui-web/player.js','setup/ui-web/video/light/intro.mp4','setup/webview2/Microsoft.Web.WebView2.Core.dll') { if (-not $seen.ContainsKey($required)) { throw ('候选缺少安装文件：' + $required) } }
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $source 'MeguLit.exe')).FileVersion
if ($version -ne $payload.packageVersion) { throw 'exe 版本与候选清单不符' }
$runtime = Get-Content -LiteralPath (Join-Path $source 'setup\runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$peakBytes = 0L; foreach ($file in $payload.files) { $peakBytes += [long]$file.size }
foreach ($id in 'base','reading','voice') {
  $pack = $runtime.packs.$id
  if ([long]$pack.size -le 0 -or [long]$pack.unpacked -le 0) { throw '组件空间清单无效' }
  $peakBytes += [long]$pack.size + [long]$pack.unpacked
}
if ((Get-PSDrive -Name H).Free -lt 10GB + [long]($peakBytes * 1.1)) { throw 'H 盘不足以容纳程序副本、组件包和展开文件并保留 10 GiB' }
if ($ValidateOnly) { Write-Output ('候选文件已核对，未启动安装：' + $payload.candidateCommit + ' / ' + $version); return }
foreach ($area in 'installed','staging','env','profile','log') { [IO.Directory]::CreateDirectory($script:setupTestScope[$area]) | Out-Null }
$lockPath = Join-Path $ownerRoot 'log\installer-owner.lock'
Assert-SetupPath $lockPath 'log'
$ownerLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$childEnv = New-OwnerTestEnvironment $ownerRoot $stamp
foreach ($dir in $childEnv.TEMP,$childEnv.LOCALAPPDATA,$childEnv.APPDATA,$childEnv.USERPROFILE,$childEnv.MEGULIT_SETUP_STAGING,$childEnv.MEGULIT_SETUP_WEBVIEW2_DATA) { Assert-SetupPath $dir; [IO.Directory]::CreateDirectory($dir) | Out-Null }
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$start.Arguments = '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "' + (Join-Path $source 'setup\setup-runtime.ps1') + '" -Root "' + $source + '"'
$start.WorkingDirectory = $source; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
$start.EnvironmentVariables.Clear()
foreach ($name in $childEnv.Keys) { $start.EnvironmentVariables[$name] = $childEnv[$name] }
$receipt = @{ candidateCommit = $payload.candidateCommit; packageVersion = $version; source = $source; target = $childEnv.MEGULIT_SETUP_TARGET; events = $childEnv.MEGULIT_SETUP_TEST; uiLog = $childEnv.MEGULIT_SETUP_UILOG; startedAt = (Get-Date -Format o); exitCode = $null }
$receiptPath = Join-Path $ownerRoot "log\launch-$stamp.json"
$receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
$process = [Diagnostics.Process]::Start($start); $process.WaitForExit(); $receipt.exitCode = $process.ExitCode
$receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output ('安装器退出码 ' + $process.ExitCode + '，日志：' + $receiptPath)
exit $process.ExitCode
} finally { $ownerLock.Dispose() }
