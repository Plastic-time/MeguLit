// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class ReaderScreenshot {
    [StructLayout(LayoutKind.Sequential)] struct PointNative { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RectNative { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref PointNative point);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out RectNative rect);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int width, int height, IntPtr src, int sx, int sy, int operation);

    static Rectangle OnScreen(IntPtr window, Rectangle client) {
        RectNative size;
        var origin = new PointNative();
        if (!GetClientRect(window, out size) || !ClientToScreen(window, ref origin)) return Rectangle.Empty;
        client.Intersect(new Rectangle(0, 0, size.Right, size.Bottom));
        if (client.Width <= 0 || client.Height <= 0) return Rectangle.Empty;
        client.Offset(origin.X, origin.Y);
        return Rectangle.Intersect(client, SystemInformation.VirtualScreen);
    }

    public static string Capture(IntPtr game, IntPtr reader, Rectangle textBounds) {
        var active = GetForegroundWindow();
        if (active == IntPtr.Zero || GameCapture.Busy(game) ||
            (active != GetAncestor(game, 2) && active != GetAncestor(reader, 2))) return "";
        var client = OnScreen(game, new Rectangle(0, 0, int.MaxValue, int.MaxValue));
        if (client.Width <= 0 || client.Height <= 0) return "";
        var text = OnScreen(reader, textBounds);
        var frame = text.Width > 0 && text.Height > 0 ? Rectangle.Union(client, text) : client;
        if ((long)frame.Width * frame.Height > 20000000) return "";
        using (var image = new Bitmap(frame.Width, frame.Height, PixelFormat.Format24bppRgb)) {
            var screen = GetDC(IntPtr.Zero);
            if (screen == IntPtr.Zero) return "";
            try {
                using (var graphics = Graphics.FromImage(image)) {
                    graphics.Clear(Color.FromArgb(24, 24, 28));
                    var dc = graphics.GetHdc();
                    try {
                        if (!Copy(dc, screen, client, frame)) return "";
                        if (text.Width > 0 && text.Height > 0 && !client.Contains(text) && !Copy(dc, screen, text, frame)) return "";
                    } finally { graphics.ReleaseHdc(dc); }
                }
            } finally { ReleaseDC(IntPtr.Zero, screen); }
            var scale = Math.Min(1.0, 1280.0 / Math.Max(frame.Width, frame.Height));
            using (var output = new Bitmap(image, Math.Max(1, (int)Math.Round(frame.Width * scale)), Math.Max(1, (int)Math.Round(frame.Height * scale))))
            using (var bytes = new MemoryStream()) {
                output.Save(bytes, ImageFormat.Jpeg);
                return Convert.ToBase64String(bytes.ToArray());
            }
        }
    }

    static bool Copy(IntPtr dest, IntPtr screen, Rectangle area, Rectangle frame) {
        return BitBlt(dest, area.Left - frame.Left, area.Top - frame.Top, area.Width, area.Height,
            screen, area.Left, area.Top, unchecked((int)0x40CC0020));
    }
}
