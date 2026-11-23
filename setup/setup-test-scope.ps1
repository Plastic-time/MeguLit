# SPDX-License-Identifier: GPL-3.0-or-later
# Opt-in owner test boundary; no Forms, registry, process or network operations.
function Get-SetupLocalPath([string]$Path) {
  if (-not $Path -or $Path -notmatch '^[A-Za-z]:[\\/]' -or $Path -match '[\x00-\x1f"<>|?*]') { throw 'SETUP_TEST_LOCAL_PATH_REQUIRED' }
  $p = $Path.Replace('/', '\').TrimEnd('\')
  if ($p.Length -le 2 -or $p.Substring(2).Contains(':')) { throw 'SETUP_TEST_DRIVE_OR_STREAM_REJECTED' }
  foreach ($segment in $p.Substring(3).Split('\')) {
    if (-not $segment -or $segment -in '.', '..' -or $segment -match '[. ]$' -or $segment -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])($|\.)') { throw 'SETUP_TEST_PATH_ALIAS_REJECTED' }
  }
  [IO.Path]::GetFullPath($p).TrimEnd('\')
}
function Assert-SetupNoLink([string]$Path) {
  $ancestors = [Collections.Generic.Stack[string]]::new()
  for ($p = $Path; $p; $p = [IO.Path]::GetDirectoryName($p)) { $ancestors.Push($p) }
  while ($ancestors.Count) {
    $p = $ancestors.Pop()
    try {
      $attributes = [IO.File]::GetAttributes($p)
      if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'SETUP_TEST_REPARSE_REJECTED' }
    } catch [IO.FileNotFoundException] { } catch [IO.DirectoryNotFoundException] { }
  }
}
function Assert-SetupPath([string]$Path, [string]$Area = 'root', [switch]$Tree) {
  if (-not $script:setupTestScope) { return }
  $p = Get-SetupLocalPath $Path
  $bases = switch ($Area) {
    'payload' { @($script:setupTestScope.source, $script:setupTestScope.installed) }
    'root' { @($script:setupTestScope.root) }
    default {
      if (-not $script:setupTestScope.ContainsKey($Area)) { throw 'SETUP_TEST_UNKNOWN_AREA' }
      @($script:setupTestScope[$Area])
    }
  }
  $inside = $false
  foreach ($base in $bases) { if ($p -ieq $base -or $p.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) { $inside = $true } }
  if (-not $inside) { throw ('SETUP_TEST_OUTSIDE_' + $Area) }
  Assert-SetupNoLink $p
  if ($Tree -and [IO.Directory]::Exists($p)) {
    # Windows can create junctions inside the private USERPROFILE. Existing profiles
    # are opaque here; the launcher gives each run a new profile, checked separately.
    $profileStore = if ($p -ieq $script:setupTestScope.root) { Join-Path $p 'profile\user' }
    $pending = New-Object 'Collections.Generic.Stack[string]'; $pending.Push($p)
    while ($pending.Count) {
      foreach ($entry in [IO.Directory]::GetFileSystemEntries($pending.Pop())) {
        $attributes = [IO.File]::GetAttributes($entry)
        if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('SETUP_TEST_REPARSE_REJECTED: ' + $entry) }
        if ($entry -ieq $profileStore) { continue }
        if ($attributes -band [IO.FileAttributes]::Directory) { $pending.Push($entry) }
      }
    }
  }
}
function Initialize-SetupTestScope([string]$PayloadRoot) {
  if (-not $env:MEGULIT_SETUP_TEST_ROOT -or -not $env:MEGULIT_SETUP_TEST) { throw 'SETUP_TEST_EXPLICIT_LOG_AND_ROOT_REQUIRED' }
  $base = Get-SetupLocalPath $env:MEGULIT_SETUP_TEST_ROOT
  Assert-SetupNoLink $base
  $script:setupTestScope = @{ root = $base }
  foreach ($area in 'source','installed','staging','env','profile','log') { $script:setupTestScope[$area] = Join-Path $base $area }
  Assert-SetupPath $base 'root' -Tree
  Assert-SetupPath $PayloadRoot 'source' -Tree
  $required = @{
    MEGULIT_SETUP_TARGET = 'installed'; MEGULIT_SETUP_STAGING = 'staging'; MEGULIT_SETUP_TEST = 'log'; MEGULIT_SETUP_UILOG = 'log'
    MEGULIT_SETUP_WEBVIEW2_DATA = 'profile'; WEBVIEW2_USER_DATA_FOLDER = 'profile'; TEMP = 'env'; TMP = 'env'
    LOCALAPPDATA = 'env'; APPDATA = 'env'; USERPROFILE = 'profile'
  }
  foreach ($name in $required.Keys) { Assert-SetupPath ([Environment]::GetEnvironmentVariable($name, 'Process')) $required[$name] }
  # Check the current profile before WebView2 starts. Archived profiles remain untouched.
  Assert-SetupPath $env:USERPROFILE 'profile' -Tree
  if ($env:MEGULIT_SPLASH_FLAG) { Assert-SetupPath $env:MEGULIT_SPLASH_FLAG 'env' }
  if ($env:MEGULIT_SETUP_PREVIEW -or $env:MEGULIT_SETUP_WEB_TEST -or $env:MEGULIT_SETUP_THEME -or $env:MEGULIT_SETUP_AUTOSTART -or $env:MEGULIT_SETUP_PREFETCH -or $env:MEGULIT_SETUP_FREE) { throw 'SETUP_TEST_OWNER_INTERACTIVE_ONLY' }
}
function Assert-SetupArchive([string]$Part, [string]$Unpack) {
  if (-not $script:setupTestScope) { return }
  Assert-SetupPath $Part 'staging'; Assert-SetupPath $Unpack 'installed' -Tree
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($Part)
  try {
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\', '/').TrimEnd('/')
      if (-not $name -or ($name -ne 'runtime' -and -not $name.StartsWith('runtime/', [StringComparison]::Ordinal))) { throw 'SETUP_TEST_ARCHIVE_ROOT_REJECTED' }
      $attributes = [uint32]([int64]$entry.ExternalAttributes -band 0xffffffffL)
      $kind = ($attributes -shr 16) -band 0xf000
      if (($attributes -band 0x400) -or ($kind -ne 0 -and $kind -ne 0x8000 -and $kind -ne 0x4000)) { throw 'SETUP_TEST_ARCHIVE_LINK_REJECTED' }
      Assert-SetupPath (Join-Path $Unpack $name) 'installed'
    }
  } finally { $zip.Dispose() }
}
