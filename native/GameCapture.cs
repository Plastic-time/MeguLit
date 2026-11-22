// SPDX-License-Identifier: GPL-3.0-or-later
// Reads a game window's client area for text, marker and dialogue detection.
// PrintWindow with PW_RENDERFULLCONTENT makes some DirectX games (Steins;Gate) render an extra frame, which shows as
// white flashes while it runs several times a second. BitBlt from the window's DC only reads what DWM already
// composed (without MeguLit's own overlay windows), so it is used; PrintWindow is only for a window BitBlt is proven
// blind to, and rate limited (see Choice). Nothing is read while the window is dragged or minimised (see Into).
// C# 5 only (the .NET Framework csc that ships with Windows).
using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;
public static class GameCapture{
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [DllImport("user32.dll")]static extern IntPtr GetDC(IntPtr hwnd);
 [DllImport("user32.dll")]static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
 [DllImport("gdi32.dll")]static extern bool BitBlt(IntPtr dest,int x,int y,int w,int h,IntPtr src,int sx,int sy,int rop);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")]static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr hwnd,ref Pt p);
 [StructLayout(LayoutKind.Sequential)]struct Pt{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)]struct GuiInfo{public int Size,Flags;public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret;public int L,T,R,B;}
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr GetDesktopWindow();
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
 [DllImport("user32.dll")]static extern uint GetDpiForWindow(IntPtr hwnd);
 [DllImport("user32.dll")]static extern IntPtr MonitorFromWindow(IntPtr hwnd,uint flags);
 [DllImport("shcore.dll")]static extern int GetDpiForMonitor(IntPtr monitor,int kind,out uint x,out uint y);
 // Proven: BitBlt has shown this window's picture. Blind: BitBlt keeps giving a blank picture while the screen shows
 // the game, so only PrintWindow can read it. Votes: screen checks in a row that said "blind".
 sealed class Choice{public bool Proven,Blind;public int Votes;public DateTime Printed,ProvenAt;public bool HasSig,Frozen;public int Sig,Round,FrozenVotes;public DateTime SigAt,VoteAfter;public int[] Screen;public Bitmap Last;public DateTime LastAt;}
 // 2026-11-21 (user, Aokana: 「画面都切换了译文还存在上一句」): a Unity window gave BitBlt one old picture for the whole session
 // (not blank, so it counted as proven) while the screen showed the game moving on; every scene and box check compared that
 // picture with itself. A BitBlt picture that has not changed for FreezeMs is checked against the screen while the game is in
 // front (FreezeVote): three checks where the screen moved meanwhile or shows another picture mark it Frozen, and it is then
 // read like a blind window (PrintWindow, PrintGapMs). The first BitBlt picture that changes again clears it. A still scene
 // that the screen shows exactly as BitBlt does starts the count again and is not checked for FreezeIdleMs; a check that
 // cannot tell waits FreezeUnsureMs.
 const int FreezeMs=3000,FreezeVoteGapMs=500,FreezeIdleMs=5000,FreezeUnsureMs=2000;
 static readonly Dictionary<IntPtr,Choice> Choices=new Dictionary<IntPtr,Choice>();static readonly object Gate=new object();
 // The parts of the game's client area (w x h) that MeguLit's own windows cover: left out of the freeze check. GalWindowBridge
 // sets it (OwnCover.cs); GameStyleProbe and the test harnesses build this file alone and leave it unset.
 public static Func<IntPtr,int,int,List<Rectangle>> OwnParts;
 static void Drop(){foreach(var o in Choices.Values)Release(o);Choices.Clear();}
 static void Release(Choice c){if(c.Last!=null){c.Last.Dispose();c.Last=null;}}
 // PrintWindow with PW_RENDERFULLCONTENT makes a DirectX game present an extra frame, seen as a whole black or white
 // flash. Games open on plain black/white screens (warnings, logos, fades), which BitBlt reads as "blank", and that used
 // to switch the window to PrintWindow for 30 seconds: every probe then flashed the screen several times a second for
 // the first 15-30 s (Steins;Gate and others; a photosensitive-seizure risk). Now a blank frame is only skipped; a
 // window counts as blind only when the screen itself shows a different, non-blank picture three times in a row while
 // it is in front, and even then it is printed at most once every PrintGapMs (far under 3 flashes a second).
 const int PrintGapMs=2000;
 // True when the last Into() on this thread did not read the window only for the moment (dragged, minimised, one
 // blank frame): callers keep what they have and try again, without reporting an error.
 [ThreadStatic]public static bool Skipped;
 // True when the last Into() on this thread filled the picture from the screen (style measurement only): such a picture
 // holds whatever lies over the game, MeguLit's own reader, lookup card and furigana included.
 [ThreadStatic]public static bool FromScreen;
 // Saved pictures (Anki card, collected sentence, scene shots, card wall). 2026-11-14 (user: an Anki picture held MeguLit's
 // lookup card and furigana): only the game window's own surface is used, read through its window DC or PrintWindow, which
 // DWM keeps apart from every other window, so MeguLit's overlays never reach it whatever the engine draws with. The
 // screen is never read here, and a picture that came from it anyway is dropped rather than saved.
 // A frozen window is printed for every reader together once every PrintGapMs and the scene probe takes most turns, so a
 // saved picture falls back to the last print when it is at most KeptMs old (the game showed it moments ago).
 const int KeptMs=PrintGapMs+1000;
 public static bool Picture(IntPtr hwnd,Bitmap image){
  if(Into(hwnd,image,2,false)){if(FromScreen){FromScreen=false;return false;}return true;}
  Choice c;lock(Gate)if(!Choices.TryGetValue(hwnd,out c))return false;if(Busy(hwnd)||!Kept(c,image,DateTime.UtcNow))return false;Skipped=false;return true;
 }
 // The window is being moved or resized (its thread runs the system move/size loop) or is minimised.
 public static bool Busy(IntPtr hwnd){
  if(hwnd==IntPtr.Zero||IsIconic(hwnd))return true;uint pid,thread=GetWindowThreadProcessId(hwnd,out pid);if(thread==0)return false;
  var info=new GuiInfo();info.Size=Marshal.SizeOf(typeof(GuiInfo));return GetGUIThreadInfo(thread,ref info)&&(info.Flags&0x2)!=0;
 }
 // Fills image (client size) with the window's picture; false when it could not be read this time.
 // Nothing is read during a move (a DirectX game stops presenting then).
 public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags){return Into(hwnd,image,printFlags,false);}
 // 2026-11-19 (live: the art scan's PrintWindow made the game thread redraw a frame, 66-94 ms stalls): periodic readers
 // use BitBlt only, never PrintWindow. A blank read is kept only for a window BitBlt has already shown (a dark scene is
 // dark); otherwise the round is skipped (Skipped). PrintWindow stays for one-off reads the user asks for.
 public static bool BltOnly(IntPtr hwnd,Bitmap image){
  Skipped=false;FromScreen=false;if(Busy(hwnd)||!Blt(hwnd,image)){Skipped=true;return false;}
  Choice c;lock(Gate){if(!Choices.TryGetValue(hwnd,out c)){if(Choices.Count>16)Drop();c=new Choice();Choices[hwnd]=c;}}
  if(!Blank(image)){if(Stale(c,Signature(image),DateTime.UtcNow,()=>FreezeVote(hwnd,image,c))){Skipped=true;return false;}return true;}
  bool proven;lock(Gate)proven=c.Proven;if(!proven)Skipped=true;return proven;
 }
 // screenFallback: some DirectX/Unity windows give a blank picture to both BitBlt and PrintWindow (style sync then saw
 // "ocrLines=0"). Only callers that hide MeguLit's own text first (style measurement) may read the screen instead: it
 // includes overlays, so marker and mask detection never use it.
 public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags,bool screenFallback){
  Skipped=false;FromScreen=false;if(Busy(hwnd)){Skipped=true;return false;}
  Choice c;lock(Gate){if(!Choices.TryGetValue(hwnd,out c)){if(Choices.Count>16)Drop();c=new Choice();Choices[hwnd]=c;}}
  bool frozen=false;
  if(Blt(hwnd,image)&&!Blank(image)){if(!Stale(c,Signature(image),DateTime.UtcNow,()=>FreezeVote(hwnd,image,c)))return true;frozen=true;}
  if(!frozen&&!c.Proven&&!c.Blind){int vote=BlindVote(hwnd,image);lock(Gate){if(vote>0){if(++c.Votes>=3)c.Blind=true;}else if(vote<0)c.Votes=0;}}
  bool print=false;int round=0;if(c.Blind||frozen)lock(Gate){if((DateTime.UtcNow-c.Printed).TotalMilliseconds>=PrintGapMs){c.Printed=DateTime.UtcNow;round=c.Round;print=true;}}
  if(!print){if(screenFallback&&!c.Proven&&ScreenInto(hwnd,image)){FromScreen=true;return true;}Skipped=true;return false;}
  /* a frozen window is printed client area only (PW_CLIENTONLY), as BitBlt read it: every reader gets the same framing and
     can share the kept print. Blind windows keep the caller's flags. */
  bool printed;using(var g=Graphics.FromImage(image)){IntPtr dc=g.GetHdc();try{printed=PrintWindow(hwnd,dc,frozen?printFlags|1:printFlags);}finally{g.ReleaseHdc(dc);}}
  switch(AfterPrint(printed,printed&&!Blank(image),frozen,screenFallback)){
   case 1:if(frozen)Keep(hwnd,c,round,image);return true;
   case 0:Skipped=true;return false;
   case 2:return printed;
  }
  FromScreen=true;return ScreenInto(hwnd,image);
 }
 // After PrintWindow: 1 the picture is good, 0 skipped (a frozen window printed blank: never a black picture for it and,
 // after a print, never the screen), 2 the print result as it is (no screen fallback), 3 read the screen instead.
 static int AfterPrint(bool printed,bool good,bool frozen,bool screenFallback){if(good)return 1;if(frozen)return 0;return screenFallback?3:2;}
 // 2026-11-19 (perf: the wait marker read the whole client area 16-33 times a second only to cut a corner out of it):
 // reads only part (client coordinates). image is either client-sized (part lands at its own place, the rest is left as
 // it was) or part-sized (part lands at 0,0). Only for a window whose whole picture BitBlt has already shown (Proven):
 // then BitBlt of the part is the same pixels a full read would give there. A blank part is trusted only while the whole
 // picture was seen non-blank within PartProofMs (a plain spot of the text box); otherwise the whole client area is read
 // as before, so a black fade or a window BitBlt cannot see behaves exactly like Into (skipped, PrintWindow rules).
 const int PartProofMs=400;
 public static bool Part(IntPtr hwnd,Bitmap image,Rectangle part,int clientW,int clientH,uint printFlags){
  bool whole=image.Width==clientW&&image.Height==clientH;int dx=whole?part.X:0,dy=whole?part.Y:0;
  Skipped=false;FromScreen=false;if(Busy(hwnd)){Skipped=true;return false;}
  if(part.Width<1||part.Height<1||part.X<0||part.Y<0||part.Right>clientW||part.Bottom>clientH||(!whole&&(image.Width<part.Width||image.Height<part.Height)))return false;
  Choice c;int route=2;DateTime at=DateTime.MinValue;lock(Gate){if(Choices.TryGetValue(hwnd,out c)){route=PartRoute(c,DateTime.UtcNow);at=c.ProvenAt;}}
  if(route==1){Skipped=true;return false;}
  if(route==0){
   // Read into a part-sized picture: a device context over a client-sized bitmap copies the whole bitmap in and out
   // (measured 1920x1080: 5-20 ms against 0.5 ms), then copy its rows into place.
   Bitmap small=whole?Scratch(part.Width,part.Height):image;
   if(BltPart(hwnd,small,0,0,part)){bool blank=BlankPart(small,new Rectangle(0,0,part.Width,part.Height));
    if(!blank||(DateTime.UtcNow-at).TotalMilliseconds<PartProofMs){if(!blank)lock(Gate)c.ProvenAt=DateTime.UtcNow;if(whole)CopyRows(small,image,part.X,part.Y);return true;}}}
  if(whole)return Into(hwnd,image,printFlags);
  using(var full=new Bitmap(clientW,clientH,PixelFormat.Format32bppArgb)){if(!Into(hwnd,full,printFlags))return false;
   using(var g=Graphics.FromImage(image)){g.CompositingMode=System.Drawing.Drawing2D.CompositingMode.SourceCopy;g.DrawImage(full,new Rectangle(0,0,part.Width,part.Height),part,GraphicsUnit.Pixel);}}
  return true;
 }
 // 0: BitBlt the part (the whole picture is proven and not frozen). 1: skip this round (frozen and its print is not due:
 // a whole-window read would only BitBlt the frozen picture again, 16-33 times a second). 2: read the whole window (Into).
 static int PartRoute(Choice c,DateTime now){if(c.Frozen)return (now-c.Printed).TotalMilliseconds<PrintGapMs?1:2;return c.Proven&&!c.Blind?0:2;}
 [ThreadStatic]static Bitmap ScratchBitmap;
 static Bitmap Scratch(int w,int h){var b=ScratchBitmap;if(b==null||b.Width!=w||b.Height!=h){if(b!=null)b.Dispose();b=ScratchBitmap=new Bitmap(w,h,PixelFormat.Format32bppArgb);}return b;}
 static void CopyRows(Bitmap from,Bitmap to,int x,int y){int w=from.Width,h=from.Height;
  var a=from.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{var b=to.LockBits(new Rectangle(x,y,w,h),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
   try{var row=new byte[w*4];for(int j=0;j<h;j++){Marshal.Copy(IntPtr.Add(a.Scan0,j*a.Stride),row,0,row.Length);Marshal.Copy(row,0,IntPtr.Add(b.Scan0,j*b.Stride),row.Length);}}
   finally{to.UnlockBits(b);}}finally{from.UnlockBits(a);}
 }
 static bool BltPart(IntPtr hwnd,Bitmap image,int dx,int dy,Rectangle part){
  using(var g=Graphics.FromImage(image)){IntPtr dest=g.GetHdc(),src=GetDC(hwnd);if(src==IntPtr.Zero){g.ReleaseHdc(dest);return false;}
   try{return BitBlt(dest,dx,dy,part.Width,part.Height,src,part.X,part.Y,0x00CC0020);}finally{ReleaseDC(hwnd,src);g.ReleaseHdc(dest);}}
 }
 static bool BlankPart(Bitmap image,Rectangle r){
  if(r.Width<4||r.Height<4)return true;int lo=255,hi=0;
  var d=image.LockBits(r,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{var row=new byte[r.Width*4];for(int y=0;y<r.Height;y+=Math.Max(1,r.Height/12)){Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),row,0,r.Width*4);for(int x=0;x<r.Width;x+=Math.Max(1,r.Width/24)){int i=x*4,l=(row[i]+row[i+1]+row[i+2])/3;if(l<lo)lo=l;if(l>hi)hi=l;}}}
  finally{image.UnlockBits(d);}
  return hi-lo<6;
 }
 // +1: the window is in front and the screen over its client area shows a non-blank picture that differs from the
 // blank one BitBlt gave on most sampled points (BitBlt cannot see it). -1: the screen is blank or matches (the game
 // really shows a plain screen). 0: cannot tell (not in front, screen unreadable). Reading the screen never makes the
 // game repaint. MeguLit's own subtitles cover a small part only, so they do not reach "most points".
 static int BlindVote(IntPtr hwnd,Bitmap blank){
  IntPtr front=GetForegroundWindow();if(front==IntPtr.Zero||GetAncestor(front,2)!=GetAncestor(hwnd,2))return 0;
  try{using(var screen=new Bitmap(blank.Width,blank.Height,PixelFormat.Format32bppArgb)){
   if(!ScreenInto(hwnd,screen))return -1;int w=blank.Width,h=blank.Height,n=0,diff=0;
   var a=blank.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   try{var b=screen.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
    try{var ra=new byte[w*4];var rb=new byte[w*4];for(int y=h/16;y<h;y+=Math.Max(1,h/16)){Marshal.Copy(IntPtr.Add(a.Scan0,y*a.Stride),ra,0,w*4);Marshal.Copy(IntPtr.Add(b.Scan0,y*b.Stride),rb,0,w*4);
      for(int x=w/16;x<w;x+=Math.Max(1,w/16)){int i=x*4;n++;if(Math.Abs(ra[i]-rb[i])+Math.Abs(ra[i+1]-rb[i+1])+Math.Abs(ra[i+2]-rb[i+2])>72)diff++;}}}
    finally{screen.UnlockBits(b);}}finally{blank.UnlockBits(a);}
   return n>0&&diff*10>=n*6?1:-1;}}catch{return 0;}
 }
 // +1: the game is in front and, while BitBlt kept the same picture, the screen over its client area moved on a quarter of the
 // sampled points since the last check, or differs from that picture on most of them. -1: the screen shows the picture
 // BitBlt gives (a still scene). 0: cannot tell. Points under MeguLit's own windows (OwnParts: the reader's text, a word
 // card) are left out; with most of them covered there is no vote. A window not drawn at its monitor's DPI (a DPI-unaware
 // game under display scaling) is stretched on screen while BitBlt gives its unscaled picture, so it gets no vote either.
 static int FreezeVote(IntPtr hwnd,Bitmap picture,Choice c){
  IntPtr front=GetForegroundWindow();if(front==IntPtr.Zero||GetAncestor(front,2)!=GetAncestor(hwnd,2)||!SameScale(hwnd))return 0;
  try{using(var screen=new Bitmap(picture.Width,picture.Height,PixelFormat.Format32bppArgb)){
   if(!ScreenInto(hwnd,screen))return 0;int[] now=Samples(screen);var own=OwnParts;Cover(now,own==null?null:own(hwnd,picture.Width,picture.Height),picture.Width,picture.Height);
   int[] before;lock(Gate){before=c.Screen;c.Screen=now;}
   return Judge(now,Samples(picture),before);}}catch{return 0;}
 }
 static bool SameScale(IntPtr hwnd){try{uint x,y,w=GetDpiForWindow(hwnd);return w!=0&&GetDpiForMonitor(MonitorFromWindow(hwnd,2),0,out x,out y)==0&&x==w;}catch{return false;}}
 static int Judge(int[] now,int[] pic,int[] before){
  double differs=Apart(now,pic),moved=before==null?0:Apart(now,before);if(differs<0)return 0;
  return differs<.05?-1:differs>=.6||moved>=.25?1:0;
 }
 // sampled points under MeguLit's own windows become -1 (left out by Apart)
 static void Cover(int[] samples,List<Rectangle> parts,int w,int h){if(parts==null||parts.Count==0)return;int k=0;
  for(int j=1;j<=15;j++)for(int i=1;i<=15;i++,k++){int x=i*w/16,y=j*h/16;foreach(var p in parts)if(p.Contains(x,y)){samples[k]=-1;break;}}}
 static int[] Samples(Bitmap image){int w=image.Width,h=image.Height,k=0;var r=new int[15*15];
  var d=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{var row=new byte[w*4];for(int j=1;j<=15;j++){Marshal.Copy(IntPtr.Add(d.Scan0,(j*h/16)*d.Stride),row,0,w*4);for(int i=1;i<=15;i++){int x=(i*w/16)*4;r[k++]=row[x]|row[x+1]<<8|row[x+2]<<16;}}}
  finally{image.UnlockBits(d);}
  return r;
 }
 // Share of sampled points whose colour differs by more than 72 (sum over R, G, B), as BlindVote counts them; points left out
 // (-1) on either side are not counted, and with fewer than half of them left it is -1 (cannot tell).
 static double Apart(int[] a,int[] b){int n=0,open=0;for(int i=0;i<a.Length;i++){if(a[i]<0||b[i]<0)continue;open++;if(Math.Abs((a[i]&255)-(b[i]&255))+Math.Abs((a[i]>>8&255)-(b[i]>>8&255))+Math.Abs((a[i]>>16&255)-(b[i]>>16&255))>72)n++;}return open*2<a.Length?-1:n/(double)open;}
 // Calibration only: after the renderer acknowledges its reader/menu are hidden, prefer what the user actually sees.
 public static bool ScreenInto(IntPtr hwnd,Bitmap image){
  if(Busy(hwnd))return false;
  var origin=new Pt();if(!ClientToScreen(hwnd,ref origin))return false;IntPtr screen=GetDC(IntPtr.Zero);if(screen==IntPtr.Zero)return false;
  try{using(var g=Graphics.FromImage(image)){IntPtr dc=g.GetHdc();try{if(!BitBlt(dc,0,0,image.Width,image.Height,screen,origin.X,origin.Y,0x00CC0020))return false;}finally{g.ReleaseHdc(dc);}}}finally{ReleaseDC(IntPtr.Zero,screen);}
  return !Blank(image);
 }
 static bool Blt(IntPtr hwnd,Bitmap image){
  using(var g=Graphics.FromImage(image)){IntPtr dest=g.GetHdc(),src=GetDC(hwnd);if(src==IntPtr.Zero){g.ReleaseHdc(dest);return false;}
   try{return BitBlt(dest,0,0,image.Width,image.Height,src,0,0,0x00CC0020);}finally{ReleaseDC(hwnd,src);g.ReleaseHdc(dest);}}
 }
 // A frozen window is printed once every PrintGapMs for all readers together, so most readers are skipped most of the time.
 // Its last printed picture is kept for Recent (the scene probe needs every one of them, not one in several).
 // A window dropped meanwhile (Drop, or another window took its place) or moved to a new round / unfrozen keeps no print.
 static void Keep(IntPtr hwnd,Choice c,int round,Bitmap image){lock(Gate){Choice cur;if(!Choices.TryGetValue(hwnd,out cur)||cur!=c||!c.Frozen||c.Round!=round)return;if(c.Last==null||c.Last.Width!=image.Width||c.Last.Height!=image.Height){if(c.Last!=null)c.Last.Dispose();c.Last=new Bitmap(image.Width,image.Height,PixelFormat.Format32bppArgb);}
  using(var g=Graphics.FromImage(c.Last)){g.CompositingMode=System.Drawing.Drawing2D.CompositingMode.SourceCopy;g.DrawImage(image,0,0,image.Width,image.Height);}c.LastAt=DateTime.UtcNow;}}
 // Copies a frozen window's last print into image when it is at most KeptMs old (Picture).
 static bool Kept(Choice c,Bitmap image,DateTime now){
  lock(Gate){if(!c.Frozen||c.Last==null||(now-c.LastAt).TotalMilliseconds>KeptMs||c.Last.Width!=image.Width||c.Last.Height!=image.Height)return false;
   using(var g=Graphics.FromImage(image)){g.CompositingMode=System.Drawing.Drawing2D.CompositingMode.SourceCopy;g.DrawImage(c.Last,0,0,image.Width,image.Height);}return true;}
 }
 // Copies a frozen window's last printed picture into image when it is newer than after (then moved to its time).
 public static bool Recent(IntPtr hwnd,Bitmap image,ref DateTime after){
  lock(Gate){Choice c;if(!Choices.TryGetValue(hwnd,out c)||!c.Frozen||c.Last==null||c.LastAt<=after||c.Last.Width!=image.Width||c.Last.Height!=image.Height)return false;
   using(var g=Graphics.FromImage(image)){g.CompositingMode=System.Drawing.Drawing2D.CompositingMode.SourceCopy;g.DrawImage(c.Last,0,0,image.Width,image.Height);}after=c.LastAt;return true;}
 }
 // True when this BitBlt picture (signature sig) is a frozen one that must not be used; otherwise it proves the window (in the
 // same lock, so a reader can never mark proven a window another reader has just found frozen). vote: FreezeVote.
 static bool Stale(Choice c,int sig,DateTime now,Func<int> vote){
  int round;
  lock(Gate){
   if(!c.HasSig||sig!=c.Sig){c.HasSig=true;c.Sig=sig;c.Round++;c.SigAt=now;c.Frozen=false;c.FrozenVotes=0;c.VoteAfter=DateTime.MinValue;c.Screen=null;Release(c);Prove(c,now);return false;}
   if(c.Frozen)return true;
   if((now-c.SigAt).TotalMilliseconds<FreezeMs||now<c.VoteAfter){Prove(c,now);return false;}
   c.VoteAfter=now.AddMilliseconds(FreezeVoteGapMs);round=c.Round;
  }
  int v=vote();
  lock(Gate){
   /* another reader saw a new picture meanwhile (even if the old one is back now): this vote was about the old round */
   /* the reader that started the new round has proven it; frozen again only when this vote took longer than a whole round */
   if(c.Round!=round){c.Screen=null;return c.Frozen;}
   if(v>0){if(++c.FrozenVotes>=3){c.Frozen=true;c.Proven=false;return true;}}else if(v<0){c.FrozenVotes=0;c.VoteAfter=now.AddMilliseconds(FreezeIdleMs);}
   else c.VoteAfter=now.AddMilliseconds(FreezeUnsureMs);
   Prove(c,now);
  }
  return false;
 }
 static void Prove(Choice c,DateTime at){c.Proven=true;c.Blind=false;c.Votes=0;c.ProvenAt=at;}
 // Any change of the picture changes this (about 6000 sampled pixels).
 static int Signature(Bitmap image){
  int w=image.Width,h=image.Height;unchecked{int s=(int)2166136261;
   var d=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   try{var row=new byte[w*4];for(int y=0;y<h;y+=Math.Max(1,h/64)){Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),row,0,w*4);for(int x=0;x<w;x+=Math.Max(1,w/96)){int i=x*4;s=(s^(row[i]|row[i+1]<<8|row[i+2]<<16))*16777619;}}}
   finally{image.UnlockBits(d);}
   return s;}
 }
 // A picture that stays the same while the screen differs becomes Frozen after three checks; a change clears it; a still
 // scene the screen agrees with is not checked again for FreezeIdleMs.
 public static bool FreezeSelfTest(){
  var c=new Choice{Proven=true};var t=new DateTime(2026,1,1);int asked=0;Func<int> differs=()=>{asked++;return 1;},agrees=()=>{asked++;return -1;};
  if(Stale(c,1,t,differs)||Stale(c,1,t.AddMilliseconds(1000),differs)||asked!=0)return false;
  if(Stale(c,1,t.AddMilliseconds(3100),differs)||Stale(c,1,t.AddMilliseconds(3300),differs)||asked!=1)return false;
  if(Stale(c,1,t.AddMilliseconds(3700),differs)||!Stale(c,1,t.AddMilliseconds(4300),differs)||asked!=3)return false;
  if(!Stale(c,1,t.AddMilliseconds(4400),differs)||asked!=3||c.Proven)return false;
  if(Stale(c,2,t.AddMilliseconds(4500),differs)||c.Frozen)return false;
  asked=0;var still=new Choice();Stale(still,7,t,agrees);
  if(Stale(still,7,t.AddMilliseconds(3100),agrees)||asked!=1||Stale(still,7,t.AddMilliseconds(7000),agrees)||asked!=1)return false;
  if(Stale(still,7,t.AddMilliseconds(8200),agrees)||asked!=2||still.Frozen)return false;
  // a check that cannot tell waits FreezeUnsureMs
  asked=0;var unsure=new Choice();Func<int> zero=()=>{asked++;return 0;};Stale(unsure,5,t,zero);Stale(unsure,5,t.AddMilliseconds(3100),zero);
  if(Stale(unsure,5,t.AddMilliseconds(3700),zero)||asked!=1||Stale(unsure,5,t.AddMilliseconds(5200),zero)||asked!=2)return false;
  // a vote that comes back after another reader saw a new picture is dropped
  var raced=new Choice();Stale(raced,3,t,differs);Func<int> late=()=>{Stale(raced,4,t.AddMilliseconds(3150),differs);return 1;};
  if(Stale(raced,3,t.AddMilliseconds(3100),late)||raced.FrozenVotes!=0||raced.Sig!=4)return false;
  // ...also when the old picture is back by then (A, B, A): the vote was about the first A; the second A counts from its own start
  var back=new Choice();Stale(back,3,t,differs);Func<int> abA=()=>{Stale(back,4,t.AddMilliseconds(3150),differs);Stale(back,3,t.AddMilliseconds(3160),differs);back.Screen=new int[225];return 1;};
  if(Stale(back,3,t.AddMilliseconds(3100),abA)||back.FrozenVotes!=0||back.Screen!=null)return false;
  if(Stale(back,3,t.AddMilliseconds(6200),differs)||Stale(back,3,t.AddMilliseconds(6800),differs)||!Stale(back,3,t.AddMilliseconds(7400),differs))return false;
  // a vote so slow that a new round started and froze meanwhile: the window stays frozen and unproven
  var slow=new Choice();Stale(slow,3,t,differs);Func<int> hang=()=>{Stale(slow,4,t.AddMilliseconds(3150),differs);foreach(int ms in new[]{6200,6800,7400})Stale(slow,4,t.AddMilliseconds(ms),differs);return 1;};
  if(!Stale(slow,3,t.AddMilliseconds(3100),hang)||!slow.Frozen||slow.Proven)return false;
  // the same picture again before it is checked: proven at its own time
  var again=new Choice();Stale(again,1,t,differs);Stale(again,1,t.AddMilliseconds(1000),differs);if(again.ProvenAt!=t.AddMilliseconds(1000))return false;
  // +1, +1, -1, +1 is not frozen: a still check starts the count again
  var mixed=new Choice();Stale(mixed,9,t,differs);int[] seq={1,1,-1,1};int at9=3100;bool any=false;
  foreach(var s in seq){int r=s;any|=Stale(mixed,9,t.AddMilliseconds(at9),()=>r);at9+=s<0?5100:600;}
  if(any||mixed.Frozen||mixed.FrozenVotes!=1)return false;
  // a check that does not freeze the window proves the picture it was about
  mixed.Proven=false;if(Stale(mixed,9,t.AddMilliseconds(at9),differs)||!mixed.Proven)return false;
  // a new picture starts a new round: the screen of the last check, the kept print and the freeze are dropped, and it is proven
  var fresh=new Choice{Screen=new int[225],Frozen=true,Last=new Bitmap(4,4)};fresh.HasSig=true;fresh.Sig=1;
  if(Stale(fresh,2,t,differs)||fresh.Screen!=null||fresh.Last!=null||fresh.Frozen||!fresh.Proven)return false;
  // left-out points (MeguLit's windows) do not count; covering most of them gives no vote; a moved screen is +1, a same one -1
  int[] a=new int[225],b=new int[225];for(int i=0;i<225;i++){a[i]=0x101010;b[i]=0xF0F0F0;}
  if(Judge(a,(int[])a.Clone(),null)!=-1||Judge(a,b,null)!=1)return false;
  var half=(int[])b.Clone();for(int i=0;i<120;i++)half[i]=-1;if(Judge(half,a,null)!=0)return false;
  // a word card closed since the last check: where it was is not counted as the screen moving
  var cardOver=(int[])a.Clone();for(int i=0;i<100;i++)cardOver[i]=-1;if(Judge((int[])a.Clone(),a,cardOver)!=-1)return false;
  // the screen shows exactly the picture BitBlt gives: a still scene, even if the screen moved since the last check
  if(Judge((int[])a.Clone(),a,b)!=-1)return false;
  // Part: frozen and its print not due is skipped, due is a whole read, proven and not frozen is the part only
  var now=new DateTime(2026,1,1,0,0,10);
  if(PartRoute(new Choice{Proven=true,Frozen=true,Printed=now.AddMilliseconds(-500)},now)!=1||PartRoute(new Choice{Frozen=true,Printed=now.AddMilliseconds(-2500)},now)!=2)return false;
  if(PartRoute(new Choice{Proven=true},now)!=0||PartRoute(new Choice{Proven=true,Blind=true},now)!=2||PartRoute(new Choice(),now)!=2)return false;
  // ...and Part itself leaves such a window alone (a whole read would take a new picture of it: its signature and freeze change).
  // The desktop window stands in for the game: it can be read, and only its pixels are read.
  var desk=GetDesktopWindow();var held=new Choice{Frozen=true,Printed=DateTime.UtcNow};lock(Gate)Choices[desk]=held;
  try{using(var small=new Bitmap(16,16,PixelFormat.Format32bppArgb)){Skipped=false;
   if(Part(desk,small,new Rectangle(0,0,16,16),64,64,2)||!Skipped||!held.Frozen||held.HasSig)return false;}}
  finally{lock(Gate){Choices.Remove(desk);Release(held);}}
  // a frozen window that printed blank is skipped: never a black picture, and after a print never the screen; a blind one
  // keeps the old rules
  if(AfterPrint(true,false,true,false)!=0||AfterPrint(true,false,true,true)!=0||AfterPrint(true,true,true,false)!=1)return false;
  if(AfterPrint(true,false,false,false)!=2||AfterPrint(false,false,false,true)!=3)return false;
  // Recent gives each print once, and nothing for a window that is not frozen; Picture takes a print at most KeptMs old
  var key=new IntPtr(-77);var k=new Choice{Frozen=true};lock(Gate)Choices[key]=k;
  try{using(var p=new Bitmap(8,8,PixelFormat.Format32bppArgb))using(var q=new Bitmap(8,8,PixelFormat.Format32bppArgb)){Keep(key,k,k.Round,p);DateTime seen=DateTime.MinValue;
   if(!Recent(key,q,ref seen)||Recent(key,q,ref seen))return false;
   k.Frozen=false;seen=DateTime.MinValue;if(Recent(key,q,ref seen)||Kept(k,q,k.LastAt))return false;k.Frozen=true;
   if(!Kept(k,q,k.LastAt.AddMilliseconds(KeptMs))||Kept(k,q,k.LastAt.AddMilliseconds(KeptMs+1)))return false;
   // Drop leaves no disposed print behind, and a Keep still running for a dropped window keeps nothing
   lock(Gate)Drop();if(k.Last!=null)return false;Keep(key,k,k.Round,p);if(k.Last!=null)return false;}}
  finally{lock(Gate){Choices.Remove(key);Release(k);}}
  // a print started during frozen round A that finishes after Stale saw B (round changed) never enters B's cache
  var lateKey=new IntPtr(-78);var lk=new Choice();lock(Gate)Choices[lateKey]=lk;
  try{using(var p=new Bitmap(8,8,PixelFormat.Format32bppArgb))using(var q=new Bitmap(8,8,PixelFormat.Format32bppArgb)){
   Stale(lk,1,t,differs);foreach(int ms in new[]{3100,3700,4300})Stale(lk,1,t.AddMilliseconds(ms),differs);
   if(!lk.Frozen)return false;int roundA=lk.Round;
   if(Stale(lk,2,t.AddMilliseconds(4500),differs)||lk.Frozen)return false;
   Keep(lateKey,lk,roundA,p);
   if(lk.Last!=null)return false;
   foreach(int ms in new[]{7600,8200,8800})Stale(lk,2,t.AddMilliseconds(ms),differs);
   if(!lk.Frozen)return false;
   DateTime seen=DateTime.MinValue;if(Recent(lateKey,q,ref seen)||Kept(lk,q,DateTime.UtcNow))return false;
   // even if A's print arrives after B is already frozen again, roundA does not match B's round
   Keep(lateKey,lk,roundA,p);
   seen=DateTime.MinValue;if(lk.Last!=null||Recent(lateKey,q,ref seen)||Kept(lk,q,DateTime.UtcNow))return false;
   // an unfrozen window keeps nothing even for its current round
   if(Stale(lk,3,t.AddMilliseconds(9000),differs)||lk.Frozen)return false;
   Keep(lateKey,lk,lk.Round,p);if(lk.Last!=null)return false;}}
  finally{lock(Gate){Choices.Remove(lateKey);Release(lk);}}
  return true;
 }
 // A picture with almost no variation (all black or one colour) means BitBlt cannot see this window's content.
 static bool Blank(Bitmap image){
  int w=image.Width,h=image.Height;if(w<4||h<4)return true;int lo=255,hi=0;
  var d=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{var row=new byte[w*4];for(int y=h/16;y<h;y+=Math.Max(1,h/16)){Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),row,0,w*4);for(int x=w/16;x<w;x+=Math.Max(1,w/16)){int i=x*4,l=(row[i]+row[i+1]+row[i+2])/3;if(l<lo)lo=l;if(l>hi)hi=l;}}}
  finally{image.UnlockBits(d);}
  return hi-lo<6;
 }
}
