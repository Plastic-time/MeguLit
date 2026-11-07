// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Imaging;
// E263 (user: auto-hide fails on every game without a wait-marker profile): an auto-calibrated dialogue-box probe that
// needs no per-game setup. The lower band of the game client is sampled ~0.7 s after each new line, while the box is
// certainly shown. Cells that keep the same colour across lines whose backgrounds differed are the box itself (frame,
// name plate, buttons, opaque fill). Once those are known, the box is gone when most of them stop matching.
// No decision is made until two lines with clearly different backgrounds have been seen, so a static scene cannot
// teach the background as "box".
public sealed class DialogBoxProbe{
 const int Cols=48,Rows=16,Keep=8;
 readonly List<int[]> samples=new List<int[]>();
 bool[] stable;int stableCount;DateTime lineAt=DateTime.MinValue,next=DateTime.MinValue;bool sampled=true;int low,high;bool? reported;int width,height;
 public void Reset(){samples.Clear();stable=null;stableCount=0;sampled=true;low=high=0;reported=null;}
 public void Line(){lineAt=DateTime.UtcNow;sampled=false;low=high=0;}
 static int[] Grab(IntPtr window,int w,int h){
  using(var image=new Bitmap(w,h,PixelFormat.Format32bppArgb)){
   if(!GameCapture.Into(window,image,2))return null;
   int top=h*55/100,band=h-top;var cells=new int[Cols*Rows];
   var data=image.LockBits(new Rectangle(0,top,w,band),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   try{
    var buf=new byte[data.Stride*band];System.Runtime.InteropServices.Marshal.Copy(data.Scan0,buf,0,buf.Length);
    for(int r=0;r<Rows;r++)for(int c=0;c<Cols;c++){
     int x0=c*w/Cols,x1=(c+1)*w/Cols,y0=r*band/Rows,y1=(r+1)*band/Rows;long R=0,G=0,B=0;int n=0;
     for(int y=y0;y<y1;y+=2){int row=y*data.Stride;for(int x=x0;x<x1;x+=2){int o=row+x*4;B+=buf[o];G+=buf[o+1];R+=buf[o+2];n++;}}
     if(n==0)n=1;cells[r*Cols+c]=(int)(R/n)<<16|(int)(G/n)<<8|(int)(B/n);
    }
   }finally{image.UnlockBits(data);}
   return cells;
  }
 }
 static bool Same(int a,int b){return Math.Abs((a>>16&255)-(b>>16&255))+Math.Abs((a>>8&255)-(b>>8&255))+Math.Abs((a&255)-(b&255))<36;}
 static double Differ(int[] a,int[] b){int d=0;for(int i=0;i<a.Length;i++)if(!Same(a[i],b[i]))d++;return d/(double)a.Length;}
 void Learn(){
  stable=null;stableCount=0;if(samples.Count<2)return;bool varied=false;
  for(int i=0;i<samples.Count&&!varied;i++)for(int j=i+1;j<samples.Count;j++)if(Differ(samples[i],samples[j])>=.25){varied=true;break;}
  if(!varied)return;
  var keep=new bool[Cols*Rows];int count=0;
  for(int k=0;k<keep.Length;k++){bool ok=true;for(int i=1;i<samples.Count&&ok;i++)ok=Same(samples[0][k],samples[i][k]);keep[k]=ok;if(ok)count++;}
  // Too few cells is noise; too many means the backgrounds were not really different.
  if(count<keep.Length*3/100||count>keep.Length*85/100)return;
  stable=keep;stableCount=count;
 }
 public bool? Tick(IntPtr window,int w,int h){
  if(w<160||h<120)return null;
  if(w!=width||h!=height){width=w;height=h;Reset();}
  var now=DateTime.UtcNow;if(now<next)return null;next=now.AddMilliseconds(400);
  if(!sampled&&(now-lineAt).TotalMilliseconds>=700){
   sampled=true;var cells=Grab(window,w,h);if(cells==null)return null;
   // A line sampled while the box is already gone would poison the template: only learn from a frame that still
   // matches the current template, or while there is none.
   if(stable==null||Score(cells)>=.6){samples.Add(cells);if(samples.Count>Keep)samples.RemoveAt(0);Learn();}
   return null;
  }
  if(stable==null)return null;
  var now2=Grab(window,w,h);if(now2==null)return null;double score=Score(now2);
  if(score<.35){low++;high=0;}else if(score>=.7){high++;low=0;}else{low=high=0;}
  if(low>=2&&reported!=false){reported=false;return false;}
  if(high>=1&&reported!=true){reported=true;return true;}
  return null;
 }
 double Score(int[] cells){int hit=0;for(int k=0;k<cells.Length;k++)if(stable[k]&&Same(samples[samples.Count-1][k],cells[k]))hit++;return stableCount==0?1:hit/(double)stableCount;}
}
