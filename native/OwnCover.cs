// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;

/* 2026-11-19 (user build, 素晴らしき日々: the Alt+T menu over the game was read as game text): the parts of the game's client
   area that MeguLit's own windows cover. Every visible top-level window above the game in z-order that belongs to one of
   MeguLit's processes counts with its window region (the reader overlay sets its region to exactly what it paints: lines,
   menu, word card) or, without a region, its whole rectangle. The art scan paints these parts black before it reads, so only
   the game's own pixels are recognised. */
internal static class OwnCover {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern int GetWindowRgn(IntPtr h, IntPtr rgn);
    [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
    [DllImport("gdi32.dll")] static extern uint GetRegionData(IntPtr rgn, uint size, byte[] data);

    /* the covered parts in the game's client coordinates, clipped to w x h */
    public static List<Rectangle> Parts(IntPtr game, int w, int h, ICollection<uint> own) {
        var parts = new List<Rectangle>();
        if (game == IntPtr.Zero || own == null || own.Count == 0) return parts;
        IntPtr root = GetAncestor(game, 2); if (root == IntPtr.Zero) root = game;
        var origin = new POINT(); if (!ClientToScreen(game, ref origin)) return parts;
        var client = new Rectangle(0, 0, w, h);
        EnumWindows((win, l) => {
            if (win == root) return false; /* below the game: hidden by it, nothing to cover */
            uint pid; GetWindowThreadProcessId(win, out pid);
            if (!own.Contains(pid) || !IsWindowVisible(win) || IsIconic(win)) return true;
            RECT wr; if (!GetWindowRect(win, out wr)) return true;
            foreach (var r in Region(win, wr)) {
                var c = Rectangle.Intersect(new Rectangle(r.X - origin.X, r.Y - origin.Y, r.Width, r.Height), client);
                if (c.Width > 0 && c.Height > 0 && parts.Count < 256) parts.Add(c);
            }
            return true;
        }, IntPtr.Zero);
        return parts;
    }

    /* the window's region as screen rectangles; the whole window when it has none */
    static List<Rectangle> Region(IntPtr win, RECT wr) {
        var list = new List<Rectangle>();
        IntPtr rgn = CreateRectRgn(0, 0, 0, 0);
        try {
            int kind = GetWindowRgn(win, rgn); /* 0 error/none, 1 null region (nothing painted), 2 simple, 3 complex */
            if (kind == 0) { list.Add(Rectangle.FromLTRB(wr.Left, wr.Top, wr.Right, wr.Bottom)); return list; }
            if (kind == 1) return list;
            uint size = GetRegionData(rgn, 0, null); if (size < 32) return list;
            var data = new byte[size]; if (GetRegionData(rgn, size, data) == 0) return list;
            int count = BitConverter.ToInt32(data, 8);
            for (int i = 0; i < count && 32 + i * 16 + 16 <= data.Length; i++) {
                int o = 32 + i * 16;
                list.Add(Rectangle.FromLTRB(wr.Left + BitConverter.ToInt32(data, o), wr.Top + BitConverter.ToInt32(data, o + 4), wr.Left + BitConverter.ToInt32(data, o + 8), wr.Top + BitConverter.ToInt32(data, o + 12)));
            }
        } finally { DeleteObject(rgn); }
        return list;
    }

    /* paints the covered parts black */
    public static int Paint(Bitmap image, List<Rectangle> parts) {
        if (parts == null || parts.Count == 0) return 0;
        using (var g = Graphics.FromImage(image)) foreach (var p in parts) g.FillRectangle(Brushes.Black, p);
        return parts.Count;
    }
}
