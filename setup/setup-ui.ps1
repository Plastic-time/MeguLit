# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit setup: interface layer (dot-sourced by setup-runtime.ps1 just before the window is shown).
# This file only draws: it re-skins the controls the setup logic already writes to ($title/$pathBox/$browse/$confirm/
# $button/$deskCheck/$menuCheck/$freeLabel/$note) and answers the UI-* hooks. It never downloads, unpacks or copies.
# Theme = MEGULIT_SETUP_THEME: classic (the old look, nothing changes) | line | steps | hero.
#   line  : one calm column, one bar from start to finish
#   steps : left rail with every component's own state, form on the right (no numbers, just state dots)
#   hero  : brand header, big centred percentage, options in a card underneath
# Palette and shapes follow the in-app Alt+T panel: slate dark, crimson accent, rounded cards, pill switches.
$themeName = if ($env:MEGULIT_SETUP_THEME) { $env:MEGULIT_SETUP_THEME.ToLower() } else { 'classic' }
if ($themeName -notin 'line','steps','hero') { return }

Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Drawing2D; using System.Windows.Forms;
public static class MGfx {
  public static GraphicsPath Round(float x, float y, float w, float h, float r) {
    GraphicsPath p = new GraphicsPath(); r = Math.Max(0.5f, Math.Min(r, Math.Min(w, h) / 2f)); float d = r * 2;
    p.AddArc(x, y, d, d, 180, 90); p.AddArc(x + w - d, y, d, d, 270, 90); p.AddArc(x + w - d, y + h - d, d, d, 0, 90); p.AddArc(x, y + h - d, d, d, 90, 90); p.CloseFigure(); return p;
  }
  public static void Rounded(Control c, int r) { if (c.Width < 4 || c.Height < 4) return; using (GraphicsPath p = Round(0, 0, c.Width, c.Height, r)) c.Region = new Region(p); }
}
public class MCard : Panel {
  public int Radius = 14; public Color Fill = Color.FromArgb(35,39,47), Edge = Color.FromArgb(52,58,69), Outer = Color.Black;
  public MCard() { SetStyle(ControlStyles.ResizeRedraw | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true); }
  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics; g.Clear(Outer); g.SmoothingMode = SmoothingMode.AntiAlias;
    using (GraphicsPath p = MGfx.Round(0.5f, 0.5f, Width - 2, Height - 2, Radius)) { using (SolidBrush b = new SolidBrush(Fill)) g.FillPath(b, p); using (Pen pen = new Pen(Edge)) g.DrawPath(pen, p); }
  }
}
public class MSwitch : CheckBox {
  public Color Surface = Color.FromArgb(35,39,47), OnColor = Color.FromArgb(200,32,60), OffColor = Color.FromArgb(66,72,84), TextColor = Color.FromArgb(232,234,238);
  public MSwitch() { SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.ResizeRedraw, true); Cursor = Cursors.Hand; }
  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics; g.Clear(Surface); g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
    float h = 18, w = 34, y = (Height - h) / 2f; Color track = !Enabled ? Color.FromArgb(48,52,60) : (Checked ? OnColor : OffColor);
    using (GraphicsPath p = MGfx.Round(1, y, w, h, h / 2)) using (SolidBrush b = new SolidBrush(track)) g.FillPath(b, p);
    float kx = Checked ? 1 + w - h + 2 : 3; using (SolidBrush k = new SolidBrush(Enabled ? Color.White : Color.FromArgb(150,150,156))) g.FillEllipse(k, kx, y + 2, h - 4, h - 4);
    if (Focused && ShowFocusCues) using (GraphicsPath p = MGfx.Round(-1, y - 2, w + 4, h + 4, (h + 4) / 2)) using (Pen pen = new Pen(Color.FromArgb(235,90,110), 2)) g.DrawPath(pen, p);
    TextRenderer.DrawText(g, Text, Font, new Rectangle((int)w + 12, 0, Width - (int)w - 12, Height), Enabled ? TextColor : Color.FromArgb(120,126,138), TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
  }
  protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
  protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
}
public class MButton : Button {
  public Color Fill = Color.FromArgb(35,39,47), Hot = Color.FromArgb(48,54,64), Down = Color.FromArgb(60,66,78), Edge = Color.FromArgb(52,58,69), Ink = Color.FromArgb(232,234,238), Surface = Color.FromArgb(27,30,36); public int Radius = 10; bool over, press;
  public MButton() { SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.ResizeRedraw, true); Cursor = Cursors.Hand; }
  protected override void OnMouseEnter(EventArgs e) { over = true; Invalidate(); base.OnMouseEnter(e); }
  protected override void OnMouseLeave(EventArgs e) { over = false; press = false; Invalidate(); base.OnMouseLeave(e); }
  protected override void OnMouseDown(MouseEventArgs e) { press = true; Invalidate(); base.OnMouseDown(e); }
  protected override void OnMouseUp(MouseEventArgs e) { press = false; Invalidate(); base.OnMouseUp(e); }
  protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
  protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics; g.Clear(Surface); g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
    Color c = !Enabled ? Color.FromArgb(46,50,58) : (press ? Down : (over ? Hot : Fill));
    using (GraphicsPath p = MGfx.Round(0.5f, 0.5f, Width - 2, Height - 2, Radius)) { using (SolidBrush b = new SolidBrush(c)) g.FillPath(b, p); using (Pen pen = new Pen(Edge)) g.DrawPath(pen, p); }
    if (Focused && ShowFocusCues) using (GraphicsPath p = MGfx.Round(1.5f, 1.5f, Width - 4, Height - 4, Radius)) using (Pen pen = new Pen(Color.FromArgb(245,130,146), 2)) g.DrawPath(pen, p);
    TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), Enabled ? Ink : Color.FromArgb(120,126,138), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
  }
}
public class MBar : Control {
  public int Value = 0; public bool Busy = false; public double Phase = 0; public Color Track = Color.FromArgb(44,49,59), A = Color.FromArgb(200,32,60), B = Color.FromArgb(240,96,112), Surface = Color.FromArgb(27,30,36);
  public MBar() { SetStyle(ControlStyles.ResizeRedraw | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true); SetStyle(ControlStyles.Selectable, false); TabStop = false; }
  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics; g.Clear(Surface); g.SmoothingMode = SmoothingMode.AntiAlias; float w = Width - 1, h = Height - 1;
    using (GraphicsPath t = MGfx.Round(0, 0, w, h, h / 2)) {
      using (SolidBrush b = new SolidBrush(Track)) g.FillPath(b, t);
      if (Busy) { g.SetClip(t); float seg = w * 0.3f, x = (w + seg) * (float)Phase - seg; using (LinearGradientBrush lg = new LinearGradientBrush(new RectangleF(x, 0, seg, h + 1), A, B, 0f)) { ColorBlend cb = new ColorBlend(3); cb.Colors = new Color[] { Color.FromArgb(0, A), A, Color.FromArgb(0, B) }; cb.Positions = new float[] { 0f, 0.55f, 1f }; lg.InterpolationColors = cb; g.FillRectangle(lg, x, 0, seg, h + 1); } g.ResetClip(); }
      else if (Value > 0) { float fw = Math.Max(h, w * Value / 1000f); using (GraphicsPath f = MGfx.Round(0, 0, fw, h, h / 2)) using (LinearGradientBrush lg = new LinearGradientBrush(new RectangleF(0, 0, fw + 1, h + 1), A, B, 0f)) g.FillPath(lg, f); }
    }
  }
}
/* Left rail of the "steps" theme: one row per runtime pack with a state dot (waiting / active / done), a mini bar and a size. */
public class MRail : Control {
  public string[] Names = new string[0], Detail = new string[0]; public int[] State = new int[0]; public double[] Frac = new double[0];
  public Color Surface = Color.FromArgb(35,39,47), Ink = Color.FromArgb(232,234,238), Muted = Color.FromArgb(152,160,173), Accent = Color.FromArgb(200,32,60), Done = Color.FromArgb(98,196,140), Track = Color.FromArgb(52,58,69);
  public MRail() { SetStyle(ControlStyles.ResizeRedraw | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true); }
  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics; g.Clear(Surface); g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
    int rowH = Math.Max(48, Height / Math.Max(1, Names.Length)); if (rowH > 74) rowH = 74;
    using (Font f1 = new Font("Microsoft YaHei UI", 10f, FontStyle.Bold), f2 = new Font("Microsoft YaHei UI", 8.25f)) for (int i = 0; i < Names.Length; i++) {
      int y = i * rowH + 6; int st = State[i]; Color dot = st == 2 ? Done : (st == 1 ? Accent : Track);
      using (SolidBrush b = new SolidBrush(dot)) g.FillEllipse(b, 10, y + 6, 12, 12);
      if (st == 2) using (Pen p = new Pen(Color.FromArgb(24,28,34), 2)) { g.DrawLine(p, 13, y + 12, 15, y + 15); g.DrawLine(p, 15, y + 15, 19, y + 9); }
      if (st == 0) using (Pen p = new Pen(Color.FromArgb(90,98,112), 1)) g.DrawEllipse(p, 10, y + 6, 12, 12);
      using (SolidBrush t = new SolidBrush(st == 0 ? Muted : Ink)) g.DrawString(Names[i], f1, t, 32, y);
      using (SolidBrush m = new SolidBrush(Muted)) g.DrawString(Detail[i], f2, m, 32, y + 22);
      if (st == 1) { float bw = Width - 48; using (GraphicsPath tr = MGfx.Round(32, y + 42, bw, 4, 2)) using (SolidBrush b = new SolidBrush(Track)) g.FillPath(b, tr); float fw = (float)Math.Max(4, bw * Frac[i]); using (GraphicsPath fp = MGfx.Round(32, y + 42, fw, 4, 2)) using (SolidBrush b = new SolidBrush(Accent)) g.FillPath(b, fp); }
    }
  }
}
public class MHero : Panel {
  public Image Logo; public int Mode = 0; public Color Back = Color.FromArgb(27,30,36), Ring = Color.FromArgb(200,32,60);
  public MHero() { SetStyle(ControlStyles.ResizeRedraw | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true); }
  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics; g.Clear(Back); g.SmoothingMode = SmoothingMode.AntiAlias; g.InterpolationMode = InterpolationMode.HighQualityBicubic;
    if (Mode == 1) {
      using (LinearGradientBrush lg = new LinearGradientBrush(new Rectangle(0, 0, Width, Height), Color.FromArgb(46,30,36), Back, 90f)) g.FillRectangle(lg, 0, 0, Width, Height);
      float cx = Width / 2f, cy = Height * 0.62f;
      foreach (float r in new float[] { 150, 128, 78, 30 }) using (Pen p = new Pen(Color.FromArgb(r == 150 ? 70 : 42, Ring), 1)) g.DrawEllipse(p, cx - r, cy - r, 2 * r, 2 * r);
      for (int rot = 0; rot < 360; rot += 180) { PointF[] pts = new PointF[3]; for (int i = 0; i < 3; i++) { double a = (rot - 90 + i * 120) * Math.PI / 180; pts[i] = new PointF((float)(cx + 128 * Math.Cos(a)), (float)(cy + 128 * Math.Sin(a))); } using (Pen p = new Pen(Color.FromArgb(46, Ring), 1)) g.DrawPolygon(p, pts); }
      if (Logo != null) { float lw = 300, lh = lw * Logo.Height / Logo.Width; g.DrawImage(Logo, cx - lw / 2, (Height - lh) / 2f, lw, lh); }
    } else if (Logo != null) { float lh = Height, lw = lh * Logo.Width / Logo.Height; g.DrawImage(Logo, 0, 0, lw, lh); }
  }
}
'@

$pal = @{
  bg = [Drawing.Color]::FromArgb(27,30,36); card = [Drawing.Color]::FromArgb(35,39,47); card2 = [Drawing.Color]::FromArgb(24,27,33)
  edge = [Drawing.Color]::FromArgb(52,58,69); text = [Drawing.Color]::FromArgb(232,234,238); muted = [Drawing.Color]::FromArgb(152,160,173)
  red = [Drawing.Color]::FromArgb(200,32,60); redHot = [Drawing.Color]::FromArgb(224,52,80); redDown = [Drawing.Color]::FromArgb(160,22,48); ok = [Drawing.Color]::FromArgb(98,196,140); warn = [Drawing.Color]::FromArgb(240,170,90)
}
function UFont([double]$size, [bool]$bold = $false) { New-Object Drawing.Font($ui, [single]$size, $(if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular })) }
function ULabel($parent, $text, [double]$size, $color, [bool]$bold = $false) {
  $l = New-Object Windows.Forms.Label; $l.Text = $text; $l.Font = UFont $size $bold; $l.ForeColor = $color; $l.BackColor = [Drawing.Color]::Transparent
  $l.UseCompatibleTextRendering = $false; $parent.Controls.Add($l); $l
}
function Place($ctl, $x, $y, $w, $h) { $ctl.Location = New-Object Drawing.Point([int]$x, [int]$y); $ctl.Size = New-Object Drawing.Size([int]$w, [int]$h) }

# ---- re-skin the existing controls ----
function Style-Button($b, [bool]$primary) {
  $b.Surface = $surfColor
  if ($primary) { $b.Fill = $pal.red; $b.Edge = $pal.red; $b.Hot = $pal.redHot; $b.Down = $pal.redDown; $b.Ink = [Drawing.Color]::White }
  else { $b.Fill = $pal.card; $b.Edge = $pal.edge; $b.Hot = [Drawing.Color]::FromArgb(48,54,64); $b.Down = [Drawing.Color]::FromArgb(60,66,78); $b.Ink = $pal.text }
  $b.Invalidate()
}
function New-Btn($text, [double]$size, [bool]$bold, [bool]$primary) { $b = New-Object MButton; $b.Text = $text; $b.Font = UFont $size $bold; Style-Button $b $primary; $b }
function Roundify($b, [int]$r = 10) {}
$surfColor = $pal.bg
$form.SuspendLayout()
$stage.Visible = $false
$surf = New-Object Windows.Forms.Panel; $surf.Dock = 'Fill'; $surf.BackColor = $pal.bg; $form.Controls.Add($surf); $surf.BringToFront()
$form.BackColor = $pal.bg

# header art / logo
$hero = New-Object MHero; $hero.Logo = $logo; $hero.BackColor = $pal.bg; $surf.Controls.Add($hero)
$title = ULabel $surf '' 15 $pal.text $true
$titleEn = ULabel $surf '' 9 $pal.muted
$percent = ULabel $surf '' 22 $pal.text $true; $percent.TextAlign = 'MiddleRight'
$bar = New-Object MBar; $surf.Controls.Add($bar)
$detail = ULabel $surf '' 10 $pal.text
$detail2 = ULabel $surf '' 8.5 $pal.muted
$rail = New-Object MRail; $surf.Controls.Add($rail)
$railTitle = ULabel $surf '运行组件' 9 $pal.muted $true
$railSum = ULabel $surf '' 8.5 $pal.muted
$status = ULabel $surf '' 8 $pal.muted; $status.Visible = $false

# options card (install location, shortcuts, free space)
$opt = New-Object MCard; $opt.Fill = $pal.card; $opt.Edge = $pal.edge; $opt.Outer = $pal.bg; $surf.Controls.Add($opt)
$optTitle = ULabel $opt '装到哪里' 10 $pal.text $true; $optTitleEn = ULabel $opt 'Install location' 8.5 $pal.muted
foreach ($ctl in $pathBox, $freeLabel, $note) { $ctl.Parent.Controls.Remove($ctl); $opt.Controls.Add($ctl) }
$choice.Visible = $false; $progress.Visible = $false
$pathWrap = New-Object MCard; $pathWrap.Radius = 9; $pathWrap.Fill = $pal.card2; $pathWrap.Edge = $pal.edge; $pathWrap.Outer = $pal.card; $opt.Controls.Add($pathWrap)
$pathBox.Parent.Controls.Remove($pathBox); $pathWrap.Controls.Add($pathBox)
$pathBox.BackColor = $pal.card2; $pathBox.ForeColor = $pal.text; $pathBox.BorderStyle = 'None'; $pathBox.Font = UFont 10
$pathBox.add_GotFocus({ $pathWrap.Edge = [Drawing.Color]::FromArgb(235,90,110); $pathWrap.Invalidate() })
$pathBox.add_LostFocus({ $pathWrap.Edge = $pal.edge; $pathWrap.Invalidate() })
$pathWrap.add_Click({ $pathBox.Focus() })
function Place-Path($x, $y, $w) { Place $pathWrap $x $y $w 34; $pathBox.Location = New-Object Drawing.Point(12, [int]((34 - $pathBox.Height) / 2)); $pathBox.Width = $w - 24 }
$oldBrowse = $browse; $oldBrowse.Visible = $false; $browse = New-Btn '更改 Browse' 9 $false $false; $browse.Surface = $pal.card; $opt.Controls.Add($browse)
$browse.add_Click({ $m = [Windows.Forms.Button].GetMethod('OnClick', [Reflection.BindingFlags]'NonPublic,Instance'); [void]$m.Invoke($oldBrowse, @([EventArgs]::Empty)) })
$freeLabel.Font = UFont 8.5; $freeLabel.TextAlign = 'MiddleRight'; $note.Font = UFont 8.5; $note.ForeColor = $pal.muted; $note.AutoEllipsis = $false
function New-Switch($text) { $s = New-Object MSwitch; $s.Text = $text; $s.Checked = $true; $s.Font = UFont 9.5; $s.Surface = $pal.card; $s.OnColor = $pal.red; $opt.Controls.Add($s); $s }
$deskCheck = New-Switch '桌面快捷方式'; $menuCheck = New-Switch '开始菜单'
$optHint = ULabel $opt '' 8.5 $pal.muted

# footer buttons ($button = cancel, $confirm = install)
foreach ($b in $button, $confirm) { $b.Visible = $false }
$button = New-Btn '取消 Cancel' 9.5 $true $false; $surf.Controls.Add($button)
$confirm = New-Btn '开始安装 Install' 11 $true $true; $surf.Controls.Add($confirm); $confirm.add_Click({ Confirm-Install })
$form.AcceptButton = $confirm; $form.CancelButton = $null

# error card (replaces the progress block when something fails)
$err = New-Object MCard; $err.Fill = [Drawing.Color]::FromArgb(44,31,36); $err.Edge = [Drawing.Color]::FromArgb(120,44,62); $err.Outer = $pal.bg; $err.Visible = $false; $surf.Controls.Add($err)
$errTitle = ULabel $err '' 12 $pal.text $true
$errMsg = ULabel $err '' 9.5 $pal.text
$errSteps = ULabel $err '' 8.5 $pal.muted
$errRetry = New-Btn '重试 Retry' 9.5 $true $true; $errRetry.Surface = $err.Fill; $err.Controls.Add($errRetry)
$errCopy = New-Btn '复制日志 Copy log' 9 $false $false; $errCopy.Surface = $err.Fill; $err.Controls.Add($errCopy)
$errSite = New-Btn '手动下载 Manual' 9 $false $false; $errSite.Surface = $err.Fill; $err.Controls.Add($errSite)
$errRetry.add_Click({ $m = [Windows.Forms.Button].GetMethod('OnClick', [Reflection.BindingFlags]'NonPublic,Instance'); [void]$m.Invoke($button, @([EventArgs]::Empty)) })
$errCopy.add_Click({
  try {
    $log = if ($script:failKind -eq 'vc-runtime') { Join-Path $env:LOCALAPPDATA 'MeguLit\setup-vc-runtime.log' } else { Join-Path $Root 'logs\setup-download.log' }
    $t = "MeguLit setup`r`n" + $errMsg.Text + "`r`n"
    if (Test-Path $log) { $t += (Get-Content -Tail 120 -Encoding UTF8 $log) -join "`r`n" }
    [Windows.Forms.Clipboard]::SetText($t); $errCopy.Text = '已复制 Copied'
  } catch { $errCopy.Text = '复制失败' }
})
$errSite.add_Click({ Start-Process 'https://megulit.com' })

# the progress ticker (reuses the shimmer timer of the old bar)
$shimmer.Stop(); $shimmer.remove_Tick($null) 2>$null
$script:uiTick = New-Object Windows.Forms.Timer; $script:uiTick.Interval = 30
$script:uiTick.add_Tick({ $bar.Phase = ($bar.Phase + 0.012) % 1.0; $bar.Invalidate() })
function Set-Bar([int]$value) { $bar.Busy = $false; $script:uiTick.Stop(); $bar.Value = [math]::Max(0, [math]::Min(1000, $value)); $percent.Text = if ($value -gt 0) { ('{0:N0}%' -f ($bar.Value / 10)) } else { '' }; $bar.Invalidate() }
function Set-Busy { $bar.Busy = $true; $percent.Text = ''; $script:uiTick.Start(); $bar.Invalidate() }

# ---- layouts ----
function Fmt-Eta([double]$sec) {
  if ($sec -lt 0 -or $sec -gt 86400) { return '' }
  if ($sec -lt 60) { return ('约剩 {0:N0} 秒' -f [math]::Max(1, $sec)) }
  if ($sec -lt 3600) { return ('约剩 {0:N0} 分 {1:N0} 秒' -f [math]::Floor($sec / 60), ($sec % 60)) }
  '约剩 {0:N0} 小时 {1:N0} 分' -f [math]::Floor($sec / 3600), [math]::Floor(($sec % 3600) / 60)
}
function Layout-Line {
  $form.ClientSize = New-Object Drawing.Size(640,470)
  $hero.Mode = 0; Place $hero 32 24 132 50; $hero.Visible = $true
  Place $title 32 92 450 34; $titleEn.TextAlign = 'TopLeft'; Place $titleEn 32 126 450 18
  Place $percent 470 90 138 40; Place $bar 32 160 576 8
  Place $detail 32 178 576 22; Place $detail2 32 200 576 20; $title.TextAlign = 'MiddleLeft'; $detail.TextAlign = 'TopLeft'; $detail2.TextAlign = 'TopLeft'
  $rail.Visible = $false; $railTitle.Visible = $false; $railSum.Visible = $false
  Place $err 32 84 576 170
  Place $opt 32 262 576 126
  Place $button 32 412 110 38; Place $confirm 408 412 200 38
  $script:optInner = @{ w = 576 }
}
function Layout-Steps {
  $form.ClientSize = New-Object Drawing.Size(780,540)
  $hero.Mode = 0; Place $hero 24 20 132 50
  Place $railTitle 28 92 200 18; Place $rail 24 114 236 230; Place $railSum 28 352 232 36
  $rail.Visible = $true; $railTitle.Visible = $true; $railSum.Visible = $true
  Place $title 292 24 330 34; Place $titleEn 292 58 330 18; Place $percent 600 24 156 40
  Place $bar 292 92 464 8; Place $detail 292 110 464 22; Place $detail2 292 132 464 20
  Place $err 292 24 464 184
  Place $opt 292 218 464 236
  Place $button 292 470 110 38; Place $confirm 548 470 208 38
  $title.TextAlign = 'MiddleLeft'; $detail.TextAlign = 'TopLeft'; $detail2.TextAlign = 'TopLeft'
}
function Layout-Hero {
  $form.ClientSize = New-Object Drawing.Size(720,590)
  $hero.Mode = 1; Place $hero 0 0 720 190; $hero.Visible = $true
  $rail.Visible = $false; $railTitle.Visible = $false; $railSum.Visible = $false
  Place $title 48 200 624 34; $title.TextAlign = 'MiddleCenter'; Place $titleEn 48 234 624 18; $titleEn.TextAlign = 'TopCenter'
  Place $percent 48 258 624 46; $percent.TextAlign = 'MiddleCenter'; $percent.Font = UFont 26 $true
  Place $bar 48 312 624 10; Place $detail 48 330 624 22; Place $detail2 48 352 624 20; $detail.TextAlign = 'TopCenter'; $detail2.TextAlign = 'TopCenter'
  Place $err 48 200 624 186
  Place $opt 48 398 624 108
  Place $button 48 526 110 40; Place $confirm 468 526 204 40
}
switch ($themeName) { 'line' { Layout-Line } 'steps' { Layout-Steps } 'hero' { Layout-Hero } }

# options card inner layout depends on the card's width
function Layout-Options {
  $w = $opt.Width
  if ($themeName -eq 'hero') {
    Place $optTitle 18 12 120 22; Place $optTitleEn 18 34 120 16
    Place-Path 150 10 ($w - 150 - 140); Place $browse ($w - 124) 10 106 34
    Place $deskCheck 150 62 150 26; Place $menuCheck 310 62 110 26; Place $freeLabel ($w - 258) 64 240 22
    $note.Visible = $false; $optHint.Visible = $false
  } elseif ($themeName -eq 'steps') {
    Place $optTitle 18 14 200 22; Place $optTitleEn 18 36 200 16
    Place-Path 18 60 ($w - 36 - 112); Place $browse ($w - 18 - 102) 60 102 34
    Place $freeLabel 18 98 ($w - 36) 20; $freeLabel.TextAlign = 'MiddleLeft'
    Place $deskCheck 18 128 200 26; Place $menuCheck 18 158 200 26
    Place $note 18 192 ($w - 36) 40; $note.Visible = $true; $optHint.Visible = $false
  } else {
    Place $optTitle 18 12 200 22; Place $optTitleEn 120 15 200 16
    Place-Path 18 40 ($w - 36 - 112); Place $browse ($w - 18 - 102) 40 102 34
    Place $deskCheck 18 86 160 26; Place $menuCheck 190 86 120 26; Place $freeLabel ($w - 18 - 250) 88 250 22
    $note.Visible = $false; $optHint.Visible = $false
  }
  $freeLabel.Visible = $true
}
Layout-Options
function Layout-Err {
  $w = $err.Width; Place $errTitle 20 14 ($w - 40) 24; Place $errMsg 20 42 ($w - 40) 38
  Place $errSteps 20 84 ($w - 40) 50
  $by = $err.Height - 46; Place $errRetry 20 $by 120 34; Place $errCopy 150 $by 150 34; Place $errSite 310 $by 140 34
}
Layout-Err
foreach ($ctl in $title, $titleEn, $percent, $detail, $detail2) { $ctl.AutoSize = $false }
$title.AutoEllipsis = $true; $detail.AutoEllipsis = $true; $detail2.AutoEllipsis = $true; $errMsg.AutoEllipsis = $false
# keyboard order: path, browse, switches, install, cancel
$pathBox.TabStop = $true; $pathBox.TabIndex = 0; $browse.TabIndex = 1; $errRetry.TabIndex = 0; $errCopy.TabIndex = 1; $errSite.TabIndex = 2; $deskCheck.TabIndex = 2; $menuCheck.TabIndex = 3; $confirm.TabIndex = 4; $button.TabIndex = 5
$form.ResumeLayout($true)

# ---- hooks the logic calls ----
$script:uiPackState = $null
function Pack-Rows($p) {
  $ids = @($script:dl); $n = $ids.Count; $names2 = @(); $det = @(); $st = @(); $fr = @()
  for ($i = 0; $i -lt $n; $i++) {
    $id = $ids[$i]; $names2 += $names[$id]; $sz = [long]$packs.$id.size
    if ($i -lt $script:dlPos) {
      $inst = $script:confirmed -and -not (@($script:ready | Where-Object { $_.id -eq $id }).Count -gt 0)
      $st += 2; $fr += 1.0; $det += ((MB $sz) + $(if ($inst) { ' · 已安装' } else { ' · 已下载' }))
    } elseif ($i -eq $script:dlPos -and $p.phase -in 'probe','download','verify') {
      $st += 1; $fr += $(if ($p.size -gt 0) { [double]$p.got / [double]$p.size } else { 0.0 }); $det += $(if ($p.phase -eq 'probe') { '正在测速…' } elseif ($p.phase -eq 'verify') { '校验中…' } else { ('{0:N0} / {1:N0} MB' -f ($p.got / 1MB), ($p.size / 1MB)) })
    } else { $st += 0; $fr += 0.0; $det += ((MB $sz) + ' · 等待') }
  }
  $rail.Names = [string[]]$names2; $rail.Detail = [string[]]$det; $rail.State = [int[]]$st; $rail.Frac = [double[]]$fr; $rail.Invalidate()
}
function UI-Show-Err([bool]$on) { $err.Visible = $on; foreach ($ctl in $title, $titleEn, $percent, $bar, $detail, $detail2) { $ctl.Visible = -not $on }; if ($on) { $err.BringToFront() } }
# p: phase probe|download|verify|unpack|waiting|copy, idx, count, name, got, size, speed, src, resumed, totalGot, total, dir
function UI-Progress($p) {
  UI-Show-Err $false; $errCopy.Text = '复制日志 Copy log'
  $cnt = [math]::Max(1, $p.count)
  $overall = if ($p.total -gt 0) { [int][math]::Min(1000, 1000.0 * $p.totalGot / $p.total) } else { 0 }
  switch ($p.phase) {
    'vc-runtime' {
      $title.Text = '正在检查 Visual C++ 运行库'; $titleEn.Text = 'Checking Visual C++ Runtime'
      Set-Busy; $detail.Text = '如需安装，请确认微软安装程序的管理员提示'; $detail2.Text = ''
    }
    'probe' {
      $title.Text = '正在准备下载'; $titleEn.Text = 'Picking the fastest sources'
      Set-Busy; $detail.Text = '正在同时测速所有下载源，挑最快的几个一起下'; $detail2.Text = ('先下载 ' + $p.name + ' · 共 ' + $cnt + ' 个组件，约 ' + (MB $p.total) + ' · GitHub 与国内镜像一起测')
    }
    'download' {
      $title.Text = '正在下载运行组件'; $titleEn.Text = 'Downloading runtime components'
      Set-Bar $overall
      $eta = if ($p.speed -gt 0) { Fmt-Eta (($p.total - $p.totalGot) / $p.speed) } else { '' }
      $spd = if ($p.speed -gt 0) { ('{0:N1} MB/s' -f ($p.speed / 1MB)) } else { '测速中' }
      $detail.Text = ('{0} / {1}  ·  {2}  ·  {3}' -f (MB $p.totalGot), (MB $p.total), $spd, $eta).TrimEnd(' ', '·')
      $detail2.Text = ('当前：' + $p.name + $(if ($p.resumed) { '（接着上次）' } else { '' }) + $(if ($p.src) { '  ·  来源 ' + $p.src } else { '' }))
    }
    'verify' { $title.Text = '正在校验文件'; $titleEn.Text = 'Verifying SHA-256'; Set-Bar $overall; $detail.Text = ('正在核对 ' + $p.name + ' 的 SHA-256'); $detail2.Text = '组件是各项目官方原版文件，被改动过的不会安装' }
    'waiting' { $title.Text = '下载好了'; $titleEn.Text = 'Download complete'; Set-Bar 1000; $detail.Text = ('全部 ' + (MB $p.total) + ' 已下载并校验通过'); $detail2.Text = '确认安装位置后，点右下角「开始安装」' }
    'unpack' { $title.Text = '正在安装'; $titleEn.Text = 'Installing'; Set-Busy; $detail.Text = ('正在解压 ' + $p.name); $detail2.Text = ('到 ' + $p.dir) }
    'copy' { $title.Text = '正在复制 MeguLit'; $titleEn.Text = 'Copying program files'; Set-Busy; $detail.Text = '把程序文件复制到你选的位置'; $detail2.Text = '' }
  }
  if ($script:confirmed -and $p.phase -in 'probe','download','verify') { $titleEn.Text += ' · 下完自动安装' }
  Pack-Rows $p
  $railSum.Text = if ($p.total -gt 0) { '合计 ' + (MB $p.total) + ' · 已完成 ' + (MB $p.totalGot) } else { '' }
}
function Show-State {
  if ($script:mode -eq 'failed') { return }
  if ($script:copying) { UI-Progress @{ phase = 'copy'; count = $script:dl.Count; total = (Total-Bytes) } }
}
function UI-Fail([string]$kind, [string]$message) {
  UI-Show-Err $true; $errCopy.Text = '复制日志 Copy log'
  $errTitle.Text = if ($kind -eq 'vc-runtime') { 'Visual C++ 运行库未就绪' } elseif ($kind -eq 'install') { '安装没有完成 · Install did not finish' } else { '下载中断了 · Download interrupted' }
  $errTitle.ForeColor = $pal.warn; $errMsg.Text = $message
  $errSteps.Text = if ($kind -eq 'vc-runtime') { '确认管理员提示后点「重试」，也可以复制日志' }
    elseif ($kind -eq 'install') { '多半是磁盘空间不够或文件被占用：关掉占用的程序、腾出空间后点「重试」；组件已下载好，不会重下' }
    else { '先点「重试」：会重新测速并换最快的源，已下的部分接着用。还是不行就「复制日志」发给我们，或到官网手动下载整包' }
  $percent.Text = ''; Pack-Rows @{ phase = 'none' }
}
function UI-Done { $title.Visible = $true; UI-Show-Err $false; $title.Text = '装好了'; $titleEn.Text = 'All set — starting MeguLit'; Set-Bar 1000; $detail.Text = '正在启动 MeguLit…'; $detail2.Text = ''; $form.Refresh(); $until = [DateTime]::Now.AddMilliseconds(900); while ([DateTime]::Now -lt $until) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 } }

# ---- preview fixtures (MEGULIT_SETUP_PREVIEW_STATE) ----
function UI-Preview([string]$state) {
  $script:dl = New-Object Collections.ArrayList; foreach ($i in 'base','reading','voice') { [void]$script:dl.Add($i) }
  $total = Total-Bytes; $deskCheck.Checked = $true; $menuCheck.Checked = $true; $script:confirmed = $false; $script:ready.Clear(); $script:dlPos = 0
  $mk = { param($ph, $pos, $got, $size, $spd) @{ phase = $ph; idx = $pos; count = 3; name = $names[$script:dl[[math]::Min($pos, 2)]]; got = $got; size = $size; speed = $spd; src = 'cn-dl.megulit.com 等 3 个源'; resumed = $false; totalGot = $got; total = $total } }
  switch ($state) {
    'probing' { UI-Progress (& $mk 'probe' 0 0 107MB 0) }
    'downloading' { $script:dlPos = 1; $p = & $mk 'download' 1 (60MB) (190MB) (6.8MB); $p.totalGot = 107MB + 60MB; UI-Progress $p }
    'waiting' { $script:dlPos = 3; UI-Progress @{ phase = 'waiting'; count = 3; total = $total; totalGot = $total } }
    'installing' { $script:dlPos = 3; $script:confirmed = $true; UI-Progress @{ phase = 'unpack'; count = 3; name = $names['reading']; dir = 'D:\MeguLit\runtime'; total = $total; totalGot = $total } }
    'failed-download' { $script:dlPos = 1; $script:mode = 'failed'; UI-Fail 'download' '下载失败：所有下载源都连不上（cn-dl.megulit.com、dl.megulit.com、github.com 均无响应）' }
    'failed-install' { $script:dlPos = 3; $script:confirmed = $true; $script:mode = 'failed'; UI-Fail 'install' '安装失败：解压失败（D:\MeguLit\runtime 有文件被其他程序占用）' }
    'done' { UI-Show-Err $false; $script:dlPos = 3; $script:confirmed = $true; $title.Text = '装好了'; $titleEn.Text = 'All set — starting MeguLit'; Set-Bar 1000; $detail.Text = '正在启动 MeguLit…'; $detail2.Text = ''; Pack-Rows @{ phase = 'none' }; $railSum.Text = '合计 ' + (MB $total) + ' · 已完成 ' + (MB $total) }
  }
  $script:mode = ''
}
