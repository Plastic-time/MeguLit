# SPDX-License-Identifier: GPL-3.0-or-later
# Synthetic RGSS2 API surface; no game or vendor code is executed
require 'json'
$wire=[];$control=[];$draws=[];$api_calls=[]
class Win32API
 def initialize(dll,name,args,result);@name=name;end
 def call(*args)
  $api_calls << [@name,args.map{|a|a.is_a?(String) ? a.dup : a}]
  case @name
  when 'WSAStartup','ioctlsocket','closesocket';0
  when 'connect';$connecting ? -1 : 0
  when 'select';args[3].replace([0,0].pack('LL'));1
  when 'socket';123
  when 'GetCurrentProcessId';42
  when 'WSAGetLastError';10035
  when 'send';n=$send_limit ? [args[2],$send_limit].min : args[2];$wire << args[1][0,n].dup;n
  when 'recv';if $control.empty?;-1;else;s=$control.shift;args[1].replace(s);s.bytesize;end
  end
 end
end
class Rect
 attr_accessor :x,:y,:width,:height
 def initialize(x,y,w,h);@x=x;@y=y;@width=w;@height=h;end
end
class Font
 attr_accessor :size
 def initialize;@size=24;end
end
class Bitmap
 attr_accessor :font,:width,:height
 def initialize(w,h);@font=Font.new;@width=w;@height=h;end
 def text_size(t);Rect.new(0,0,t.unpack('U*').size*@font.size,@font.size);end
 def draw_text(*args);raise 'host draw failure' if args.include?('RAISE');$draws << args;:draw_return;end
 def clear;:clear_return;end
 def clear_rect(*args);:rect_return;end
end
class Window
 attr_accessor :x,:y,:width,:height,:ox,:oy,:contents,:contents_opacity,:visible,:openness,:viewport,:pause
 def initialize(x,y,w,h);@x=x;@y=y;@width=w;@height=h;@ox=0;@oy=0;@visible=true;@openness=255;@contents_opacity=255;@contents=Bitmap.new(w-32,h-32);@disposed=false;@pause=false;end
 def disposed?;@disposed;end
 def dispose;@disposed=true;:dispose_return;end
end
class Window_Base < Window
 def initialize(*args);super;end
end
class Window_Selectable < Window_Base
 attr_accessor :index
 def initialize(*args);super;@index=0;end
end
class Window_Message < Window_Selectable;end
class Window_Command < Window_Selectable
 attr_accessor :commands
 def initialize(commands);super(10,20,240,160);@commands=commands;refresh;end
 def draw_item(i);contents.draw_text(Rect.new(4,i*28,180,28),@commands[i]);:item_return;end
 def refresh;contents.clear;@commands.size.times{|i|draw_item(i)};end
end
class Window_Choice < Window_Selectable
 attr_accessor :commands
 def initialize(commands);super(300,180,240,160);@commands=commands;refresh;end
 def draw_item(i);contents.draw_text(Rect.new(0,i*28,180,28),@commands[i]);:choice_return;end
 def refresh;contents.clear;@commands.size.times{|i|draw_item(i)};end
end
module Graphics
 def self.width;544;end
 def self.height;416;end
 def self.update;:update_return;end
end
def frames(n=3);n.times{Graphics.update};end
