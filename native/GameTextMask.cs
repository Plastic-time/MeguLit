using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

// Only reads the explicitly bound game's client image. Images stay in memory.
// This is a local image cover, not engine-level text suppression.
public sealed class GameTextMask : IDisposable {
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
    sealed class Frame : IDisposable {
        public int Generation,Width,Height,Count; public Rectangle Region; public Bitmap Pixels; public string Message; public bool Skipped;
        public byte[] Background; public List<Rectangle> Boxes,Indicators; public double Advance;
        public void Dispose(){if(Pixels!=null){Pixels.Dispose();Pixels=null;}}
    }
    sealed class FastTemplate { public int Width,Height; public Rectangle Region; public byte[] Background; public List<Rectangle> Boxes; public double Advance; }
    FastTemplate Cached;
    readonly ConcurrentQueue<Frame> Frames=new ConcurrentQueue<Frame>();
    readonly Action<object> Emit;
    string Mode="local",Source="",LastMessage="";
    double X=2,Y=60,W=96,H=38,Radius=13,Padding=2;
    int Generation,LastWidth,LastHeight,FrameSerial,SurfaceX,SurfaceY; IntPtr LastTarget;
    bool Busy,Disposed,HasFrame,Fast=true,Blend=true; DateTime Next=DateTime.MinValue,Started,SourceChanged;
    public GameTextMask(Action<object> emit){Emit=emit;}
    static double Number(Dictionary<string,object> d,string k,double fallback,double min,double max){object v;double n;if(!d.TryGetValue(k,out v)||!Double.TryParse(Convert.ToString(v,CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture,out n)||Double.IsNaN(n)||Double.IsInfinity(n))return fallback;return Math.Max(min,Math.Min(max,n));}
    public void Configure(Dictionary<string,object> d){
        object v; string mode=d.TryGetValue("maskMode",out v)?Convert.ToString(v):"local";
        if(mode!="local"&&mode!="none"&&mode!="full")mode="none";
        bool fast=!d.TryGetValue("fastMask",out v)||!(v is bool)||((bool)v);
        bool blend=!d.TryGetValue("maskStyle",out v)||Convert.ToString(v)!="blur";
        double x=Number(d,"scanX",2,0,95),y=Number(d,"scanY",60,0,95),w=Number(d,"scanWidth",96,5,100),h=Number(d,"scanHeight",38,5,100),r=Number(d,"blurRadius",13,5,30),p=Number(d,"maskPadding",2,0,10);
        if(mode==Mode&&x==X&&y==Y&&w==W&&h==H&&r==Radius&&p==Padding&&fast==Fast&&blend==Blend)return;
        Mode=mode;X=x;Y=y;W=w;H=h;Radius=r;Padding=p;Fast=fast;Blend=blend;Invalidate();
        if(Mode!="local")Status("局部遮字已关闭");
    }
    public void SetSource(string source){
        source=source??"";if(source==Source)return;Source=source.Length>4000?source.Substring(0,4000):source;Generation++;SourceChanged=DateTime.UtcNow;Next=DateTime.UtcNow;
        if(String.IsNullOrWhiteSpace(Source)){Hide();return;}
        if(Fast&&Active&&Cached!=null){
            try{var boxes=PredictBoxes(Source,Cached.Boxes,Cached.Advance,Cached.Region.Width,Cached.Region.Height);using(var pixels=RenderBackground(Cached.Background,Cached.Region.Width,Cached.Region.Height,boxes,Math.Max(3,(int)Math.Round(Padding*Cached.Width/1280))))SendPixels(pixels,Cached.Region,boxes.Count,true);}
            catch{ /* Retain the last valid cover until OCR catches up. */ }
        }else Hide();
    }
    void Invalidate(){Generation++;Cached=null;Hide();Next=DateTime.UtcNow;}
    void Status(string message){if(message==LastMessage)return;LastMessage=message;Emit(new{type="mask",maskMessage=message});}
    public Rectangle SurfaceRegion(int width,int height){return Active?ScanRegion(width,height,X,Y,W,H):Rectangle.Empty;}
    // Per-line backstop (user, 2026-11-09, WHITE ALBUM2): when the hook answered a replacement but the screen check still
    // sees the game's original line, this line alone is covered the OCR way; the next line goes back to the hook.
    string AssistSource;
    bool Active{get{return Mode=="local"||(AssistSource!=null&&AssistSource==Source&&Source.Length>0);}}
    public void Assist(string source){if(Mode=="local"||String.IsNullOrWhiteSpace(Source))return;AssistSource=Source;Next=DateTime.UtcNow;Status("本句原文未被隐藏，已临时用遮罩盖住");}
    public void Hide(){if(HasFrame){HasFrame=false;Emit(new{type="maskFrame",clear=true,id=++FrameSerial});}}
    void SendPixels(Bitmap pixels,Rectangle region,int count,bool provisional){
        using(var stream=new MemoryStream()){
            pixels.Save(stream,ImageFormat.Png);string png=Convert.ToBase64String(stream.ToArray());
            if(png.Length>2500000)throw new InvalidOperationException("局部遮罩图像过大，请缩小扫描范围");
            Emit(new{type="maskFrame",clear=false,id=++FrameSerial,png=png,x=region.X-SurfaceX,y=region.Y-SurfaceY,width=region.Width,height=region.Height,count=count,provisional=provisional});HasFrame=true;
        }
    }
    public bool Tick(IntPtr target,int left,int top,int width,int height,bool visible,int surfaceX,int surfaceY){
        if(Disposed)return false;
        SurfaceX=surfaceX;SurfaceY=surfaceY;
        bool changed=false;
        if(target!=LastTarget||width!=LastWidth||height!=LastHeight){LastTarget=target;LastWidth=width;LastHeight=height;Invalidate();}
        Frame frame;
        while(Frames.TryDequeue(out frame)){
            Busy=false;
            using(frame){
                if(frame.Skipped)continue; // window dragged / minimised: keep the current cover, read again next time
                if(frame.Generation!=Generation||frame.Width!=width||frame.Height!=height)continue;
                if(!visible||!Active){Hide();continue;}
                if(frame.Pixels==null){if(!Fast||(DateTime.UtcNow-SourceChanged).TotalSeconds>1.5)Hide();if(!String.IsNullOrEmpty(frame.Message))Status(frame.Message);continue;}
                try{
                    Cached=new FastTemplate{Width=width,Height=height,Region=frame.Region,Background=frame.Background,Boxes=frame.Boxes,Advance=frame.Advance};
                    SendPixels(frame.Pixels,frame.Region,frame.Count,false);Status("已识别 "+frame.Count+" 个原文区域，遮罩已交给阅读层");
                }catch{Hide();Status("局部遮罩传递失败；请缩小扫描范围后重试");}
            }
        }
        if(!visible||target==IntPtr.Zero||!Active||String.IsNullOrWhiteSpace(Source)){Hide();return changed;}
        if(Busy){if((DateTime.UtcNow-Started).TotalSeconds>6){Hide();Status("游戏画面读取较慢；可在 Alt+T 关闭局部遮字，不会改动游戏");}return changed;}
        if(DateTime.UtcNow<Next)return changed;
        int generation=Generation;string source=Source;
        Rectangle region=ScanRegion(width,height,X,Y,W,H);
        int radius=Math.Max(5,(int)Math.Round(Radius*width/1280)),padding=Math.Max(1,(int)Math.Round(Padding*width/1280));
        bool blendBackground=Blend;var template=Cached;bool fastMask=Fast;
        Busy=true;Started=DateTime.UtcNow;Next=DateTime.UtcNow.AddMilliseconds((DateTime.UtcNow-SourceChanged).TotalSeconds<2?160:900);
        Task.Run(delegate{
            Frame result=new Frame{Generation=generation,Width=width,Height=height,Region=region};
            try{
                using(Bitmap capture=Capture(target,width,height,region)){
                    var engine=OcrEngine.TryCreateFromLanguage(new Language("ja"));
                    if(engine==null)throw new InvalidOperationException("Windows 缺少日语 OCR；局部遮字不可用，不会铺整块底板");
                    var advances=new List<double>();var recognized=new List<string>();List<Rectangle> boxes=FindWords(capture,engine,source,advances,recognized);
                    // Do not shrink the immediate precover to a partially typed
                    // OCR result while the game is still revealing this line.
                    if(fastMask&&boxes.Count>0&&Normalize(String.Join("",recognized)).Length<Normalize(source).Length*.92){
                        if(template!=null&&template.Region.Width==capture.Width&&template.Region.Height==capture.Height)boxes.AddRange(PredictBoxes(source,template.Boxes,template.Advance,capture.Width,capture.Height));
                        else{advances.Sort();boxes.AddRange(PredictBoxes(source,boxes,advances.Count>0?advances[advances.Count/2]*1.1:24,capture.Width,capture.Height));}
                    }
                    result.Count=boxes.Count;
                    if(boxes.Count>0){advances.Sort();result.Advance=advances.Count>0?advances[advances.Count/2]*1.1:24;result.Boxes=boxes;var coverage=RefineCoverage(capture,MergeCoverage(boxes));result.Indicators=FindIndicators(capture,coverage);result.Background=blendBackground?Reconstruct(Bytes(capture),capture.Width,capture.Height,coverage,padding):Blur(Bytes(capture),capture.Width,capture.Height,radius);result.Pixels=RenderBackground(result.Background,capture.Width,capture.Height,coverage,padding,result.Indicators);}
                    else result.Message="尚未匹配到原文；请在 Alt+T 调整「原文字扫描范围」（"+LastOcr+"）";
                }
            }catch(OperationCanceledException){result.Skipped=true;}catch(Exception error){result.Message=error is InvalidOperationException?error.Message:"局部遮字无法读取此游戏画面；原文未被隐藏，可关闭或调整扫描范围";}
            lock(Frames){if(Disposed)result.Dispose();else Frames.Enqueue(result);}
        });
        return changed;
    }
    public static Rectangle ScanRegion(int width,int height,double x,double y,double w,double h){
        width=Math.Max(1,width);height=Math.Max(1,height);
        int l=Math.Min(width-1,Math.Max(0,(int)Math.Round(width*x/100))),t=Math.Min(height-1,Math.Max(0,(int)Math.Round(height*y/100)));
        return new Rectangle(l,t,Math.Max(1,Math.Min(width-l,(int)Math.Round(width*w/100))),Math.Max(1,Math.Min(height-t,(int)Math.Round(height*h/100))));
    }
    public static List<Rectangle> PredictBoxes(string text,List<Rectangle> previous,double advance,int width,int height){
        var result=new List<Rectangle>();if(previous==null||previous.Count==0)return result;
        int startX=width,startY=height;var heights=new List<int>();
        foreach(var box in previous){startX=Math.Min(startX,box.Left);startY=Math.Min(startY,box.Top);if(box.Height>5)heights.Add(box.Height);}
        heights.Sort();int glyphHeight=heights.Count>0?heights[heights.Count/2]:24;
        advance=Math.Max(8,Math.Min(glyphHeight*2,advance));double lineStep=glyphHeight*1.4;
        var tops=new List<int>();foreach(var box in previous){if(box.Height<glyphHeight*.6)continue;bool found=false;foreach(int top in tops)if(Math.Abs(top-box.Top)<glyphHeight*.6){found=true;break;}if(!found)tops.Add(box.Top);}tops.Sort();
        if(tops.Count>1){var gaps=new List<int>();for(int i=1;i<tops.Count;i++)gaps.Add(tops[i]-tops[i-1]);gaps.Sort();lineStep=Math.Max(glyphHeight+2,gaps[gaps.Count/2]);}
        int columns=Math.Max(1,(int)Math.Floor((width-startX-3)/advance)),row=0,column=0;
        if(tops.Count>1){int edge=startX;foreach(var box in previous)if(box.Top<startY+glyphHeight&&box.Bottom>startY)edge=Math.Max(edge,box.Right);columns=Math.Max(1,Math.Min(columns,(int)Math.Round((edge-startX)/advance)));}
        var chars=StringInfo.GetTextElementEnumerator((text??"").Replace("\r",""));
        while(chars.MoveNext()&&result.Count<1024){string c=chars.GetTextElement();if(c=="\n"){row++;column=0;continue;}if(column>=columns){row++;column=0;}int y=startY+(int)Math.Round(row*lineStep);if(y+glyphHeight>height)break;
            if(!String.IsNullOrWhiteSpace(c)){int x=startX+(int)Math.Floor(column*advance);var box=Rectangle.Intersect(new Rectangle(0,0,width,height),new Rectangle(x,y,(int)Math.Ceiling(advance),glyphHeight));if(box.Width>0&&box.Height>0)result.Add(box);}column++;
        }
        return result;
    }
    public sealed class ProbeResult {public bool Matched;public int JapaneseCharacters,Characters;}
    public static ProbeResult ProbeOriginal(IntPtr target,int width,int height,Rectangle region,string source){
      var engine=OcrEngine.TryCreateFromLanguage(new Language("ja"));if(engine==null)throw new Exception("系统日语 OCR 不可用，无法自动确认画面");
      using(var image=Capture(target,width,height,region))using(var memory=new MemoryStream()){
       image.Save(memory,ImageFormat.Png);using(var random=new InMemoryRandomAccessStream()){
        using(var writer=new DataWriter(random.GetOutputStreamAt(0))){writer.WriteBytes(memory.ToArray());Await<uint>(writer.StoreAsync());Await<bool>(writer.FlushAsync());writer.DetachStream();}
        random.Seek(0);var decoder=Await<BitmapDecoder>(BitmapDecoder.CreateAsync(random));
        using(var software=Await<SoftwareBitmap>(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8,BitmapAlphaMode.Premultiplied))){
         var ocr=Await<OcrResult>(engine.RecognizeAsync(software));var result=new ProbeResult();
         foreach(var line in ocr.Lines){if(Matches(line.Text,source))result.Matched=true;foreach(char c in line.Text){if(!Char.IsWhiteSpace(c))result.Characters++;if((c>=0x3040&&c<=0x30ff)||(c>=0x3400&&c<=0x9fff))result.JapaneseCharacters++;}}
         return result;
        }
       }
      }
    }
    static Bitmap Capture(IntPtr hwnd,int width,int height,Rectangle region){
        if(width<1||height<1||width>7680||height>4320)throw new InvalidOperationException("游戏画面尺寸暂不支持局部遮字");
        using(var client=new Bitmap(width,height,PixelFormat.Format24bppRgb)){
            {
                bool ok=GameCapture.Into(hwnd,client,3);
                if(!ok&&GameCapture.Skipped)throw new OperationCanceledException();
                if(!ok)throw new InvalidOperationException("此游戏不支持窗口画面读取；局部遮字没有启用");
            }
            return client.Clone(region,PixelFormat.Format32bppArgb);
        }
    }
    public static string Normalize(string text){var output=new StringBuilder();foreach(char c in (text??"").Normalize(NormalizationForm.FormKC)){if(Char.IsLetterOrDigit(c))output.Append(c);}return output.ToString();}
    public static bool Matches(string line,string source){
        string a=Normalize(line),b=Normalize(source);
        if(a.Length<2||b.Length<2)return false;
        if(a.Contains(b)||b.Contains(a))return true;
        // LCS tolerates a few OCR errors while requiring most of the visible line.
        if(a.Length>500)a=a.Substring(0,500);if(b.Length>2000)b=b.Substring(0,2000);
        int[] previous=new int[b.Length+1],current=new int[b.Length+1];
        for(int i=0;i<a.Length;i++){for(int j=0;j<b.Length;j++)current[j+1]=a[i]==b[j]?previous[j]+1:Math.Max(previous[j+1],current[j]);var swap=previous;previous=current;current=swap;Array.Clear(current,0,current.Length);}
        int count=previous[b.Length];return count>=4&&count>=Math.Min(a.Length,b.Length)*.74;
    }
    static T Await<T>(Windows.Foundation.IAsyncOperation<T> operation){
        var until=DateTime.UtcNow.AddSeconds(8);
        try{while(operation.Status==Windows.Foundation.AsyncStatus.Started){if(DateTime.UtcNow>until){operation.Cancel();throw new InvalidOperationException("本地 OCR 超时；请减小原文扫描范围");}System.Threading.Thread.Sleep(10);}return operation.GetResults();}finally{operation.Close();}
    }
    [ThreadStatic] static string LastOcr;
    static List<Rectangle> FindWords(Bitmap input,OcrEngine engine,string source,List<double> advances=null,List<string> recognized=null){
        using(var memory=new MemoryStream()){
            input.Save(memory,ImageFormat.Png);
            using(var random=new InMemoryRandomAccessStream()){
                using(var writer=new DataWriter(random.GetOutputStreamAt(0))){writer.WriteBytes(memory.ToArray());Await<uint>(writer.StoreAsync());Await<bool>(writer.FlushAsync());writer.DetachStream();}
                random.Seek(0);var decoder=Await<BitmapDecoder>(BitmapDecoder.CreateAsync(random));
                using(var software=Await<SoftwareBitmap>(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8,BitmapAlphaMode.Premultiplied))){
                    var result=Await<OcrResult>(engine.RecognizeAsync(software));var boxes=new List<Rectangle>();
                    double angle=result.TextAngle.HasValue?result.TextAngle.Value:0;
                    if(Math.Abs(angle)>10)return boxes;
                    var lines=new List<OcrLine>(result.Lines);var chosen=new HashSet<int>();
                    for(int i=0;i<lines.Count;i++)if(Matches(lines[i].Text,source)||(Normalize(source).Length==0&&PunctuationOnly(lines[i].Text,source)&&lines[i].Text.Trim()==source.Trim()))chosen.Add(i);
                    {var counts=new List<string>();foreach(var l in lines)counts.Add(Normalize(l.Text).Length.ToString());LastOcr="OCR 读到 "+lines.Count+" 行（字数 "+String.Join("/",counts.ToArray())+"），台词 "+Normalize(source).Length+" 字";}
                    // A one-character final line or a punctuation-only line has
                    // no independent OCR anchor. Admit it only beside a matched
                    // dialogue row, with matching source content and geometry.
                    for(int pass=0;pass<2;pass++)for(int i=0;i<lines.Count;i++){
                        if(chosen.Contains(i)||lines[i].Words.Count==0)continue;
                        string plain=Normalize(lines[i].Text);bool inSource=plain.Length>0&&Normalize(source).Contains(plain);
                        if(!inSource&&!PunctuationOnly(lines[i].Text,source))continue;
                        var current=LineBounds(lines[i],angle,input.Width,input.Height);
                        foreach(int j in new List<int>(chosen)){var anchor=LineBounds(lines[j],angle,input.Width,input.Height);double size=Math.Max(anchor.Height,current.Height);
                            if(Math.Abs(current.Top-anchor.Top)<size*2.8&&Math.Abs(current.Left-anchor.Left)<size*2.5){chosen.Add(i);break;}
                        }
                    }
                    var selected=new List<OcrLine>();
                    for(int i=0;i<lines.Count;i++)if(chosen.Contains(i))selected.Add(lines[i]);
                    selected.Sort((a,b)=>LineBounds(a,angle,input.Width,input.Height).Top.CompareTo(LineBounds(b,angle,input.Width,input.Height).Top));
                    foreach(var line in selected){
                        if(recognized!=null)recognized.Add(line.Text);
                        foreach(var word in line.Words){if(IndicatorOnly(word.Text))continue;var r=word.BoundingRect;Rectangle box=RotatedBounds(r.X,r.Y,r.Width,r.Height,angle,input.Width,input.Height);
                            if(box.Width>0&&box.Height>0){boxes.Add(box);if(advances!=null&&Normalize(word.Text).Length>0)advances.Add(box.Width/(double)Math.Max(1,StringInfo.ParseCombiningCharacters(word.Text).Length));}}
                    }
                    CompletePunctuation(boxes,selected,source,input.Width,input.Height);
                    return boxes;
                }
            }
        }
    }
    static bool IndicatorOnly(string text){return !String.IsNullOrWhiteSpace(text)&&String.IsNullOrWhiteSpace((text??"").Trim().Trim('▼','▽','▾','▿','﹀','⏷'));}
    static bool DialoguePunctuation(char c){return Char.IsPunctuation(c)||"…‥〜～ー".IndexOf(c)>=0;}
    static bool PunctuationOnly(string text,string source){bool any=false;foreach(char c in text){if(Char.IsWhiteSpace(c))continue;if(!DialoguePunctuation(c)||source.IndexOf(c)<0)return false;any=true;}return any;}
    static Rectangle LineBounds(OcrLine line,double angle,int width,int height){Rectangle result=Rectangle.Empty;foreach(var word in line.Words){if(IndicatorOnly(word.Text))continue;var r=word.BoundingRect;var box=RotatedBounds(r.X,r.Y,r.Width,r.Height,angle,width,height);result=result.IsEmpty?box:Rectangle.Union(result,box);}return result;}
    static int EdgePunctuation(string text,bool leading){text=(text??"").Trim().Trim('▼','▽','▾','▿');int count=0;for(int n=0;n<text.Length;n++){char c=text[leading?n:text.Length-1-n];if(!DialoguePunctuation(c))break;count++;}return count;}
    static void CompletePunctuation(List<Rectangle> boxes,List<OcrLine> lines,string source,int width,int height){
        if(boxes.Count==0||lines.Count==0)return;
        var rows=MergeCoverage(boxes);rows.Sort((a,b)=>a.Top.CompareTo(b.Top));var first=rows[0];var last=rows[rows.Count-1];
        int leading=Math.Min(6,Math.Max(0,EdgePunctuation(source,true)-EdgePunctuation(lines[0].Text,true))),trailing=Math.Min(8,Math.Max(0,EdgePunctuation(source,false)-EdgePunctuation(lines[lines.Count-1].Text,false)));
        // Japanese full-width punctuation occupies a character cell even when
        // OCR sees only a tiny dot. Fill only those expected cells at the ends.
        if(leading>0)boxes.Add(Rectangle.Intersect(new Rectangle(0,0,width,height),new Rectangle(Math.Max(0,first.Left-leading*first.Height),first.Top,leading*first.Height,first.Height)));
        if(trailing>0)boxes.Add(Rectangle.Intersect(new Rectangle(0,0,width,height),new Rectangle(last.Right,last.Top,trailing*last.Height,last.Height)));
        // Lines of one dialogue block start at the same left edge. A wrapped line that OCR starts later (dashes such
        // as "――" at its start are not recognised) gets its start covered back to that edge.
        int edge=int.MaxValue;foreach(var r in rows)edge=Math.Min(edge,r.Left);
        foreach(var r in rows){int gap=r.Left-edge;if(gap>r.Height/2&&gap<=r.Height*4)boxes.Add(new Rectangle(edge,r.Top,gap,r.Height));}
    }
    static List<Rectangle> FindIndicators(Bitmap image,List<Rectangle> rows){
        var output=new List<Rectangle>();if(rows.Count==0)return output;
        var ordered=new List<Rectangle>(rows);ordered.Sort((a,b)=>a.Top.CompareTo(b.Top));Rectangle last=ordered[ordered.Count-1];int size=Math.Max(12,last.Height);
        Rectangle area=Rectangle.Intersect(new Rectangle(0,0,image.Width,image.Height),Rectangle.FromLTRB(Math.Max(0,last.Right-size*3),Math.Max(0,last.Top-size/2),Math.Min(image.Width,last.Right+size*3),Math.Min(image.Height,last.Bottom+size/2)));
        if(area.IsEmpty)return output;byte[] pixels=Bytes(image);bool[] ink=new bool[area.Width*area.Height],seen=new bool[ink.Length];
        for(int x=area.Left;x<area.Right;x++){
            int top=Math.Max(0,area.Top-2),bottom=Math.Min(image.Height-1,area.Bottom+1),a=(top*image.Width+x)*4,b=(bottom*image.Width+x)*4;
            double bg=(pixels[a]+pixels[a+1]+pixels[a+2]+pixels[b]+pixels[b+1]+pixels[b+2])/6.0;
            for(int y=area.Top;y<area.Bottom;y++){int p=(y*image.Width+x)*4;double value=(pixels[p]+pixels[p+1]+pixels[p+2])/3.0;ink[(y-area.Top)*area.Width+x-area.Left]=Math.Abs(value-bg)>55;}
        }
        for(int start=0;start<ink.Length;start++){
            if(seen[start]||!ink[start])continue;var queue=new Queue<int>();var points=new List<Point>();queue.Enqueue(start);seen[start]=true;int l=area.Width,t=area.Height,r=0,b=0;
            while(queue.Count>0){int p=queue.Dequeue(),x=p%area.Width,y=p/area.Width;points.Add(new Point(x,y));l=Math.Min(l,x);r=Math.Max(r,x);t=Math.Min(t,y);b=Math.Max(b,y);
                for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=area.Width||ny>=area.Height)continue;int q=ny*area.Width+nx;if(!seen[q]&&ink[q]){seen[q]=true;queue.Enqueue(q);}}
            }
            int w=r-l+1,h=b-t+1;if(w<6||h<5||w<h*.8||w>h*2.5||h>size*1.2||points.Count<w*h*.18)continue;
            int[] left=new int[h],right=new int[h];for(int i=0;i<h;i++){left[i]=area.Width;right[i]=-1;}foreach(var p in points){left[p.Y-t]=Math.Min(left[p.Y-t],p.X);right[p.Y-t]=Math.Max(right[p.Y-t],p.X);}
            double topWidth=0,bottomWidth=0,center=(l+r)/2.0,drift=0;int segment=Math.Max(1,h/3);bool valid=true;
            for(int i=0;i<h;i++){if(right[i]<0){valid=false;break;}double span=right[i]-left[i]+1;if(i<segment)topWidth+=span;if(i>=h-segment)bottomWidth+=span;drift=Math.Max(drift,Math.Abs((left[i]+right[i])/2.0-center));}
            if(valid&&topWidth>bottomWidth*1.7&&drift<Math.Max(1.5,w*.12)){var marker=new Rectangle(area.Left+l,area.Top+t,w,h);marker.Inflate(2,2);output.Add(marker);}
        }
        return output;
    }
    static byte[] Bytes(Bitmap image){Rectangle area=new Rectangle(0,0,image.Width,image.Height);var data=image.LockBits(area,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);try{byte[] result=new byte[image.Width*image.Height*4];for(int y=0;y<image.Height;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),result,y*image.Width*4,image.Width*4);return result;}finally{image.UnlockBits(data);}}
    public static Rectangle RotatedBounds(double x,double y,double w,double h,double angle,int imageWidth,int imageHeight){
        double rad=angle*Math.PI/180,cos=Math.Cos(rad),sin=Math.Sin(rad),cx=imageWidth/2.0,cy=imageHeight/2.0;
        double left=Double.MaxValue,top=Double.MaxValue,right=Double.MinValue,bottom=Double.MinValue;
        foreach(var point in new[]{new[]{x,y},new[]{x+w,y},new[]{x,y+h},new[]{x+w,y+h}}){double px=(point[0]-cx)*cos-(point[1]-cy)*sin+cx,py=(point[0]-cx)*sin+(point[1]-cy)*cos+cy;left=Math.Min(left,px);right=Math.Max(right,px);top=Math.Min(top,py);bottom=Math.Max(bottom,py);}
        return Rectangle.Intersect(new Rectangle(0,0,imageWidth,imageHeight),Rectangle.FromLTRB((int)Math.Floor(left),(int)Math.Floor(top),(int)Math.Ceiling(right),(int)Math.Ceiling(bottom)));
    }
    static byte[] Blur(byte[] input,int width,int height,int radius){
        byte[] a=(byte[])input.Clone(),b=new byte[a.Length];
        for(int pass=0;pass<3;pass++){
            for(int y=0;y<height;y++)for(int c=0;c<3;c++){
                int sum=0;for(int dx=-radius;dx<=radius;dx++)sum+=a[(y*width+Math.Max(0,Math.Min(width-1,dx)))*4+c];
                for(int x=0;x<width;x++){b[(y*width+x)*4+c]=(byte)(sum/(2*radius+1));sum-=a[(y*width+Math.Max(0,x-radius))*4+c];sum+=a[(y*width+Math.Min(width-1,x+radius+1))*4+c];}
            }
            for(int x=0;x<width;x++)for(int c=0;c<3;c++){
                int sum=0;for(int dy=-radius;dy<=radius;dy++)sum+=b[(Math.Max(0,Math.Min(height-1,dy))*width+x)*4+c];
                for(int y=0;y<height;y++){a[(y*width+x)*4+c]=(byte)(sum/(2*radius+1));sum-=b[(Math.Max(0,y-radius)*width+x)*4+c];sum+=b[(Math.Min(height-1,y+radius+1)*width+x)*4+c];}
            }
        }
        return a;
    }
    public static Bitmap Render(Bitmap input,List<Rectangle> boxes,int radius,int padding){
        var coverage=MergeCoverage(boxes);
        return RenderBackground(Reconstruct(Bytes(input),input.Width,input.Height,coverage,padding),input.Width,input.Height,coverage,padding);
    }
    public static List<Rectangle> MergeCoverage(List<Rectangle> boxes){
        var rows=new List<List<Rectangle>>();
        foreach(var box in boxes){List<Rectangle> found=null;foreach(var row in rows){var first=row[0];if(Math.Abs((first.Top+first.Height/2.0)-(box.Top+box.Height/2.0))<Math.Max(first.Height,box.Height)*.6){found=row;break;}}if(found==null){found=new List<Rectangle>();rows.Add(found);}found.Add(box);}
        var result=new List<Rectangle>();
        foreach(var row in rows){row.Sort((a,b)=>a.Left.CompareTo(b.Left));Rectangle current=row[0];for(int i=1;i<row.Count;i++){var next=row[i];if(next.Left-current.Right<Math.Max(current.Height,next.Height)*1.5)current=Rectangle.Union(current,next);else{result.Add(current);current=next;}}result.Add(current);}
        return result;
    }
    static byte[] Reconstruct(byte[] source,int width,int height,List<Rectangle> boxes,int padding){
        var output=(byte[])source.Clone();
        foreach(var word in boxes){Rectangle expanded=word;expanded.Inflate(padding+2,padding+2);var region=Rectangle.Intersect(new Rectangle(0,0,width,height),expanded);int top=Math.Max(0,region.Top-2),bottom=Math.Min(height-1,region.Bottom+1);
            for(int x=region.Left;x<region.Right;x++)for(int channel=0;channel<3;channel++){
                int a=0,b=0,n=0;for(int dx=-2;dx<=2;dx++){int sx=Math.Max(0,Math.Min(width-1,x+dx));a+=source[(top*width+sx)*4+channel];b+=source[(bottom*width+sx)*4+channel];n++;}
                double above=a/(double)n,below=b/(double)n;
                for(int y=region.Top;y<region.Bottom;y++){double amount=(y-top)/(double)Math.Max(1,bottom-top);output[(y*width+x)*4+channel]=(byte)Math.Max(0,Math.Min(255,above+(below-above)*amount));}
            }
        }
        return output;
    }
    static List<Rectangle> RefineCoverage(Bitmap image,List<Rectangle> boxes){
        var output=new List<Rectangle>();byte[] pixels=Bytes(image);
        foreach(var box in boxes){
            int reach=Math.Max(3,Math.Min(10,box.Height/3));Rectangle search=box;search.Inflate(reach,reach);search=Rectangle.Intersect(new Rectangle(0,0,image.Width,image.Height),search);
            int l=box.Left,t=box.Top,r=box.Right,b=box.Bottom,above=Math.Max(0,search.Top-3),below=Math.Min(image.Height-1,search.Bottom+2);
            for(int x=search.Left;x<search.Right;x++){
                int a=(above*image.Width+x)*4,z=(below*image.Width+x)*4;
                double top=(pixels[a]+pixels[a+1]+pixels[a+2])/3.0,bottom=(pixels[z]+pixels[z+1]+pixels[z+2])/3.0;
                for(int y=search.Top;y<search.Bottom;y++){
                    int p=(y*image.Width+x)*4;double value=(pixels[p]+pixels[p+1]+pixels[p+2])/3.0,expected=top+(bottom-top)*(y-above)/Math.Max(1,below-above);
                    if(Math.Abs(value-expected)>55){l=Math.Min(l,x);r=Math.Max(r,x+1);t=Math.Min(t,y);b=Math.Max(b,y+1);}
                }
            }
            output.Add(Rectangle.Intersect(new Rectangle(0,0,image.Width,image.Height),Rectangle.FromLTRB(l,t,r,b)));
        }
        return output;
    }
    static Bitmap RenderBackground(byte[] blur,int width,int height,List<Rectangle> boxes,int padding,List<Rectangle> exclusions=null){
        byte[] output=new byte[width*height*4];
        foreach(Rectangle word in boxes){
            Rectangle expanded=word;expanded.Inflate(padding,padding);Rectangle region=Rectangle.Intersect(new Rectangle(0,0,width,height),expanded);
            for(int y=region.Top;y<region.Bottom;y++)for(int x=region.Left;x<region.Right;x++){
                bool excluded=false;if(exclusions!=null)foreach(var marker in exclusions)if(marker.Contains(x,y)){excluded=true;break;}if(excluded)continue;
                int edge=Math.Min(Math.Min(x-expanded.Left,expanded.Right-1-x),Math.Min(y-expanded.Top,expanded.Bottom-1-y));
                int alpha=Math.Min(255,(edge+1)*85),index=(y*width+x)*4;if(output[index+3]>=alpha)continue;
                output[index]=(byte)(blur[index]*alpha/255);output[index+1]=(byte)(blur[index+1]*alpha/255);output[index+2]=(byte)(blur[index+2]*alpha/255);output[index+3]=(byte)alpha;
            }
        }
        var bitmap=new Bitmap(width,height,PixelFormat.Format32bppPArgb);var data=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppPArgb);
        try{for(int y=0;y<height;y++)Marshal.Copy(output,y*width*4,IntPtr.Add(data.Scan0,y*data.Stride),width*4);}finally{bitmap.UnlockBits(data);}return bitmap;
    }
    public static int SelfTest(string destination){
        Rectangle clipped=ScanRegion(1280,720,95,95,100,100);
        if(clipped.Right!=1280||clipped.Bottom!=720||clipped.Width<1||clipped.Height<1)throw new Exception("Scan region must stay inside game client");
        if(!Matches("今日もいい天気ですね","「今日もいい天気ですね。」")||Matches("無関係なボタン","今日は晴れています"))throw new Exception("OCR matching failed");
        using(var edgeSample=new Bitmap(260,100,PixelFormat.Format32bppArgb)){
            using(var g=Graphics.FromImage(edgeSample)){g.Clear(Color.FromArgb(216,214,205));g.FillRectangle(Brushes.Black,35,43,112,4);}
            var refined=RefineCoverage(edgeSample,new List<Rectangle>{new Rectangle(40,35,100,30)});
            if(!refined[0].Contains(35,44)||!refined[0].Contains(146,44))throw new Exception("Ink beyond both OCR edges must be included");
        }
        // A filled/outlined page indicator must remain visible even where a
        // text mask overlaps it; ordinary sentence punctuation stays covered.
        using(var sample=new Bitmap(400,100,PixelFormat.Format32bppArgb)){
            using(var g=Graphics.FromImage(sample)){g.Clear(Color.FromArgb(216,214,205));g.FillPolygon(Brushes.Black,new[]{new Point(270,40),new Point(290,40),new Point(280,53)});g.FillEllipse(Brushes.Black,250,51,5,5);}
            var areas=new List<Rectangle>{new Rectangle(40,35,250,28)};
            var markers=FindIndicators(sample,areas);if(markers.Count!=1||!markers[0].Contains(280,45))throw new Exception("Page indicator detection failed");
            using(var cover=RenderBackground(Reconstruct(Bytes(sample),400,100,areas,4),400,100,areas,4,markers)){
                if(cover.GetPixel(280,45).A!=0||cover.GetPixel(252,53).A<250)throw new Exception("Indicator must stay visible while punctuation is covered");
            }
        }
        using(var source=new Bitmap(1050,180,PixelFormat.Format32bppArgb)){
            using(var graphics=Graphics.FromImage(source)){graphics.Clear(Color.FromArgb(216,214,205));using(var font=new Font("Yu Mincho",32))graphics.DrawString("今日はいい天気ですね。",font,Brushes.Black,30,55);}
            var engine=OcrEngine.TryCreateFromLanguage(new Language("ja"));if(engine==null)throw new Exception("Japanese OCR missing");
            var boxes=FindWords(source,engine,"今日はいい天気ですね。");if(boxes.Count<1)throw new Exception("OCR found no matching words");
            var predicted=PredictBoxes("次の台詞を先に覆います。",boxes,44,source.Width,source.Height);
            if(predicted.Count!=12)throw new Exception("Predictive mask character layout failed");
            var emitted=new List<object>();using(var fast=new GameTextMask(emitted.Add)){
                fast.Source="前の台詞";fast.HasFrame=true;fast.Cached=new FastTemplate{Width=1050,Height=180,Region=new Rectangle(0,0,1050,180),Boxes=boxes,Advance=44,Background=Blur(Bytes(source),1050,180,13)};
                var watch=System.Diagnostics.Stopwatch.StartNew();fast.SetSource("次の台詞を先に覆います。");watch.Stop();LastFastTestMilliseconds=watch.ElapsedMilliseconds;
                if(emitted.Count!=1||new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(emitted[0]).IndexOf("\"provisional\":true",StringComparison.Ordinal)<0)throw new Exception("New sentence must publish a provisional image immediately, without a clear gap");
            }
            using(var mask=Render(source,boxes,13,2)){
                if(mask.GetPixel(0,0).A!=0||mask.GetPixel(source.Width-1,source.Height-1).A!=0)throw new Exception("Mask escapes word areas");
                int ink=0,coveredInk=0,opaque=0;
                for(int y=0;y<source.Height;y++)for(int x=0;x<source.Width;x++){
                    Color original=source.GetPixel(x,y),cover=mask.GetPixel(x,y);
                    if(cover.A>0)opaque++;
                    if(original.R<100&&original.G<100&&original.B<100){ink++;if(cover.A>220)coveredInk++;}
                }
                if(ink<100||coveredInk<ink*.985)throw new Exception("OCR word masks leave visible source strokes");
                if(opaque>source.Width*source.Height*.25)throw new Exception("Mask is too large for the source text");
                if(destination!=null){Directory.CreateDirectory(destination);File.WriteAllText(Path.Combine(destination,"boxes.txt"),String.Join("\n",boxes));source.Save(Path.Combine(destination,"source.png"),ImageFormat.Png);mask.Save(Path.Combine(destination,"mask.png"),ImageFormat.Png);using(var combined=(Bitmap)source.Clone()){using(var graphics=Graphics.FromImage(combined))graphics.DrawImageUnscaled(mask,0,0);combined.Save(Path.Combine(destination,"covered.png"),ImageFormat.Png);}}
            }
            if(FindWords(source,engine,"これは全く関係のない別の文章です").Count!=0)throw new Exception("Unrelated text must not be masked");
            return boxes.Count;
        }
    }
    public static long LastFastTestMilliseconds;
    public void Dispose(){Hide();lock(Frames){Disposed=true;Frame f;while(Frames.TryDequeue(out f))f.Dispose();}}

}
