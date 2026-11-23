# SPDX-License-Identifier: GPL-3.0-or-later
# Test driver for validation\setup-download.test.cjs: loads the MeguFetch class and the source ranking
# straight out of setup\setup-runtime.ps1 (no window), runs one download and prints the outcome as JSON.
param([Parameter(Mandatory=$true)][string]$Script, [string]$Urls = '', [string]$Part = '', [long]$Size = 0, [string]$Sha = '',
  [string]$Options = '{}', [long]$CancelAt = 0, [string]$Rank = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Arg($v) { if ($v -like 'b64:*') { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($v.Substring(4))) } else { $v } }
$Options = Arg $Options; $Rank = Arg $Rank
$text = [IO.File]::ReadAllText($Script, [Text.Encoding]::UTF8)
$ast = [Management.Automation.Language.Parser]::ParseInput($text, [ref]$null, [ref]$null)
foreach ($name in 'Mirror-List', 'Mirror-Host', 'Rank-Sources', 'Source-Hints') {
  $fn = $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true) | Select-Object -First 1
  if ($fn) { . ([scriptblock]::Create($fn.Extent.Text)) }
}
if ($Rank) {
  $r = ConvertFrom-Json $Rank
  ConvertTo-Json -Compress -Depth 4 @{ china = @(Rank-Sources $r.urls $true $r.mirrors); world = @(Rank-Sources $r.urls $false $r.mirrors); hints = (Source-Hints $r.mirrors) }
  return
}
$m = [regex]::Match($text, "(?ms)^\`$fetchSource = @'\r?\n(.*?)\r?\n'@")
if (-not $m.Success) { throw 'fetchSource not found' }
Add-Type -TypeDefinition $m.Groups[1].Value
$f = New-Object MeguFetch
$f.Urls = [string[]]($Urls -split '\|'); $f.Part = $Part; $f.Size = $Size; $f.Sha = $Sha
$o = ConvertFrom-Json $Options
foreach ($p in $o.PSObject.Properties) {
  if ($p.Name -eq 'HostLimits' -or $p.Name -eq 'TrustedHosts') { [MeguFetch]::($p.Name) = [string[]]@($p.Value) } else { $f.($p.Name) = $p.Value }
}
$sw = [Diagnostics.Stopwatch]::StartNew()
$f.Start()
$maxSources = 0; $labels = @{}
while (-not $f.Wait(100)) {
  $busy = @($f.Sources | Where-Object { $_.Active -gt 0 }).Count; if ($busy -gt $maxSources) { $maxSources = $busy }
  if ($f.Phase -eq 'download') { $l = $f.SourceLabel(); if ($l) { $labels[$l] = 1 } }
  if ($CancelAt -gt 0 -and $f.Received -ge $CancelAt) { $f.Cancel(); [void]$f.Wait(5000); break }
}
ConvertTo-Json -Compress -Depth 4 @{
  phase = $f.Phase; error = $f.Error; resumed = $f.Resumed; received = $f.Received; probeMs = $f.ProbeElapsedMs; single = $f.Single
  slowKills = $f.SlowKills; stallKills = $f.StallKills; steals = $f.Steals; dups = $f.Dups; dupWins = $f.DupWins; cooldowns = $f.Cooldowns; maxTarget = $f.MaxTarget; ms = $sw.ElapsedMilliseconds; maxSources = $maxSources; labels = @($labels.Keys)
  sources = @($f.Sources | ForEach-Object { @{ host = $_.Host; dead = $_.Dead; why = $_.Why; range = $_.Range; probe = $_.ProbeSpeed; bytes = $_.Bytes; trust = $_.Trust; max = $_.Max } })
  log = $f.LogText()
}
