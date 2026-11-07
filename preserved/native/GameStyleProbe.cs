// SPDX-License-Identifier: GPL-3.0-or-later
// One bounded request per new dialogue, never a render-loop OCR task. C# 5.
using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Linq;using System.Runtime.InteropServices;using System.Text;using System.Web.Script.Serialization;using Windows.Globalization;using Windows.Graphics.Imaging;using Windows.Media.Ocr;using Windows.Storage.Streams;
public static class GameStyleProbe{
 [StructLayout(LayoutKind.Sequential)]struct Rect{public int L,T,R,B;}
 [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();static OcrEngine Engine;
 static double N(Dictionary<string,object>d,string k,double fallback){object v;double n;return d.TryGetValue(k,out v)&&Double.TryParse(Convert.ToString(v),out n)?n:fallback;}
 static T Await<T>(Windows.Foundation.IAsyncOperation<T> op){var end=DateTime.UtcNow.AddSeconds(5);try{while(op.Status==Windows.Foundation.AsyncStatus.Started){if(DateTime.UtcNow>end){op.Cancel();throw new Exception("timeout");}System.Threading.Thread.Sleep(10);}return op.GetResults();}finally{op.Close();}}
 static string Normalize(string s){return new string((s??"").Normalize(NormalizationForm.FormKC).Where(Char.IsLetterOrDigit).ToArray());}
 static double Match(string text,string source){string a=Normalize(text),b=Normalize(source);if(a.Length<4||b.Length<4)return 0;a=a.Substring(0,Math.Min(a.Length,400));b=b.Substring(0,Math.Min(b.Length,2000));int[] p=new int[b.Length+1],c=new int[b.Length+1];foreach(char x in a){for(int j=0;j<b.Length;j++)c[j+1]=x==b[j]?p[j]+1:Math.Max(p[j+1],c[j]);var swap=p;p=c;c=swap;Array.Clear(c,0,c.Length);}return p[b.Length]/(double)Math.Min(a.Length,b.Length);}
 sealed class Word{public string Text;public Rectangle Box;}
 static double Median(IEnumerable<double> values){var a=values.OrderBy(x=>x).ToArray();return a.Length==0?0:a[a.Length/2];}
 // Flood the pixels connected to the outer word-box background first. A white glyph fill on a white
 // background is still separate when enclosed by its dark outline; rejecting by RGB contrast loses that fill.
 // A flood keeps its seed colour, so anti-alias gradients cannot drift into the outline. Candidate area is
 // penalized by background contact; using only contact ratio mistakes enclosed background holes for a thin fill.
 sealed class Band{public Dictionary<int,int> Counts=new Dictionary<int,int>();public Dictionary<int,long[]> Sums=new Dictionary<int,long[]>();public Dictionary<int,int> Touches=new Dictionary<int,int>();}
 static string Ink(Bitmap image,List<Word> words){string top,bottom;return Ink(image,words,out top,out bottom);}
 static string Ink(Bitmap image,List<Word> words,out string gradientTop,out string gradientBottom){
  gradientTop=gradientBottom=null;var bands=Enumerable.Range(0,8).Select(i=>new Band()).ToArray();
  int w=image.Width,h=image.Height;var px=new byte[w*h*4];var data=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{for(int y=0;y<h;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),px,y*w*4,w*4);}finally{image.UnlockBits(data);}
  var bins=new Dictionary<int,int>();var sums=new Dictionary<int,long[]>();var touches=new Dictionary<int,int>();
  foreach(var word in words){var b=Rectangle.Intersect(new Rectangle(0,0,w,h),Rectangle.Inflate(word.Box,3,3));if(b.Width<5||b.Height<5)continue;
   int bw=b.Width,bh=b.Height;var bg=new bool[bw*bh];var seeds=new int[bw*bh];var q=new Queue<int>();
   Action<int> seed=i=>{if(!bg[i]){bg[i]=true;seeds[i]=((b.Top+i/bw)*w+b.Left+i%bw)*4;q.Enqueue(i);}};
   for(int x=0;x<bw;x++){seed(x);seed((bh-1)*bw+x);}for(int y=0;y<bh;y++){seed(y*bw);seed(y*bw+bw-1);}
   while(q.Count>0){int i=q.Dequeue(),x=i%bw,y=i/bw,o=seeds[i];foreach(int j in new[]{x>0?i-1:-1,x+1<bw?i+1:-1,y>0?i-bw:-1,y+1<bh?i+bw:-1}){if(j<0||bg[j])continue;int p=((b.Top+j/bw)*w+b.Left+j%bw)*4;if(Math.Abs(px[o]-px[p])+Math.Abs(px[o+1]-px[p+1])+Math.Abs(px[o+2]-px[p+2])<=42){bg[j]=true;seeds[j]=o;q.Enqueue(j);}}}
   for(int y=1;y<bh-1;y++)for(int x=1;x<bw-1;x++){int i=y*bw+x;if(bg[i])continue;int o=((b.Top+y)*w+b.Left+x)*4,R=px[o+2],G=px[o+1],B=px[o];
    int flat=0;foreach(int j in new[]{i-1,i+1,i-bw,i+bw}){int p=((b.Top+j/bw)*w+b.Left+j%bw)*4;if(Math.Abs(R-px[p+2])+Math.Abs(G-px[p+1])+Math.Abs(B-px[p])<36)flat++;}if(flat<2)continue;
    bool near=false;for(int dy=-1;dy<=1&&!near;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx>=0&&nx<bw&&ny>=0&&ny<bh&&bg[ny*bw+nx]){near=true;break;}}
    int key=(R/16<<8)|(G/16<<4)|(B/16);if(!bins.ContainsKey(key)){bins[key]=0;sums[key]=new long[3];touches[key]=0;}bins[key]++;sums[key][0]+=R;sums[key][1]+=G;sums[key][2]+=B;if(near)touches[key]++;
    double t=((b.Top+y)-word.Box.Top)/(double)Math.Max(1,word.Box.Height-1);if(t>=0&&t<=1){var band=bands[Math.Min(7,(int)(t*8))];if(!band.Counts.ContainsKey(key)){band.Counts[key]=0;band.Sums[key]=new long[3];band.Touches[key]=0;}band.Counts[key]++;band.Sums[key][0]+=R;band.Sums[key][1]+=G;band.Sums[key][2]+=B;if(near)band.Touches[key]++;}
   }
  }
  if(bins.Count==0)return null;int top=bins.Values.Max();if(top<12)return null;
  int best=bins.Where(p=>p.Value>=Math.Max(12,top/5)).OrderByDescending(p=>p.Value-2*touches[p.Key]).ThenByDescending(p=>p.Value).First().Key,count=bins[best];var s=sums[best];Gradient(bands,out gradientTop,out gradientBottom);return String.Format("#{0:x2}{1:x2}{2:x2}",s[0]/count,s[1]/count,s[2]/count);
 }
 // Fit a vertical two-stop gradient to per-height fill candidates, after the same background flood as solid ink.
 // Reject uneven/unsupported band coverage and nonlinear fits rather than invent a gradient from a background.
 static void Gradient(Band[] bands,out string top,out string bottom){
  top=bottom=null;var points=new List<double[]>();double[] previous=null;
  for(int i=0;i<bands.Length;i++){var band=bands[i];if(band.Counts.Count==0)continue;int max=band.Counts.Values.Max();if(max<8)continue;
   var choices=band.Counts.Where(p=>p.Value>=Math.Max(8,max/8)&&(previous==null||Enumerable.Range(0,3).Sum(c=>Math.Abs(band.Sums[p.Key][c]/(double)p.Value-previous[c]))<144)).OrderByDescending(p=>p.Value-2*band.Touches[p.Key]).ThenByDescending(p=>p.Value).ToArray();if(choices.Length==0)continue;int key=choices[0].Key;
   int n=band.Counts[key];if(n-2*band.Touches[key]<4)continue;var sum=band.Sums[key];previous=new[]{sum[0]/(double)n,sum[1]/(double)n,sum[2]/(double)n};points.Add(new[]{(i+.5)/8,previous[0],previous[1],previous[2]});}
  if(points.Count<6||points[0][0]>.2||points[points.Count-1][0]<.8)return;
  // Sparse horizontal strokes can let the outline win one height band. Require a six-band consensus,
  // then fit only those bands; do not relax the residual until an outline looks like a gradient.
  List<double[]> consensus=null;
  for(int i=0;i<points.Count;i++)for(int j=i+1;j<points.Count;j++){var a0=points[i];var b0=points[j];if(b0[0]-a0[0]<.4)continue;
   var inliers=points.Where(p=>Enumerable.Range(1,3).Sum(c=>Math.Abs(p[c]-a0[c]-(b0[c]-a0[c])*(p[0]-a0[0])/(b0[0]-a0[0])))<36).ToList();
   if(consensus==null||inliers.Count>consensus.Count)consensus=inliers;}
  if(consensus==null||consensus.Count<6||consensus[0][0]>.2||consensus[consensus.Count-1][0]<.8)return;points=consensus;
  double mt=points.Average(p=>p[0]),den=points.Sum(p=>(p[0]-mt)*(p[0]-mt));var a=new double[3];var b=new double[3];double residual=0,contrast=0;
  for(int c=0;c<3;c++){int ch=c+1;double mean=points.Average(p=>p[ch]);b[c]=points.Sum(p=>(p[0]-mt)*(p[ch]-mean))/den;a[c]=mean-b[c]*mt;contrast+=Math.Abs(b[c]);residual+=points.Sum(p=>Math.Pow(p[ch]-a[c]-b[c]*p[0],2));}
  if(contrast<32||Math.Sqrt(residual/(points.Count*3))>10)return;
  Func<double[],string> hex=v=>"#"+String.Concat(v.Select(x=>((int)Math.Round(Math.Max(0,Math.Min(255,x)))).ToString("x2")));
  top=hex(a);bottom=hex(a.Select((v,i)=>v+b[i]).ToArray());
 }
 static void GradientSelfTest(){
  foreach(var colors in new[]{new[]{Color.White,Color.FromArgb(120,160,220)},new[]{Color.FromArgb(170,225,255),Color.FromArgb(80,120,180)}})
  using(var image=OpaqueBitmap(600,120))using(var g=Graphics.FromImage(image))using(var path=new System.Drawing.Drawing2D.GraphicsPath())using(var font=new FontFamily("Meiryo")){
   g.Clear(Color.FromArgb(30,35,40));g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;path.AddString("原文色の検査です",font,0,46,new PointF(20,20),StringFormat.GenericDefault);var bounds=path.GetBounds();
   using(var pen=new Pen(Color.Black,4)){pen.LineJoin=System.Drawing.Drawing2D.LineJoin.Round;g.DrawPath(pen,path);}using(var brush=new System.Drawing.Drawing2D.LinearGradientBrush(bounds,colors[0],colors[1],90f))g.FillPath(brush,path);
   string top,bottom;Ink(image,new List<Word>{new Word{Text="原文色の検査です",Box=Rectangle.Ceiling(bounds)}},out top,out bottom);
   if(top==null||bottom==null)throw new Exception("Gradient was not detected: "+colors[0]+" -> "+colors[1]);Color t=ColorTranslator.FromHtml(top),b=ColorTranslator.FromHtml(bottom);
   if(Math.Abs(t.R-colors[0].R)+Math.Abs(t.G-colors[0].G)+Math.Abs(t.B-colors[0].B)>65||Math.Abs(b.R-colors[1].R)+Math.Abs(b.G-colors[1].G)+Math.Abs(b.B-colors[1].B)>65)throw new Exception("Gradient endpoints mismatch: "+top+" "+bottom);
  }
  using(var image=OpaqueBitmap(300,100))using(var g=Graphics.FromImage(image))using(var font=new Font("Meiryo",30)){g.Clear(Color.Black);g.DrawString("原文の検査",font,Brushes.White,10,10);string top,bottom;Ink(image,new List<Word>{new Word{Text="原文の検査",Box=new Rectangle(10,20,240,45)}},out top,out bottom);if(top!=null)throw new Exception("Solid text falsely identified as a gradient");}
 }
 static void InkSelfTest(){
  var cases=new[]{new[]{Color.White,Color.White,Color.Black},new[]{Color.FromArgb(22,30,45),Color.White,Color.Black},new[]{Color.White,Color.Black,Color.White},new[]{Color.FromArgb(22,30,45),Color.FromArgb(187,238,255),Color.Black},new[]{Color.White,Color.FromArgb(200,20,30),Color.Transparent}};
  foreach(var weight in new[]{FontStyle.Regular,FontStyle.Bold})foreach(var colors in cases)using(var image=OpaqueBitmap(420,100))using(var g=Graphics.FromImage(image))using(var path=new System.Drawing.Drawing2D.GraphicsPath())using(var font=new FontFamily("Meiryo")){
   g.Clear(colors[0]);g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;path.AddString("原文色の検査",font,(int)weight,38,new PointF(20,20),StringFormat.GenericDefault);if(colors[2].A>0)using(var pen=new Pen(colors[2],4)){pen.LineJoin=System.Drawing.Drawing2D.LineJoin.Round;g.DrawPath(pen,path);}using(var brush=new SolidBrush(colors[1]))g.FillPath(brush,path);
   string result=Ink(image,new List<Word>{new Word{Text="原文色の検査",Box=Rectangle.Ceiling(path.GetBounds())}});Color actual=result==null?Color.Transparent:ColorTranslator.FromHtml(result);if(result==null||Math.Abs(actual.R-colors[1].R)+Math.Abs(actual.G-colors[1].G)+Math.Abs(actual.B-colors[1].B)>60)throw new Exception("Text fill colour mismatch: expected "+ColorTranslator.ToHtml(colors[1])+", got "+result);
  }
 }
 // GDI capture writes BGR pixels but may leave the reserved alpha byte at zero. Treat the
 // capture as opaque before DrawImage/PNG encoding, or a visible game becomes an empty OCR image.
 static Bitmap OpaqueBitmap(int width,int height){return new Bitmap(width,height,PixelFormat.Format32bppRgb);}
 static Bitmap RegionImage(Bitmap full,Rectangle region,double scale){
  var image=OpaqueBitmap(Math.Max(1,(int)(region.Width*scale)),Math.Max(1,(int)(region.Height*scale)));
  try{using(var g=Graphics.FromImage(image))g.DrawImage(full,new Rectangle(0,0,image.Width,image.Height),region,GraphicsUnit.Pixel);return image;}catch{image.Dispose();throw;}
 }
 static void CaptureImageSelfTest(){
  using(var full=OpaqueBitmap(100,60)){
   var bits=full.LockBits(new Rectangle(0,0,100,60),ImageLockMode.WriteOnly,full.PixelFormat);
   try{var row=new byte[400];for(int x=0;x<100;x++){row[x*4]=180;row[x*4+1]=230;row[x*4+2]=250;row[x*4+3]=0;}for(int y=0;y<60;y++)Marshal.Copy(row,0,IntPtr.Add(bits.Scan0,y*bits.Stride),row.Length);}finally{full.UnlockBits(bits);}
   foreach(double scale in new[]{1.0,.5})using(var image=RegionImage(full,new Rectangle(10,10,80,40),scale))using(var memory=new MemoryStream()){
    image.Save(memory,ImageFormat.Png);memory.Position=0;using(var decoded=new Bitmap(memory)){var p=decoded.GetPixel(decoded.Width/2,decoded.Height/2);if(p.A!=255||Math.Abs(p.R-250)>1||Math.Abs(p.G-230)>1||Math.Abs(p.B-180)>1)throw new Exception("GDI pixels lost during OCR image preparation");}
   }
  }
 }
 public static object Probe(Dictionary<string,object>d){
  long hwnd=(long)N(d,"hwnd",0),pid=(long)N(d,"pid",0);IntPtr target=new IntPtr(hwnd);uint actual;Rect client;
  if(!IsWindow(target)||GetWindowThreadProcessId(target,out actual)==0||actual!=pid||!GetClientRect(target,out client))throw new Exception("target changed");
  uint foregroundPid;GetWindowThreadProcessId(GetForegroundWindow(),out foregroundPid);uint overlayPid=(uint)N(d,"overlayPid",0);if(IsIconic(target)||(GetAncestor(GetForegroundWindow(),2)!=GetAncestor(target,2)&&(overlayPid==0||foregroundPid!=overlayPid)))throw new Exception("game not foreground; measurement deferred");
  int width=client.R,height=client.B;if(width<100||height<100||width>16384||height>16384)throw new Exception("invalid client size");
  string source=Convert.ToString(d["source"]);if(source.Length>4000)throw new Exception("source too long");
  var region=Rectangle.Intersect(new Rectangle(0,0,width,height),new Rectangle((int)(width*N(d,"scanX",0)/100),(int)(height*N(d,"scanY",40)/100),(int)(width*N(d,"scanWidth",100)/100),(int)(height*N(d,"scanHeight",60)/100)));
  if(region.Width<20||region.Height<20)throw new Exception("empty region");
  // Capture only the game window DC, never the desktop or ToMe overlay. Limit raster memory to 4K-class clients.
  if((long)width*height>36000000)throw new Exception("capture budget exceeded");
  using(var full=OpaqueBitmap(width,height)){
   if(!(Convert.ToString(d.ContainsKey("captureMode")?d["captureMode"]:null)=="visible-client"&&GameCapture.ScreenInto(target,full))&&!GameCapture.Into(target,full,3,true))throw new Exception("capture deferred");
   return Measure(full,region,source,width,height,true);
  }
 }
 static object Measure(Bitmap full,Rectangle region,string source,int width,int height,bool diagnostics){
   double scale=Math.Min(1,1600.0/region.Width);
   using(var image=RegionImage(full,region,scale)){
    using(var memory=new MemoryStream())using(var random=new InMemoryRandomAccessStream()){
     image.Save(memory,ImageFormat.Png);using(var writer=new DataWriter(random.GetOutputStreamAt(0))){writer.WriteBytes(memory.ToArray());Await<uint>(writer.StoreAsync());Await<bool>(writer.FlushAsync());writer.DetachStream();}random.Seek(0);
     var decoder=Await<BitmapDecoder>(BitmapDecoder.CreateAsync(random));using(var bitmap=Await<SoftwareBitmap>(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8,BitmapAlphaMode.Premultiplied))){
      if(Engine==null)Engine=OcrEngine.TryCreateFromLanguage(new Language("ja"));if(Engine==null)throw new Exception("Japanese OCR unavailable");var result=Await<OcrResult>(Engine.RecognizeAsync(bitmap));
      var words=new List<Word>();var rows=new List<Rectangle>();double confidence=0,bestMatch=0;
      // Furigana that OCR folds into a line (half-height words) is dropped before matching: the extra kana pushed
      // lines of games with ruby (manosaba) below the threshold although the text was plainly visible, and the row box
      // now starts at the glyphs instead of the ruby. Long lines get a slightly lower bar for stylised fonts.
      foreach(var line in result.Lines){var all=new List<Word>();foreach(var w in line.Words){var r=w.BoundingRect;all.Add(new Word{Text=w.Text,Box=Rectangle.FromLTRB((int)Math.Floor(r.X),(int)Math.Floor(r.Y),(int)Math.Ceiling(r.X+r.Width),(int)Math.Ceiling(r.Y+r.Height))});}
       if(all.Count==0)continue;double tall=Median(all.Select(w=>(double)w.Box.Height));var main=all.Where(w=>w.Box.Height>=tall*.6).ToList();string text=String.Concat(main.Select(w=>w.Text));
       double score=Match(text,source);bestMatch=Math.Max(bestMatch,score);if(score<.78&&!(score>=.62&&Normalize(text).Length>=8))continue;
       Rectangle row=Rectangle.Empty;foreach(var w in main){words.Add(w);row=row.IsEmpty?w.Box:Rectangle.Union(row,w.Box);}if(!row.IsEmpty){rows.Add(row);confidence=Math.Max(confidence,score);}}
      // Diagnostics, off by default: with logs\style-probe.on a failed match keeps the picture OCR saw (no text is logged).
      if(words.Count==0&&diagnostics){try{string logs=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","logs"));if(File.Exists(Path.Combine(logs,"style-probe.on")))image.Save(Path.Combine(logs,"style-probe.png"),ImageFormat.Png);}catch{}}
      if(words.Count==0)return new{valid=false,reason="original-not-visible-or-unmatched; ocrLines="+result.Lines.Count+" chars="+result.Lines.Sum(l=>Normalize(l.Text).Length)+" bestMatch="+bestMatch.ToString("F3",System.Globalization.CultureInfo.InvariantCulture),width=width,height=height};
      double inkHeight=Median(words.Where(w=>Normalize(w.Text).Length>0).Select(w=>(double)w.Box.Height))/scale;
      // Ink bounds are measured, not a claimed font-family or em-size identification.
      var advances=words.Where(w=>w.Text.Count(ch=>ch>=0x3040&&ch<=0x9fff)>=2).Select(w=>w.Box.Width/(double)w.Text.Length/scale).ToArray();
      var bounds=rows.Aggregate(Rectangle.Union);var ordered=rows.OrderBy(r=>r.Top).ToArray();var steps=new List<double>();for(int i=1;i<ordered.Length;i++){double step=(ordered[i].Top-ordered[i-1].Top)/scale;if(step>inkHeight*.7)steps.Add(step);}
      string gradientTop,gradientBottom;string color=Ink(image,words,out gradientTop,out gradientBottom);if(gradientTop!=null)color=gradientTop;double advance=Median(advances);double em=Math.Max(inkHeight,advance);var style=new Dictionary<string,object>();
      style["x"]=(region.Left+bounds.Left/scale)*100/width;style["y"]=(region.Top+bounds.Top/scale)*100/height;// Width of the measured text itself (it used to run to the window edge, so ToMe's box always reached the screen edge).
      style["width"]=Math.Min(100-styleNumber(style,"x"),bounds.Width/scale*100/width);
      // Where the game wraps: every row but the last one of a line ended because the line was full.
      double wrap=0;for(int i=0;i<ordered.Length-1;i++)wrap=Math.Max(wrap,(ordered[i].Right-bounds.Left)/scale*100/width);
      // Height of the measured lines only; ToMe derives its display area from several lines (game-style-sync.cjs).
      style["height"]=bounds.Height/scale*100/height;
      style["japaneseSize"]=em*1280/width;style["paddingX"]=0;style["paddingY"]=0;style["autoScale"]=true;
      if(color!=null){style["textColor"]=color;style["textGradient"]=gradientTop!=null;if(gradientTop!=null){style["textGradientTop"]=gradientTop;style["textGradientBottom"]=gradientBottom;}}if(advance>0)style["japaneseSpacingPx"]=(advance-em)*1280/width;if(steps.Count>0)style["lineHeight"]=Median(steps)/em;
      return new{valid=true,method="visual-measurement",estimated=true,confidence=confidence,width=width,height=height,rows=rows.Count,inkHeight=inkHeight,advance=advance,lineStep=steps.Count>0?Median(steps):0,wrapWidth=wrap,inkLeft=region.Left+bounds.Left/scale,inkTop=region.Top+bounds.Top/scale,inkBottom=region.Top+bounds.Bottom/scale,style=style,unsupported=new[]{"fontFamily","exactEmSize","nonVerticalOrMultiStopGradient","perCharacterColor","outline","weight"}};
     }
    }
   }
 }
 static object MeasureFile(string file,string source){using(var loaded=new Bitmap(file))using(var image=OpaqueBitmap(loaded.Width,loaded.Height)){
  using(var g=Graphics.FromImage(image))g.DrawImageUnscaled(loaded,0,0);
  return Measure(image,new Rectangle(0,0,image.Width,image.Height),source,image.Width,image.Height,false);
 }}

 static double styleNumber(Dictionary<string,object>d,string key){return Convert.ToDouble(d[key]);}
 public static int Main(string[] args){if(args.Length==3&&args[0]=="--image"){Console.OutputEncoding=new UTF8Encoding(false);try{Console.WriteLine(Json.Serialize(MeasureFile(args[1],args[2])));return 0;}catch(Exception e){Console.WriteLine(Json.Serialize(new{valid=false,error=e.Message}));return 3;}}if(args.Length==1&&args[0]=="--self-test"){try{if(Match("街の喧噪の中に立っている時とは打って変わって、ここはとても静かだ","ここはとても静かだ")<.78||Match("全く違う内容の文章です","魔女の裁判が始まる")>=.78)return 3;CaptureImageSelfTest();InkSelfTest();GradientSelfTest();Console.WriteLine("PASS style matching, opaque capture preparation and ten regular/bold fill/outline/background colour cases, two vertical gradients and solid rejection");return 0;}catch(Exception e){Console.Error.WriteLine(e.Message);return 3;}}Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);string line;while((line=Console.ReadLine())!=null){try{if(line.Length>20000)throw new Exception("request too large");var d=Json.Deserialize<Dictionary<string,object>>(line);var start=DateTime.UtcNow;Console.WriteLine(Json.Serialize(new{id=d["id"],result=Probe(d),elapsedMs=(DateTime.UtcNow-start).TotalMilliseconds}));}catch(Exception e){Console.WriteLine(Json.Serialize(new{error=e.Message}));}}return 0;}
}
