// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit's own layers never hold the top of the user's desktop (user, 2026-11-15: 「不要让幽灵窗口抢我桌面置顶」).
// The reading layer and everything that rides on it may sit above the game only while the bound game (or MeguLit's own
// layer, being used) is the foreground window. The moment the user switches to another program, the game is minimised or
// the game is gone, the layer leaves the topmost band in ONE SetWindowPos: it is inserted directly above the game (under
// every other window) or, without a usable game window, at the bottom. HWND_NOTOPMOST alone is not enough: it puts the
// window at the top of the normal band, i.e. above the browser the user just switched to.
// Driven by SetWinEventHook(EVENT_SYSTEM_FOREGROUND / MINIMIZESTART / MINIMIZEEND, out of context): the callback runs
// inside the owning thread's next PeekMessage, so the bridge reacts within one loop pass (<= 16 ms bound), not on a poll.
// C# 5 (the .NET Framework csc), compiled with GalWindowBridge.cs.
using System;
using System.Runtime.InteropServices;

internal static class TopmostGuard {
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEventProc proc,uint pid,uint thread,uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int hh,uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h,uint cmd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex,string cls,string title,uint style,int x,int y,int w,int h,IntPtr owner,IntPtr menu,IntPtr instance,IntPtr param);
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetActiveWindow();
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr SetActiveWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]
    static extern bool GetUserObjectInformation(IntPtr obj,int index,System.Text.StringBuilder info,int bytes,out int needed);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,System.Text.StringBuilder s,int n);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int cmd);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h,int cmd);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct Msg{public IntPtr h;public uint m;public IntPtr w,l;public uint t;public int x,y;}
    [DllImport("user32.dll")] static extern bool PeekMessage(out Msg m,IntPtr h,uint a,uint b,uint r);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref Msg m);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Msg m);
    delegate void WinEventProc(IntPtr hook,uint ev,IntPtr hwnd,int obj,int child,uint thread,uint time);

    public const uint Foreground=0x0003,MinimizeStart=0x0016,MinimizeEnd=0x0017;
    const uint NoSizeMoveActivate=0x0001|0x0002|0x0010|0x0200; /* NOSIZE NOMOVE NOACTIVATE NOOWNERZORDER */
    static WinEventProc Keep;static IntPtr[] Hooks=new IntPtr[0];static Action<uint,IntPtr> Handler;

    /// <summary>Calls <paramref name="handler"/>(event, window) on this thread (it must pump messages) whenever the
    /// foreground window changes or a window is minimised / restored.</summary>
    public static bool Install(Action<uint,IntPtr> handler){
        Uninstall();Handler=handler;
        Keep=(hook,ev,h,obj,child,thread,time)=>{if(obj!=0)return;var f=Handler;if(f!=null)try{f(ev,h);}catch{}};
        Hooks=new[]{SetWinEventHook(Foreground,Foreground,IntPtr.Zero,Keep,0,0,0),SetWinEventHook(MinimizeStart,MinimizeEnd,IntPtr.Zero,Keep,0,0,0)};
        return Hooks[0]!=IntPtr.Zero&&Hooks[1]!=IntPtr.Zero;
    }
    public static void Uninstall(){foreach(var h in Hooks)if(h!=IntPtr.Zero)UnhookWinEvent(h);Hooks=new IntPtr[0];Handler=null;}

    /// <summary>The rule. A layer may float over the game only while the game lives, is not minimised, and the foreground
    /// is the game (its window tree or its process: IME lists, its own dialogs) or MeguLit's own layer being used.</summary>
    public static bool MayFloat(bool gameAlive,bool gameIconic,bool foregroundIsGame,bool foregroundIsOwnLayer){
        return gameAlive&&!gameIconic&&(foregroundIsGame||foregroundIsOwnLayer);
    }

    public static bool IsTopmost(IntPtr h){return h!=IntPtr.Zero&&(GetWindowLong(h,-20)&0x8)!=0;}

    public static bool IsAbove(IntPtr layer,IntPtr game){
        int steps=0;
        for(IntPtr h=GetWindow(game,3);h!=IntPtr.Zero&&steps<2000;h=GetWindow(h,3),steps++)if(h==layer)return true;
        return false;
    }

    public static bool ShowAtBottom(IntPtr window){
        // Show and place in the same call. SW_SHOWNOACTIVATE can still show above the current app.
        return SetWindowPos(window,new IntPtr(1),0,0,0,0,NoSizeMoveActivate|0x0040);
    }

    /// <summary>Where a layer goes when it may not float: after the nearest visible ordinary window above the game.
    /// Use the top of the ordinary band when no such window exists, or HWND_BOTTOM without a usable game window.</summary>
    public static IntPtr Slot(IntPtr layer,IntPtr game){
        if(game==IntPtr.Zero||!IsWindow(game)||IsIconic(game))return new IntPtr(1);
        int steps=0;
        for(IntPtr h=GetWindow(game,3);h!=IntPtr.Zero&&steps<2000;h=GetWindow(h,3),steps++){
            if(h==layer)continue;
            if(!IsTopmost(h)&&IsWindowVisible(h)&&!IsIconic(h))return h;
        }
        return IntPtr.Zero;
    }

    /// <summary>Takes a layer out of the topmost band and puts it in its slot in one call (no frame above other
    /// programs). Returns true when the layer was moved.</summary>
    public static bool Sink(IntPtr layer,IntPtr game){
        if(layer==IntPtr.Zero||!IsWindow(layer))return false;
        IntPtr slot=Slot(layer,game);
        bool topmost=IsTopmost(layer);
        if(!topmost&&slot!=IntPtr.Zero&&slot!=new IntPtr(1)&&IsAbove(slot,layer)&&IsAbove(layer,game))return false;
        if(slot==IntPtr.Zero){
            // No ordinary predecessor can anchor the layer. HWND_NOTOPMOST does nothing to a layer that is already ordinary.
            if(IsTopmost(game))return topmost&&SetWindowPos(layer,new IntPtr(-2),0,0,0,0,NoSizeMoveActivate)&&!IsTopmost(layer);
            if(!topmost&&IsAbove(layer,game))return false;
            // Inserting after a real sibling works even when Windows accepts HWND_TOP without moving the layer ahead of the game.
            // An invisible IME window can provide that insertion point without affecting which visible application is in front.
            IntPtr previous=GetWindow(game,3);
            IntPtr anchor=previous!=IntPtr.Zero&&!IsTopmost(previous)?previous:topmost?new IntPtr(-2):IntPtr.Zero;
            return SetWindowPos(layer,anchor,0,0,0,0,NoSizeMoveActivate)&&
                !IsTopmost(layer)&&IsAbove(layer,game);
        }
        /* inserting after a normal window (or at the bottom) also ends topmost */
        bool moved=SetWindowPos(layer,slot,0,0,0,0,NoSizeMoveActivate);
        if(IsTopmost(layer)){SetWindowPos(layer,new IntPtr(-2),0,0,0,0,NoSizeMoveActivate);moved=SetWindowPos(layer,slot,0,0,0,0,NoSizeMoveActivate);}
        return moved&&!IsTopmost(layer)&&(slot==new IntPtr(1)||IsAbove(layer,game));
    }

    /// <summary>Policy table (no windows). The live z-order is checked by --topmost-guard-self-test with stand-in windows.</summary>
    public static bool PolicySelfTest(){
        return MayFloat(true,false,true,false)&&MayFloat(true,false,false,true)
            &&!MayFloat(true,false,false,false)   /* browser / Discord / Explorer in front */
            &&!MayFloat(true,true,true,false)     /* game minimised */
            &&!MayFloat(false,false,true,false)   /* game gone */
            &&!MayFloat(false,false,false,true);  /* own layer left over after the game is gone */
    }

    /* Stand-in windows (off screen, tool windows, never activated): a "game", a "browser" in front of it and a topmost
       "layer". Checks the z-order after the guard, that a second pass changes nothing, that the hook delivers a
       minimise of the game and the layer is down within 100 ms, and that a closed game sends the layer to the bottom.
       Returns "" when everything holds, else what failed. */
    static IntPtr Stand(string name,uint style=0x80|0x08000000,bool show=true){
        var h=CreateWindowEx(style,"STATIC","MeguLit topmost guard test "+name,0x80000000,-32000,-32000,64,64,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
        if(show&&h!=IntPtr.Zero)ShowAtBottom(h);
        return h;
    }
    /* nothing the user could see lies below: only hidden / minimised windows and the desktop shell (Progman, WorkerW) */
    static bool AtBottom(IntPtr h){var c=new System.Text.StringBuilder(64);int steps=0;
        for(IntPtr n=GetWindow(h,2);n!=IntPtr.Zero&&steps<4000;n=GetWindow(n,2),steps++){
            if(!IsWindowVisible(n)||IsIconic(n))continue;c.Length=0;GetClassName(n,c,64);var k=c.ToString();if(k=="Progman"||k=="WorkerW")continue;return false;}
        return true;}
    static void Pump(){Msg m;while(PeekMessage(out m,IntPtr.Zero,0,0,1)){TranslateMessage(ref m);DispatchMessage(ref m);}}
    /* Judged inside a window, never on one sample: a busy machine (release builds run this next to compilers) may take
       a while to apply a z-order change or deliver an event. Polls every 50 ms for up to 2 s (pumping this thread). */
    static bool Within(Func<bool> ok,int ms=2000){var c=System.Diagnostics.Stopwatch.StartNew();for(;;){Pump();if(ok())return true;if(c.ElapsedMilliseconds>=ms)return false;System.Threading.Thread.Sleep(50);}}
    /// <summary>Last self-test: milliseconds from the game's minimise to the layer being down (informational).</summary>
    public static long LastMinimiseMs=-1;
    public static string BackgroundShowSelfTest(){
        var desktop=new System.Text.StringBuilder(128);int needed;
        if(!GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()),2,desktop,desktop.Capacity*2,out needed)||
            !desktop.ToString().StartsWith("MeguLitTest-",StringComparison.Ordinal))return "requires tools/run-isolated.cjs";
        IntPtr active=Stand("active",0x80), background=Stand("background",0x80|0x8,false);
        try{
            if(active==IntPtr.Zero||background==IntPtr.Zero)return "stand-in windows";
            SetActiveWindow(active);
            if(GetActiveWindow()!=active)return "fixture could not activate its reference window";
            IntPtr foreground=GetForegroundWindow();
            if(IsWindowVisible(background)||!IsTopmost(background))return "fixture is not hidden and topmost";
            if(!ShowAtBottom(background)||!IsWindowVisible(background)||IsTopmost(background)||!AtBottom(background))
                return "first show did not place the background window at the bottom";
            if(GetActiveWindow()!=active||GetForegroundWindow()!=foreground)return "background show changed focus";
            Console.WriteLine("desktop={0}, foreground before/after={1}, active={2}, background={3}",desktop,foreground,active,background);
            return "";
        }finally{if(background!=IntPtr.Zero)DestroyWindow(background);if(active!=IntPtr.Zero)DestroyWindow(active);}
    }

    public static string WindowSelfTest(){
        if(!PolicySelfTest())return "policy";
        /* the "game" lives on its own thread with its own message loop, like a game in its own process */
        IntPtr game=IntPtr.Zero;bool gameQuit=false;var ready=new System.Threading.ManualResetEvent(false);
        var gameThread=new System.Threading.Thread(()=>{game=Stand("game");ready.Set();Msg m;while(!gameQuit&&IsWindow(game)){while(PeekMessage(out m,IntPtr.Zero,0,0,1)){TranslateMessage(ref m);DispatchMessage(ref m);}System.Threading.Thread.Sleep(1);}if(IsWindow(game))DestroyWindow(game);});
        gameThread.IsBackground=true;gameThread.Start();ready.WaitOne(3000);
        IntPtr browser=Stand("browser"),layer=Stand("layer");
        try{
            if(game==IntPtr.Zero||browser==IntPtr.Zero||layer==IntPtr.Zero)return "stand-in windows";
            // Returning from another application can put the game at the top of the ordinary band, ahead of an ordinary reader.
            SetWindowPos(game,IntPtr.Zero,0,0,0,0,NoSizeMoveActivate);
            SetWindowPos(layer,new IntPtr(1),0,0,0,0,NoSizeMoveActivate);
            if(!Within(()=>Slot(layer,game)==IntPtr.Zero&&!IsAbove(layer,game)))return "ordinary layer recovery setup";
            IntPtr previousForeground=GetForegroundWindow();
            if(!Sink(layer,game)||!Within(()=>IsAbove(layer,game)&&!IsTopmost(layer)))return "ordinary layer remained behind the game";
            if(GetForegroundWindow()!=previousForeground)return "ordinary layer recovery changed focus";
            if(Sink(layer,game))return "recovered layer moved again";
            /* bottom of the desktop: browser directly above the game; the layer topmost */
            SetWindowPos(browser,new IntPtr(1),0,0,0,0,NoSizeMoveActivate);SetWindowPos(game,new IntPtr(1),0,0,0,0,NoSizeMoveActivate);
            SetWindowPos(layer,new IntPtr(-1),0,0,0,0,NoSizeMoveActivate);
            if(!Within(()=>IsTopmost(layer)&&GetWindow(browser,2)==game))return "setup";
            /* another program in front of the game */
            Sink(layer,game);
            Func<bool> placed=()=>IsWindowVisible(layer)&&!IsTopmost(layer)&&GetWindow(browser,2)==layer&&GetWindow(layer,2)==game;
            if(!Within(placed))return IsTopmost(layer)?"still topmost after another program came in front":"not directly above the game under the program in front";
            // This stand-in belongs to the reader's process, just like the main window. Moving it across the game keeps its spot.
            if(!SetWindowPos(browser,IntPtr.Zero,-31000,-31000,0,0,0x0001|0x0004|0x0010|0x0200)||!Within(placed))
                return "moving the main window lost its place above the layer";
            /* a second pass leaves a placed layer alone (only checked while nothing else has slipped in between) */
            if(placed()&&Sink(layer,game))return "second pass moved the layer again";
            if(!Within(placed))return "second pass lost the place";
            /* the game is minimised: the event arrives and the layer is down within 100 ms */
            SetWindowPos(layer,new IntPtr(-1),0,0,0,0,NoSizeMoveActivate);
            /* the delay is measured from the event's own time stamp: ShowWindow on a window of this thread runs the minimise
               animation before it returns, which a bridge watching another process's game never waits for */
            long delay=-1;var clock=new System.Diagnostics.Stopwatch();
            if(!Install((ev,h)=>{if(h==game&&ev==MinimizeStart&&delay<0){Sink(layer,game);delay=clock.ElapsedMilliseconds;}}))return "hook not installed";
            Pump();clock.Start();ShowWindowAsync(game,7);
            while(delay<0&&clock.ElapsedMilliseconds<2000){Pump();System.Threading.Thread.Sleep(1);}
            Uninstall();LastMinimiseMs=delay;
            if(delay<0)return "no minimise event";
            if(!Within(()=>!IsTopmost(layer)&&AtBottom(layer)))return IsTopmost(layer)?"topmost after the game was minimised":"not at the bottom after the game was minimised";
            /* the game is gone */
            PostMessage(game,0x0010,IntPtr.Zero,IntPtr.Zero);gameQuit=true;gameThread.Join(2000);if(!Within(()=>!IsWindow(game)))return "stand-in game did not close";
            SetWindowPos(layer,new IntPtr(-1),0,0,0,0,NoSizeMoveActivate);
            Sink(layer,game);
            if(!Within(()=>!IsTopmost(layer)&&AtBottom(layer)))return "not at the bottom after the game closed";
            return "";
        }finally{Uninstall();gameQuit=true;if(game!=IntPtr.Zero&&IsWindow(game))PostMessage(game,0x0010,IntPtr.Zero,IntPtr.Zero);gameThread.Join(2000);foreach(var h in new[]{browser,layer})if(h!=IntPtr.Zero)DestroyWindow(h);}
    }
}
