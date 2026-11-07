// SPDX-License-Identifier: GPL-3.0-or-later
// Visual-only OCR surface: WS_EX_TRANSPARENT keeps it out of mouse hit testing.
using System;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;
public sealed class NativeMaskLayer:IDisposable{
 [StructLayout(LayoutKind.Sequential)]struct Point{public int X,Y;public Point(int x,int y){X=x;Y=y;}}
 [StructLayout(LayoutKind.Sequential)]struct Size{public int W,H;public Size(int w,int h){W=w;H=h;}}
 [StructLayout(LayoutKind.Sequential,Pack=1)]struct Blend{public byte Operation,Flags,Alpha,Format;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowEx(uint ex,string cls,string title,uint style,int x,int y,int w,int h,IntPtr owner,IntPtr menu,IntPtr instance,IntPtr param);
 [DllImport("user32.dll")]static extern bool UpdateLayeredWindow(IntPtr window,IntPtr screen,ref Point position,ref Size size,IntPtr source,ref Point origin,uint key,ref Blend blend,uint flags);
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int w,int h,uint flags);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr window,int command);
 [DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr window);
 [DllImport("gdi32.dll")]static extern IntPtr CreateCompatibleDC(IntPtr dc);
 [DllImport("gdi32.dll")]static extern IntPtr SelectObject(IntPtr dc,IntPtr value);
 [DllImport("gdi32.dll")]static extern bool DeleteDC(IntPtr dc);
 [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr value);
 IntPtr Window,Owner,Game;int BaseX,BaseY,X,Y,Width,Height;bool HasImage,Visible;
 // The OCR cover must sit under MeguLit's reading layer: an owned window always stays above its owner, so it is owned by
 // the game window (above the game) and placed directly below the reading layer (Owner), never on top of MeguLit's text.
 public void Origin(IntPtr overlay,IntPtr game,int x,int y){Owner=overlay;BaseX=x;BaseY=y;
  if(game!=IntPtr.Zero&&game!=Game){if(Window!=IntPtr.Zero&&!CreatedForMarker){DestroyWindow(Window);Window=IntPtr.Zero;Visible=false;HasImage=false;}Game=game;}
  if(HasImage&&Window!=IntPtr.Zero)SetWindowPos(Window,Owner,BaseX+X,BaseY+Y,Width,Height,0x0010|0x0004);}
 bool CreatedForMarker{get{return CreatedOwner!=IntPtr.Zero;}}
 public void Frame(string png,int x,int y,int width,int height){if(width<1||height<1||width>7680||height>4320)return;if(Window==IntPtr.Zero)Window=CreateWindowEx(0x080800a0,"STATIC","MeguLit visual mask",0x80000000,0,0,1,1,Game!=IntPtr.Zero?Game:Owner,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(Window==IntPtr.Zero)return;
  using(var stream=new MemoryStream(Convert.FromBase64String(png)))using(var original=new Bitmap(stream))using(var image=new Bitmap(original.Width,original.Height,PixelFormat.Format32bppPArgb)){using(var g=Graphics.FromImage(image))g.DrawImageUnscaled(original,0,0);IntPtr bitmap=image.GetHbitmap(Color.FromArgb(0)),dc=CreateCompatibleDC(IntPtr.Zero),old=SelectObject(dc,bitmap);try{var position=new Point(BaseX+x,BaseY+y);var size=new Size(width,height);var zero=new Point();var blend=new Blend{Alpha=255,Format=1};HasImage=UpdateLayeredWindow(Window,IntPtr.Zero,ref position,ref size,dc,ref zero,0,ref blend,2);X=x;Y=y;Width=width;Height=height;if(HasImage){SetWindowPos(Window,Owner,position.X,position.Y,width,height,0x0010|0x0040);Visible=true;}}finally{SelectObject(dc,old);DeleteObject(bitmap);DeleteDC(dc);}}
 }
 // Places a ready bitmap at absolute screen coordinates (used for the wait-marker cover).
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr window,uint command);
 IntPtr CreatedOwner;
 // The cover is owned by the game window and not topmost: it sits directly above the game, below menus, the
 // reading layer and any other application, and minimises with the game.
 public void Show(Bitmap source,int screenX,int screenY,IntPtr game){if(source.Width<1||source.Height<1||game==IntPtr.Zero)return;
  if(Window!=IntPtr.Zero&&CreatedOwner!=game){DestroyWindow(Window);Window=IntPtr.Zero;Visible=false;}
  if(Window==IntPtr.Zero){Window=CreateWindowEx(0x080800a0,"STATIC","MeguLit marker cover",0x80000000,0,0,1,1,game,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);CreatedOwner=game;}if(Window==IntPtr.Zero)return;
  using(var image=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppPArgb)){using(var g=Graphics.FromImage(image))g.DrawImageUnscaled(source,0,0);IntPtr bitmap=image.GetHbitmap(Color.FromArgb(0)),dc=CreateCompatibleDC(IntPtr.Zero),old=SelectObject(dc,bitmap);try{var position=new Point(screenX,screenY);var size=new Size(source.Width,source.Height);var zero=new Point();var blend=new Blend{Alpha=255,Format=1};HasImage=UpdateLayeredWindow(Window,IntPtr.Zero,ref position,ref size,dc,ref zero,0,ref blend,2);if(HasImage){if(!Visible){IntPtr above=GetWindow(game,3);if(above==Window)above=IntPtr.Zero;SetWindowPos(Window,above,position.X,position.Y,size.W,size.H,0x0010|0x0040);}Visible=true;}}finally{SelectObject(dc,old);DeleteObject(bitmap);DeleteDC(dc);}}
 }
 public void Hide(){if(Window!=IntPtr.Zero&&Visible)ShowWindow(Window,0);Visible=false;HasImage=false;}
 public void Dispose(){Hide();if(Window!=IntPtr.Zero)DestroyWindow(Window);Window=IntPtr.Zero;}
}
