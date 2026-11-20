using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;

// Own the complete physical gesture before it can reach a polling game. The desktop
// relays it into WebView2 without re-injecting it into the Windows input stream.
internal sealed class ReaderPointerGate {
    internal const int Move=0x200, LeftDown=0x201, LeftUp=0x202, RightDown=0x204, RightUp=0x205, MiddleDown=0x207, MiddleUp=0x208;
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public Point Position; public uint Data,Flags,Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Position; public uint Reserved; }
    delegate IntPtr MouseProc(int code,IntPtr message,ref Mouse mouse);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,MouseProc callback,IntPtr module,uint thread);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,ref Mouse mouse);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern int GetMessage(out Message message,IntPtr window,uint min,uint max);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flag);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr window,ref Point point);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out GalWindowBridge.Rect rect);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread,uint message,UIntPtr w,IntPtr l);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] static extern uint GetTickCount();

    internal sealed class Context {
        internal readonly IntPtr Overlay,Game;
        internal readonly GalWindowBridge.Rect Client;
        internal readonly bool Lookup;
        internal readonly GalWindowBridge.Rect[] Hits,Menus;
        internal Context(IntPtr overlay,IntPtr game,GalWindowBridge.Rect client,bool lookup,GalWindowBridge.Rect[] hits,GalWindowBridge.Rect[] menus=null){
            Overlay=overlay;Game=game;Client=client;Lookup=lookup;Hits=hits;Menus=menus??new GalWindowBridge.Rect[0];
        }
        /* 2026-11-21 (owner: every slider in Alt+T stopped dragging once b31d1ae6 kept the gate on with the menu open): the panel
           is a real window MeguLit draws; a gesture that starts on it is Windows' own, delivered untouched (press, moves, release) */
        internal bool InMenu(int x,int y){foreach(var rect in Menus)if(Contains(rect,x,y))return true;return false;}
        internal bool Hit(int x,int y){
            if(!Contains(Client,x,y))return false;
            if(Lookup)return true;
            foreach(var rect in Hits)if(Contains(rect,x,y))return true;
            return false;
        }
        static bool Contains(GalWindowBridge.Rect rect,int x,int y){return x>=rect.Left&&x<rect.Right&&y>=rect.Top&&y<rect.Bottom;}
    }

    internal volatile Context Current;
    readonly BlockingCollection<object> events=new BlockingCollection<object>();
    readonly MouseProc callback;
    static readonly int[] Buttons={LeftDown,RightDown,MiddleDown};
    sealed class Gesture {
        internal Context Owner;
        internal int Button=-1;
        internal bool Accept(int down,int up,bool move,Context initial){
            if(Owner!=null)return up==Button||move;
            if(down<0||initial==null)return false;
            Owner=initial;Button=down;return true;
        }
        internal void End(){Owner=null;Button=-1;}
    }
    readonly Gesture gesture=new Gesture();
    uint lastMove;

    internal ReaderPointerGate(Action<object> emit){
        callback=Filter;
        /* 2026-11-21 (owner, CHAOS;CHILD: a click on a word went to the game; no click was logged after 20:34:58): one failed write
           ended this relay for good (and with it every later click routed to the reader); a failed write now only drops that item */
        new Thread(()=>{foreach(var item in events.GetConsumingEnumerable()){try{emit(item);}catch(System.IO.IOException){}catch(ObjectDisposedException){}}}){IsBackground=true,Name="Reader pointer relay"}.Start();
        new Thread(Watch){IsBackground=true,Name="Reader mouse hook"}.Start();
        new Thread(Guard){IsBackground=true,Name="Reader mouse hook guard"}.Start();
    }

    /* 2026-11-21: Windows removes a low-level mouse hook without a word when its callback is late (LowLevelHooksTimeout), and
       every click then reaches the game. The guard polls the mouse; when it moved or a button went down and the hook has seen
       nothing for StaleMs, the hook thread installs the hook again. */
    const uint Reinstall=0x8001;internal const uint StaleMs=2000;
    volatile uint hookThread,lastHook;
    internal static bool Stale(uint lastHook,uint lastInput,uint now){return unchecked(lastInput-lastHook)<0x80000000u&&unchecked(lastInput-lastHook)>0&&unchecked(now-lastHook)>=StaleMs&&unchecked(now-lastInput)<StaleMs*2;}
    void Watch(){
        hookThread=GetCurrentThreadId();
        var hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);
        int error=Marshal.GetLastWin32Error();lastHook=GetTickCount();
        events.Add(new{type="hostFrame",pointerHook=hook!=IntPtr.Zero,error=hook==IntPtr.Zero?error:0});
        if(hook==IntPtr.Zero)return;
        try{Message message;while(GetMessage(out message,IntPtr.Zero,0,0)>0){
            if(message.Id!=Reinstall)continue;
            UnhookWindowsHookEx(hook);hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);error=Marshal.GetLastWin32Error();lastHook=GetTickCount();
            events.Add(new{type="hostFrame",pointerHook=hook!=IntPtr.Zero,reinstalled=true,error=hook==IntPtr.Zero?error:0});
        }}finally{UnhookWindowsHookEx(hook);}
    }
    void Guard(){
        Point last;GetCursorPos(out last);uint lastInput=0;bool down=false;
        for(;;){Thread.Sleep(250);uint now=GetTickCount();Point at;bool moved=GetCursorPos(out at)&&(at.X!=last.X||at.Y!=last.Y);last=at;
            bool pressed=GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0;if(moved||pressed&&!down)lastInput=now;down=pressed;
            if(hookThread!=0&&lastInput!=0&&Stale(lastHook,lastInput,now)){lastHook=now;PostThreadMessage(hookThread,Reinstall,UIntPtr.Zero,IntPtr.Zero);}}
    }

    IntPtr Filter(int code,IntPtr message,ref Mouse mouse){
        lastHook=GetTickCount();
        if(code==0){
            if(Route((int)message,mouse))return new IntPtr(1);
            TraceGameClick((int)message,mouse);
        }
        return CallNextHookEx(IntPtr.Zero,code,message,ref mouse);
    }

    void TraceGameClick(int message,Mouse mouse){
        int button=Array.IndexOf(Buttons,message);
        bool down=button>=0;
        if(!down)button=Array.IndexOf(Buttons,message-1);
        var context=Current;
        if(button<0||context==null||GetAncestor(GetForegroundWindow(),2)!=context.Game)return;
        var point=mouse.Position;
        GalWindowBridge.Rect client;
        if(!ScreenToClient(context.Game,ref point)||!GetClientRect(context.Game,out client)||
           point.X<0||point.Y<0||point.X>=client.Right||point.Y>=client.Bottom)return;
        events.Add(new{type="hostFrame",pointer=down?"down":"up",isolated=false,button,gameX=point.X,gameY=point.Y,
            gameWidth=client.Right,gameHeight=client.Bottom,game=context.Game.ToInt64(),ctrl=GetAsyncKeyState(0x11)<0,
            x=mouse.Position.X,y=mouse.Position.Y});
    }

    bool Route(int message,Mouse mouse){
        int index=Array.IndexOf(Buttons,message),up=Array.IndexOf(Buttons,message-1);
        bool moving=message==Move;
        if(index<0&&up<0&&!moving)return false;
        if(gesture.Owner==null&&index<0)return false;
        var context=gesture.Owner??Current;
        if(context==null)return false;
        var point=mouse.Position;
        if(!ScreenToClient(context.Overlay,ref point)){
            if(gesture.Owner!=null&&up==gesture.Button){gesture.End();return true;}
            return false;
        }
        if(gesture.Owner==null&&index>=0&&context.InMenu(point.X,point.Y))return false; /* the panel: the whole gesture goes to the WebView as Windows sends it */
        if(gesture.Owner==null){
            /* (user, issue #133: the speaker button still advanced the game) a click Windows delivers to the overlay is
               MeguLit's, whether or not the page listed that control among its hit regions; it never reaches a game
               that polls the mouse button. */
            var under=GetAncestor(WindowFromPoint(mouse.Position),2);
            if(!IsWindowVisible(context.Overlay)||!(context.Hit(point.X,point.Y)||under==context.Overlay))return false;
            var foreground=GetAncestor(GetForegroundWindow(),2);
            if(foreground!=context.Game&&foreground!=context.Overlay&&under!=context.Overlay)return false;
            if(under!=context.Overlay&&under!=context.Game)return false;
        }
        if(!gesture.Accept(index,up,moving,context))return false;
        if(moving&&unchecked(mouse.Time-lastMove)<12)return false;
        lastMove=mouse.Time;
        int modifiers=(GetAsyncKeyState(0x12)<0?1:0)|(GetAsyncKeyState(0x11)<0?2:0)|(GetAsyncKeyState(0x10)<0?8:0);
        var kind=index>=0?"mousePressed":up>=0?"mouseReleased":"mouseMoved";
        int button=gesture.Button;
        events.Add(new{type="readerPointer",kind,x=point.X,y=point.Y,button=moving?-1:button,buttons=up>=0?0:1<<button,modifiers});
        if(!moving)events.Add(new{type="hostFrame",pointer=index>=0?"down":"up",isolated=true,button,x=mouse.Position.X,y=mouse.Position.Y,foreground=GetForegroundWindow().ToInt64(),overlay=context.Overlay.ToInt64(),game=context.Game.ToInt64(),lookup=context.Lookup});
        if(up>=0)gesture.End();
        // Mouse motion still updates the real cursor and hover. Only the relayed move carries a pressed button.
        return !moving;
    }

    internal static bool SelfTest(){
        /* a press on the panel is the panel's; a press on the reader's text outside it is the gate's */
        {var c=new Context(IntPtr.Zero,IntPtr.Zero,new GalWindowBridge.Rect(0,0,1920,1080),false,new[]{new GalWindowBridge.Rect(1300,0,1900,740),new GalWindowBridge.Rect(100,600,900,660)},new[]{new GalWindowBridge.Rect(1300,0,1900,740)});
         if(!c.InMenu(1500,400)||c.InMenu(300,620)||!c.Hit(300,620))return false;}
        /* an open (or pinned) menu keeps the gate on; no translation layer, no overlay or a hidden layer switch it off */
        if(!GalWindowBridge.PointerGateOn(true,true,true,true)||!GalWindowBridge.PointerGateOn(true,false,true,true)||GalWindowBridge.PointerGateOn(false,true,true,true)||GalWindowBridge.PointerGateOn(true,true,false,true)||GalWindowBridge.PointerGateOn(true,true,true,false))return false;
        /* hook guard: input after the hook went quiet for StaleMs means reinstall; input the hook saw, or old input, does not */
        if(!Stale(1000,3500,3600)||Stale(4000,3500,4100)||Stale(1000,1500,2900)||Stale(1000,3500,9000))return false;
        var client=new GalWindowBridge.Rect(0,0,1920,1080);
        var hits=new[]{new GalWindowBridge.Rect(200,600,800,660)};
        var line=new Context(IntPtr.Zero,IntPtr.Zero,client,false,hits);
        var lookup=new Context(IntPtr.Zero,IntPtr.Zero,client,true,hits);
        if(!line.Hit(300,620)||line.Hit(800,620)||line.Hit(900,600)||!lookup.Hit(900,600)||lookup.Hit(-1,600)||lookup.Hit(1920,600))return false;
        var gesture=new Gesture();
        if(!gesture.Accept(0,-1,false,line)||!gesture.Accept(-1,-1,true,null)||gesture.Accept(-1,1,false,null)||!gesture.Accept(-1,0,false,null))return false;
        gesture.End();
        if(!gesture.Accept(0,-1,false,lookup)||!gesture.Accept(-1,0,false,null))return false;
        gesture.End();
        if(gesture.Accept(0,-1,false,null)||gesture.Owner!=null)return false;
        MouseProc probe=PassThrough;
        var hook=SetWindowsHookEx(14,probe,GetModuleHandle(null),0);
        bool registered=hook!=IntPtr.Zero&&UnhookWindowsHookEx(hook);
        GC.KeepAlive(probe);
        return registered;
    }
    static IntPtr PassThrough(int code,IntPtr message,ref Mouse mouse){return CallNextHookEx(IntPtr.Zero,code,message,ref mouse);}
}
