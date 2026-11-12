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
 /* Issue #135 (Magpie): while Magpie scales the game into its own window, every cover is placed and stretched over Magpie's
    picture (source rectangle -> destination rectangle, physical pixels) and kept just under the reading layer, which is
    above Magpie; otherwise Magpie's window hid the covers and the scaled picture still showed the original text. */
 static volatile bool Scaled;static int SL,ST,DL,DT;static double KX=1,KY=1;static IntPtr Reader;
 public static void Scale(bool on,int srcLeft,int srcTop,int destLeft,int destTop,double kx,double ky,IntPtr reader){SL=srcLeft;ST=srcTop;DL=destLeft;DT=destTop;KX=kx>0?kx:1;KY=ky>0?ky:1;Reader=reader;Scaled=on;}
 static int MX(int x){return Scaled?DL+(int)Math.Round((x-SL)*KX):x;}
 static int MY(int y){return Scaled?DT+(int)Math.Round((y-ST)*KY):y;}
 static int MW(int w){return Scaled?Math.Max(1,(int)Math.Ceiling(w*KX)):w;}
 static int MH(int h){return Scaled?Math.Max(1,(int)Math.Ceiling(h*KY)):h;}
 static Bitmap Fit(Bitmap source,int w,int h){var image=new Bitmap(w,h,PixelFormat.Format32bppPArgb);using(var g=Graphics.FromImage(image)){if(w==source.Width&&h==source.Height)g.DrawImageUnscaled(source,0,0);else{g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;g.PixelOffsetMode=System.Drawing.Drawing2D.PixelOffsetMode.Half;g.DrawImage(source,new Rectangle(0,0,w,h));}}return image;}
 // The OCR cover must sit under MeguLit's reading layer: an owned window always stays above its owner, so it is owned by
 // the game window (above the game) and placed directly below the reading layer (Owner), never on top of MeguLit's text.
 public void Origin(IntPtr overlay,IntPtr game,int x,int y){Owner=overlay;BaseX=x;BaseY=y;
  if(game!=IntPtr.Zero&&game!=Game){if(Window!=IntPtr.Zero&&!CreatedForMarker){DestroyWindow(Window);Window=IntPtr.Zero;Visible=false;HasImage=false;}Game=game;}
  if(HasImage&&Window!=IntPtr.Zero)SetWindowPos(Window,Owner,MX(BaseX+X),MY(BaseY+Y),MW(Width),MH(Height),0x0010|(Scaled?0u:0x0004u));}
 bool CreatedForMarker{get{return CreatedOwner!=IntPtr.Zero;}}
 public void Frame(string png,int x,int y,int width,int height){if(width<1||height<1||width>7680||height>4320)return;if(Window==IntPtr.Zero)Window=CreateWindowEx(0x080800a0,"STATIC","MeguLit visual mask",0x80000000,0,0,1,1,Game!=IntPtr.Zero?Game:Owner,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(Window==IntPtr.Zero)return;
  using(var stream=new MemoryStream(Convert.FromBase64String(png)))using(var original=new Bitmap(stream))using(var image=Fit(original,Scaled?MW(original.Width):original.Width,Scaled?MH(original.Height):original.Height)){IntPtr bitmap=image.GetHbitmap(Color.FromArgb(0)),dc=CreateCompatibleDC(IntPtr.Zero),old=SelectObject(dc,bitmap);try{var position=new Point(MX(BaseX+x),MY(BaseY+y));var size=new Size(Scaled?MW(width):width,Scaled?MH(height):height);var zero=new Point();var blend=new Blend{Alpha=255,Format=1};HasImage=UpdateLayeredWindow(Window,IntPtr.Zero,ref position,ref size,dc,ref zero,0,ref blend,2);X=x;Y=y;Width=width;Height=height;if(HasImage){SetWindowPos(Window,Owner,position.X,position.Y,size.W,size.H,0x0010|0x0040);Visible=true;}}finally{SelectObject(dc,old);DeleteObject(bitmap);DeleteDC(dc);}}
 }
 // Places a ready bitmap at absolute screen coordinates (used for the wait-marker cover).
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr window,uint command);
 IntPtr CreatedOwner;
 // The cover is owned by the game window and not topmost: it sits directly above the game, below menus, the
 // reading layer and any other application, and minimises with the game.
 public void Show(Bitmap source,int screenX,int screenY,IntPtr game){if(source.Width<1||source.Height<1||game==IntPtr.Zero)return;
  if(Window!=IntPtr.Zero&&CreatedOwner!=game){DestroyWindow(Window);Window=IntPtr.Zero;Visible=false;}
  if(Window==IntPtr.Zero){Window=CreateWindowEx(0x080800a0,"STATIC","MeguLit marker cover",0x80000000,0,0,1,1,game,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);CreatedOwner=game;}if(Window==IntPtr.Zero)return;
  using(var image=Fit(source,MW(source.Width),MH(source.Height))){IntPtr bitmap=image.GetHbitmap(Color.FromArgb(0)),dc=CreateCompatibleDC(IntPtr.Zero),old=SelectObject(dc,bitmap);try{var position=new Point(MX(screenX),MY(screenY));var size=new Size(MW(source.Width),MH(source.Height));var zero=new Point();var blend=new Blend{Alpha=255,Format=1};HasImage=UpdateLayeredWindow(Window,IntPtr.Zero,ref position,ref size,dc,ref zero,0,ref blend,2);if(HasImage){if(Scaled&&Reader!=IntPtr.Zero)SetWindowPos(Window,Reader,position.X,position.Y,size.W,size.H,0x0010|0x0040);else if(!Visible){IntPtr above=GetWindow(game,3);if(above==Window)above=IntPtr.Zero;SetWindowPos(Window,above,position.X,position.Y,size.W,size.H,0x0010|0x0040);}Visible=true;}}finally{SelectObject(dc,old);DeleteObject(bitmap);DeleteDC(dc);}}
 }
 public void Hide(){if(Window!=IntPtr.Zero&&Visible)ShowWindow(Window,0);Visible=false;HasImage=false;}
 public void Dispose(){Hide();if(Window!=IntPtr.Zero)DestroyWindow(Window);Window=IntPtr.Zero;}
}
