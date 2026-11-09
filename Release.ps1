# SPDX-License-Identifier: GPL-3.0-or-later
# One-command release: bump the version, build and test, package, merge to main, tag and publish on GitHub.
#
#   .\Release.ps1 -Version 1.1.3 -Notes notes.md          # full release
#   .\Release.ps1 -Version 1.1.3 -Notes notes.md -DryRun  # bump, build, test and package only; nothing is pushed
#   .\Release.ps1 -Version 1.1.6 -Prepare                 # bump, build and test now; then release with -SkipBuild
#   .\Release.ps1 -Version 1.1.6 -Notes notes.md -SkipBuild  # skips the build when nothing changed since
#   .\Release.ps1 -Version 1.1.8 -Notes notes.md -Hotfix -IncludeWorkingChanges  # fix the latest release in place
#   -IncludeWorkingChanges                                 # also commit the uncommitted changes in this release
#
# notes.md: Chinese first, then a line with only ---, then English (the in-app update card shows the reader's half).
# The package keeps the updater contract: MeguLit-vX.Y.Z-win-x64.zip with every entry under MeguLit/ (see
# services/update.cjs). Its file list is the previous release's list plus newly tracked files under core/, services/,
# web/ and setup/; files that are not in the repository (prebuilt helpers) are carried over from the previous zip.
param(
 [Parameter(Mandatory=$true)][string]$Version,
 [string]$Notes,
 [switch]$DryRun,
 [switch]$Prepare,   # bump + build + test only, and remember this tree so a later -SkipBuild can reuse the build
 [switch]$SkipBuild, # reuse the last -Prepare (or release) build when the tree and MeguLit.exe are unchanged since
 [switch]$Hotfix,    # replace the package of the latest release (same version); installs from v1.1.8 on pick it up
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
function Swap($p,$pattern,$replacement){$t=ReadText $p;$n=[regex]::Replace($t,$pattern,$replacement);if($n -eq $t -and -not ($t -match [regex]::Escape($Version))){throw "version not found in $p"};if($n -ne $t){WriteText $p $n}}

# ---------- checks ----------
if($Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Version must look like 1.2.3'}
$Body=''
if(-not $Prepare){
 if(-not $Notes){throw 'Pass -Notes notes.md (or -Prepare to only build)'}
 $NotesPath=(Resolve-Path $Notes).Path
 $Body=[IO.File]::ReadAllText($NotesPath,[Text.Encoding]::UTF8)
 if($Body -notmatch "(?m)^---\s*$"){throw 'Notes need a --- line between the Chinese and English halves'}
}
$Tag="v$Version";$Asset="MeguLit-$Tag-win-x64.zip"
# One click to the package at the top of the release page, however many hotfix sections follow (user, 2026-11-09).
# The in-app update card drops this line (services/update.cjs).
$DownloadLine="> **[⬇ 下载 MeguLit $Tag 安装包 / Download $Asset](https://github.com/ilynthn/MeguLit/releases/download/$Tag/$Asset)**"
# E297 (user, 2026-11-10: every release note, hotfixes too, bilingual and collapsible like DangoMusic's): the notes file
# stays "Chinese --- English"; the page shows each language in its own collapsed <details> block, and a hotfix is
# one collapsed block holding both. A --- line still separates the halves for update cards older than 1.2.4.
$Halves=[regex]::Split($Body.Trim(),"(?m)^---\s*$");$Zh=$Halves[0].Trim();$En=($Halves[1..($Halves.Count-1)] -join "`n").Trim()
function LangBlocks($zh,$en,$openZh){$o=if($openZh){' open'}else{''};return "<details$o>`n<summary><b>中文</b></summary>`n`n$zh`n`n</details>`n`n---`n`n<details>`n<summary><b>English</b></summary>`n`n$en`n`n</details>"}
$Token=$null
if(-not $DryRun -and -not $Prepare){
 # gh first: Windows PowerShell 5.1 pipes CRLF, which newer git credential fill rejects
 try{$Token=(gh auth token 2>$null|Out-String).Trim()}catch{}
 if(-not $Token){$cred="protocol=https`nhost=github.com`n`n" | git credential fill
 $Token=($cred | Where-Object {$_ -like 'password=*'}) -replace '^password=',''}
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
if(-not $DryRun -and -not $Prepare){
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
if($Hotfix){if($Version -ne $prev){throw "-Hotfix replaces the latest release ($prev); pass -Version $prev"}}
elseif([version]$Version -le [version]$prev){throw "Version $Version is not newer than the latest release $prev"}
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
if($readme -ne (ReadText 'README.md')){WriteText 'README.md' $readme}

# ---------- build ----------
Step 'build and test'
# Reuse rule: the last build was for this version and no source file is newer than MeguLit.exe. The bump above only
# writes files whose content changes, and cargo's own rewrite of Cargo.lock happens before the exe is produced.
$stampFile=Join-Path $env:TEMP 'megulit-release-stamp.json';$exePath=Join-Path $Root 'MeguLit.exe'
function NewestSource{
 $files=git ls-files --cached --others --exclude-standard web services core setup desktop/src desktop/Cargo.toml desktop/tauri.conf.json native
 $newest=$null;foreach($f in $files){if($f -match '\.(exe|dll|lib|obj|png|jpg|webp|ico)$'){continue};$p=Join-Path $Root $f;if(-not (Test-Path -LiteralPath $p)){continue};$t=(Get-Item -LiteralPath $p).LastWriteTimeUtc;if(-not $newest -or $t -gt $newest.Time){$newest=@{Time=$t;File=$f}}}
 $newest
}
$reuse=$false
if($SkipBuild -and (Test-Path $stampFile) -and (Test-Path $exePath)){
 $stamp=Get-Content $stampFile -Raw | ConvertFrom-Json;$exeTime=(Get-Item $exePath).LastWriteTimeUtc;$src=NewestSource
 if($stamp.version -eq $Version -and $stamp.exe -eq (Get-FileHash $exePath -Algorithm SHA256).Hash -and $src.Time -le $exeTime){$reuse=$true}
 elseif($src.Time -gt $exeTime){Write-Host "  $($src.File) changed after the last build"}
}
if($reuse){Write-Host "  nothing changed since the last build of $Tag; reusing MeguLit.exe"}
else{
 if($SkipBuild){Write-Host '  building (no reusable build for this version)'}
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'Build.ps1') -Check
 if($LASTEXITCODE -ne 0){throw 'Build or tests failed'}
 @{version=$Version;exe=(Get-FileHash $exePath -Algorithm SHA256).Hash} | ConvertTo-Json | Set-Content $stampFile
}
if($Prepare){Step "prepared $Tag (built and tested; release later with -SkipBuild)";return}

# ---------- package ----------
Step 'package'
$work=Join-Path $env:TEMP "megulit-release-$Version";if(Test-Path $work){Remove-Item $work -Recurse -Force};New-Item -ItemType Directory $work | Out-Null
$prevZip=Join-Path $work ("previous-"+$prevAsset.name) # a hotfix downloads a package of the same name it then writes
Invoke-WebRequest -Uri $prevAsset.browser_download_url -OutFile $prevZip -UseBasicParsing
$old=[IO.Compression.ZipFile]::OpenRead($prevZip)
$names=New-Object 'System.Collections.Generic.SortedSet[string]' ([StringComparer]::Ordinal)
foreach($e in $old.Entries){if($e.FullName -like 'MeguLit/*' -and -not $e.FullName.EndsWith('/')){[void]$names.Add($e.FullName.Substring(8))}}
# --others: files added in this release are not tracked yet when the list is built (-IncludeWorkingChanges)
foreach($f in (git ls-files --cached --others --exclude-standard core services web setup)){if($f -notlike 'web/fonts/*'){[void]$names.Add($f)}}
# Prebuilt native helpers added after the previous package (not tracked: *.dll is ignored); E293 scene capture.
# E301 Ren'Py positions: the DLLs run native/MeguLitRenpy.py, which must ship next to them.
foreach($f in 'native/MeguLitScn32.dll','native/MeguLitScn64.dll','native/MeguLitKrkr32.dll','native/MeguLitKrkr64.dll','native/MeguLitRenpy32.dll','native/MeguLitRenpy64.dll','native/MeguLitRenpy.py'){if(Test-Path -LiteralPath (Join-Path $Root $f)){[void]$names.Add($f)}}
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
$branch=if($Hotfix){"hotfix/$Tag-"+(Get-Date -Format 'MMddHHmm')}else{"release/$Tag"}
G checkout -q -b $branch
G add -A
G -c "user.name=$Author" -c "user.email=$Email" commit -q -m $(if($Hotfix){"$Tag hotfix"}else{"$Tag"})
G push -q origin $branch
$pr=Api POST '/pulls' @{title=$(if($Hotfix){"$Tag hotfix"}else{"$Tag"});head=$branch;base='main';body=$Body}
# GitHub answers 405 "Base branch was modified" while it is still computing a brand-new PR's mergeability; retry.
for($try=1;;$try++){
 try{$merged=Api PUT "/pulls/$($pr.number)/merge" @{merge_method='merge'};break}
 catch{if($try -ge 6){throw};Write-Host "  merge not ready yet, retrying ($try)";Start-Sleep -Seconds 5}
}
if(-not $merged.merged){throw "PR #$($pr.number) did not merge"}
G checkout -q main
G fetch -q origin
G merge -q --ff-only origin/main
Write-Host "PR #$($pr.number) merged at $($merged.sha)"

# ---------- release ----------
Step 'publish release'
if($Hotfix){
 # same version: swap the package, append the notes; the tag stays on the first commit of this version
 $rel=Api GET "/releases/tags/$Tag"
 foreach($old in @($rel.assets | Where-Object {$_.name -eq $Asset})){Api DELETE "/releases/assets/$($old.id)" | Out-Null}
 $old=[string]$rel.body;if($old -notmatch [regex]::Escape($DownloadLine)){$old=$DownloadLine+"`n`n"+$old}
 $stamp=Get-Date -Format 'yyyy-MM-dd HH:mm'
 $section="<details>`n<summary><b>🔧 Hotfix $stamp</b>（点击展开 / click to expand）</summary>`n`n"+(LangBlocks $Zh $En $false)+"`n`n</details>"
 $rel=Api PATCH "/releases/$($rel.id)" @{body=($old+"`n`n---`n`n"+$section)}
}else{
 $rel=Api POST '/releases' @{tag_name=$Tag;target_commitish=$merged.sha;name="MeguLit $Tag";body=($DownloadLine+"`n`n## MeguLit $Tag`n`n"+(LangBlocks $Zh $En $false));make_latest='true'}
}
$upload=($rel.upload_url -replace '\{.*$','')+"?name=$Asset"
$a=Invoke-RestMethod -Method Post -Uri $upload -Headers $Headers -ContentType 'application/zip' -InFile $zipPath
if($a.size -ne $size){throw "Uploaded size $($a.size) differs from $size"}
if($a.digest -and $a.digest -ne "sha256:$hash"){throw "GitHub digest $($a.digest) differs from sha256:$hash"}

Step 'verify download'
$back=Join-Path $work 'check.zip'
# a hotfix replaces a file under the same URL; the download edge can serve the old one for a few seconds
$ok=$false;for($try=0;$try -lt 8 -and -not $ok;$try++){if($try){Start-Sleep -Seconds 5};Invoke-WebRequest -Uri $a.browser_download_url -OutFile $back -UseBasicParsing;$ok=(Get-FileHash $back -Algorithm SHA256).Hash.ToLower() -eq $hash}
if(-not $ok){throw 'Downloaded package hash differs'}
$probe=& node -e "require('./services/update.cjs').check('$prev').then(r=>console.log(r.latest+' '+r.newer)).catch(e=>console.log('ERR '+e.message))"
Write-Host "update check from v${prev}: $probe"
Remove-Item $work -Recurse -Force
Step "released $($rel.html_url)"
