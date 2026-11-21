// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

// Read-only observations, not a current-source, occlusion, hide or click acknowledgement
internal sealed class KemcoSpriteSnapshot {
 internal sealed class Glyph {
  internal int id; internal string text; internal bool shown; internal float[] box;
 }
 internal sealed class Page {
  internal string text; internal readonly List<float[]> rects = new List<float[]>();
 }
 sealed class Published { internal int generation, line; internal string wire; }
 readonly Dictionary<string, Published> pages = new Dictionary<string, Published>();
 int serial = 1000000;
 internal static bool Box(float[] b, int width, int height) {
  if (b == null || b.Length != 4 || width <= 0 || height <= 0) return false;
  foreach (float n in b) if (float.IsNaN(n) || float.IsInfinity(n)) return false;
  return b[0] >= 0 && b[1] >= 0 && b[2] > 0 && b[3] > 0 && b[0]+b[2] <= width && b[1]+b[3] <= height;
 }
 internal static bool Text(string s, int max) {
  if (string.IsNullOrEmpty(s) || s.Length > max) return false;
  for (int i=0;i<s.Length;i++) {
   char c=s[i]; if (char.IsControl(c)) return false;
   if (char.IsHighSurrogate(c)) { if (++i >= s.Length || !char.IsLowSurrogate(s[i])) return false; }
   else if (char.IsLowSurrogate(c)) return false;
  }
  return true;
 }
 internal static Page Read(IList<IList<Glyph>> rows, int width, int height) {
  if (rows == null || rows.Count == 0 || rows.Count > 32) return null;
  var p=new Page(); var text=new StringBuilder(); var ids=new HashSet<int>(); bool gap=false; int total=0;
  foreach (var row in rows) {
   if (row == null || row.Count > 256) return null;
   bool first=true;
   foreach (var g in row) {
    if (++total > 2048 || g == null || g.id == 0 || !ids.Add(g.id) || !Text(g.text,2) || (g.text.Length != 1 && !char.IsSurrogatePair(g.text,0))) return null;
    if (!g.shown) { gap=true; continue; }
    if (gap || !Box(g.box,width,height)) return null;
    if (first && text.Length > 0) text.Append('\n'); first=false;
    text.Append(g.text); p.rects.Add(g.box);
   }
  }
  if (p.rects.Count == 0) return null;
  p.text=text.ToString(); return p;
 }
 static string N(float n) { return Math.Round(n,1).ToString(CultureInfo.InvariantCulture); }
 static string B(float[] b) { return N(b[0])+","+N(b[1])+","+N(b[2])+","+N(b[3]); }
 static string Head(int line,int w,int h) { return "ToMe_CHARS engine=unity line="+line+" hidden=0 sw="+w+" sh="+h+" vx=0 vy=0 vw="+w+" vh="+h; }
 internal void Drop(string channel,int w,int h,Action<string> send) {
  Published old; if (!pages.TryGetValue(channel,out old)) return;
  pages.Remove(channel); send(Head(old.line,w,h)+" n=0 rects="+(channel=="body"?"":" role="+(channel=="name"?"name":"choice")+" id=K"+channel+" box=0,0,0,0")+" text=");
 }
 internal void Reset(int w,int h,Action<string> send) { foreach (var key in new List<string>(pages.Keys)) Drop(key,w,h,send); }
 internal void Publish(string channel,int generation,Page p,string roleText,float[] roleBox,int w,int h,Action<string> send) {
  bool body=channel=="body", name=channel=="name";
  int choice; if (!body && !name && (!channel.StartsWith("choice",StringComparison.Ordinal) || !int.TryParse(channel.Substring(6),out choice) || choice<0 || choice>=16)) throw new ArgumentException("KEMCO_CHANNEL");
  if (generation == 0 || (body ? p==null : !Text(roleText,512)||!Box(roleBox,w,h))) { Drop(channel,w,h,send); return; }
  Published old; pages.TryGetValue(channel,out old);
  if (old != null && old.generation != generation) { Drop(channel,w,h,send); old=null; }
  if (old==null) { old=new Published { generation=generation,line=++serial }; pages.Add(channel,old); }
  var wire=new StringBuilder(Head(old.line,w,h));
  if (body) { wire.Append(" n=").Append(p.rects.Count).Append(" rects="); foreach (var b in p.rects) { if (wire[wire.Length-1]!='=') wire.Append(';'); wire.Append(B(b)); } wire.Append(" text=").Append(p.text.Replace('\n','\u001f')); }
  else wire.Append(" n=0 rects= role=").Append(name?"name":"choice").Append(" id=K").Append(channel).Append(" box=").Append(B(roleBox)).Append(" text=").Append(roleText);
  string now=wire.ToString(); if (old.wire==now) return; old.wire=now; send(now);
 }
}
