// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Collections.Generic;
// The draw adapters frame complete script strings before LunaHost buffers them. Content is never deduplicated.
public sealed class HookSourceFrames{
 readonly Dictionary<string,string> Pending=new Dictionary<string,string>();
 public List<string> Feed(string key,string input){
  string tail;Pending.TryGetValue(key,out tail);string data=(tail??"")+(input??"");var frames=new List<string>();int at=0;
  while(true){int start=data.IndexOf('\x1e',at);if(start<0){Pending.Remove(key);break;}int end=data.IndexOf('\x1f',start+1);if(end<0){if(data.Length-start<=16000){if(Pending.Count>100)Pending.Clear();Pending[key]=data.Substring(start);}else Pending.Remove(key);break;}frames.Add(data.Substring(start+1,end-start-1));at=end+1;}
  return frames;
 }
 public static bool SelfTest(){var p=new HookSourceFrames();if(p.Feed("a","\x1e前").Count!=0)return false;var a=p.Feed("a","半\x1f\x1e同じ。\x1f\x1e同じ。\x1f");if(a.Count!=3||a[0]!="前半"||a[1]!="同じ。"||a[2]!="同じ。")return false;return p.Feed("b","\x1e繰り返す。繰り返す。\x1f")[0]=="繰り返す。繰り返す。";}
}

// LunaHost may flush multiple successive embed callbacks as one unmarked string.
// Only collapse a batch that exactly reconstructs from individual callbacks.
public sealed class EmbedSourceBatch{
 readonly List<string> Lines=new List<string>();
 DateTime LastAt;
 public void Clear(){Lines.Clear();}
 public void Add(string text,DateTime now){
  if(String.IsNullOrWhiteSpace(text)||text.Length>4000)return;
  if((now-LastAt).TotalMilliseconds>1500)Lines.Clear();
  LastAt=now;Lines.Add(text.Trim());
  if(Lines.Count>128)Lines.RemoveAt(0);
 }
 public string LastLine(string output,DateTime now){
  if(Lines.Count<2||(now-LastAt).TotalMilliseconds>1500)return output;
  string value=output.Trim();
  if(Lines.Contains(value))return output;
  // E261 (user: a line already read came back glued to the next one, 「うーい」「うーい」「あ、ナツく……」x4): some engines
  // keep redrawn lines in their text buffer. Split the tail into known lines; any repeat means redraw residue, so show
  // only the newest line.
  {var known=new List<string>(new HashSet<string>(Lines));known.Sort((x,y)=>y.Length-x.Length);
   var parts=new List<string>();int at=value.Length;
   while(at>0){while(at>0&&Char.IsWhiteSpace(value[at-1]))at--;if(at==0)break;string hit=null;
    foreach(var line in known)if(line.Length>0&&line.Length<=at&&String.CompareOrdinal(value,at-line.Length,line,0,line.Length)==0){hit=line;break;}
    if(hit==null)break;parts.Add(hit);at-=hit.Length;}
   if(parts.Count>=2){var newestFirst=new List<string>(parts);newestFirst.Reverse();if(new HashSet<string>(parts).Count<parts.Count||!Kana(parts[0])&&parts.Exists(Kana))return Japanese(newestFirst,parts[0]);}}
  for(int end=Lines.Count-1;end>0;end--){
   int offset=value.Length;
   for(int i=end;i>=0;i--){
    string line=Lines[i];
    offset-=line.Length;
    if(offset<0||String.CompareOrdinal(value,offset,line,0,line.Length)!=0)break;
    // E251 (user: Ctrl-skip still dumped several lines): two or more recent lines at the end are enough; the start may
    // be a line recorded before the 1.5 s window.
    if(i<end&&(offset==0||end-i>=1))return Japanese(Lines.GetRange(i,end-i+1),Lines[end]);
    if(offset>0&&value[offset-1]=='\n'){
     offset--;
     if(offset>0&&value[offset-1]=='\r')offset--;
    }
   }
  }
  return output;
 }
 // E262 (user: EmbedKrkrZ showed 「あんたこそ誰よ」 four times): engines that draw one line several times (shadow, edge,
 // backlog layers) reach the host as one string holding N copies. A bracketed line repeated twice or more, or any line
 // repeated three or more times, is one line. Real repeats inside a line (はい。はい。) stay.
 // E267 (user: ATRI came up in Traditional Chinese): multilingual scripts hand the draw hook every language of a line
 // in one burst (JP, zh-TW, zh-CN). The newest line of such a burst is the last language, not the shown one: prefer the
 // newest line that has kana, and keep the old choice when none has.
 static bool Kana(string s){foreach(char ch in s)if(ch>='ぁ'&&ch<='ヿ'&&ch!='・'&&ch!='ー')return true;return false;}
 static string Japanese(List<string> oldestFirst,string fallback){for(int i=oldestFirst.Count-1;i>=0;i--)if(Kana(oldestFirst[i]))return oldestFirst[i];return fallback;}
 public static string Unrepeat(string text){
  if(text==null)return text;string v=text.Trim();int n=v.Length;
  for(int u=1;u<=n/2;u++){if(n%u!=0)continue;int k=n/u;string unit=v.Substring(0,u);bool all=true;
   for(int i=1;i<k&&all;i++)all=String.CompareOrdinal(v,i*u,unit,0,u)==0;
   if(!all)continue;string t=unit.Trim();
   bool quoted=t.Length>=2&&"「『（“‘【《〈(".IndexOf(t[0])>=0&&"」』）”’】》〉)".IndexOf(t[t.Length-1])>=0;
   if(quoted||k>=3)return unit;return text;}
  return text;
 }
 static bool LangTest(){
  var batch=new EmbedSourceBatch();var now=DateTime.UtcNow;
  batch.Add("でも、ないよりはましだ。",now);batch.Add("不過總比沒有好。",now);batch.Add("不过总比没有好。",now);
  return batch.LastLine("でも、ないよりはましだ。不過總比沒有好。不过总比没有好。",now)=="でも、ないよりはましだ。";
 }
 static bool RepeatTest(){
  var batch=new EmbedSourceBatch();var now=DateTime.UtcNow;
  batch.Add("「うーい」",now);batch.Add("「うーい」",now);batch.Add("「あ、ナツく……」",now);
  return batch.LastLine("「うーい」「うーい」「あ、ナツく……」「あ、ナツく……」「あ、ナツく……」",now)=="「あ、ナツく……」";
 }
 public static bool SelfTest(){
  var batch=new EmbedSourceBatch();var now=DateTime.UtcNow;
  batch.Add("One.",now);batch.Add("Two.",now);batch.Add("Three.",now);
  return batch.LastLine("One.Two.",now)=="Two."
   &&batch.LastLine("One.\r\nTwo.\r\n",now)=="Two."
   &&batch.LastLine("One.Two.Three.",now)=="Three."
   &&batch.LastLine("A real line. Two.",now)=="A real line. Two."
   &&batch.LastLine("One.Two.",now.AddSeconds(2))=="One.Two."
   &&batch.LastLine("Old line.One.Two.Three.",now)=="Three."
   &&RepeatTest()&&LangTest()&&Unrepeat("「あんたこそ誰よ」「あんたこそ誰よ」「あんたこそ誰よ」「あんたこそ誰よ」")=="「あんたこそ誰よ」"&&Unrepeat("はい。はい。")=="はい。はい。";
 }
}
