// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Sample the upper part of the bound game client only after game input. A pause
// or a single moving sprite cannot, by itself, make the dialogue disappear.
public sealed class GameSceneProbe : IDisposable {
 [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
 [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
 [DllImport("gdi32.dll")] static extern bool StretchBlt(IntPtr dst,int x,int y,int w,int h,IntPtr src,int sx,int sy,int sw,int sh,uint rop);
 const int Columns=24, Rows=12;
 readonly Bitmap sample=new Bitmap(Columns,Rows,PixelFormat.Format32bppArgb);
 int[] last, baseline;
 DateTime inputAt, next;
 bool hidden;
 int changed, returned;
 int left, top, width, height;

 public void Reset(){last=null;baseline=null;changed=returned=0;hidden=false;inputAt=DateTime.MinValue;}
 public void Line(){baseline=null;changed=returned=0;hidden=false;inputAt=DateTime.MinValue;}
 public void Input(){
  if(hidden||baseline!=null||last==null)return;
  baseline=last;inputAt=DateTime.UtcNow;changed=0;
 }
 public static double Difference(int[] a,int[] b){
  if(a==null||b==null||a.Length==0||a.Length!=b.Length)return 0;
  int different=0;
  for(int i=0;i<a.Length;i++){
   int d=Math.Abs((a[i]&255)-(b[i]&255))+Math.Abs((a[i]>>8&255)-(b[i]>>8&255))+Math.Abs((a[i]>>16&255)-(b[i]>>16&255));
   if(d>=108)different++;
  }
  return different/(double)a.Length;
 }
 public bool? Tick(int x,int y,int w,int h){
  if(w<160||h<120)return null;
  var now=DateTime.UtcNow;
  if(x!=left||y!=top||w!=width||h!=height){
   // A move or resize invalidates the old pixels, but must not re-show a hidden line.
   last=null;baseline=null;changed=returned=0;left=x;top=y;width=w;height=h;
  }
  if(now<next)return null;
  next=now.AddMilliseconds(170);
  var screen=GetDC(IntPtr.Zero);if(screen==IntPtr.Zero)return null;
  try{
   using(var graphics=Graphics.FromImage(sample)){
    var dc=graphics.GetHdc();
    try{if(!StretchBlt(dc,0,0,Columns,Rows,screen,x+w/10,y+h/9,w*8/10,h*5/9,0x00CC0020))return null;}
    finally{graphics.ReleaseHdc(dc);}
   }
  }finally{ReleaseDC(IntPtr.Zero,screen);}
  var pixels=new int[Columns*Rows];
  for(int row=0;row<Rows;row++)for(int col=0;col<Columns;col++)pixels[row*Columns+col]=sample.GetPixel(col,row).ToArgb();
  last=pixels;
  if(baseline==null)return null;
  double delta=Difference(baseline,pixels);
  if(hidden){
   returned=delta<=.13?returned+1:0;
   if(returned>=2){Line();return true;}
  }else{
   if((now-inputAt).TotalMilliseconds>1900){Line();return null;}
   changed=delta>=.62?changed+1:0;
   if(changed>=3){hidden=true;return false;}
  }
  return null;
 }
 public void Dispose(){sample.Dispose();}
}
