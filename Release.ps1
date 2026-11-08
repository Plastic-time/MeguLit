# SPDX-License-Identifier: GPL-3.0-or-later
# One-command release: bump the version, build and test, package, merge to main, tag and publish on GitHub.
#
#   .\Release.ps1 -Version 1.1.3 -Notes notes.md          # full release
#   .\Release.ps1 -Version 1.1.3 -Notes notes.md -DryRun  # bump, build, test and package only; nothing is pushed
#   -IncludeWorkingChanges                                 # also commit the uncommitted changes in this release
#
# notes.md: Chinese first, then a line with only ---, then English (the in-app update card shows the reader's half).
# The package keeps the updater contract: MeguLit-vX.Y.Z-win-x64.zip with every entry under MeguLit/ (see
# services/update.cjs). Its file list is the previous release's list plus newly tracked files under core/, services/,
# web/ and setup/; files that are not in the repository (prebuilt helpers) are carried over from the previous zip.
param(
 [Parameter(Mandatory=$true)][string]$Version,
 [Parameter(Mandatory=$true)][string]$Notes,
 [switch]$DryRun,
 [switch]$IncludeWorkingChanges  # ship uncommitted changes in the release commit instead of refusing
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$Repo='ilynthn/MeguLit'
$Author=-join [char[]](0x9B5A,0x9B5A,0x68DF)
$Email='ilymegumin1204@gmail.com'
$Root=$PSScriptRoot
Set-Location $Root
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
function Step($m){Write-Host "== $m" -ForegroundColor Yellow}
function G{ & git.exe @args; if($LASTEXITCODE -ne 0){throw "git $($args -join ' ') failed"} }
function Utf8NoBom{New-Object System.Text.UTF8Encoding($false)}
function ReadText($p){[IO.File]::ReadAllText((Join-Path $Root $p),[Text.Encoding]::UTF8)}
function WriteText($p,$t){[IO.File]::WriteAllText((Join-Path $Root $p),$t,(Utf8NoBom))}
function Swap($p,$pattern,$replacement){$t=ReadText $p;$n=[regex]::Replace($t,$pattern,$replacement);if($n -eq $t -and -not ($t -match [regex]::Escape($Version))){throw "version not found in $p"};WriteText $p $n}

# ---------- checks ----------
if($Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Version must look like 1.2.3'}
$NotesPath=(Resolve-Path $Notes).Path
$Body=[IO.File]::ReadAllText($NotesPath,[Text.Encoding]::UTF8)
if($Body -notmatch "(?m)^---\s*$"){throw 'Notes need a --- line between the Chinese and English halves'}
$Tag="v$Version";$Asset="MeguLit-$Tag-win-x64.zip"
$Token=$null
if(-not $DryRun){
 $cred="protocol=https`nhost=github.com`n`n" | git credential fill
 $Token=($cred | Where-Object {$_ -like 'password=*'}) -replace '^password=',''
 if(-not $Token){throw 'No GitHub token from git credential fill'}
}
$Headers=@{'User-Agent'='megulit-release';'Accept'='application/vnd.github+json'}
if($Token){$Headers.Authorization="Bearer $Token"}
function Api($method,$path,$body=$null){
 $p=@{Method=$method;Uri="https://api.github.com/repos/$Repo$path";Headers=$Headers}
 if($body){$p.Body=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Depth 5));$p.ContentType='application/json; charset=utf-8'}
 Invoke-RestMethod @p
}

Step 'sync main'
if(-not $DryRun){
 $dirty=git status --porcelain --untracked-files=no
 if($dirty -and -not $IncludeWorkingChanges){throw "Working tree has uncommitted changes (add -IncludeWorkingChanges to ship them):`n$dirty"}
 G checkout -q main
 G fetch -q origin
 G merge -q --ff-only origin/main
}
$latest=Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $Headers
$prev=$latest.tag_name -replace '^v',''
$prevAsset=$latest.assets | Where-Object {$_.name -match '^MeguLit-v\d+\.\d+\.\d+-win-x64\.zip$'} | Select-Object -First 1
if(-not $prevAsset){throw 'Previous release has no package to take the file list from'}
if([version]$Version -le [version]$prev){throw "Version $Version is not newer than the latest release $prev"}
Write-Host "previous release v$prev -> $Tag"

# ---------- version ----------
Step 'bump version'
Swap 'web/about.js' "export const VERSION='\d+\.\d+\.\d+';" "export const VERSION='$Version';"
Swap 'desktop/Cargo.toml' '(?m)^version = "\d+\.\d+\.\d+"' "version = `"$Version`""
Swap 'desktop/tauri.conf.json' '"version": "\d+\.\d+\.\d+"' "`"version`": `"$Version`""
Swap 'desktop/Cargo.lock' '(name = "megulit"\r?\nversion = )"\d+\.\d+\.\d+"' "`${1}`"$Version`""
$readme=ReadText 'README.md'
$readme=[regex]::Replace($readme,'MeguLit-v\d+\.\d+\.\d+-win-x64\.zip',$Asset)
$readme=[regex]::Replace($readme,'\u4e0b\u8f7d v\d+\.\d+\.\d+',"$([char]0x4e0b)$([char]0x8f7d) $Tag")
WriteText 'README.md' $readme

# ---------- build ----------
Step 'build and test'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'Build.ps1') -Check
if($LASTEXITCODE -ne 0){throw 'Build or tests failed'}

# ---------- package ----------
Step 'package'
$work=Join-Path $env:TEMP "megulit-release-$Version";if(Test-Path $work){Remove-Item $work -Recurse -Force};New-Item -ItemType Directory $work | Out-Null
$prevZip=Join-Path $work $prevAsset.name
Invoke-WebRequest -Uri $prevAsset.browser_download_url -OutFile $prevZip -UseBasicParsing
$old=[IO.Compression.ZipFile]::OpenRead($prevZip)
$names=New-Object 'System.Collections.Generic.SortedSet[string]' ([StringComparer]::Ordinal)
foreach($e in $old.Entries){if($e.FullName -like 'MeguLit/*' -and -not $e.FullName.EndsWith('/')){[void]$names.Add($e.FullName.Substring(8))}}
foreach($f in (git ls-files core services web setup)){if($f -notlike 'web/fonts/*'){[void]$names.Add($f)}}
$zipPath=Join-Path $work $Asset
$out=[IO.Compression.ZipFile]::Open($zipPath,'Create')
try{
 foreach($n in $names){
  $local=Join-Path $Root ($n -replace '/','\')
  if(Test-Path -LiteralPath $local -PathType Leaf){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($out,$local,"MeguLit/$n",[IO.Compression.CompressionLevel]::Optimal)}
  else{
   $src=$old.GetEntry("MeguLit/$n");if(-not $src){throw "No source for $n"}
   $dst=$out.CreateEntry("MeguLit/$n",[IO.Compression.CompressionLevel]::Optimal);$dst.LastWriteTime=$src.LastWriteTime
   $i=$src.Open();$o=$dst.Open();try{$i.CopyTo($o)}finally{$o.Dispose();$i.Dispose()}
   Write-Host "  carried over $n"
  }
 }
}finally{$out.Dispose();$old.Dispose()}
$check=[IO.Compression.ZipFile]::OpenRead($zipPath)
try{if(-not $check.GetEntry('MeguLit/MeguLit.exe')){throw 'Package has no MeguLit.exe'};if($check.Entries | Where-Object {$_.FullName -like 'MeguLit/data/*'}){throw 'Package contains data/'};$count=$check.Entries.Count}finally{$check.Dispose()}
$hash=(Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower();$size=(Get-Item $zipPath).Length
Write-Host "$Asset  $count files  $size bytes  sha256 $hash"
if($DryRun){& git.exe checkout -- web/about.js desktop/Cargo.toml desktop/tauri.conf.json desktop/Cargo.lock README.md;Step "dry run finished; package at $zipPath (version files restored)";return}

# ---------- merge ----------
Step 'commit, pull request, merge'
$branch="release/$Tag"
G checkout -q -b $branch
G add -A
G -c "user.name=$Author" -c "user.email=$Email" commit -q -m "$Tag"
G push -q origin $branch
$pr=Api POST '/pulls' @{title="$Tag";head=$branch;base='main';body=$Body}
$merged=Api PUT "/pulls/$($pr.number)/merge" @{merge_method='merge'}
if(-not $merged.merged){throw "PR #$($pr.number) did not merge"}
G checkout -q main
G fetch -q origin
G merge -q --ff-only origin/main
Write-Host "PR #$($pr.number) merged at $($merged.sha)"

# ---------- release ----------
Step 'publish release'
$rel=Api POST '/releases' @{tag_name=$Tag;target_commitish=$merged.sha;name="MeguLit $Tag";body=$Body;make_latest='true'}
$upload=($rel.upload_url -replace '\{.*$','')+"?name=$Asset"
$a=Invoke-RestMethod -Method Post -Uri $upload -Headers $Headers -ContentType 'application/zip' -InFile $zipPath
if($a.size -ne $size){throw "Uploaded size $($a.size) differs from $size"}
if($a.digest -and $a.digest -ne "sha256:$hash"){throw "GitHub digest $($a.digest) differs from sha256:$hash"}

Step 'verify download'
$back=Join-Path $work 'check.zip'
Invoke-WebRequest -Uri $a.browser_download_url -OutFile $back -UseBasicParsing
if((Get-FileHash $back -Algorithm SHA256).Hash.ToLower() -ne $hash){throw 'Downloaded package hash differs'}
$probe=& node -e "require('./services/update.cjs').check('$prev').then(r=>console.log(r.latest+' '+r.newer)).catch(e=>console.log('ERR '+e.message))"
Write-Host "update check from v${prev}: $probe"
Remove-Item $work -Recurse -Force
Step "released $($rel.html_url)"
