// SPDX-License-Identifier: GPL-3.0-or-later
// E306 (user 2026-11-10: "make it the best hook": every engine should place each sentence of a full-screen page where
// the game drew it, not only ISLAND, KiriKiri and Ren'Py). Engines without their own position source (BGI, Siglus,
// Artemis, CatSystem2, anything LunaHook reads) are located on the picture instead: when a new hook line arrives,
// MeguLit sends it here (pageLocate); the bound game's client area is read (GameCapture, never MeguLit's own windows)
// and passed through the system's Japanese OCR, and the hook line is aligned to the OCR rows. The rows it covers give
// the sentence's box and the game's own line breaks (the hook text, split where the game wrapped it: OCR only finds
// where, the characters always come from the hook). The result goes out as the same hookEngineLine as the native
// page engines (engine "ocr"): nvl=1 when the sentence sits in the upper half (a full-screen page), same=1 while the
// sentence before it is still on screen. ADV games report nvl=0 and keep the usual single-line reader; after a run of
// ADV lines only every fourth line is read, so an ADV game pays almost nothing. C# 5 (the .NET Framework csc).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

public sealed class PageLocator : IDisposable {
 [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
 [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }

 public sealed class Row { public string Text; public Rectangle Box; public Row(string text, Rectangle box) { Text = text; Box = box; } }
 public sealed class Found { public int First, Last; public List<string> Parts = new List<string>(); public double Coverage; }

 readonly Action<object> Emit;
 readonly object Gate = new object();
 readonly AutoResetEvent Wake = new AutoResetEvent(false);
 Thread Worker;
 volatile bool Disposed;
 IntPtr Target; string Text; DateTime At; int Serial; bool Art;
 string PreviousText; bool PreviousNvl; long Line; int AdvRun, Skipped;
 OcrEngine Engine; bool EngineTried;

 public PageLocator(Action<object> emit) { Emit = emit; }

 /* 2026-11-12 (user: art text, opening titles and credits, must be readable too, with MeguLit drawing over it): art=true
    locates a line that is not in the text window. The game keeps drawing it; MeguLit lays an invisible, selectable copy
    and the translation over it (artText), and hides them when the picture no longer shows the line. */
 public void Request(IntPtr target, string text) { Request(target, text, false); }
 public void Request(IntPtr target, string text, bool art) {
  if (target == IntPtr.Zero || String.IsNullOrWhiteSpace(text) || text.Length > 600) return;
  lock (Gate) {
   if (art) { Target = target; Text = text; At = DateTime.UtcNow; Serial++; Art = true; if (Worker == null) { Worker = new Thread(Run) { IsBackground = true, Name = "MeguLit page locator" }; Worker.Start(); } Wake.Set(); return; }
   Art = false;
   // After 12 ADV lines in a row only every fourth line is read; a page found again restores every line.
   if (AdvRun >= 12 && ++Skipped % 4 != 0) return;
   Target = target; Text = text; At = DateTime.UtcNow; Serial++;
   if (Worker == null) { Worker = new Thread(Run) { IsBackground = true, Name = "MeguLit page locator" }; Worker.Start(); }
  }
  Wake.Set();
 }

 void Run() {
  int done = 0;
  while (!Disposed) {
   Wake.WaitOne(1000);
   IntPtr target; string text; DateTime at; int serial; bool art;
   lock (Gate) { target = Target; text = Text; at = At; serial = Serial; art = Art; }
   if (serial == done || text == null) continue;
   done = serial;
   try { if (art) LocateArt(target, text, at, serial); else Locate(target, text, at, serial); } catch (Exception e) { Emit(new { type = "pageLocateStatus", status = "error " + e.Message }); }
  }
 }

 bool Stale(int serial) { lock (Gate) return serial != Serial || Disposed; }

 // The line types out: read at 0.4 s, then again while the game is still drawing it, up to 3.5 s.
 void Locate(IntPtr target, string text, DateTime at, int serial) {
  if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } if (Engine == null) Emit(new { type = "pageLocateStatus", status = "no Japanese OCR" }); }
  if (Engine == null) return;
  foreach (int ms in new[] { 400, 1000, 2000, 3500 }) {
   int wait = (int)(at.AddMilliseconds(ms) - DateTime.UtcNow).TotalMilliseconds;
   if (wait > 0) Thread.Sleep(wait);
   if (Stale(serial)) return;
   RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) return;
   int w = rect.Right, h = rect.Bottom;
   List<Row> rows;
   using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
    if (!GameCapture.Into(target, image, 3)) return;
    lock (OcrLock) rows = Read(image, w, h);
   }
   if (Stale(serial)) return;
   var found = Find(rows, text);
   if (found == null) continue;
   Report(found, rows, text, w, h);
   return;
  }
  Emit(new { type = "pageLocateStatus", status = "miss chars=" + text.Length });
  lock (Gate) { if (AdvRun < 12) AdvRun++; }
 }

 bool Capture(IntPtr target, out List<Row> rows, out int w, out int h) {
  rows = null; w = h = 0;
  RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) return false;
  w = rect.Right; h = rect.Bottom;
  using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
   if (!GameCapture.Into(target, image, 3)) return false;
   lock (OcrLock) rows = Read(image, w, h);
  }
  return true;
 }
 // Art text: found within 3 s of the hook line, then followed every 0.7 s for up to 30 s; hidden when the picture lost it.
 void LocateArt(IntPtr target, string text, DateTime at, int serial) {
  if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } }
  if (Engine == null) return;
  Found found = null; List<Row> rows = null; int w = 0, h = 0;
  foreach (int ms in new[] { 250, 800, 1600, 3000 }) {
   int wait = (int)(at.AddMilliseconds(ms) - DateTime.UtcNow).TotalMilliseconds;
   if (wait > 0) Thread.Sleep(wait);
   if (Stale(serial)) return;
   if (!Capture(target, out rows, out w, out h)) return;
   found = Find(rows, text);
   if (found != null) break;
  }
  if (found == null) { Emit(new { type = "pageLocateStatus", status = "art miss chars=" + text.Length }); return; }
  ArtEmit(serial, text, found, rows, w, h, true);
  int misses = 0;
  for (int i = 0; i < 43 && !Stale(serial); i++) {
   Thread.Sleep(700);
   if (Stale(serial)) break;
   List<Row> again; int w2, h2;
   if (!Capture(target, out again, out w2, out h2)) break;
   var f2 = Find(again, text);
   if (f2 == null) { if (++misses >= 2) break; continue; }
   misses = 0;
  }
  ArtEmit(serial, text, null, null, w, h, false);
 }
 void ArtEmit(int id, string text, Found f, List<Row> rows, int w, int h, bool visible) {
  var parts = new List<object>();
  if (f != null) for (int i = f.First; i <= f.Last; i++) { var b = rows[i].Box; string t = i - f.First < f.Parts.Count ? f.Parts[i - f.First] : rows[i].Text; parts.Add(new { text = t, x = b.Left, y = b.Top, w = b.Width, h = b.Height }); }
  Emit(new { type = "artText", id = id, text = text, visible = visible, rows = parts, sw = w, sh = h, at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
 }

 void Report(Found f, List<Row> rows, string text, int w, int h) {
  int x0 = int.MaxValue, x1 = 0, size = 0;
  for (int i = f.First; i <= f.Last; i++) { var b = rows[i].Box; x0 = Math.Min(x0, b.Left); size += b.Height; }
  size = Math.Max(6, size / (f.Last - f.First + 1));
  for (int i = f.First; i <= f.Last; i++) x1 = Math.Max(x1, rows[i].Box.Right - size);
  if (x1 < x0) x1 = x0;
  int y0 = rows[f.First].Box.Top, y1 = rows[f.Last].Box.Top;
  bool nvl = y0 < h * 0.5;
  bool same = nvl && PreviousNvl && PreviousText != null && Find(rows, PreviousText) != null;
  lock (Gate) { AdvRun = nvl ? 0 : Math.Min(12, AdvRun + 1); if (nvl) Skipped = 0; }
  PreviousText = text; PreviousNvl = nvl;
  long line = ++Line;
  string drawn = String.Join("\n", f.Parts.ToArray());
  int count = 0; foreach (char c in drawn) if (c != '\n') count++;
  long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
  Emit(new { type = "hookEngineLine", engine = "ocr", phase = "begin", line = line, same = same, nvl = nvl, x0 = x0, y0 = y0, x1 = x1, y1 = y1, size = size, sw = w, sh = h, count = 0, text = "", at = now });
  Emit(new { type = "hookEngineLine", engine = "ocr", phase = "end", line = line, same = same, nvl = nvl, x0 = x0, y0 = y0, x1 = x1, y1 = y1, size = size, sw = w, sh = h, count = count, text = drawn, at = now });
 }


 // ---- choices (E407) -----------------------------------------------------------------------------------------------
 // Choice texts come from the hook's other streams (read-only). Each is looked up on its own in the OCR rows; only the
 // ones drawn as a row of their own come back, with their pixel boxes, so the reader can draw over the buttons.
 readonly object OcrLock = new object();
 int ChoiceSerial;
 public void RequestChoices(IntPtr target, List<string> options) {
  if (target == IntPtr.Zero || options == null || options.Count == 0 || options.Count > 12) return;
  int serial = Interlocked.Increment(ref ChoiceSerial);
  ThreadPool.QueueUserWorkItem(_ => { try { LocateChoices(target, options, serial); } catch (Exception e) { Emit(new { type = "pageLocateStatus", status = "choice error " + e.Message }); } });
 }
 void LocateChoices(IntPtr target, List<string> options, int serial) {
  if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } }
  if (Engine == null) { Emit(new { type = "hookChoiceBoxes", serial = serial, items = new object[0], missed = options.ToArray(), rows = new string[0], status = "no Japanese OCR" }); return; }
  foreach (int ms in new[] { 250, 700, 1500 }) {
   Thread.Sleep(ms == 250 ? 250 : ms == 700 ? 450 : 800);
   if (serial != ChoiceSerial || Disposed) return;
   RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) return;
   int w = rect.Right, h = rect.Bottom;
   List<Row> rows;
   using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
    if (!GameCapture.Into(target, image, 3)) return;
    lock (OcrLock) rows = Read(image, w, h);
   }
   var items = new List<object>(); var missed = new List<string>();
   foreach (var option in options) {
    var f = Find(rows, option);
    if (f == null || f.Last - f.First > 1) { missed.Add(option); continue; }
    int x0 = int.MaxValue, y0 = int.MaxValue, x1 = 0, y1 = 0;
    for (int i = f.First; i <= f.Last; i++) { var q = rows[i].Box; x0 = Math.Min(x0, q.Left); y0 = Math.Min(y0, q.Top); x1 = Math.Max(x1, q.Right); y1 = Math.Max(y1, q.Bottom); }
    items.Add(new { text = option, x0 = x0, y0 = y0, x1 = x1, y1 = y1 });
   }
   if (items.Count >= 2 || ms == 1500) {
    var seen = new List<string>(); foreach (var r in rows) { if (seen.Count >= 24) break; seen.Add(r.Text.Length > 40 ? r.Text.Substring(0, 40) : r.Text); }
    Emit(new { type = "hookChoiceBoxes", serial = serial, sw = w, sh = h, items = items.ToArray(), missed = missed.ToArray(), rows = seen.ToArray(), status = items.Count >= 2 ? "found" : "miss" });
    return;
   }
  }
 }

 // ---- OCR ----------------------------------------------------------------------------------------------------------
 // Small text reads badly: pictures under 1400 px wide are read at twice their size (boxes are scaled back).
 List<Row> Read(Bitmap image, int w, int h) {
  double scale = w < 1400 ? 2 : 1;
  Bitmap input = image;
  if (scale != 1) { input = new Bitmap((int)(w * scale), (int)(h * scale), PixelFormat.Format24bppRgb); using (var g = Graphics.FromImage(input)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.DrawImage(image, 0, 0, input.Width, input.Height); } }
  try {
   using (var memory = new MemoryStream()) {
    input.Save(memory, ImageFormat.Png);
    using (var random = new InMemoryRandomAccessStream()) {
     using (var writer = new DataWriter(random.GetOutputStreamAt(0))) { writer.WriteBytes(memory.ToArray()); Await(writer.StoreAsync()); Await(writer.FlushAsync()); writer.DetachStream(); }
     random.Seek(0);
     var decoder = Await(BitmapDecoder.CreateAsync(random));
     using (var software = Await(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied))) {
      var result = Await(Engine.RecognizeAsync(software));
      var rows = new List<Row>();
      if (result.TextAngle.HasValue && Math.Abs(result.TextAngle.Value) > 10) return rows; // vertical / rotated text: not handled
      foreach (var line in result.Lines) {
       double l = double.MaxValue, t = double.MaxValue, r = 0, b = 0;
       foreach (var word in line.Words) { var q = word.BoundingRect; l = Math.Min(l, q.X); t = Math.Min(t, q.Y); r = Math.Max(r, q.X + q.Width); b = Math.Max(b, q.Y + q.Height); }
       if (r <= l || b <= t) continue;
       rows.Add(new Row(line.Text, Rectangle.FromLTRB((int)(l / scale), (int)(t / scale), (int)Math.Ceiling(r / scale), (int)Math.Ceiling(b / scale))));
      }
      rows.Sort((a, c) => Math.Abs(a.Box.Top - c.Box.Top) > Math.Min(a.Box.Height, c.Box.Height) / 2 ? a.Box.Top.CompareTo(c.Box.Top) : a.Box.Left.CompareTo(c.Box.Left));
      return rows;
     }
    }
   }
  } finally { if (!ReferenceEquals(input, image)) input.Dispose(); }
 }
 static T Await<T>(Windows.Foundation.IAsyncOperation<T> operation) {
  var until = DateTime.UtcNow.AddSeconds(8);
  try { while (operation.Status == Windows.Foundation.AsyncStatus.Started) { if (DateTime.UtcNow > until) { operation.Cancel(); throw new InvalidOperationException("OCR timed out"); } Thread.Sleep(10); } return operation.GetResults(); } finally { operation.Close(); }
 }

 // ---- alignment (pure; see SelfTest) -------------------------------------------------------------------------------
 // Letters and digits only (NFKC), each remembering the source index it came from.
 static string Plain(string s, List<int> map) {
  var o = new StringBuilder();
  for (int i = 0; i < s.Length; i++) {
   string n = s[i].ToString().Normalize(NormalizationForm.FormKC);
   foreach (char c in n) if (Char.IsLetterOrDigit(c)) { o.Append(c); if (map != null) map.Add(i); }
  }
  return o.ToString();
 }
 static int Lcs(string a, string b) {
  if (a.Length == 0 || b.Length == 0) return 0;
  int[] p = new int[b.Length + 1], c = new int[b.Length + 1];
  for (int i = 0; i < a.Length; i++) { for (int j = 0; j < b.Length; j++) c[j + 1] = a[i] == b[j] ? p[j] + 1 : Math.Max(p[j + 1], c[j]); var t = p; p = c; c = t; Array.Clear(c, 0, c.Length); }
  return p[b.Length];
 }
 const string Closing = "、。，．,.!！?？」』）)】〉》…‥ー～〜♪";
 const string Opening = "「『（(【〈《“‘";

 // The run of consecutive OCR rows that holds the sentence: every row mostly made of the sentence's characters (in
 // order), together covering at least 60 % of it. The hook text is then split at the rows' ends.
 public static Found Find(List<Row> rows, string source) {
  var map = new List<int>();
  string s = Plain(source, map);
  if (s.Length < 2 || rows.Count == 0) return null;
  if (s.Length > 600) return null;
  var plain = new string[rows.Count]; var fits = new bool[rows.Count];
  for (int i = 0; i < rows.Count; i++) { plain[i] = Plain(rows[i].Text, null); int n = plain[i].Length; fits[i] = n >= 1 && Lcs(plain[i], s) >= Math.Max(1, Math.Ceiling(n * 0.6)); }
  Found best = null;
  for (int i = 0; i < rows.Count; i++) {
   if (!fits[i]) continue;
   var joined = new StringBuilder();
   for (int j = i; j < rows.Count && j < i + 40 && fits[j]; j++) {
    joined.Append(plain[j]);
    string c = joined.ToString();
    int l = Lcs(c, s);
    double coverage = (double)l / s.Length, precision = (double)l / Math.Max(1, c.Length);
    if (coverage >= 0.6 && precision >= 0.6 && (best == null || coverage > best.Coverage + 1e-9)) best = new Found { First = i, Last = j, Coverage = coverage };
   }
  }
  if (best == null) return null;
  // Align the run to the sentence and cut the sentence where each row ends.
  var lens = new List<int>(); var run = new StringBuilder();
  for (int i = best.First; i <= best.Last; i++) { run.Append(plain[i]); lens.Add(run.Length); }
  string a = run.ToString();
  int[,] d = new int[a.Length + 1, s.Length + 1];
  for (int i = a.Length - 1; i >= 0; i--) for (int j = s.Length - 1; j >= 0; j--) d[i, j] = a[i] == s[j] ? d[i + 1, j + 1] + 1 : Math.Max(d[i + 1, j], d[i, j + 1]);
  var matchedAt = new int[a.Length]; for (int k = 0; k < a.Length; k++) matchedAt[k] = -1;
  { int i = 0, j = 0; while (i < a.Length && j < s.Length) { if (a[i] == s[j] && d[i, j] == d[i + 1, j + 1] + 1) { matchedAt[i] = j; i++; j++; } else if (d[i + 1, j] >= d[i, j + 1]) i++; else j++; } }
  // A row ends after its last matched character and the next starts at its first one. Closing punctuation after the
  // end stays on the row, opening punctuation before the next start moves down; characters OCR missed in between go
  // to the row with more misread characters (its unmatched OCR characters stand for them), the upper one on a tie.
  var firstOf = new int[lens.Count]; var lastOf = new int[lens.Count]; var misses = new int[lens.Count];
  for (int r = 0; r < lens.Count; r++) {
   int from0 = r == 0 ? 0 : lens[r - 1]; firstOf[r] = -1; lastOf[r] = -1;
   for (int k = from0; k < lens[r]; k++) { if (matchedAt[k] < 0) { misses[r]++; continue; } if (firstOf[r] < 0) firstOf[r] = matchedAt[k]; lastOf[r] = matchedAt[k]; }
  }
  var cuts = new List<int>(); int last = 0, prev = -1;
  for (int r = 0; r < lens.Count; r++) {
   if (firstOf[r] < 0) continue;
   if (prev >= 0) {
    int p = map[lastOf[prev]] + 1, q = map[firstOf[r]];
    while (p < q && (Char.IsWhiteSpace(source[p]) || Closing.IndexOf(source[p]) >= 0)) p++;
    int k = q; while (k > p && Opening.IndexOf(source[k - 1]) >= 0) k--;
    int cut = misses[prev] >= misses[r] ? k : p;
    if (cut > last && cut < source.Length) { cuts.Add(cut); last = cut; }
   }
   prev = r;
  }
  int from = 0;
  foreach (int cut in cuts) { best.Parts.Add(source.Substring(from, cut - from).Trim()); from = cut; }
  best.Parts.Add(source.Substring(from).Trim());
  best.Parts.RemoveAll(p => p.Length == 0);
  return best;
 }

 public static bool SelfTest() {
  Func<string, int, Row> row = (t, y) => new Row(t, new Rectangle(120, y, 900, 30));
  var rows = new List<Row> { row("第一章", 20), row("春の風が吹いていた。窓の外では", 96), row("桜が散り始めている。", 136), row("「おはよう」と彼女は言った。", 176), row("セーブ ロード オート", 680) };
  var a = Find(rows, "春の風が吹いていた。窓の外では桜が散り始めている。");
  if (a == null || a.First != 1 || a.Last != 2 || a.Parts.Count != 2 || a.Parts[0] != "春の風が吹いていた。窓の外では" || a.Parts[1] != "桜が散り始めている。") return false;
  // OCR mistakes (ぃ for い, a dropped character) still align; the text kept is the hook's.
  var noisy = new List<Row> { row("春の風が吹いてぃた。窓の外で", 96), row("桜が散り始めている", 136) };
  var b = Find(noisy, "春の風が吹いていた。窓の外では桜が散り始めている。");
  if (b == null || b.Parts.Count != 2 || b.Parts[0] != "春の風が吹いていた。窓の外では" || b.Parts[1] != "桜が散り始めている。") return false;
  var c = Find(rows, "「おはよう」と彼女は言った。");
  if (c == null || c.First != 3 || c.Last != 3 || c.Parts.Count != 1) return false;
  if (Find(rows, "どこにも描かれていない台詞です") != null) return false;
  // Opening quote moves to the next row, closing punctuation stays on the row it ends.
  var q = Find(new List<Row> { row("彼は言った。", 96), row("「待って」", 136) }, "彼は言った。「待って」");
  if (q == null || q.Parts.Count != 2 || q.Parts[0] != "彼は言った。" || q.Parts[1] != "「待って」") return false;
  return true;
 }

 // Real OCR on a drawn page (no game): three paragraphs wrapped at their own widths over a striped background, read by
 // the system's Japanese OCR and aligned. Returns 0, or the step that failed; "skip" when no Japanese OCR is installed.
 public static string OcrSelfTest(string save) {
  var locator = new PageLocator(o => { });
  try { locator.Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { }
  if (locator.Engine == null) return "skip no Japanese OCR";
  string[] paragraphs = { "春の風が吹いていた。窓の外では桜が散り始めている。", "「おはよう」と彼女は言った。少し眠そうな声だった。", "僕は返事をしないまま、ぼんやりと空を見上げていた。" };
  int[][] breaks = { new[] { 15 }, new[] { 14 }, new[] { 13 } };
  using (var image = new Bitmap(1280, 720, PixelFormat.Format24bppRgb)) {
   using (var g = Graphics.FromImage(image))
   using (var font = new Font("MS Gothic", 30, FontStyle.Regular, GraphicsUnit.Pixel)) {
    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
    for (int y = 0; y < 720; y += 8) g.FillRectangle(new SolidBrush(Color.FromArgb(30 + y / 12, 40, 70 + (y / 8 % 2) * 12)), 0, y, 1280, 8);
    int top = 90;
    for (int p = 0; p < paragraphs.Length; p++) {
     int at = 0; var cuts = new List<int>(breaks[p]); cuts.Add(paragraphs[p].Length);
     foreach (int cut in cuts) { g.DrawString(paragraphs[p].Substring(at, cut - at), font, Brushes.White, 120, top); top += 44; at = cut; }
     top += 20;
    }
   }
   if (!String.IsNullOrEmpty(save)) image.Save(save, ImageFormat.Png);
   var rows = locator.Read(image, 1280, 720);
   for (int p = 0; p < paragraphs.Length; p++) {
    var f = Find(rows, paragraphs[p]);
    if (f == null) return "miss paragraph " + p + " rows=" + rows.Count + " [" + String.Join(" | ", rows.ConvertAll(r => r.Text).ToArray()) + "]";
    string want = paragraphs[p].Substring(0, breaks[p][0]) + "\n" + paragraphs[p].Substring(breaks[p][0]);
    string got = String.Join("\n", f.Parts.ToArray());
    if (got != want) return "breaks paragraph " + p + ": " + got.Replace("\n", "/");
    if (rows[f.First].Box.Left < 100 || rows[f.First].Box.Left > 160) return "box paragraph " + p + " left=" + rows[f.First].Box.Left;
   }
  }
  return "0";
 }

 public void Dispose() { Disposed = true; Wake.Set(); }
}
