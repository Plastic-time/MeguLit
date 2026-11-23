// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
// A PID by itself can be reused. Bind the process name and creation timestamp
// captured by our window selector as well as the window ID. Some desktops do
// not expose HWND lookups to a helper; that does not invalidate process identity.
public static class HookTarget {
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder path,ref int size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out System.Runtime.InteropServices.ComTypes.FILETIME created,out System.Runtime.InteropServices.ComTypes.FILETIME exited,out System.Runtime.InteropServices.ComTypes.FILETIME kernel,out System.Runtime.InteropServices.ComTypes.FILETIME user);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr process);
 /* the bound game's program file, reported so the service can choose the hook text code page (Chinese builds draw GBK) */
 public static string ExePath="";
 /* The language of the game text decides whether any hide path is armed (a Chinese build shows its own text).
    2026-11-19 (audit of 416b2c63, user's 千恋＊万花: ds.ini of a Steam emulator next to the exe said Language=schinese while the
    text was Japanese, and every hiding path was off from the first line): an ini is never evidence. A Steam emulator's Language
    is the store language, and a multilingual build (千恋＊万花 Steam) has a Chinese interface over Japanese text. What counts is
    the library ("zh!" known Chinese build, "zh" inferred, "ja") and the lines the dialogue stream actually gives. */
 public static bool ChineseText=false;
 /* "zh!" is a build the library knows to be Chinese (contentLanguage zh): one Japanese line there is an untranslated line of a
    partial patch, not proof of a Japanese build, and never turns hiding on over the Chinese text the user chose. */
 public static bool ChineseKnown=false;static int ChineseRun=0;
 public static void SetSourceLanguage(string language){ChineseRun=0;if(language=="zh!"){ChineseText=true;ChineseKnown=true;}else if(language=="zh"){ChineseText=true;ChineseKnown=false;}else if(language=="ja"){ChineseText=false;ChineseKnown=false;}}
 public static bool JapaneseLine(string text){return (text??"").Length>=8&&System.Text.RegularExpressions.Regex.Matches(text??"","[ぁ-ゖァ-ヺ]").Count>=2&&System.Text.RegularExpressions.Regex.IsMatch(text??"","[。！？!?「」]");}
 /* no kana at all, six Han characters or more, and a word Japanese does not write (们 这 么 吗 呢 说 没 吧 啊, simplified or traditional) */
 public static bool ChineseLine(string text){string t=text??"";return !System.Text.RegularExpressions.Regex.IsMatch(t,"[ぁ-ゖァ-ヺ]")&&System.Text.RegularExpressions.Regex.Matches(t,"[一-鿿]").Count>=6&&System.Text.RegularExpressions.Regex.IsMatch(t,"[们們这這么麼吗嗎呢说說没沒吧啊]");}
 public static void ConfirmJapanese(string text){if(ChineseText&&!ChineseKnown&&JapaneseLine(text))ChineseText=false;}
 /* each line of the selected dialogue stream: a Japanese line makes the text Japanese at once (unless the library knows the build is
    Chinese); two Chinese lines in a row make it Chinese (one kana-less Japanese line never flips it) */
 public static void ObserveLanguage(string text){if(ChineseKnown)return;if(JapaneseLine(text)){ChineseRun=0;ChineseText=false;return;}if(ChineseLine(text)){if(++ChineseRun>=2)ChineseText=true;}else ChineseRun=0;}
 public static bool LanguageSelfTest(){bool c=ChineseText,k=ChineseKnown;int r=ChineseRun;try{SetSourceLanguage("");ChineseText=false;ChineseKnown=false;
  ObserveLanguage("这就是一个纯中文句子，你说呢。");if(ChineseText)return false;ObserveLanguage("我们今天去哪里吃饭吧。");if(!ChineseText)return false;
  ObserveLanguage("これは日本語の台詞です。");if(ChineseText)return false;
  ObserveLanguage("三日後、東京駅前広場。");ObserveLanguage("我们走吧，别说了。");if(ChineseText)return false;
  SetSourceLanguage("zh!");ObserveLanguage("これは日本語の台詞です。");ConfirmJapanese("これは日本語の台詞です。");if(!ChineseText)return false;
  SetSourceLanguage("zh");ConfirmJapanese("これは日本語の台詞です。");return !ChineseText;}finally{ChineseText=c;ChineseKnown=k;ChineseRun=r;}}
 public static void Validate(uint pid,string window,string name,string started){
  long hwnd;if(pid==0||pid==Process.GetCurrentProcess().Id||!Int64.TryParse(window,out hwnd)||hwnd==0||String.IsNullOrEmpty(name)||String.IsNullOrEmpty(started))throw new Exception("Missing explicitly bound game identity");
  IntPtr process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)throw new Exception("Unable to query the explicitly bound game");
  try{var path=new StringBuilder(32768);int size=path.Capacity;uint exit;System.Runtime.InteropServices.ComTypes.FILETIME created,exited,kernel,user;
   if(!QueryFullProcessImageName(process,0,path,ref size)||!GetProcessTimes(process,out created,out exited,out kernel,out user)||!GetExitCodeProcess(process,out exit))throw new Exception("Unable to verify bound game identity");
   ExePath=path.ToString();
   ChineseText=false;SetSourceLanguage(Environment.GetEnvironmentVariable("MEGULIT_SOURCE_LANGUAGE"));
   long filetime=((long)created.dwHighDateTime<<32)|(uint)created.dwLowDateTime;
   if(exit!=259||!String.Equals(Path.GetFileNameWithoutExtension(path.ToString()),name,StringComparison.OrdinalIgnoreCase)||DateTime.FromFileTimeUtc(filetime).Ticks.ToString(CultureInfo.InvariantCulture)!=started)throw new Exception("Bound game process changed; bind the game again");
  }finally{CloseHandle(process);}
  uint owner;GetWindowThreadProcessId(new IntPtr(hwnd),out owner);if(owner!=0&&owner!=pid)throw new Exception("Bound game window belongs to another process");
 }
}
