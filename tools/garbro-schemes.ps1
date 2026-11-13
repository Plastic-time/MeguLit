# SPDX-License-Identifier: GPL-3.0-or-later
# E578 export per-title archive keys from GARbro's key database (GameData\Formats.dat, morkt, MIT) to JSON, the way
# cx-schemes.json and paz-schemes.json were made. Run against the "archives" runtime pack (runtime\garbro):
#   powershell -NoProfile -File tools\garbro-schemes.ps1 -GarbroDir runtime\garbro -Engine malie > malie-schemes.json
#   -Engine malie : Malie LIBP/LIBU keys (DatOpener.KnownSchemes): Camellia (the 16 key bytes) or CFI (key + rotate key)
#   -Engine warc  : ShiinaRio WARC scheme names and engine versions, and the game map (exe/archive name -> title)
param([string]$GarbroDir,[string]$Engine='malie')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$gameRes=[Reflection.Assembly]::LoadFrom((Join-Path $GarbroDir 'GameRes.dll'))
$arcFormats=[Reflection.Assembly]::LoadFrom((Join-Path $GarbroDir 'ArcFormats.dll'))
$catalog=$gameRes.GetType('GameRes.FormatCatalog')::Instance
$st=[IO.File]::OpenRead((Join-Path $GarbroDir 'GameData\Formats.dat'));try{$catalog.DeserializeScheme($st)}finally{$st.Dispose()}
$bf=[Reflection.BindingFlags]'Public,NonPublic,Instance,Static'
function Field($o,$name){$t=$o.GetType();while($t){$f=$t.GetField($name,$bf);if($f){return $f.GetValue($o)};$p=$t.GetProperty($name,$bf);if($p){return $p.GetValue($o)};$t=$t.BaseType};return $null}
function Hex($bytes){if($null -eq $bytes){return $null};return (($bytes|ForEach-Object{$_.ToString('x2')}) -join '')}
$out=[ordered]@{source='GARbro '+$gameRes.GetName().Version.ToString()+' GameData/Formats.dat';schemes=[ordered]@{}}
if($Engine -eq 'malie'){
 $known=$arcFormats.GetType('GameRes.Formats.Malie.DatOpener')::KnownSchemes
 foreach($k in $known.Keys){$s=$known[$k];$align=[uint32](Field $s 'DataAlign')
  if($s.GetType().Name -eq 'LibCamelliaScheme'){$w=$s.Key;$b=New-Object byte[] 16
   for($i=0;$i -lt 4;$i++){$v=[uint32]$w[48+$i];$b[$i*4]=[byte]($v -shr 24);$b[$i*4+1]=[byte](($v -shr 16) -band 255);$b[$i*4+2]=[byte](($v -shr 8) -band 255);$b[$i*4+3]=[byte]($v -band 255)}
   $out.schemes[$k]=[ordered]@{cipher='camellia';align=$align;key=(Hex $b)}}
  elseif($s.GetType().Name -eq 'LibCfiScheme'){$out.schemes[$k]=[ordered]@{cipher='cfi';align=$align;key=(Hex $s.Key);rotate=@($s.RotateKey|ForEach-Object{[uint32]$_})}}
  else{$out.schemes[$k]=[ordered]@{cipher=$s.GetType().Name;align=$align}}}
}elseif($Engine -eq 'warc'){
 $known=$arcFormats.GetType('GameRes.Formats.ShiinaRio.Decoder')::KnownSchemes
 foreach($s in $known){$extra=Field $s 'ExtraCrypt';$out.schemes[$s.Name]=[ordered]@{version=[int]$s.Version;nameSize=[int]$s.EntryNameSize;extra=$(if($extra){$extra.GetType().Name}else{$null})}}
}
$map=Field $catalog 'm_game_map';if($map){$g=[ordered]@{};foreach($k in $map.Keys){if($out.schemes.Contains($map[$k])){$g[$k]=$map[$k]}};$out.games=$g}
[Console]::Out.WriteLine(($out|ConvertTo-Json -Depth 6))
