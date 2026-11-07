// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
public sealed class GameHookVerifier : IDisposable {
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out GalWindowBridge.Rect r);
 readonly Action<object> Emit;int Generation;bool Disposed,Busy;Dictionary<string,object> Pending;IntPtr Target;DateTime Due;
 public GameHookVerifier(Action<object> emit){Emit=emit;}
 static double Num(Dictionary<string,object>d,string k,double v){object x;double n;return d.TryGetValue(k,out x)&&Double.TryParse(Convert.ToString(x,System.Globalization.CultureInfo.InvariantCulture),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out n)?n:v;}
 public void Request(IntPtr target,Dictionary<string,object> d){Generation++;Target=target;Pending=d;Due=DateTime.UtcNow.AddMilliseconds(850);}
 public void Cancel(){Generation++;Pending=null;}
 public void Tick(){
  if(Disposed||Busy||Pending==null||DateTime.UtcNow<Due)return;
  var request=Pending;Pending=null;var hwnd=Target;int serial=Generation;Busy=true;
  ThreadPool.QueueUserWorkItem(delegate{try{
   string source=Convert.ToString(request["source"]),stage=Convert.ToString(request["stage"]);long sequence=Convert.ToInt64(request["sequence"]);
   for(int sample=1;sample<=2;sample++){
    if(sample==2)Thread.Sleep(650);
    if(Disposed||serial!=Generation)return;
    GalWindowBridge.Rect client;if(!IsWindow(hwnd)||IsIconic(hwnd)||!GetClientRect(hwnd,out client))throw new Exception("游戏已最小化或窗口不可用");
    int width=client.Right,height=client.Bottom;
    int x=(int)(width*Math.Max(0,Math.Min(95,Num(request,"scanX",5)))/100),y=(int)(height*Math.Max(0,Math.Min(95,Num(request,"scanY",70)))/100);
    int rw=Math.Max(1,(int)(width*Math.Max(5,Math.Min(100,Num(request,"scanWidth",92)))/100));
    int rh=Math.Max(1,(int)(height*Math.Max(5,Math.Min(100,Num(request,"scanHeight",28)))/100));
    var region=Rectangle.Intersect(new Rectangle(0,0,width,height),new Rectangle(x,y,rw,rh));
    var result=GameTextMask.ProbeOriginal(hwnd,width,height,region,source);
    if(Disposed||serial!=Generation)return;
    Emit(new{type="hookVisual",sequence=sequence,stage=stage,sample=sample,valid=true,matched=result.Matched,japaneseCharacters=result.JapaneseCharacters,recognizedCharacters=result.Characters,sourceCharacters=GameTextMask.Normalize(source).Length,checkedAt=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),region=new{x=region.X,y=region.Y,width=region.Width,height=region.Height}});
   }
  }catch(Exception e){if(!Disposed&&serial==Generation)Emit(new{type="hookVisual",valid=false,sequence=Convert.ToInt64(request["sequence"]),stage=Convert.ToString(request["stage"]),error=e.Message});}finally{Busy=false;}});
 }
 public void Dispose(){Disposed=true;Cancel();}
}
