// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;

public sealed class GameUiLayer {
 readonly NativeMaskLayer layer=new NativeMaskLayer();
 ArrayList items;
 IntPtr target;
 bool preview, painted;
 DateTime expires;
 Rectangle location;

 public void Set(IntPtr game,ArrayList rows,bool boxes) {
  Clear();
  if(game==IntPtr.Zero||rows==null||rows.Count==0)return;
  target=game;items=rows;preview=boxes;expires=DateTime.UtcNow.AddSeconds(boxes?10:25);
 }
 public void Clear(){layer.Hide();items=null;painted=false;}
 public void Dispose(){Clear();layer.Dispose();}
 static double Num(Dictionary<string,object> row,string key){object v;double d;return row.TryGetValue(key,out v)&&Double.TryParse(Convert.ToString(v),out d)?d:0;}
 static string Str(Dictionary<string,object> row,string key){object v;return row.TryGetValue(key,out v)?Convert.ToString(v):"";}
 public void Tick(IntPtr game,Rectangle area,bool foreground) {
  if(items==null)return;
  if(game!=target||DateTime.UtcNow>=expires){Clear();return;}
  if(!foreground){layer.Hide();painted=false;return;}
  if(painted&&location==area)return;
  if(area.Width<1||area.Height<1||(long)area.Width*area.Height>17000000)return;
  using(var image=new Bitmap(area.Width,area.Height,PixelFormat.Format32bppPArgb))
  using(var graphics=Graphics.FromImage(image))
  using(var border=new Pen(Color.FromArgb(225,115,229,240),2))
  using(var format=new StringFormat(StringFormatFlags.NoWrap)){
   graphics.TextRenderingHint=TextRenderingHint.AntiAliasGridFit;
   format.Trimming=StringTrimming.EllipsisCharacter;
   foreach(var item in items){
    var row=item as Dictionary<string,object>;if(row==null)continue;
    var rect=new RectangleF((float)(Num(row,"x")*area.Width),(float)(Num(row,"y")*area.Height),(float)(Num(row,"width")*area.Width),(float)(Num(row,"height")*area.Height));
    if(rect.Width<3||rect.Height<3||rect.X<0||rect.Y<0||rect.Right>area.Width+1||rect.Bottom>area.Height+1)continue;
    if(preview){graphics.DrawRectangle(border,rect.X,rect.Y,rect.Width,rect.Height);continue;}
    try{
     string text=Str(row,"text"),family=Str(row,"font");
     using(var font=new Font(family,Math.Max(6,Math.Min(128,rect.Height*.83f)),GraphicsUnit.Pixel))
     using(var ink=new SolidBrush(ColorTranslator.FromHtml(Str(row,"color"))))graphics.DrawString(text,font,ink,rect,format);
    }catch(ArgumentException){}
   }
   layer.Show(image,area.X,area.Y,game);
  }
  painted=true;location=area;
 }
}
