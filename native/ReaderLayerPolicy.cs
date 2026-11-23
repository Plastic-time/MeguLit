// SPDX-License-Identifier: GPL-3.0-or-later
// One decision for the reading layer's place and for when the screen probes may be believed (user, 2026-11-19: Alt+T kept
// switching the subtitles and the game's text box, after more than twenty fixes).
// Before, five places in GalWindowBridge.Tick each read GetForegroundWindow() for themselves and each applied its own rule:
// the tick sank the layer out of the topmost band when "the game is not in front", the foreground hook let it float when
// "MeguLit's own layer is in front", the visibility test hid it when "nothing of ours is in front". Closing the Alt+T menu
// hands the keyboard from the layer back to the game: for a few ticks the foreground is the layer, then nothing, then the
// game. Each reader caught a different moment, the layer was sunk or hidden, the game was activated above it, and
// HookBridge (which only looks at the z-order) gave the text back to the game: the menu key "switched the text".
// Rules, all in Decide():
//  - the foreground is classified once per tick; "no foreground window" (an activation in flight) is never a fact of its
//    own: the last known front is kept (for at most HoldMs)
//  - the game and MeguLit's own layer in front are the same context: handing the keyboard between them moves nothing
//  - a foreign program in front takes the layer out of the topmost band, keeping it visible directly above the game
//  - the screen probes (wait marker, text-window and scene compare, game UI) are believed only after the game has been
//    in front, with no menu and no word card, for SettleMs without a break (Settled()); a click or key is a fact and is
//    reported at once
// No window calls in here: --layer-policy-self-test replays recorded and random sequences. C# 5 (.NET Framework csc).
using System;

internal static class ReaderLayerPolicy {
    public const int Game=0,OwnLayer=1,OwnHome=2,Foreign=3,None=4,Capture=5;
    public static int SettleMs=700,HoldMs=1000;
    public struct State{public int Front;public bool Float,Context,Pinned;}
    static int Anchor=Foreign;static long NoneSince=-1,SettledSince=-1;

    public static void Reset(){Anchor=Foreign;NoneSince=-1;SettledSince=-1;}

    /// <summary>What is in front. gameTree: the foreground window belongs to the game's window tree; gameProcess: to its
    /// process or its IME; ownLayer: it is the reading layer; ownProcess: another window of MeguLit.</summary>
    public static int Classify(bool hasForeground,bool gameTree,bool gameProcess,bool ownLayer,bool ownProcess){return Classify(hasForeground,gameTree,gameProcess,ownLayer,ownProcess,false);}
    /// <summary>captureSurface: the foreground is a screenshot surface over the game (CaptureSurface()).</summary>
    public static int Classify(bool hasForeground,bool gameTree,bool gameProcess,bool ownLayer,bool ownProcess,bool captureSurface){
        if(!hasForeground)return None;
        if(ownLayer)return OwnLayer;
        if(gameTree||gameProcess)return Game;
        if(ownProcess)return OwnHome;
        return captureSurface?Capture:Foreign;
    }
    /// <summary>#468 (2026-11-20, 「一打开截图软件，译文就全都消失了」): Snipaste, WeChat/QQ capture, Win+Shift+S, ShareX take the
    /// foreground with a topmost, captionless window laid over the whole game (their frozen desktop or a dimmed sheet).
    /// That is not "the user switched to another program": the game is still what is on screen and the layer must stay in
    /// the picture. Judged by behaviour, never by process name: topmost + no caption + covers the game's client area +
    /// the game is not minimised. A normal application (caption, not topmost) is still Foreign.</summary>
    public static bool CaptureSurface(bool topmost,bool caption,bool coversGame,bool gameIconic){return topmost&&!caption&&coversGame&&!gameIconic;}

    /// <summary>front: Classify() of this tick. homeCounts: another MeguLit window in front keeps the layer shown (the
    /// main window hosts it). Float: the layer may be topmost above the game. Context: the layer may be shown at all
    /// (cover, dialogue and menu still decide). Pinned: the open menu holds it above the game.</summary>
    public static State Decide(int front,bool menu,bool menuReady,bool homeCounts,bool gameIconic,long nowMs){
        /* a screenshot surface in front changes nothing: the layer keeps the place and visibility it had (no timer, the
           user may take a while to drag the rectangle) */
        if(front==Capture){NoneSince=-1;}
        else if(front==None){
            if(NoneSince<0)NoneSince=nowMs;
            if(nowMs-NoneSince>=HoldMs)Anchor=Foreign;
        }else{NoneSince=-1;Anchor=front;}
        State s=new State();s.Front=Anchor;
        bool game=Anchor==Game,own=Anchor==OwnLayer,home=Anchor==OwnHome;
        s.Pinned=menu&&menuReady&&(game||own);
        s.Float=!gameIconic&&(game||own);
        s.Context=!gameIconic&&(game||own||home&&(homeCounts||menu&&menuReady)||Anchor==Foreign);
        return s;
    }

    /// <summary>May the screen probes be believed? raw: the game is in front, no menu, no word card, cover on, not
    /// minimised. True only after raw has held for SettleMs without a break.</summary>
    public static bool Settled(bool raw,long nowMs){
        if(!raw){SettledSince=-1;return false;}
        if(SettledSince<0)SettledSince=nowMs;
        return nowMs-SettledSince>=SettleMs;
    }
    public static void Unsettle(){SettledSince=-1;}

    /// <summary>The window calls a raise needs (GalWindowBridge.LayerZ does them; the self-test has a model).</summary>
    public interface ILayerZ{bool BelowGame();bool Topmost();void RequestTopmost();void PlaceAboveGame();void PlaceTop();void ForceTopmost();}
    /// <summary>May the layer leave the topmost band when it may not float? Only when it stays visible there (another
    /// MeguLit window in front). A layer that is hidden anyway keeps its place: recorded 2026-11-19 16:57, a sunk layer
    /// could not be raised again while the game held the foreground.</summary>
    public static bool SinkOnLeave(bool layerStaysVisible){return layerStaysVisible;}
    /// <summary>Puts the layer above the game and says how it got there. A request is never taken for its result:
    /// after each step the order is looked at again. wantFloat: the layer may be topmost. "failed": still under the
    /// game after everything (the caller tries again on its next pass).</summary>
    public static string Raise(ILayerZ z,bool wantFloat){
        if(wantFloat){
            if(!z.Topmost())z.RequestTopmost();
            if(!z.BelowGame())return z.Topmost()?"topmost":"above-game";
            z.PlaceAboveGame();
            if(!z.BelowGame())return "above-game";
        }
        z.PlaceTop();
        if(!z.BelowGame())return "top";
        if(wantFloat){z.ForceTopmost();if(!z.BelowGame())return "attached";}
        return "failed";
    }
    /* A desktop in miniature for the self-test: the order of game, layer and one other program, the layer's topmost
       bit, and a system that may ignore a topmost request (recorded 2026-11-19 16:17 after coming back from another program). */
    sealed class ModelZ:ILayerZ{
        public bool RefuseTopmost,RefuseAll,LayerTopmost,Visible=true;public System.Collections.Generic.List<char> Order=new System.Collections.Generic.List<char>{'L','G','O'}; /* top first */
        void Put(char w,int at){Order.Remove(w);Order.Insert(Math.Max(0,Math.Min(Order.Count,at)),w);}
        public bool BelowGame(){return Order.IndexOf('L')>Order.IndexOf('G');}
        public bool Topmost(){return LayerTopmost;}
        public void RequestTopmost(){if(RefuseTopmost||RefuseAll)return;LayerTopmost=true;Put('L',0);}
        public void PlaceAboveGame(){if(RefuseAll)return;LayerTopmost=false;Order.Remove('L');Order.Insert(Order.IndexOf('G'),'L');}
        public void PlaceTop(){if(LayerTopmost||RefuseAll)return;Put('L',0);}
        public bool ForceWorks;public void ForceTopmost(){if(!ForceWorks)return;LayerTopmost=true;Put('L',0);}
        public void Hide(){Visible=false;}public void Show(){Visible=true;}
        /* a window that becomes the foreground goes to the top of the normal band: above the layer unless that is topmost */
        public void Activate(char w){Order.Remove(w);Order.Insert(LayerTopmost&&Order.Count>0&&Order[0]=='L'?1:0,w);}
        /* TopmostGuard.Sink: out of the topmost band, directly above the game */
        public void Sink(){LayerTopmost=false;Order.Remove('L');Order.Insert(Order.IndexOf('G'),'L');}
    }
    static string LegacyRaise(ILayerZ z,bool wantFloat){if(wantFloat)z.RequestTopmost();else z.PlaceTop();return "";}

    /* What the tick did before (kept for the self-test only: the recorded sequence must fail on it). */
    static bool LegacyFloat(int front,bool menu,bool menuReady){return front==Game||menu&&menuReady&&(front==Game||front==OwnLayer||front==OwnHome);}
    static bool LegacyContext(int front,bool menu,bool menuReady){return front==Game||front==OwnLayer||menu&&menuReady&&front==OwnHome;}

    /// <summary>"" when every rule holds, else what failed.</summary>
    public static string SelfTest(){
        int keepSettle=SettleMs,keepHold=HoldMs;
        try{
            SettleMs=700;HoldMs=1000;
            /* 1. recorded (千恋＊万花, 2026-11-19 15:00:39.80 local): menu open with the keyboard on the layer, Alt+T closes
                  it, the foreground goes layer -> nothing -> game inside 60 ms. The layer must float and stay shown at
                  every step; the old rules sank it at the first step and hid it at the second. */
            int[] fronts={Game,Game,OwnLayer,OwnLayer,OwnLayer,None,Game,Game};
            bool[] menus={false,true,true,true,false,false,false,false};
            Reset();long t=0;bool legacyBroke=false;
            for(int i=0;i<fronts.Length;i++,t+=16){
                State s=Decide(fronts[i],menus[i],menus[i],false,false,t);
                if(!s.Float)return "recorded close: layer left the topmost band at step "+i;
                if(!s.Context)return "recorded close: layer hidden at step "+i;
                if(!LegacyFloat(fronts[i],menus[i],menus[i])||!LegacyContext(fronts[i],menus[i],menus[i]))legacyBroke=true;
            }
            if(!legacyBroke)return "recorded close: the old rules do not fail on it (the test proves nothing)";
            /* 2. any order of menu open / close, keyboard on the layer or the game, activations in flight: nothing moves */
            var random=new Random(20261119);
            for(int run=0;run<2000;run++){
                Reset();t=0;Decide(Game,false,false,false,false,t);bool menu=false;
                for(int step=0;step<60;step++){
                    t+=random.Next(1,90);int roll=random.Next(5);
                    int front=roll==0?None:roll<3?Game:OwnLayer;
                    if(random.Next(4)==0)menu=!menu;
                    bool ready=menu&&random.Next(3)!=0;
                    State s=Decide(front,menu,ready,random.Next(2)==0,false,t);
                    if(!s.Float||!s.Context)return "random run "+run+" step "+step+": front "+front+" menu "+menu+" float "+s.Float+" context "+s.Context;
                }
            }
            /* 3. a foreign program in front takes precedence, but the layer stays visible over the game */
            Reset();Decide(Game,false,false,false,false,0);
            State foreign=Decide(Foreign,true,true,false,false,16);
            if(foreign.Float||!foreign.Context)return "foreign program in front: layer floated or lost visibility";
            if(!Decide(Game,false,false,false,false,32).Float)return "back on the game: layer not floating";
            /* 4. the game minimised never floats; no foreground for longer than HoldMs counts as foreign */
            if(Decide(Game,false,false,false,true,48).Float)return "minimised game: layer floating";
            Reset();Decide(Game,false,false,false,false,0);
            if(!Decide(None,false,false,false,false,500).Float)return "no foreground for 0.5 s: layer sunk";
            Decide(None,false,false,false,false,600);
            if(Decide(None,false,false,false,false,1600).Float)return "no foreground for over 1 s: layer still floating";
            /* 4b. #468: a screenshot surface preserves visibility and the last z-order policy indefinitely */
            Reset();Decide(Game,false,false,false,false,0);
            for(long ct=16;ct<60000;ct+=997){State c=Decide(Capture,false,false,false,false,ct);if(!c.Float||!c.Context)return "screenshot surface in front: layer sunk or hidden at "+ct+" ms";}
            State left=Decide(Foreign,false,false,false,false,60100);
            State shot=Decide(Capture,false,false,false,false,60200);
            if(left.Float||!left.Context||shot.Float||!shot.Context)return "background game under a screenshot: wrong visibility or z-order";
            if(!CaptureSurface(true,false,true,false)||CaptureSurface(false,false,true,false)||CaptureSurface(true,true,true,false)||CaptureSurface(true,false,false,false)||CaptureSurface(true,false,true,true))return "capture surface rule";
            if(Classify(true,false,false,false,false,true)!=Capture||Classify(true,false,false,false,false,false)!=Foreign||Classify(true,true,false,false,false,true)!=Game)return "classify capture";
            /* 5. Dragging MeguLit's main window in front of the game always takes precedence over the reading layer. */
            Reset();
            if(Decide(OwnHome,false,false,false,false,0).Context)return "MeguLit window in front without hosting: layer shown";
            if(!Decide(OwnHome,false,false,true,false,16).Context||Decide(OwnHome,false,false,true,false,16).Float)return "hosting MeguLit window in front: wrong";
            if(!Decide(Game,true,true,true,false,24).Float)return "menu over foreground game: layer not raised";
            foreach(int foreground in new[]{OwnHome,None,OwnHome}){
                State duringDrag=Decide(foreground,true,true,true,false,32);
                if(duringDrag.Float||duringDrag.Pinned||!duringDrag.Context)return "open menu covered the foreground MeguLit window";
            }
            if(!Decide(Game,true,true,true,false,64).Pinned)return "menu did not return above the foreground game";
            /* 6. probes: silent through every menu / focus change and for SettleMs after the game is back */
            Unsettle();
            if(Settled(true,0)||Settled(true,699))return "probes believed before the settle time";
            if(!Settled(true,700))return "probes never believed";
            if(Settled(false,800))return "probes believed with the menu open";
            if(Settled(true,900)||Settled(true,1500))return "probes believed right after the menu closed";
            if(!Settled(true,1600))return "probes not believed after settling again";
            for(int run=0;run<500;run++){
                Unsettle();t=0;long rawSince=-1;
                for(int step=0;step<80;step++){
                    t+=random.Next(1,200);bool raw=random.Next(4)!=0;
                    if(!raw)rawSince=-1;else if(rawSince<0)rawSince=t;
                    bool ok=Settled(raw,t);
                    if(ok&&(rawSince<0||t-rawSince<SettleMs))return "probes believed "+(rawSince<0?-1:t-rawSince)+" ms after a context change";
                }
            }
            /* 7. recorded 2026-11-19 16:17: another program in front (the layer sinks), back to the game, and the system
                  does not take the topmost request. The layer must be above the game after the first raise; the old raise
                  (ask for topmost, look at nothing) leaves it under the game. Then every order of leaving and returning. */
            foreach(bool refuse in new[]{true,false}){
                var z=new ModelZ{RefuseTopmost=refuse,LayerTopmost=true};
                z.Activate('O');z.Sink();z.Activate('G');
                if(!z.BelowGame())return "focus return model: the game did not cover the sunk layer";
                string how=Raise(z,true);
                if(z.BelowGame())return "focus return: layer still under the game ("+how+", topmost "+(refuse?"refused":"taken")+")";
                if(refuse&&how!="above-game")return "focus return with topmost refused: "+how;
                if(!refuse&&how!="topmost")return "focus return: "+how;
            }
            var old=new ModelZ{RefuseTopmost=true,LayerTopmost=true};old.Activate('O');old.Sink();old.Activate('G');LegacyRaise(old,true);
            if(!old.BelowGame())return "focus return: the old raise does not fail on the recorded case (the test proves nothing)";
            for(int run=0;run<2000;run++){
                var z=new ModelZ{RefuseTopmost=random.Next(2)==0,LayerTopmost=random.Next(2)==0};Reset();t=0;
                for(int step=0;step<40;step++){
                    t+=random.Next(16,400);int roll=random.Next(6);
                    int front=roll<3?Game:roll<5?Foreign:OwnLayer;
                    if(random.Next(5)==0)z.RefuseTopmost=!z.RefuseTopmost;
                    if(front==Game)z.Activate('G');else if(front==Foreign)z.Activate('O');else z.Activate('L');
                    State s=Decide(front,false,false,false,false,t);
                    if(!s.Float){z.Sink();continue;}
                    string how=Raise(z,true);
                    if(z.BelowGame())return "random focus run "+run+" step "+step+": layer under the game after "+how;
                    /* a second pass changes nothing that holds */
                    Raise(z,true);if(z.BelowGame())return "random focus run "+run+" step "+step+": second pass lost the place";
                }
            }
            /* 8. Hiding is reserved for the minimised/hidden game; another app in front must see its own window above the overlay. */
            if(SinkOnLeave(false)||!SinkOnLeave(true))return "leave rule";
            {
                var z=new ModelZ{LayerTopmost=true,RefuseAll=true};
                z.Activate('O');if(!SinkOnLeave(false))z.Hide();else z.Sink();
                z.Activate('G');z.Show();
                if(z.BelowGame()||!z.Visible)return "return after hiding: layer under the game with every request refused";
                var before=new ModelZ{LayerTopmost=true,RefuseAll=true};before.Activate('O');before.Sink();before.Activate('G');before.Show();
                if(Raise(before,true)!="failed"||!before.BelowGame())return "return after sinking: the old way does not fail with every request refused (the test proves nothing)";
                before.ForceWorks=true;if(Raise(before,true)!="attached"||before.BelowGame())return "last step not taken";
            }
            for(int run=0;run<2000;run++){
                var z=new ModelZ{LayerTopmost=true,RefuseTopmost=random.Next(2)==0};Reset();t=0;Decide(Game,false,false,false,false,t);
                for(int step=0;step<40;step++){
                    t+=random.Next(16,9000);int roll=random.Next(6);bool minimised=random.Next(7)==0;
                    int front=roll<3?Game:roll<5?Foreign:OwnLayer;
                    if(front==Game)z.Activate('G');else if(front==Foreign)z.Activate('O');else z.Activate('L');
                    State s=Decide(front,false,false,false,minimised,t);bool shown=s.Context&&!minimised;
                    if(!s.Float&&SinkOnLeave(shown))z.Sink();
                    if(shown)z.Show();else z.Hide();
                    if(shown&&s.Float){Raise(z,true);if(z.BelowGame())return "random leave/return: layer under the game";}
                    if(shown&&front==Foreign&&(z.LayerTopmost||z.BelowGame()||z.Order.IndexOf('L')<z.Order.IndexOf('O')))
                        return "background overlay must be between the foreign window and the game";
                    if(shown==minimised)return "foreground switch changed visibility independently of minimisation";
                }
            }
            if(Classify(false,true,true,true,true)!=None||Classify(true,true,false,true,true)!=OwnLayer||Classify(true,false,true,false,true)!=Game||Classify(true,false,false,false,true)!=OwnHome||Classify(true,false,false,false,false)!=Foreign)return "classify";
            return "";
        }finally{SettleMs=keepSettle;HoldMs=keepHold;Reset();}
    }
}
