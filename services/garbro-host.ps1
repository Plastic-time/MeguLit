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
 # Encrypted formats ask which game (scheme) the archive belongs to, in the GUI through the format's own access widget.
 # Here: first accept GARbro's own guess (Formats.dat game map / format default), then build that same widget offscreen
 # and try each scheme its combo box lists, the way a user would pick one, until the archive opens with entries.
 Add-Type -AssemblyName PresentationFramework
 # The per-game key database is loaded by GARbro's GUI at start-up, not by GameRes itself.
 $db=Join-Path $GarbroDir 'GameData\Formats.dat';if(Test-Path -LiteralPath $db){$st=[IO.File]::OpenRead($db);try{$catalog.DeserializeScheme($st)}finally{$st.Dispose()}}
 $script:pick=-1;$script:sender=$null;$script:widget=$null;$script:combo=$null;$script:asked=$false
 $catalog.add_ParametersRequest([GameRes.ParametersRequestEventHandler]{param($s,$e)
  $script:asked=$true;if($null -eq $script:sender){$script:sender=$s}
  if($script:pick -ge 0 -and $script:combo){$script:combo.SelectedIndex=$script:pick;$e.Options=$s.GetOptions($script:widget)}
  $e.InputResult=$true})
 if($Mode -eq 'probe'){Say @{ok=$true;formats=@($catalog.ArcFormats).Count;version=$gameRes.GetName().Version.ToString()};exit 0}
 function Combos($o){if($o -is [Windows.Controls.ComboBox]){$o};if($o -is [Windows.Controls.Panel]){foreach($k in $o.Children){Combos $k}}elseif($o -is [Windows.Controls.ContentControl] -and $o.Content -is [Windows.UIElement]){Combos $o.Content}elseif($o -is [Windows.Controls.Decorator]){Combos $o.Child}}
 function Open{try{$a=[GameRes.ArcFile]::TryOpen($Archive);if($a -and $a.Dir.Count -gt 0){return $a};if($a){$a.Dispose()}}catch{};return $null}
 $arc=Open;$scheme=''
 if($null -eq $arc -and $script:asked -and $script:sender){
  try{$script:widget=$script:sender.GetAccessWidget();$script:combo=@(Combos $script:widget)[0]}catch{}
  if($script:combo){$n=$script:combo.Items.Count
   for($script:pick=0;$script:pick -lt $n;$script:pick++){$arc=Open;if($arc){$scheme=[string]$script:combo.Items[$script:pick];break}}}
 }
 if($null -eq $arc){Say @{error=$(if($script:asked){'NEEDS_SCHEME'}else{'UNSUPPORTED_ARCHIVE'})};exit 2}
 try{
  $tag=$arc.Tag
  if($Mode -eq 'list'){
   $list=@($arc.Dir|Select-Object -First $Limit|ForEach-Object{@{name=$_.Name;size=[long]$_.Size}})
   Say @{format=$tag;scheme=$scheme;count=$arc.Dir.Count;entries=$list};exit 0
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
  Say @{format=$tag;scheme=$scheme;files=@($files);bytes=$total};exit 0
 }finally{$arc.Dispose()}
}catch{Say @{error=[string]$_.Exception.Message};exit 2}
