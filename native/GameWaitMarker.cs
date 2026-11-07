// SPDX-License-Identifier: GPL-3.0-or-later
// One current, confirmed wait marker. No position file and no accumulation of rectangles.
// Detection looks for a small downward-pointing triangle in the scan area in two forms:
//  dark  – a dark filled ▼ with a light rim (the original detector)
//  light – a light ▼ or a light outlined ▼ (its rim or body is the bright part); on dark dialogue boxes and black
//          scenes a dark ▼ merges with the background, so only this form can be found there.
// C# 5 only (the .NET Framework csc that ships with Windows): no interpolated strings, no ?. and no out var.
using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;
public sealed class GameWaitMarker:IDisposable{
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 readonly Action<object> Emit;readonly NativeMaskLayer Cover=new NativeMaskLayer();
 bool AnimatedTarget;bool Enabled=true,Relocate=true;double X=2,Y=60,W=96,H=38;IntPtr Target;int Width,Height;
 Rectangle Pending=Rectangle.Empty,Current=Rectangle.Empty;int Confirmed;DateTime LastSeen,Next;
 long FrameId;bool FrameShown;DateTime NextFrame;string FrameSource="";
 public int ScreenX,ScreenY;public bool PresenceWanted;bool? Present;int SeenStreak,MissStreak;
 // Set while the reading layer is auto-hidden (no dialogue): keep reporting presence so the layer can come back when
 // the dialogue box (and its marker) returns, but put no patch on the game.
 public bool ProbeOnly;
 // Diagnostics: a short status line when the state changes, and an occasional copy of the scan area in logs\.
 string LastStatus="";DateTime LastStatusAt=DateTime.MinValue,LastFoundAt=DateTime.MinValue,LastDumpAt=DateTime.MinValue,BoundAt=DateTime.MinValue;
 public GameWaitMarker(Action<object> emit){Emit=emit;}
 static double N(Dictionary<string,object>d,string k,double fallback){object v;double n;return d.TryGetValue(k,out v)&&Double.TryParse(Convert.ToString(v,System.Globalization.CultureInfo.InvariantCulture),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out n)?n:fallback;}
 public void Configure(Dictionary<string,object>d){object v;bool enabled=!d.TryGetValue("hideWaitMarker",out v)||!(v is bool)||(bool)v;
  bool relocate=!d.TryGetValue("relocateWaitMarker",out v)||!(v is bool)||(bool)v;
  double x=N(d,"scanX",2),y=N(d,"scanY",60),w=N(d,"scanWidth",96),h=N(d,"scanHeight",38);
  if(enabled!=Enabled||relocate!=Relocate||x!=X||y!=Y||w!=W||h!=H){Hide();Enabled=enabled;Relocate=relocate;X=x;Y=y;W=w;H=h;}
 }
 // A new line only drops the moved copy (it belongs to the old line). The cover and the detection history stay: with
 // the original hidden the marker comes back at the same spot, so it stays covered instead of being found again.
 public void SetSource(string text){text=text??"";if(text==FrameSource)return;FrameSource=text;ClearFrame();if(!Current.IsEmpty)LastSeen=DateTime.UtcNow;LineAt=DateTime.UtcNow;}
 // Spots where the marker was already confirmed in this window (with the original hidden it reappears at a few fixed
 // places: after an empty line, after a name line): a shape there is covered at once instead of after two scans.
 readonly List<Rectangle> Known=new List<Rectangle>();DateTime LineAt=DateTime.MinValue;
 bool KnownSpot(Rectangle r){foreach(var k in Known)if(Near(k,r))return true;return false;}
 // Set once this line's marker has been moved: a frame that cannot be cut out cleanly (blink, busy art) keeps the
 // original covered without sending anything, so it never shows in both places and the page copy still blinks.
 string LastPng;int LastW,LastH;
 // Last good cut-out for the draw hook (kept across lines: once hooked, the game no longer shows the marker to capture).
 string HookPng;int HookW,HookH;DateTime HookDrawnAt=DateTime.MinValue;Rectangle Targeted;
 public void HookDrawn(){HookDrawnAt=DateTime.UtcNow;}
 // The game's own picture of the marker spot taken while the marker was blinked off.
 Bitmap Clean;Rectangle CleanBounds;DateTime CleanAt=DateTime.MinValue;
 // Blinked-off pictures of earlier spots, with the pixels just around them: reused at once while that surrounding
 // ring still matches (same background), so a known spot is covered with the real picture before the next blink.
 sealed class Saved{public Bitmap Picture;public byte[] Ring;}
 Rectangle SpotBounds;DateTime SpotSince;
 readonly Dictionary<Rectangle,Saved> SavedClean=new Dictionary<Rectangle,Saved>();
 static byte[] RingOf(Bitmap image,Rectangle r){var o=Rectangle.Inflate(r,3,3);o.Intersect(new Rectangle(0,0,image.Width,image.Height));if(o.Width<=r.Width||o.Height<=r.Height)return null;var bytes=new List<byte>();
  for(int x=o.Left;x<o.Right;x+=2){foreach(int y in new[]{o.Top,o.Bottom-1}){var c=image.GetPixel(x,y);bytes.Add(c.R);bytes.Add(c.G);bytes.Add(c.B);}}
  for(int y=o.Top;y<o.Bottom;y+=2){foreach(int x in new[]{o.Left,o.Right-1}){var c=image.GetPixel(x,y);bytes.Add(c.R);bytes.Add(c.G);bytes.Add(c.B);}}return bytes.ToArray();}
 static bool SameRing(byte[] a,byte[] b){if(a==null||b==null||a.Length!=b.Length||a.Length==0)return false;long sum=0;for(int i=0;i<a.Length;i++)sum+=Math.Abs(a[i]-b[i]);return sum/(double)a.Length<6;}
 // Solid pixels of the last cut-out (same box): where the marker's own ink sits and its colour there.
 byte[] InkPixels;Rectangle InkBounds;
 void RememberInk(Bitmap sprite,Rectangle bounds){InkPixels=Bytes(sprite);InkBounds=bounds;}
 // The marker is blinked off right now: at almost none of its solid ink pixels does the picture still have its colour.
 bool Bare(Bitmap image,Rectangle bounds){
  if(InkPixels==null||InkBounds!=bounds)return false;byte[] p;using(var crop=image.Clone(bounds,PixelFormat.Format32bppArgb))p=Bytes(crop);if(p.Length!=InkPixels.Length)return false;
  int ink=0,same=0;for(int i=0;i<p.Length;i+=4){if(InkPixels[i+3]<250)continue;ink++;if(Math.Abs(p[i]-InkPixels[i])+Math.Abs(p[i+1]-InkPixels[i+1])+Math.Abs(p[i+2]-InkPixels[i+2])<60)same++;}
  return ink>=8&&same<=ink/20;
 }
 void ClearFrame(){LastPng=null;if(!FrameShown)return;FrameShown=false;Emit(new{type="waitMarkerFrame",id=++FrameId,clear=true});}
 public void Hide(){ClearFrame();Cover.Hide();Pending=Current=Rectangle.Empty;Confirmed=0;Present=null;SeenStreak=MissStreak=0;PrevLum=null;Spots.Clear();}
 static bool Near(Rectangle a,Rectangle b){return !a.IsEmpty&&!b.IsEmpty&&Math.Abs((a.X+a.Width/2)-(b.X+b.Width/2))<=6&&Math.Abs((a.Y+a.Height/2)-(b.Y+b.Height/2))<=9&&Math.Abs(a.Width-b.Width)<=6&&Math.Abs(a.Height-b.Height)<=6;}
 void Status(string text){
  if(text==LastStatus&&(DateTime.UtcNow-LastStatusAt).TotalSeconds<30)return;
  if(text!=LastStatus||(DateTime.UtcNow-LastStatusAt).TotalSeconds>=30){LastStatus=text;LastStatusAt=DateTime.UtcNow;try{Emit(new{type="markerDebug",markerDebug=text});}catch{}}
 }
 // Off by default; create logs\marker-scan.on to save the scan area again while tuning detection.
 void Dump(Bitmap region,string reason){
  if((DateTime.UtcNow-LastDumpAt).TotalSeconds<60)return;LastDumpAt=DateTime.UtcNow;
  try{string folder=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","logs"));if(!File.Exists(Path.Combine(folder,"marker-scan.on")))return;region.Save(Path.Combine(folder,"marker-scan.png"),ImageFormat.Png);File.WriteAllText(Path.Combine(folder,"marker-scan.txt"),DateTime.Now.ToString("s")+" "+reason+" region="+region.Width+"x"+region.Height+"\r\n");}catch{}
 }
 // With logs\marker-scan.on: every 3 s, how many cut-outs worked and the last good one, for tuning relocation.
 int ExtractOk,ExtractFail;DateTime LastTraceAt;
 void Trace(Bitmap sprite,Rectangle bounds){
  if((DateTime.UtcNow-LastTraceAt).TotalSeconds<3)return;LastTraceAt=DateTime.UtcNow;
  try{string folder=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","logs"));if(!File.Exists(Path.Combine(folder,"marker-scan.on")))return;
   if(sprite!=null)sprite.Save(Path.Combine(folder,"marker-ok.png"),ImageFormat.Png);
   File.AppendAllText(Path.Combine(folder,"marker-stats.txt"),DateTime.Now.ToString("s")+" at "+bounds.X+","+bounds.Y+" "+bounds.Width+"x"+bounds.Height+" ok="+ExtractOk+" fail="+ExtractFail+" last="+(sprite!=null?"ok":ExtractReason)+"\r\n");}catch{}
 }
 public void Tick(IntPtr target,int width,int height,bool visible,int surfaceX,int surfaceY){
  if(!(Enabled||Relocate||PresenceWanted)||!visible||target==IntPtr.Zero){Hide();return;}
  if(target!=Target||width!=Width||height!=Height){Hide();Target=target;Width=width;Height=height;BoundAt=DateTime.UtcNow;LastFoundAt=DateTime.MinValue;AnimatedTarget=false;Known.Clear();ClearSaved();}
  // Scan faster right after a new line, when the marker is about to appear.
  if(DateTime.UtcNow<Next)return;Next=DateTime.UtcNow.AddMilliseconds((DateTime.UtcNow-LineAt).TotalMilliseconds<1500?30:60);
  // The draw hook skips the game's own marker and reports every skipped draw: show the moved copy exactly while the
  // game would draw it (its blink), with nothing left to cover in the game. Without such reports, capture as before.
  if((Enabled||Relocate)&&HookPng!=null&&(DateTime.UtcNow-HookDrawnAt).TotalSeconds<2){
   Cover.Hide();bool drawn=(DateTime.UtcNow-HookDrawnAt).TotalMilliseconds<160;
   if(drawn&&Relocate&&!String.IsNullOrWhiteSpace(FrameSource)){if(DateTime.UtcNow>=NextFrame){NextFrame=DateTime.UtcNow.AddMilliseconds(90);FrameShown=true;Emit(new{type="waitMarkerFrame",id=++FrameId,png=HookPng,width=HookW,height=HookH,source=FrameSource});}}
   else ClearFrame();
   Status("original marker not drawn (draw hook); "+(Relocate?"moved copy follows its draws":"hidden"));return;
  }
  try{
   double mx=Math.Max(0,X-12),my=Math.Max(0,Y-6);var scan=GameTextMask.ScanRegion(width,height,mx,my,Math.Min(100-mx,W+(X-mx)+12),Math.Min(100-my,H+(Y-my)+6));
   if(scan.Width<16||scan.Height<16){ClearFrame();Cover.Hide();return;}
   using(var image=new Bitmap(width,height,PixelFormat.Format32bppArgb)){
    if(!GameCapture.Into(target,image,3)){Cover.Hide();if(GameCapture.Skipped){Status("game window moving or minimised; waiting");return;}ClearFrame();Status("capture failed");return;}
    List<Rectangle> candidates;int darkCount,lightCount;
    using(var region=image.Clone(scan,PixelFormat.Format32bppArgb)){
     var dark=Detect(region);var light=DetectLight(region);darkCount=dark.Count;lightCount=light.Count;
     var shapes=new List<Rectangle>(dark);foreach(var r in light){bool dup=false;foreach(var c in shapes)if(Rectangle.Intersect(Rectangle.Inflate(c,2,2),r).Width>0){dup=true;break;}if(!dup)shapes.Add(r);}
     // Wait markers move (blink, bounce, spin): a small spot that keeps changing in place is the marker, whatever its
     // shape (Steins;Gate's spinning gear is no triangle). A triangle that never moves (a name-plate ornament) is not
     // taken while something animated is there; it only counts as the fallback for games with a still marker.
     var moving=Animated(region);
     if(moving.Count>0){AnimatedTarget=true;candidates=new List<Rectangle>();foreach(var m in moving){Rectangle exact=m;foreach(var s in shapes)if(Rectangle.Intersect(Rectangle.Inflate(m,3,3),s).Width>0){exact=Rectangle.Union(m,s);break;}candidates.Add(exact);}LastMovingAt=DateTime.UtcNow;}
     else candidates=!AnimatedTarget&&(DateTime.UtcNow-LastMovingAt).TotalSeconds>3?shapes:new List<Rectangle>();
     if(!String.IsNullOrWhiteSpace(FrameSource)){var pages=DetectPage(region);if(pages.Count==1)candidates=pages;}
     if(candidates.Count>0)LastFoundAt=DateTime.UtcNow;
     else if((Enabled||Relocate)&&(DateTime.UtcNow-BoundAt).TotalSeconds>4&&(LastFoundAt==DateTime.MinValue||(DateTime.UtcNow-LastFoundAt).TotalSeconds>8))Dump(region,"no marker candidate");
     if(candidates.Count>3)Dump(region,candidates.Count+" candidates");
    }
    if(candidates.Count>0){SeenStreak++;MissStreak=0;}else{MissStreak++;SeenStreak=0;}
    if(PresenceWanted){if(Present!=true&&SeenStreak>=2){Present=true;Emit(new{type="markerPresence",present=true});}else if(Present!=false&&MissStreak>=6){Present=false;Emit(new{type="markerPresence",present=false});}}
    if(ProbeOnly){ClearFrame();Cover.Hide();Pending=Current=Rectangle.Empty;Confirmed=0;Status("reading layer hidden; probing");return;}
    // Relocation works on its own: with hiding off, the marker is still found, moved to MeguLit's text and covered here.
    if(!Enabled&&!Relocate){Cover.Hide();Status("hiding and relocation off; candidates dark="+darkCount+" light="+lightCount);return;}
    for(int i=0;i<candidates.Count;i++){var c=candidates[i];c.Offset(scan.X,scan.Y);candidates[i]=c;}
    // With several shapes, follow the one that is already being tracked; a new single shape starts tracking.
    Rectangle hit=Rectangle.Empty;
    foreach(var c in candidates)if(Near(Current,c)||Near(Pending,c)){hit=c;break;}
    if(hit.IsEmpty&&candidates.Count==1)hit=candidates[0];
    if(hit.IsEmpty&&candidates.Count>1){
     // Prefer the lowest-right shape (wait markers sit after the last character or in the box corner).
     Rectangle best=Rectangle.Empty;foreach(var c in candidates)if(best.IsEmpty||c.Bottom*4+c.Right>best.Bottom*4+best.Right)best=c;hit=best;
    }
    if(!hit.IsEmpty){
     if(Near(Pending,hit))Confirmed++;else{Pending=hit;Confirmed=KnownSpot(hit)?2:1;}
     if(Confirmed>=2){Current=hit;LastSeen=DateTime.UtcNow;if(!KnownSpot(hit)){Known.Add(hit);if(Known.Count>8)Known.RemoveAt(0);}
      // Tell the draw hook (when the game's renderer is supported) where the marker is; it then stops the game drawing it.
      if(!Near(Targeted,Current)){Targeted=Current;Emit(new{type="markerTarget",active=true,x=Current.X,y=Current.Y,width=Current.Width,height=Current.Height,clientWidth=Width,clientHeight=Height});}}
     // Do not keep covering an old place while a new place is being confirmed.
     else if(!Current.IsEmpty&&!Near(Current,hit)){Current=Rectangle.Empty;ClearFrame();Cover.Hide();}
    }
    // Keep only this current spot through a blink, never across a scene indefinitely.
    if(Current.IsEmpty){ClearFrame();Status(candidates.Count==0?"no marker in scan area":"confirming candidate (dark="+darkCount+" light="+lightCount+")");return;}
    // Held 2.5 s: long enough to bridge a blink and the start of the next line; the patch is cut from the current frame.
    if((DateTime.UtcNow-LastSeen).TotalMilliseconds>2500){Current=Rectangle.Empty;Cover.Hide();Status("marker gone");return;}
    var bounds=Rectangle.Inflate(Current,3,3);bounds.Intersect(new Rectangle(1,1,width-2,height-2));
    using(var patch=MakePatch(image,bounds)){
     if(patch==null){ClearFrame();Cover.Hide();Status("marker found but patch rejected");return;}
     // The two switches are independent: Relocate shows a copy at the end of MeguLit's line, Enabled covers the original
     // spot. The marker is still cut out when only covering, so the cover can use the game's own blinked-off picture.
     bool wantMove=Relocate&&!String.IsNullOrWhiteSpace(FrameSource);
     using(var sprite=wantMove||Enabled?ExtractMarker(image,bounds,patch):null){
      if(wantMove){if(sprite!=null)ExtractOk++;else ExtractFail++;Trace(sprite,bounds);}
      bool extracted=sprite!=null,moved=wantMove&&(extracted||LastPng!=null);
      if(wantMove&&extracted&&DateTime.UtcNow>=NextFrame){NextFrame=DateTime.UtcNow.AddMilliseconds(90);using(var stream=new MemoryStream()){sprite.Save(stream,ImageFormat.Png);LastPng=Convert.ToBase64String(stream.ToArray());LastW=sprite.Width;LastH=sprite.Height;HookPng=LastPng;HookW=LastW;HookH=LastH;}FrameShown=true;Emit(new{type="waitMarkerFrame",id=++FrameId,png=LastPng,width=LastW,height=LastH,source=FrameSource});}
      else if(!moved)ClearFrame();
      // While the marker blinks off, this spot shows the game's real background: keep that picture and cover with it,
      // so the covered spot looks untouched instead of an estimated (blurry) patch. Only fresh pictures are used, so a
      // changing background is followed within a blink.
      if(sprite!=null)RememberInk(sprite,bounds);
      else if(Bare(image,bounds)){if(Clean!=null)Clean.Dispose();Clean=image.Clone(bounds,PixelFormat.Format32bppArgb);CleanBounds=bounds;CleanAt=DateTime.UtcNow;
       Saved old;if(SavedClean.TryGetValue(bounds,out old))old.Picture.Dispose();if(SavedClean.Count>=8&&!SavedClean.ContainsKey(bounds)){foreach(var k in SavedClean.Keys){SavedClean[k].Picture.Dispose();SavedClean.Remove(k);break;}}
       SavedClean[bounds]=new Saved{Picture=(Bitmap)Clean.Clone(),Ring=RingOf(image,bounds)};}
      // Only the game's own picture covers the marker (no estimated, blurred patch): this blink's picture, or one saved
      // at this spot while the background around it is unchanged. Until one exists the marker is left as it is.
      Bitmap picture=Clean!=null&&CleanBounds==bounds&&(DateTime.UtcNow-CleanAt).TotalSeconds<1.5?Clean:null;bool clean=picture!=null;
      Saved saved;if(picture==null&&SavedClean.TryGetValue(bounds,out saved)&&SameRing(saved.Ring,RingOf(image,bounds))){picture=saved.Picture;clean=true;}
      // A marker that never blinks (BGI, Subahibi) never shows its spot bare: after 1.5 s at the same spot cover it with the
      // estimated patch instead of leaving the original visible for good.
      if(SpotBounds!=bounds){SpotBounds=bounds;SpotSince=DateTime.UtcNow;}bool estimated=false;
      if(picture==null&&(DateTime.UtcNow-SpotSince).TotalSeconds>=1.5){picture=patch;estimated=true;}
      if(Enabled&&picture!=null)Cover.Show(picture,ScreenX+bounds.X,ScreenY+bounds.Y,Target);else Cover.Hide();
      if(wantMove&&!moved)using(var crop=image.Clone(bounds,PixelFormat.Format32bppArgb))Dump(crop,"extract rejected at "+bounds.X+","+bounds.Y+": "+ExtractReason);
      string at=" at "+Current.X+","+Current.Y+" "+Current.Width+"x"+Current.Height;
      Status((moved?"relocating original marker":Relocate?(String.IsNullOrWhiteSpace(FrameSource)?"relocation deferred: no source line yet":"relocation deferred ("+ExtractReason+")"):"marker found")+at+(Enabled?(clean?"; covered with game picture":estimated?"; covered with estimated patch (marker does not blink)":"; waiting for a blink to capture the game picture"):"; original left visible"));
     }
    }
    // No candidate counts here: a blinking marker flips them every half second and would fill startup.log.

   }
  }catch(Exception error){Cover.Hide();Status("error: "+error.Message);}
 }
 // Coons interpolation follows a gently shaded dialogue background instead of a flat colour block.
 // A busy border (text or character art right next to the marker) falls back to the border's median colour, so the
 // marker is still hidden instead of being left visible.
 public static Bitmap MakePatch(Bitmap image,Rectangle r){
  if(r.Width<6||r.Height<6||r.Width>110||r.Height>110||r.X<1||r.Y<1||r.Right>=image.Width||r.Bottom>=image.Height)return null;
  int w=r.Width,h=r.Height,W=w+2,H=h+2;byte[] p;using(var a=image.Clone(new Rectangle(r.X-1,r.Y-1,W,H),PixelFormat.Format32bppArgb))p=Bytes(a);
  Func<int,int,int,double> at=(x,y,c)=>p[(y*W+x)*4+c];
  bool busy=false;double[] median=new double[3];
  for(int c=0;c<3;c++){var border=new List<double>();for(int x=0;x<W;x++){border.Add(at(x,0,c));border.Add(at(x,H-1,c));}for(int y=1;y<H-1;y++){border.Add(at(0,y,c));border.Add(at(W-1,y,c));}
   border.Sort();double lo=border[border.Count/20],hi=border[border.Count-1-border.Count/20];median[c]=border[border.Count/2];if(hi-lo>72)busy=true;}
  var result=new Bitmap(w,h,PixelFormat.Format32bppArgb);var data=result.LockBits(new Rectangle(0,0,w,h),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);var o=new byte[w*h*4];
  for(int j=0;j<h;j++)for(int i=0;i<w;i++){double u=(i+1.0)/(w+1),v=(j+1.0)/(h+1);for(int c=0;c<3;c++){
   double value;
   if(busy)value=median[c];
   else{double corners=(1-u)*(1-v)*at(0,0,c)+u*(1-v)*at(W-1,0,c)+(1-u)*v*at(0,H-1,c)+u*v*at(W-1,H-1,c);
    value=(1-v)*at(i+1,0,c)+v*at(i+1,H-1,c)+(1-u)*at(0,j+1,c)+u*at(W-1,j+1,c)-corners;}
   o[(j*w+i)*4+c]=(byte)Math.Max(0,Math.Min(255,Math.Round(value)));}
   int d=Math.Min(Math.Min(i,j),Math.Min(w-1-i,h-1-j));o[(j*w+i)*4+3]=(byte)(d>=2?255:(d+1)*85);
  }
  Marshal.Copy(o,0,data.Scan0,o.Length);result.UnlockBits(data);return result;
 }
 // Preserve captured game pixels and animation, with a conservative transparent background estimate.
 // Reject busy backgrounds: uncertain extraction must never move character art into the reader.
 [ThreadStatic]public static string ExtractReason;
 public static Bitmap ExtractMarker(Bitmap image,Rectangle bounds,Bitmap background){
  ExtractReason="size "+bounds.Width+"x"+bounds.Height;if(bounds.Width<6||bounds.Height<6||bounds.Width>110||bounds.Height>110)return null;
  using(var crop=image.Clone(bounds,PixelFormat.Format32bppArgb)){var raw=Bytes(crop);var bg=Bytes(background);int w=crop.Width,h=crop.Height;
   int range=0;for(int c=0;c<3;c++){int lo=255,hi=0;for(int x=0;x<w;x++){int a=raw[x*4+c],b=raw[((h-1)*w+x)*4+c];lo=Math.Min(lo,Math.Min(a,b));hi=Math.Max(hi,Math.Max(a,b));}for(int y=0;y<h;y++){int a=raw[y*w*4+c],b=raw[(y*w+w-1)*4+c];lo=Math.Min(lo,Math.Min(a,b));hi=Math.Max(hi,Math.Max(a,b));}range=Math.Max(range,hi-lo);}
   int ink=0;
   if(range>80){
    // A see-through text box over character art: the background estimate is unreliable, so only the marker's own
    // solid shape (one dark or light blob clear of the crop edge) is taken, with a soft edge from its outline pixels.
    if(!ShapeAlpha(raw,bg,w,h)){ExtractReason="busy border range="+range+", no clean shape";return null;}
    for(int i=3;i<raw.Length;i+=4)if(raw[i]>127)ink++;
   }
   else for(int i=0;i<raw.Length;i+=4){int difference=Math.Max(Math.Abs(raw[i]-bg[i]),Math.Max(Math.Abs(raw[i+1]-bg[i+1]),Math.Abs(raw[i+2]-bg[i+2])));raw[i+3]=(byte)(difference>=20?255:0);if(raw[i+3]>0)ink++;}
   if(ink<8||ink>w*h*.78){ExtractReason="ink "+ink+"/"+(w*h);return null;}
   ExtractReason="";
   var result=new Bitmap(w,h,PixelFormat.Format32bppArgb);var data=result.LockBits(new Rectangle(0,0,w,h),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);try{for(int y=0;y<h;y++)Marshal.Copy(raw,y*w*4,IntPtr.Add(data.Scan0,y*data.Stride),w*4);}finally{result.UnlockBits(data);}return result;
  }
 }
 // Sets raw's alpha to the largest dark (or else light) blob that does not touch the crop edge; its outline pixels get
 // partial alpha by how far their brightness sits between the blob and the estimated background.
 static bool ShapeAlpha(byte[] raw,byte[] bg,int w,int h){
  foreach(bool light in new[]{false,true}){
   var seen=new bool[w*h];List<int> best=null;
   for(int s=0;s<w*h;s++){if(seen[s]||!(light?Light(raw,s*4):Dark(raw,s*4)))continue;var blob=new List<int>();var queue=new Queue<int>();queue.Enqueue(s);seen[s]=true;bool edge=false;
    while(queue.Count>0){int p=queue.Dequeue(),x=p%w,y=p/w;blob.Add(p);if(x==0||y==0||x==w-1||y==h-1)edge=true;
     for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;int q=ny*w+nx;if(!seen[q]&&(light?Light(raw,q*4):Dark(raw,q*4))){seen[q]=true;queue.Enqueue(q);}}}
    if(!edge&&blob.Count>=12&&(best==null||blob.Count>best.Count))best=blob;}
   if(best==null)continue;
   var inside=new bool[w*h];double inkLum=0;foreach(int p in best){inside[p]=true;inkLum+=Lum(raw,p*4);}inkLum/=best.Count;
   for(int p=0;p<w*h;p++){byte alpha=0;
    if(inside[p])alpha=255;
    else{int x=p%w,y=p/w;bool near=false;for(int dy=-1;dy<=1&&!near;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h&&inside[ny*w+nx]){near=true;break;}}
     if(near){double back=Lum(bg,p*4),span=back-inkLum;if(Math.Abs(span)>8)alpha=(byte)Math.Max(0,Math.Min(255,Math.Round((back-Lum(raw,p*4))/span*255)));}}
    raw[p*4+3]=alpha;}
   return true;
  }
  return false;
 }
 static double Lum(byte[] p,int i){return p[i]*.11+p[i+1]*.59+p[i+2]*.30;}
 static bool Dark(byte[] p,int i){return p[i]<85&&p[i+1]<85&&p[i+2]<85;}
 static bool Light(byte[] p,int i){return p[i]+p[i+1]+p[i+2]>570;}
 public static List<Rectangle> Detect(Bitmap image){return Find(image,false);}
 public static List<Rectangle> DetectLight(Bitmap image){return Find(image,true);}
 public static List<Rectangle> DetectPage(Bitmap image){return Find(image,true,true);}
 static List<Rectangle> Find(Bitmap image,bool light,bool pageOnly=false){
  int width=image.Width,height=image.Height,limit=Math.Max(45,width*55/1280);byte[] pixels=Bytes(image);bool[] seen=new bool[width*height];var found=new List<Rectangle>();
  for(int start=0;start<seen.Length;start++){if(seen[start]||!(light?Light(pixels,start*4):Dark(pixels,start*4)))continue;var queue=new Queue<int>();var points=new List<int>();queue.Enqueue(start);seen[start]=true;int left=width,right=0,top=height,bottom=0,count=0;
   while(queue.Count>0){int p=queue.Dequeue(),x=p%width,y=p/width;left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);count++;if(points.Count<limit*limit*2)points.Add(p);for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;int q=ny*width+nx;if(!seen[q]&&(light?Light(pixels,q*4):Dark(pixels,q*4))){seen[q]=true;queue.Enqueue(q);}}}
   int w=right-left+1,h=bottom-top+1;
   // A filled ▼ covers about half its box; an outlined one (rim only) much less.
   double minFill=light?.18:.33,maxFill=.76;
   if(left<2||top<2||right>=width-2||bottom>=height-2||w<9||h<7||w>limit||h>limit||w<h*.8||w>h*1.6||count<w*h*minFill||count>w*h*maxFill)continue;
   if(pageOnly){var page=new Rectangle(left,top,w,h);if(WaitPageMarker.Matches(pixels,width,page))found.Add(page);continue;}
   int[] rowLeft=new int[h],rowRight=new int[h];for(int i=0;i<h;i++){rowLeft[i]=width;rowRight[i]=-1;}foreach(int p in points){int y=p/width-top;rowLeft[y]=Math.Min(rowLeft[y],p%width);rowRight[y]=Math.Max(rowRight[y],p%width);}bool valid=true;double a=0,b=0,drift=0,center=(left+right)/2.0;int segment=Math.Max(2,h/4),contrast=0,samples=0;
   for(int i=0;i<h;i++){if(rowRight[i]<0){valid=false;break;}int span=rowRight[i]-rowLeft[i]+1;if(i<segment)a+=span;if(i>=h-segment)b+=span;drift=Math.Max(drift,Math.Abs((rowLeft[i]+rowRight[i])/2.0-center));
    foreach(int x in new[]{rowLeft[i]-1,rowRight[i]+1}){if(x<0||x>=width)continue;int p=((top+i)*width+x)*4;samples++;int sum=pixels[p]+pixels[p+1]+pixels[p+2];if(light?sum<330:sum>540)contrast++;}}
   // The outside of the shape must contrast with it: a light rim around a dark ▼, a darker surround around a light one.
   if(valid&&a>b*1.9&&drift<Math.Max(2,w*.13)&&contrast>samples*(light?.45:.35))found.Add(new Rectangle(left,top,w,h));
  }return found;
 }

 // ── Motion: 4 px cells whose brightness changes between captures, grouped into spots and followed over time ──────
 // With logs\marker-scan.on: every 3 s, each motion spot and why it would be rejected (logs\marker-spots.txt).
 DateTime LastSpotTrace;
 void TraceSpots(DateTime now){
  if((now-LastSpotTrace).TotalSeconds<3)return;LastSpotTrace=now;
  try{string folder=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","logs"));if(!File.Exists(Path.Combine(folder,"marker-scan.on")))return;
   var lines=new List<string>{now.ToString("HH:mm:ss.fff")+" spots="+Spots.Count+" typingAgo="+(TypingAt==DateTime.MinValue?-1:(int)(now-TypingAt).TotalMilliseconds)};
   foreach(var sp in Spots)lines.Add("  "+sp.R.X+","+sp.R.Y+" "+sp.R.Width+"x"+sp.R.Height+" hits="+sp.Hits+" rev="+sp.Reversed.Count+" revFrames="+sp.ReverseFrames+" age="+(int)(now-sp.First).TotalMilliseconds+" idle="+(int)(now-sp.Last).TotalMilliseconds+" grew="+sp.Grew+" typedAfterStart="+(TypingAt>sp.First.AddMilliseconds(700)));
   File.AppendAllText(Path.Combine(folder,"marker-spots.txt"),String.Join("\r\n",lines)+"\r\n");}catch{}
 }
 sealed class Spot{public Rectangle R,Start;public int Hits,ReverseFrames;public bool Grew;public DateTime First,Last;public readonly Dictionary<int,int> Directions=new Dictionary<int,int>();public readonly HashSet<int> Reversed=new HashSet<int>();}
 byte[] PrevLum;int PrevW,PrevH;readonly List<Spot> Spots=new List<Spot>();DateTime LastMovingAt=DateTime.MinValue,TypingAt=DateTime.MinValue;
 List<Rectangle> Animated(Bitmap region){
  int w=region.Width,h=region.Height;var px=Bytes(region);var lum=new byte[w*h];for(int i=0,j=0;i<lum.Length;i++,j+=4)lum[i]=(byte)((px[j]*11+px[j+1]*59+px[j+2]*30)/100);
  var prev=PrevLum;bool same=prev!=null&&PrevW==w&&PrevH==h;PrevLum=lum;PrevW=w;PrevH=h;var result=new List<Rectangle>();if(!same){Spots.Clear();return result;}
  const int C=4;int gw=w/C,gh=h/C,changed=0;var cell=new bool[gw*gh];
  for(int cy=0;cy<gh;cy++)for(int cx=0;cx<gw;cx++){int n=0;for(int y=cy*C;y<cy*C+C;y++)for(int x=cx*C;x<cx*C+C;x++){int k=y*w+x;if(Math.Abs(lum[k]-prev[k])>28)n++;}if(n>=2){cell[cy*gw+cx]=true;changed++;}}
  var now=DateTime.UtcNow;
  // A scene change or a fade moves everything: nothing in it is a marker.
  if(changed>gw*gh/5){Spots.Clear();return result;}
  // Expire before matching: a new glyph at an old position must not inherit its age or motion evidence.
  // Kept through 1.3 s without change: some markers step only every half second or so.
  foreach(var sp in Spots)if((now-sp.Last).TotalMilliseconds>1300&&sp.Reversed.Count<8&&sp.Last>TypingAt)TypingAt=sp.Last;
  Spots.RemoveAll(sp=>(now-sp.Last).TotalMilliseconds>1300);
  var seen=new bool[cell.Length];var stack=new Stack<int>();
  for(int s=0;s<cell.Length;s++){if(!cell[s]||seen[s])continue;int minX=int.MaxValue,minY=int.MaxValue,maxX=-1,maxY=-1,count=0;seen[s]=true;stack.Push(s);
   while(stack.Count>0){int p=stack.Pop(),px0=p%gw,py0=p/gw;count++;if(px0<minX)minX=px0;if(px0>maxX)maxX=px0;if(py0<minY)minY=py0;if(py0>maxY)maxY=py0;
    // Cells one cell apart still join: a marker made of separate parts (euphoria's stacked bars with 3-4 px gaps)
    // must move as one spot, not as several thin strips that each look like new text.
    for(int dy=-2;dy<=2;dy++)for(int dx=-2;dx<=2;dx++){int nx=px0+dx,ny=py0+dy;if(nx<0||ny<0||nx>=gw||ny>=gh)continue;int q=ny*gw+nx;if(cell[q]&&!seen[q]){seen[q]=true;stack.Push(q);}}}
   var r=new Rectangle(minX*C,minY*C,(maxX-minX+1)*C,(maxY-minY+1)*C);
   if(r.Width>72||r.Height>72||count>140)continue;
   // Same spot when it overlaps (or nearly touches) one already followed: a marker whose parts change in turn
   // (bars lighting up one after another) stays one spot.
   Spot hit=null;foreach(var sp in Spots){if(Rectangle.Intersect(Rectangle.Inflate(sp.R,6,6),r).Width>0){hit=sp;break;}}
   bool fresh=hit==null;
   // A spot that grows past marker size (56 px) is text appearing letter by letter; a spinning gear only fills out its
   // own size. (euphoria's stacked-bars marker is 20x44 and reaches 48 on the 4 px grid, so 44 was too tight.)
   if(hit==null){hit=new Spot{R=r,Start=r,Hits=1,First=now,Last=now};Spots.Add(hit);}
   else{var u=Rectangle.Union(hit.R,r);if(u.Width>56||u.Height>56){hit.Grew=true;TypingAt=now;}if(u.Width<=72&&u.Height<=72)hit.R=u;if((now-hit.Last).TotalMilliseconds>40)hit.Hits++;hit.Last=now;}
   // Appearing text changes in one direction. A spinning/blinking marker repeatedly changes the same pixels back.
   // Keep this evidence per spot, so a later sentence cannot borrow a previous sentence's reversals.
   bool reversed=false;
   for(int yy=r.Top;yy<r.Bottom;yy++)for(int xx=r.Left;xx<r.Right;xx++){int k=yy*w+xx,delta=lum[k]-prev[k];if(Math.Abs(delta)<=28)continue;
    int direction=delta>0?1:-1,previous;bool known=hit.Directions.TryGetValue(k,out previous);
    if(known&&previous!=direction){hit.Reversed.Add(k);reversed=true;}hit.Directions[k]=direction;}
   if(reversed)hit.ReverseFrames++;
   // New one-way changes are typing evidence immediately, before an older mouth can qualify.
   // Only a new spot or one that keeps growing is a letter being written; a marker changing in place is not.
   if(hit.Reversed.Count<8&&(fresh||hit.Grew))TypingAt=now;}
  // A spot that changed only briefly and stopped was a letter fading in: the line was still being written then.
  foreach(var sp in Spots)if((now-sp.Last).TotalMilliseconds>1300&&(sp.Last-sp.First).TotalMilliseconds<900&&sp.Last>TypingAt)TypingAt=sp.Last;
  Spots.RemoveAll(sp=>(now-sp.Last).TotalMilliseconds>1300);
  // The marker: small, roughly square, unchanged in size, moving for almost a second and still moving, and started
  // only once the line was written (a talking mouth or a scene animation started earlier). Among several, the one
  // that changes most steadily (a spinning gear or a blinking ▼ more than an irregular animation).
  TraceSpots(now);
  Spot best=null;double bestRate=0;
  foreach(var sp in Spots){var r=sp.R;double age=(now-sp.First).TotalMilliseconds;
   if(sp.Grew||sp.Hits<3||sp.Reversed.Count<8||sp.ReverseFrames<2||age<900||(now-sp.Last).TotalMilliseconds>1300||TypingAt>sp.First.AddMilliseconds(700))continue;
   if(r.Width<8||r.Height<8||r.Width>r.Height*2.4||r.Height>r.Width*2.4)continue;
   double rate=sp.Hits/age;if(best==null||rate>bestRate){best=sp;bestRate=rate;}}
  if(best!=null)result.Add(best.R);
  return result;
 }
 static byte[] Bytes(Bitmap image){var d=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);try{var result=new byte[image.Width*image.Height*4];for(int y=0;y<image.Height;y++)Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),result,y*image.Width*4,image.Width*4);return result;}finally{image.UnlockBits(d);}}
 void ClearSaved(){foreach(var v in SavedClean.Values)v.Picture.Dispose();SavedClean.Clear();}
 public void Dispose(){Hide();ClearSaved();Cover.Dispose();}
}
