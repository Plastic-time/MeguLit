// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Loaded immediately before the game's Main, after its message/choice plugins. Ruby 1.8-compatible syntax. */
const SCRIPT=String.raw`
# MEGULIT_RGSS_BOOTSTRAP
unless defined?(MeguLitRGSS)
 module MeguLitRGSS
  @windows={}; @owners={}; @serial=0; @ui=0; @generation=0; @roles=true; @ready=false; @out=''; @input=''; @socket=nil; @attempt=0
  class << self
   def observe
    yield
   rescue StandardError
    nil
   end
   def bytes(s); s.respond_to?(:bytesize) ? s.bytesize : s.size; end
   def binary(s); s=s.dup; s.force_encoding('BINARY') if s.respond_to?(:force_encoding); s; end
   def api(name,args); Win32API.new('ws2_32',name,args,'i'); end
   def start
    @wsa=api('WSAStartup','ip'); @open=api('socket','iii'); @nonblock=api('ioctlsocket','ilp'); @connect=api('connect','ipi')
    @send=api('send','ipii'); @recv=api('recv','ipii'); @close=api('closesocket','i'); @error=api('WSAGetLastError',''); @select=api('select','ipppp')
    @pid=Win32API.new('kernel32','GetCurrentProcessId','','i').call
    raise 'winsock unavailable' unless @wsa.call(0x202,"\0"*512)==0
    @installed=true
    install
   end
   def queue(s)
    s=binary(s); return false if bytes(@out)+bytes(s)>65536
    @out << s; true
   end
   def disconnect
    @close.call(@socket) if @socket; @socket=nil; @ready=false; @roles=false; @out=''; @input=''
    forget
   end
   def transport
    unless @socket
     @attempt+=1; return unless @attempt%30==1
     @socket=@open.call(2,1,6); raise 'socket' if @socket==-1
     raise 'nonblocking socket' unless @nonblock.call(@socket,-2147195266,[1].pack('L'))==0
     address=[2].pack('s')+[__PORT__].pack('n')+[127,0,0,1].pack('C*')+"\0"*8
     result=@connect.call(@socket,address,16)
     if result==-1 && ![10035,10036,10037].include?(@error.call); disconnect; return; end
     @connecting=result==-1
     queue("HELLO __TOKEN__ #{@pid}\n")
    end
    if @connecting
     writable=[1,@socket].pack('LL');failed=[1,@socket].pack('LL')
     n=@select.call(0,0,writable,failed,[0,0].pack('ll'))
     if n<0 || failed.unpack('L')[0]>0;disconnect;return;end
     return if n==0 || writable.unpack('L')[0]==0
     @connecting=false
    end
    unless @out.empty?
     n=@send.call(@socket,@out,bytes(@out),0)
     if n>0; @out=@out[n..-1] || ''; elsif n==0 || @error.call!=10035; disconnect; return; end
    end
    buffer="\0"*4096; n=@recv.call(@socket,buffer,4096,0)
    if n>0
     @input << buffer[0,n]; raise 'control budget' if bytes(@input)>4096
     while (at=@input.index("\n"))
      line=@input.slice!(0,at+1)
      if line =~ /\ACFG ([1-9][0-9]{0,9}) ([01])\n\z/
       generation=$1.to_i; roles=$2=='1'
       forget if !roles || @generation!=generation && @ready
       @generation=generation; @roles=roles; @ready=true
      end
     end
    elsif n==0 || @error.call!=10035
     disconnect
    end
   end
   def active?; @roles; end
   def forget
    @windows.each_value{|c|c[:glyphs]=[];c[:items]={};c[:signature]=nil;c[:source_signature]=nil;c[:shown]=false;c[:overflow]=false}
   end
   def serial; @serial+=1; end
   def register(w)
    return unless @windows.size<128
    c=@windows[w.object_id] ||= {:window=>w,:glyphs=>[],:items=>{},:line=>serial,:signature=>nil,:shown=>false}
    bind(w,w.contents) if w.respond_to?(:contents)
    c
   end
   def bind(w,bmp)
    return unless bmp
    c=@windows[w.object_id];return unless c
    if c[:bitmap] && c[:bitmap]!=bmp
     clear(c);@owners.delete(c[:bitmap].object_id);c[:glyphs]=[];c[:items]={};c[:line]=serial;c[:overflow]=false
    end
    c[:bitmap]=bmp;@owners[bmp.object_id]=c
   end
   def role(w)
    return 'line' if w.is_a?(Window_Message)
    return 'choice' if defined?(Window_Choice) && w.is_a?(Window_Choice)
    return 'menu' if w.is_a?(Window_Selectable)
    return 'system' if defined?(Window_Help) && w.is_a?(Window_Help)
    nil
   end
   def number(n); n.is_a?(Numeric) && n==n && n.abs<100000; end
   def draw(bmp,args)
    return unless active?;c=@owners[bmp.object_id];return unless c
    w=c[:window];r=role(w);return unless r
    if args[0].is_a?(Rect)
     box=args[0];x=box.x;y=box.y;width=box.width;height=box.height;text=args[1];align=args[2] || 0
    else
     x,y,width,height,text,align=args;align ||= 0
    end
    return if text.nil? || ![x,y,width,height].all?{|n|number(n)} || width<=0 || height<=0
    text=text.to_s;return if bytes(text)>12000
    if r!='line'
     key=[x,y,width,height].join(',');return if !c[:items].has_key?(key) && c[:items].size>=40
     text=text.gsub(/[\x00-\x1f\x7f]/,'').strip;return if text.empty?
     c[:items][key]=[text,[x,y,width,height],w.instance_variable_get(:@__mg_item)]
     return
    end
    font=bmp.font.size;return unless number(font) && font>0
    points=text.unpack('U*');if points.size+c[:glyphs].size>1000;c[:overflow]=true;return;end
    return if c[:overflow]
    tw=bmp.text_size(text).width;return unless tw>0
    scale=tw>width ? width.to_f/tw : 1.0;drawn=tw*scale
    left=x;left+=(width-drawn)/2.0 if align==1;left+=width-drawn if align==2
    top=y+(height-font)/2.0;prefix='';previous=0
    points.each do |point|
     ch=[point].pack('U');prefix << ch;last=bmp.text_size(prefix).width*scale
     if point>=32 && point!=127 && last>previous && c[:glyphs].size<1000
      c[:glyphs] << [ch,left+previous,top,last-previous,font]
     end
     previous=last
    end
   end
   def screen
    return nil unless Graphics.respond_to?(:width) && Graphics.respond_to?(:height)
    [Graphics.width,Graphics.height]
   end
   def visible?(w)
    return false if w.disposed? || !w.visible || w.contents_opacity==0
    bmp=w.contents;return false if !bmp || bmp.respond_to?(:disposed?) && bmp.disposed?
    return false if w.respond_to?(:openness) && w.openness!=255
    v=w.viewport;return false if v && (v.disposed? || !v.visible)
    true
   end
   def origin(w)
    x=w.x+16-w.ox;y=w.y+16-w.oy;v=w.viewport
    if v;x+=v.rect.x-v.ox;y+=v.rect.y-v.oy;end
    [x,y]
   end
   def field(n); sprintf('%.2f',n).sub(/\.00\z/,''); end
   def record(c,text,rects,extra='')
    return false unless @ready && active?;s=screen;return false unless s && s.all?{|n|number(n) && n>0}
    text=text.gsub(/[\r\n]/,"\037").gsub(/[\x00-\x1e\x7f]/,'')
    line="ToMe_CHARS engine=rgss line=#{c[:line]} hidden=0 sw=#{s[0]} sh=#{s[1]} vx=0 vy=0 vw=0 vh=0 n=#{rects.size} rects="
    line << rects.map{|q|q.map{|n|field(n)}.join(',')}.join(';') << extra << ' text=' << text
    queue("G #{@generation} #{line}\n")
   end
   def clear(c)
    if c[:shown]
     if role(c[:window])=='line';record(c,'',[])
     else;record(c,'',[]," role=#{role(c[:window])} id=W#{c[:window].object_id}: box=0,0,0,0");end
    end
    c[:shown]=false;c[:signature]=nil;c[:source_signature]=nil
   end
   def erase(bmp,rect=nil)
    return unless active?;c=@owners[bmp.object_id];return unless c
    if rect
     x,y,width,height=rect
     return unless [x,y,width,height].all?{|n|number(n)}
     hit=lambda{|q|q[0]<x+width && q[0]+q[2]>x && q[1]<y+height && q[1]+q[3]>y}
     c[:glyphs].delete_if{|g|hit.call(g[1,4])};c[:items].delete_if{|key,v|hit.call(v[1])}
    else
     clear(c);c[:glyphs]=[];c[:items]={};c[:line]=serial;c[:overflow]=false
    end
   end
   def dispose(w)
    c=@windows.delete(w.object_id);return unless c;clear(c);@owners.delete(c[:bitmap].object_id) if c[:bitmap]
   end
   def publish(c)
    w=c[:window];return clear(c) unless visible?(w)
    r=role(w);return unless r;o=origin(w)
    if r=='line'
     return clear(c) if c[:glyphs].empty? || c[:overflow]
     rects=[];text='';last_y=nil
     c[:glyphs].each do |g|
      text << "\n" if last_y && (g[2]-last_y).abs>g[4]/2.0
      text << g[0];last_y=g[2];rects << [o[0]+g[1],o[1]+g[2],g[3],g[4]]
     end
     signature=[text,rects].inspect
     unless c[:shown] && c[:signature]==signature
      if record(c,text,rects);c[:signature]=signature;c[:shown]=true;end
     end
     if c[:shown] && c[:signature]==signature && w.respond_to?(:pause) && w.pause && c[:source_signature]!=signature
      c[:source_signature]=signature if queue("S #{@generation} #{c[:line]} #{[text].pack('m').delete("\r\n")}\n")
     end
    else
     return clear(c) if c[:items].empty?
     items=c[:items].values;selected=w.respond_to?(:index) ? w.index : -1;signature=[o,items,selected].inspect
     return if c[:shown] && c[:signature]==signature
     c[:line]=serial;ok=true
     items.each_with_index do |item,i|
      b=item[1];box=[o[0]+b[0],o[1]+b[1],b[2],b[3]];sel=item[2] ? item[2]==selected : i==selected
      ok=false unless record(c,item[0],[]," role=#{r} id=W#{w.object_id}:#{i} box=#{box.map{|n|field(n)}.join(',')} sel=#{sel ? 1 : 0}")
     end
     if ok;c[:signature]=signature;c[:shown]=true;end
    end
   end
   def tick
    transport
    return unless @ready && active?
    @windows.values.each{|c|observe{if c[:window].disposed?;dispose(c[:window]);else;bind(c[:window],c[:window].contents);publish(c);end}}
   end
   def install
    Window_Base.class_eval do
     alias_method :__megulit_rgss_initialize,:initialize
     def initialize(*args,&block);r=__megulit_rgss_initialize(*args,&block);MeguLitRGSS.observe{MeguLitRGSS.register(self)};r;end
     alias_method :__megulit_rgss_contents_set,:contents=
     def contents=(bmp);r=__megulit_rgss_contents_set(bmp);MeguLitRGSS.observe{MeguLitRGSS.bind(self,bmp)};r;end
     alias_method :__megulit_rgss_dispose,:dispose
     def dispose(*args);r=__megulit_rgss_dispose(*args);MeguLitRGSS.observe{MeguLitRGSS.dispose(self)};r;end
    end
    Bitmap.class_eval do
     alias_method :__megulit_rgss_draw_text,:draw_text
     def draw_text(*args);r=__megulit_rgss_draw_text(*args);MeguLitRGSS.observe{MeguLitRGSS.draw(self,args)};r;end
     alias_method :__megulit_rgss_clear,:clear
     def clear(*args);r=__megulit_rgss_clear(*args);MeguLitRGSS.observe{MeguLitRGSS.erase(self)};r;end
     alias_method :__megulit_rgss_clear_rect,:clear_rect
     def clear_rect(*args);r=__megulit_rgss_clear_rect(*args);MeguLitRGSS.observe{a=args[0].is_a?(Rect) ? [args[0].x,args[0].y,args[0].width,args[0].height] : args;MeguLitRGSS.erase(self,a)};r;end
    end
    [Window_Command,(defined?(Window_Choice) ? Window_Choice : nil)].compact.each do |klass|
     next unless klass.method_defined?(:draw_item)
     klass.class_eval do
      alias_method :__megulit_rgss_draw_item,:draw_item
      def draw_item(index,*args);before=@__mg_item;@__mg_item=index;begin;__megulit_rgss_draw_item(index,*args);ensure;@__mg_item=before;end;end
     end
    end
    class << Graphics
     alias_method :__megulit_rgss_update,:update
     def update(*args);r=__megulit_rgss_update(*args);MeguLitRGSS.observe{MeguLitRGSS.tick};r;end
    end
   end
  end
 end
 begin
  MeguLitRGSS.start
 rescue StandardError
  # The original Main below must still run when setup is unavailable
 end
end
`;
function pageScript({port,token}){if(!Number.isInteger(port)||port<1||port>65535||!/^[a-f0-9]{32}$/.test(token))throw Error('RGSS_SESSION_ARGUMENTS');return SCRIPT.replace('__PORT__',String(port)).replace('__TOKEN__',token);}
module.exports={pageScript};
