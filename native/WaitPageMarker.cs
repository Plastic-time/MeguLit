// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Drawing;

// A light speech/page outline, with a clipped lower-right corner and two lines of ink.
public static class WaitPageMarker {
 static bool Light(byte[] pixels,int width,int x,int y) {
  int i=(y*width+x)*4;
  return pixels[i]+pixels[i+1]+pixels[i+2]>570;
 }
 public static bool Matches(byte[] pixels,int width,Rectangle r){
  if(r.Width<14||r.Height<14||r.Width>r.Height*1.25||r.Height>r.Width*1.25)return false;
  int thickness=Math.Max(2,r.Height/7),corner=Math.Max(4,r.Width/4);
  int top=0,left=0,right=0,bottom=0,cornerInk=0;
  for(int x=r.Left+thickness;x<r.Right-thickness;x++){
   for(int y=r.Top;y<r.Top+thickness;y++)if(Light(pixels,width,x,y)){top++;break;}
   if(x<r.Right-corner)for(int y=r.Bottom-thickness;y<r.Bottom;y++)if(Light(pixels,width,x,y)){bottom++;break;}
  }
  for(int y=r.Top+thickness;y<r.Bottom-thickness;y++){
   for(int x=r.Left;x<r.Left+thickness;x++)if(Light(pixels,width,x,y)){left++;break;}
   for(int x=r.Right-thickness;x<r.Right;x++)if(Light(pixels,width,x,y)){
    if(y<r.Bottom-corner)right++;
    break;
   }
  }
  int tip=Math.Max(3,corner/2);
  for(int y=r.Bottom-tip;y<r.Bottom;y++)for(int x=r.Right-tip;x<r.Right;x++)if(Light(pixels,width,x,y))cornerInk++;
  if(top<.65*(r.Width-2*thickness)||left<.65*(r.Height-2*thickness)||right<.62*(r.Height-corner-thickness)||
     bottom<.6*(r.Width-corner-thickness)||cornerInk>.25*tip*tip)return false;
  int runs=0;bool ink=false;
  for(int y=r.Top+thickness+1;y<r.Bottom-corner;y++){
   int count=0;
   for(int x=r.Left+thickness+1;x<r.Right-thickness-1;x++)if(Light(pixels,width,x,y))count++;
   bool next=count>=Math.Max(3,r.Width/3);
   if(next&&!ink)runs++;
   ink=next;
  }
  return runs==2;
 }
 public static bool SelfTest(){
  using(var image=new Bitmap(140,64))
  using(var g=Graphics.FromImage(image))
  using(var pen=new Pen(Color.White,2)){
   g.Clear(Color.FromArgb(20,105,153));
   g.DrawPolygon(pen,new[]{new Point(24,18),new Point(46,18),new Point(46,34),new Point(40,40),new Point(24,40)});
   g.DrawLine(pen,29,24,41,24);g.DrawLine(pen,29,29,41,29);
   g.DrawRectangle(pen,62,18,22,22);g.DrawLine(pen,67,24,79,24);g.DrawLine(pen,67,29,79,29);
   g.DrawEllipse(pen,100,18,22,22);
   var found=GameWaitMarker.DetectPage(image);
   return found.Count==1&&found[0].Contains(new Point(35,29));
  }
 }
}
