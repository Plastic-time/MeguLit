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

    internal sealed class Context {
        internal readonly IntPtr Overlay,Game;
        internal readonly GalWindowBridge.Rect Client;
        internal readonly bool Lookup;
        internal readonly GalWindowBridge.Rect[] Hits;
        internal Context(IntPtr overlay,IntPtr game,GalWindowBridge.Rect client,bool lookup,GalWindowBridge.Rect[] hits){
            Overlay=overlay;Game=game;Client=client;Lookup=lookup;Hits=hits;
        }
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
        new Thread(()=>{try{foreach(var item in events.GetConsumingEnumerable())emit(item);}catch(System.IO.IOException){Current=null;}}){IsBackground=true,Name="Reader pointer relay"}.Start();
        new Thread(Watch){IsBackground=true,Name="Reader mouse hook"}.Start();
    }

    void Watch(){
        var hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);
        int error=Marshal.GetLastWin32Error();
        events.Add(new{type="hostFrame",pointerHook=hook!=IntPtr.Zero,error=hook==IntPtr.Zero?error:0});
        if(hook==IntPtr.Zero)return;
        try{Message message;while(GetMessage(out message,IntPtr.Zero,0,0)>0){}}finally{UnhookWindowsHookEx(hook);}
    }

    IntPtr Filter(int code,IntPtr message,ref Mouse mouse){
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
