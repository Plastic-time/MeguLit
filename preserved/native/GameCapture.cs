// SPDX-License-Identifier: GPL-3.0-or-later
// Reads a game window's client area for text, marker and dialogue detection.
// PrintWindow with PW_RENDERFULLCONTENT makes some DirectX games (Steins;Gate) render an extra frame, which shows as
// white flashes while it runs several times a second. BitBlt from the window's DC only reads what DWM already
// composed (without ToMe's own overlay windows), so it is tried first; a window that gives a blank picture that way
// falls back to PrintWindow. Nothing is read while the window is dragged or minimised (see Into).
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
 sealed class Choice{public bool Blt,Proven;public DateTime Checked;}
 static readonly Dictionary<IntPtr,Choice> Choices=new Dictionary<IntPtr,Choice>();static readonly object Gate=new object();
 // True when the last Into() on this thread did not read the window only for the moment (dragged, minimised, one
 // blank frame): callers keep what they have and try again, without reporting an error.
 [ThreadStatic]public static bool Skipped;
 // The window is being moved or resized (its thread runs the system move/size loop) or is minimised.
 public static bool Busy(IntPtr hwnd){
  if(hwnd==IntPtr.Zero||IsIconic(hwnd))return true;uint pid,thread=GetWindowThreadProcessId(hwnd,out pid);if(thread==0)return false;
  var info=new GuiInfo();info.Size=Marshal.SizeOf(typeof(GuiInfo));return GetGUIThreadInfo(thread,ref info)&&(info.Flags&0x2)!=0;
 }
 // Fills image (client size) with the window's picture; false when it could not be read this time.
 // While a DirectX game is dragged its thread stops presenting and BitBlt can see one blank frame; that used to switch
 // the window to PrintWindow, which makes such a game repaint itself white (the white screen while dragging) and kept
 // it on PrintWindow for 30 seconds. Now nothing is read during a move, and a window BitBlt has read before never
 // falls back to PrintWindow: a blank frame there is only skipped.
 public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags){return Into(hwnd,image,printFlags,false);}
 // screenFallback: some DirectX/Unity windows give a blank picture to both BitBlt and PrintWindow (style sync then saw
 // "ocrLines=0"). Only callers that hide ToMe's own text first (style measurement) may read the screen instead: it
 // includes overlays, so marker and mask detection never use it.
 public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags,bool screenFallback){
  Skipped=false;if(Busy(hwnd)){Skipped=true;return false;}
  Choice c;lock(Gate){if(!Choices.TryGetValue(hwnd,out c)){if(Choices.Count>16)Choices.Clear();c=new Choice{Blt=true,Checked=DateTime.UtcNow};Choices[hwnd]=c;}
   else if(!c.Blt&&!c.Proven&&(DateTime.UtcNow-c.Checked).TotalSeconds>30){c.Blt=true;c.Checked=DateTime.UtcNow;}}
  if(c.Blt){if(Blt(hwnd,image)&&!Blank(image)){c.Proven=true;return true;}
   if(c.Proven){Skipped=true;return false;}
   lock(Gate){c.Blt=false;c.Checked=DateTime.UtcNow;}}
  bool printed;using(var g=Graphics.FromImage(image)){IntPtr dc=g.GetHdc();try{printed=PrintWindow(hwnd,dc,printFlags);}finally{g.ReleaseHdc(dc);}}
  if(printed&&!Blank(image))return true;if(!screenFallback)return printed;
  return ScreenInto(hwnd,image);
 }
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
 // A picture with almost no variation (all black or one colour) means BitBlt cannot see this window's content.
 static bool Blank(Bitmap image){
  int w=image.Width,h=image.Height;if(w<4||h<4)return true;int lo=255,hi=0;
  var d=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{var row=new byte[w*4];for(int y=h/16;y<h;y+=Math.Max(1,h/16)){Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),row,0,w*4);for(int x=w/16;x<w;x+=Math.Max(1,w/16)){int i=x*4,l=(row[i]+row[i+1]+row[i+2])/3;if(l<lo)lo=l;if(l>hi)hi=l;}}}
  finally{image.UnlockBits(d);}
  return hi-lo<6;
 }
}
