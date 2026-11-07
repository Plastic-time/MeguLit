// SPDX-License-Identifier: GPL-3.0-or-later
// Frosted glass behind the in-game panels (Alt+T menu, backlog, lookup card): the picture behind the panels, read live
// and handed to the page, which scales, blurs, darkens and positions it on the GPU like the home page's glass.
// The overlay spans the whole desktop and the menu can be dragged anywhere, so "behind" can be the game, the desktop or
// any other window (user, 2026-11-03), and CSS backdrop-filter cannot see other windows (E87).
//  - A Magnification API control (in a host window over the area, alpha 1/255, so invisible) renders the screen with
//    MeguLit's overlay and the host filtered out (the filter list accepts other processes' windows). DWM accent/backdrop
//    blur draws only an opaque material on the user's Windows 11 24H2 (E137).
//  - One read per frame covers every glass panel at once (the union of their boxes): each PrintWindow of a magnifier
//    waits for a DWM composition (about 8-13 ms whatever the size, E148), and three panels reading on their own made
//    the whole desktop stutter.
//  - The read is shrunk once (area averaging) and sent as a small JPEG; scaling, blur, darkening, saturation, corners,
//    opacity, drag and the open/close animation are all the page's (GPU) work. There are no glass windows any more, so
//    nothing to keep in z-order and nothing that can trail a dragged panel.
// No game file or game window is touched.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Drawing;using System.Drawing.Drawing2D;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;using System.Threading;
public sealed class GlassLayer:IDisposable{
 [StructLayout(LayoutKind.Sequential)]struct POINT{public int X,Y;public POINT(int x,int y){X=x;Y=y;}}
 [StructLayout(LayoutKind.Sequential)]struct RECT{public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)]struct Msg{public IntPtr h;public uint m;public IntPtr w,l;public uint t;public int x,y;}
 [DllImport("Magnification.dll")]static extern bool MagInitialize();
 [DllImport("Magnification.dll")]static extern bool MagUninitialize();
 [DllImport("Magnification.dll")]static extern bool MagSetWindowSource(IntPtr w,RECT r);
 [DllImport("Magnification.dll")]static extern bool MagSetWindowFilterList(IntPtr w,int mode,int count,IntPtr[] list);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowEx(uint ex,string cls,string title,uint style,int x,int y,int w,int h,IntPtr owner,IntPtr menu,IntPtr instance,IntPtr param);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string name);
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr w,IntPtr after,int x,int y,int cx,int cy,uint flags);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr w,int command);
 [DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr w);
 [DllImport("user32.dll")]static extern bool IsWindow(IntPtr w);
 [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr w,ref POINT p);
 [DllImport("user32.dll")]static extern int GetSystemMetrics(int index);
 [DllImport("user32.dll")]static extern bool SetLayeredWindowAttributes(IntPtr w,uint key,byte alpha,uint flags);
 [DllImport("user32.dll")]static extern bool InvalidateRect(IntPtr w,IntPtr r,bool erase);
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr w,IntPtr dc,uint flags);
 [DllImport("user32.dll")]static extern bool PeekMessage(out Msg m,IntPtr h,uint a,uint b,uint remove);
 [DllImport("user32.dll")]static extern bool TranslateMessage(ref Msg m);
 [DllImport("user32.dll")]static extern IntPtr DispatchMessage(ref Msg m);

 // One panel rectangle (device pixels, relative to the overlay's client area). FX..FH is the box the read must cover
 // (the page sends the full, unscaled panel plus the room its blur needs); Blur sets how small the picture may be.
 public struct Box{public int X,Y,W,H,R,Blur,Dim,Saturate,Alpha,FX,FY,FW,FH;
  public Box(int x,int y,int w,int h):this(x,y,w,h,-1){}
  public Box(int x,int y,int w,int h,int r):this(x,y,w,h,r,18,0,100){}
  public Box(int x,int y,int w,int h,int r,int blur,int dim,int saturate):this(x,y,w,h,r,blur,dim,saturate,100,x,y,w,h){}
  public Box(int x,int y,int w,int h,int r,int blur,int dim,int saturate,int alpha,int fx,int fy,int fw,int fh){X=x;Y=y;W=w;H=h;R=r;Blur=blur;Dim=dim;Saturate=saturate;Alpha=alpha;
   if(fw>=w&&fh>=h&&fw>0&&fh>0){FX=fx;FY=fy;FW=fw;FH=fh;}else{FX=x;FY=y;FW=w;FH=h;}}}
 struct Wanted{public IntPtr Overlay;public bool Visible;public int X,Y;public List<Box> Rects;public long At;}

 readonly object Gate=new object();Wanted State;bool Stop;Thread Worker;readonly AutoResetEvent Wake=new AutoResetEvent(false);
 List<Box> Rects=new List<Box>();static readonly Stopwatch Clock=Stopwatch.StartNew();
 // Where frames go (the bridge's thread-safe Emit): {type:"glassFrame", x,y,w,h (device px, relative to the overlay's
 // client area), image (base64 JPEG)} or {type:"glassFrame", clear:true}.
 public Action<object> Emit;
 // 1 once the magnifier is up, -1 if it could not start (no frames are sent then).
 public int Kind{get;private set;}
 public int Frames{get;private set;}public string LastError{get;private set;}public string Filter{get;private set;}
 // Optional timing log, written every 3 seconds while glass shows (the bridge points it at logs\glass-timing.log).
 public string LogPath;
 public string LastReport{get;private set;}

 public GlassLayer(){State.Rects=new List<Box>();}
 // Panel rectangles; thread-safe (the bridge calls it straight from its input thread).
 public void Set(List<Box> rects,int radius){lock(Gate){Rects=rects??new List<Box>();State.Rects=Rects;State.At=Clock.ElapsedTicks;}Start();Wake.Set();}
 // The magnifier takes about a second to start: begin when the page first reports (it does on load), not on first open.
 void Start(){lock(Gate){if(Worker!=null)return;Worker=new Thread(Run);Worker.IsBackground=true;Worker.Name="MeguLit glass";Worker.Priority=ThreadPriority.BelowNormal;Worker.Start();}}
 // Called every bridge tick: where the overlay is and whether glass may be read at all.
 public void Follow(IntPtr overlay,bool visible){POINT o=new POINT();bool ok;lock(Gate)ok=overlay!=IntPtr.Zero&&visible&&Rects.Count>0;ok=ok&&ClientToScreen(overlay,ref o);bool changed;
  lock(Gate){changed=State.Overlay!=overlay||State.Visible!=ok||State.X!=o.X||State.Y!=o.Y;State.Overlay=overlay;State.Visible=ok;State.X=o.X;State.Y=o.Y;}
  if(ok)Start();if(changed)Wake.Set();}
 public void Hide(){lock(Gate)State.Visible=false;Wake.Set();}
 public void Clear(){lock(Gate){Rects=new List<Box>();State.Rects=Rects;State.Visible=false;}Wake.Set();}
 public void Dispose(){lock(Gate)Stop=true;Wake.Set();var w=Worker;if(w!=null)w.Join(1000);}

 static double Ms(long ticks){return ticks*1000.0/Stopwatch.Frequency;}
 // Reads at most every ReadMs, and keeps the thread near BusyShare of a core by the measured cost of a read.
 const double ReadMs=33,BusyShare=.5;
 IntPtr Host,Mag;int MagW,MagH,SrcX,SrcY,SrcW,SrcH,ReqX,ReqY,ReqW,ReqH,Discard,LastL=int.MinValue,LastT;bool Requested,HasFrame,Sent;long ReqAt,ReadAt,MoveAt,Sum;double Cost=12;
 Bitmap Shot,Small;IntPtr FilterOverlay;long FilterAt;

 void Run(){
  if(!MagInitialize()){Kind=-1;return;}Kind=1;
  try{
   while(true){
    Wanted s;bool stop;lock(Gate){s=State;stop=Stop;}if(stop)break;
    Msg m;while(PeekMessage(out m,IntPtr.Zero,0,0,1)){TranslateMessage(ref m);DispatchMessage(ref m);}
    int count=s.Visible&&s.Overlay!=IntPtr.Zero&&IsWindow(s.Overlay)?s.Rects.Count:0;double wait=250;
    if(count==0)Idle();
    else{try{wait=Step(s);Frames++;}catch(Exception e){LastError=e.GetType().Name+": "+e.Message;wait=100;}Report();}
    Wake.WaitOne((int)Math.Ceiling(Math.Max(1,wait)));}
  }finally{Idle();if(Host!=IntPtr.Zero)DestroyWindow(Host);Host=Mag=IntPtr.Zero;if(Shot!=null)Shot.Dispose();if(Small!=null)Small.Dispose();MagUninitialize();}}

 // No glass panel open: hide the host, forget the picture and tell the page once.
 void Idle(){if(Host!=IntPtr.Zero&&SrcW>0)ShowWindow(Host,0);SrcW=0;Requested=false;HasFrame=false;LastL=int.MinValue;
  if(Sent){Sent=false;Send(new{type="glassFrame",clear=true});}}

 // One pass: read the frame requested last time if it is ready, otherwise request one when due. Returns the wait.
 double Step(Wanted s){
  // The area every glass panel needs (page-provided boxes already include the blur's room), on screen.
  int l=int.MaxValue,t=int.MaxValue,r=int.MinValue,b=int.MinValue,blur=60;
  foreach(var x in s.Rects){l=Math.Min(l,s.X+x.FX);t=Math.Min(t,s.Y+x.FY);r=Math.Max(r,s.X+x.FX+x.FW);b=Math.Max(b,s.Y+x.FY+x.FH);blur=Math.Min(blur,Math.Max(0,x.Blur));}
  int vx=GetSystemMetrics(76),vy=GetSystemMetrics(77),vr=vx+GetSystemMetrics(78),vb=vy+GetSystemMetrics(79);
  l=Math.Max(vx,l);t=Math.Max(vy,t);r=Math.Min(vr,r);b=Math.Min(vb,b);if(r-l<2||b-t<2)return 100;
  long now=Clock.ElapsedTicks;if(l!=LastL||t!=LastT){MoveAt=now;LastL=l;LastT=t;}bool moving=Ms(now-MoveAt)<300;
  if(Host==IntPtr.Zero){
   Host=CreateWindowEx(0x08080080|0x20,"STATIC","MeguLit glass source",0x80000000,0,0,1,1,IntPtr.Zero,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);if(Host==IntPtr.Zero)return 1000;
   SetLayeredWindowAttributes(Host,0,1,2);
   Mag=CreateWindowEx(0,"Magnifier","MeguLit glass magnifier",0x40000000|0x10000000,0,0,1,1,Host,IntPtr.Zero,GetModuleHandle(null),IntPtr.Zero);if(Mag==IntPtr.Zero)return 1000;}
  // The magnifier must leave out MeguLit's overlay and its own host. Set again every second and after the host first shows
  // (a window only drops out once it has been composed).
  if(FilterOverlay!=s.Overlay||Ms(now-FilterAt)>1000){if(MagSetWindowFilterList(Mag,0,2,new[]{s.Overlay,Host})){FilterOverlay=s.Overlay;FilterAt=now;Filter="True:2";}else Filter="False";}
  if(Requested){
   if(Ms(now-ReqAt)<14)return 14-Ms(now-ReqAt);
   var t0=Clock.ElapsedTicks;Capture();Requested=false;ReadAt=Clock.ElapsedTicks;bool valid=Discard==0;if(Discard>0)Discard--;
   if(valid)Process(s,blur);else T.Dropped++;
   double cost=Ms(Clock.ElapsedTicks-t0);Cost=Cost*.8+cost*.2;T.Busy+=Clock.ElapsedTicks-t0;
   if(!valid)Request(l,t,r,b,moving);
   return valid?Math.Max(1,Gap()-Ms(Clock.ElapsedTicks-ReqAt)):14;}
  // The cadence counts from the previous request, not from the end of its processing (that halved the rate: 16/s).
  double since=Ms(now-ReqAt);if(HasFrame&&since<Gap()&&Covers(l,t,r,b))return Gap()-since;
  Request(l,t,r,b,moving);return 14;}
 // A picture that stopped changing (a still scene) is checked about 10 times a second instead of 30.
 double Gap(){return Math.Max(Unchanged>15?100:ReadMs,Cost/BusyShare);}int Unchanged;

 bool Covers(int l,int t,int r,int b){return SrcW>0&&l>=SrcX&&t>=SrcY&&r<=SrcX+SrcW&&b<=SrcY+SrcH;}
 void Request(int l,int t,int r,int b,bool moving){
  // Keep the source area while it covers every panel (moving it costs a dropped read: the first read after a move can
  // still hold the old area, E140); while dragging, read a margin around the panels so they stay inside for a while.
  if(!Covers(l,t,r,b)){int m=moving?120:8;
   int vx=GetSystemMetrics(76),vy=GetSystemMetrics(77),vr=vx+GetSystemMetrics(78),vb=vy+GetSystemMetrics(79);
   int nl=Math.Max(vx,l-m),nt=Math.Max(vy,t-m),nr=Math.Min(vr,r+m),nb=Math.Min(vb,b+m),cw=nr-nl,ch=nb-nt;
   // The host must stay on screen and uncovered (a covered or off-screen magnifier stops refreshing): a click-through,
   // nearly invisible (alpha 1/255) topmost window over the area.
   if(cw!=MagW||ch!=MagH){SetWindowPos(Mag,IntPtr.Zero,0,0,cw,ch,0x0004|0x0010);MagW=cw;MagH=ch;}
   SetWindowPos(Host,new IntPtr(-1),nl,nt,cw,ch,0x0010|0x0040);MagSetWindowSource(Mag,new RECT{L=nl,T=nt,R=nr,B=nb});
   SrcX=nl;SrcY=nt;SrcW=cw;SrcH=ch;Discard=HasFrame?1:0;}
  else if(!moving&&(SrcW>r-l+40||SrcH>b-t+40)){SrcW=0;Request(l,t,r,b,false);return;}
  InvalidateRect(Mag,IntPtr.Zero,true);ReqX=SrcX;ReqY=SrcY;ReqW=SrcW;ReqH=SrcH;Requested=true;ReqAt=Clock.ElapsedTicks;}

 void Capture(){if(ReqW<1||ReqH<1)return;
  if(Shot==null||Shot.Width!=ReqW||Shot.Height!=ReqH){if(Shot!=null)Shot.Dispose();Shot=new Bitmap(ReqW,ReqH,PixelFormat.Format32bppRgb);}
  var tc=Clock.ElapsedTicks;using(var g=Graphics.FromImage(Shot)){IntPtr dc=g.GetHdc();try{PrintWindow(Mag,dc,2);}finally{g.ReleaseHdc(dc);}}T.Capture+=Clock.ElapsedTicks-tc;T.Reads++;}

 // Shrinks the read (the page's blur hides the lost detail; a small blur keeps more of it) and sends it as JPEG.
 static readonly ImageCodecInfo Jpeg=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.FormatID==ImageFormat.Jpeg.Guid);
 void Process(Wanted s,int blur){
  if(Shot==null||Shot.Width!=ReqW||Shot.Height!=ReqH)return;var t0=Clock.ElapsedTicks;
  int f=Math.Max(2,Math.Min(8,blur/3+1)),sw=Math.Max(1,ReqW/f),sh=Math.Max(1,ReqH/f);
  if(Small==null||Small.Width!=sw||Small.Height!=sh){if(Small!=null)Small.Dispose();Small=new Bitmap(sw,sh,PixelFormat.Format32bppRgb);}
  using(var g=Graphics.FromImage(Small)){g.InterpolationMode=InterpolationMode.HighQualityBilinear;g.PixelOffsetMode=PixelOffsetMode.Half;g.DrawImage(Shot,new Rectangle(0,0,sw,sh),0,0,ReqW,ReqH,GraphicsUnit.Pixel);}
  long sum=Checksum(Small)^((long)ReqX*7919+ReqY*104729L+(long)ReqW*31+ReqH);T.Shrink+=Clock.ElapsedTicks-t0;
  // A still picture is not sent again.
  if(HasFrame&&sum==Sum){Unchanged++;return;}Unchanged=0;
  var t1=Clock.ElapsedTicks;string image;
  using(var ms=new MemoryStream())using(var p=new EncoderParameters(1)){p.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,80L);Small.Save(ms,Jpeg,p);image=Convert.ToBase64String(ms.ToArray());}
  Send(new{type="glassFrame",x=ReqX-s.X,y=ReqY-s.Y,w=ReqW,h=ReqH,image=image});Sent=true;
  T.Encode+=Clock.ElapsedTicks-t1;T.Sent++;T.Bytes+=image.Length;HasFrame=true;Sum=sum;}

 static long Checksum(Bitmap b){var d=b.LockBits(new Rectangle(0,0,b.Width,b.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppRgb);
  try{int n=d.Stride*b.Height/4;var px=new int[n];Marshal.Copy(d.Scan0,px,0,n);long sum=17;for(int i=0;i<n;i++)sum=sum*1000003+(px[i]&0xffffff);return sum;}finally{b.UnlockBits(d);}}
 void Send(object value){var e=Emit;if(e!=null)try{e(value);}catch{}}

 // ---- timing: where the time goes, written every 3 s while glass shows ----
 struct Timing{public long Capture,Shrink,Encode,Busy,Bytes;public int Reads,Sent,Dropped;}
 Timing T;long ReportAt;
 void Report(){long now=Clock.ElapsedTicks;if(ReportAt==0){ReportAt=now;return;}double span=Ms(now-ReportAt);if(span<3000)return;
  var t=T;T=new Timing();ReportAt=now;
  string line=DateTime.Now.ToString("HH:mm:ss")+" feed panels="+Rects.Count+" reads/s="+(t.Reads*1000/span).ToString("0.0")+" sent/s="+(t.Sent*1000/span).ToString("0.0")+" dropped/s="+(t.Dropped*1000/span).ToString("0.0")
   +" ms: capture="+Avg(t.Capture,t.Reads)+" shrink="+Avg(t.Shrink,t.Reads-t.Dropped)+" jpeg="+Avg(t.Encode,t.Sent)+" thread%="+(Ms(t.Busy)*100/span).ToString("0")
   +" KB/s="+(t.Bytes/1024.0*1000/span).ToString("0")+" area="+SrcW+"x"+SrcH+" every "+Gap().ToString("0")+"ms";
  LastReport=line;string path=LogPath;if(path==null)return;
  try{var fi=new FileInfo(path);if(fi.Exists&&fi.Length>512*1024)File.Delete(path);File.AppendAllText(path,line+Environment.NewLine);}catch{}}
 static string Avg(long ticks,int n){return n>0?(Ms(ticks)/n).ToString("0.0"):"-";}
}
