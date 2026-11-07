# The tray uses the same small Megumin artwork as the executable icon.
# icon.ico stores every frame as PNG. Windows PowerShell 5.1's Icon.ToBitmap
# decodes PNG frames as noise, so read the 32x32 PNG frame bytes directly.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskIco=[IO.File]::ReadAllBytes((Join-Path $taskRoot 'desktop\icons\icon.ico'))
$taskCount=[BitConverter]::ToUInt16($taskIco,4);$taskBest=$null
for($taskN=0;$taskN -lt $taskCount;$taskN++){
 $taskO=6+$taskN*16;$taskW=if($taskIco[$taskO] -eq 0){256}else{[int]$taskIco[$taskO]}
 $taskEntry=@{W=$taskW;Size=[BitConverter]::ToUInt32($taskIco,$taskO+8);Offset=[BitConverter]::ToUInt32($taskIco,$taskO+12)}
 if($taskW -eq 32){$taskBest=$taskEntry;break}
 if($taskW -gt 32 -and (-not $taskBest -or $taskW -lt $taskBest.W)){$taskBest=$taskEntry}
}
if(-not $taskBest){throw 'No 32px-or-larger frame in icon.ico'}
$taskStream=[IO.MemoryStream]::new($taskIco,[int]$taskBest.Offset,[int]$taskBest.Size)
$taskSource=[Drawing.Image]::FromStream($taskStream)
$taskBmp=[Drawing.Bitmap]::new(32,32,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
try{
 $taskG=[Drawing.Graphics]::FromImage($taskBmp)
 $taskG.Clear([Drawing.Color]::Transparent);$taskG.InterpolationMode='HighQualityBicubic';$taskG.PixelOffsetMode='HighQuality'
 $taskG.DrawImage($taskSource,0,0,32,32);$taskG.Dispose()
 $taskRgba=[byte[]]::new(32*32*4);$taskOpaque=0
 for($taskY=0;$taskY -lt 32;$taskY++){for($taskX=0;$taskX -lt 32;$taskX++){
  $taskPixel=$taskBmp.GetPixel($taskX,$taskY);$taskI=($taskY*32+$taskX)*4
  $taskRgba[$taskI]=$taskPixel.R;$taskRgba[$taskI+1]=$taskPixel.G;$taskRgba[$taskI+2]=$taskPixel.B;$taskRgba[$taskI+3]=$taskPixel.A
  if($taskPixel.A -eq 0){$taskOpaque++}
 }}
 # The artwork has a transparent background; noise would have almost none.
 if($taskOpaque -lt 64){throw 'Tray icon decode produced no transparent pixels; refusing to embed it'}
 [IO.File]::WriteAllBytes((Join-Path $taskRoot 'desktop\icons\tray.rgba'),$taskRgba)
}finally{$taskBmp.Dispose();$taskSource.Dispose();$taskStream.Dispose()}
