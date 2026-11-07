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
