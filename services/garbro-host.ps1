# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit bridge to GARbro (morkt, MIT): loads GameRes.dll + ArcFormats.dll from the "archives" runtime pack and
# lists or extracts entries of any archive GARbro can open, using GARbro's own format and key database (GameData).
#   -Mode probe   : print {"ok":true,"formats":N}
#   -Mode list    : print {"format":"NPK","entries":[{"name":..,"size":..}]}
#   -Mode extract : write the entries whose names match -Match (regex) under -Out, print {"format":..,"files":[..]}
# Output is one JSON line on stdout; errors are {"error":"..."} with exit code 2.
param([string]$GarbroDir,[string]$Mode='probe',[string]$Archive='',[string]$Out='',[string]$Match='.',[int]$Limit=20000,[long]$MaxBytes=1073741824)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Say($o){[Console]::Out.WriteLine(($o|ConvertTo-Json -Compress -Depth 4))}
try{
 $gameRes=[Reflection.Assembly]::LoadFrom((Join-Path $GarbroDir 'GameRes.dll'))
 $catalog=$gameRes.GetType('GameRes.FormatCatalog')::Instance
 # Encrypted formats ask for a game title; GARbro first guesses it from the folder (Formats.dat game map).
 # With no window to ask in, accept that guess (or the format default) instead of cancelling.
 $catalog.add_ParametersRequest([GameRes.ParametersRequestEventHandler]{param($s,$e) $e.InputResult=$true})
 if($Mode -eq 'probe'){Say @{ok=$true;formats=@($catalog.ArcFormats).Count;version=$gameRes.GetName().Version.ToString()};exit 0}
 $arc=[GameRes.ArcFile]::TryOpen($Archive)
 if($null -eq $arc){Say @{error='UNSUPPORTED_ARCHIVE'};exit 2}
 try{
  $tag=$arc.Tag
  if($Mode -eq 'list'){
   $list=@($arc.Dir|Select-Object -First $Limit|ForEach-Object{@{name=$_.Name;size=[long]$_.Size}})
   Say @{format=$tag;count=$arc.Dir.Count;entries=$list};exit 0
  }
  $re=[regex]::new($Match,'IgnoreCase');$files=New-Object Collections.ArrayList;$total=0L
  $root=[IO.Path]::GetFullPath($Out);[IO.Directory]::CreateDirectory($root)|Out-Null
  foreach($entry in $arc.Dir){
   if($files.Count -ge $Limit -or $total -ge $MaxBytes){break}
   if(-not $re.IsMatch($entry.Name)){continue}
   $rel=($entry.Name -replace '[:*?"<>|]','_') -replace '^(\.?[\\/])+',''
   $target=[IO.Path]::GetFullPath((Join-Path $root $rel))
   if(-not $target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){continue}
   try{
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
    $in=$arc.OpenEntry($entry);$fs=[IO.File]::Create($target)
    try{$in.CopyTo($fs)}finally{$fs.Dispose();$in.Dispose()}
    $total+=(Get-Item -LiteralPath $target).Length;[void]$files.Add($rel)
   }catch{}
  }
  Say @{format=$tag;files=@($files);bytes=$total};exit 0
 }finally{$arc.Dispose()}
}catch{Say @{error=[string]$_.Exception.Message};exit 2}
