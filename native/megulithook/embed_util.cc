#include "MinHook.h"
#include "MeguLitSafeUnhook.h"
#include "MeguLitGdiHide.h"
#include "MeguLitEmbedWait.h"
static std::atomic<bool> patch_fun_ptrs_patch_once_flag = true;
DynamicShiftJISCodec *dynamiccodec = new DynamicShiftJISCodec(932);

void cast_back(const HookParam &hp, TextBuffer *buff, const std::wstring &trans, bool normal, DWORD hostcodepage)
{

  if (hp.type & CODEC_UTF16)
  {
    buff->from(trans);
  }
  else if (hp.type & CODEC_UTF32)
  {
    buff->from(utf16_to_utf32(trans));
  }
  else
  {
    std::string astr;
    if (hp.type & EMBED_DYNA_SJIS && !normal)
    {
      astr = dynamiccodec->encodeSTD(trans, 0);
    }
    else
    {
      astr = WideStringToString(trans, hp.codepage ? hp.codepage : ((hp.type & CODEC_UTF8) ? CP_UTF8 : hostcodepage));
    }
    buff->from(astr);
  }
}

struct FunctionInfo
{
  const char *name; // for debugging purpose
  uintptr_t *oldFunction,
      newFunction;
  bool attached;
  uintptr_t addr;
  explicit FunctionInfo(const uintptr_t _addr = 0, const char *name = "", uintptr_t *oldFunction = nullptr, uintptr_t newFunction = 0,
                        bool attached = false)
      : name(name), oldFunction(oldFunction), newFunction(newFunction), attached(attached), addr(_addr)
  {
  }
};
std::unordered_map<uintptr_t, FunctionInfo> funcs; // attached functions
std::vector<uintptr_t> replacedfuns;               // attached functions
bool _1f()
{
#define ADD_FUN(_f) funcs[F_##_f] = FunctionInfo((uintptr_t)_f, #_f, (uintptr_t *)&Hijack::old##_f, (uintptr_t)Hijack::new##_f);
  ADD_FUN(CreateFontA)
  ADD_FUN(CreateFontW)
  ADD_FUN(CreateFontIndirectA)
  ADD_FUN(CreateFontIndirectW)
  ADD_FUN(GetGlyphOutlineA)
  ADD_FUN(GetGlyphOutlineW)
  ADD_FUN(GetTextExtentPoint32A)
  ADD_FUN(GetTextExtentPoint32W)
  ADD_FUN(GetTextExtentExPointA)
  ADD_FUN(GetTextExtentExPointW)
  // ADD_FUN(GetCharABCWidthsA)
  // ADD_FUN(GetCharABCWidthsW)
  ADD_FUN(TextOutA)
  ADD_FUN(TextOutW)
  ADD_FUN(ExtTextOutA)
  ADD_FUN(ExtTextOutW)
  ADD_FUN(DrawTextA)
  ADD_FUN(DrawTextW)
  ADD_FUN(DrawTextExA)
  ADD_FUN(DrawTextExW)
  ADD_FUN(CharNextA)
  // ADD_FUN(CharNextW)
  // ADD_FUN(CharNextExA)
  // ADD_FUN(CharNextExW)
  ADD_FUN(CharPrevA)
  // ADD_FUN(CharPrevW)
  ADD_FUN(MultiByteToWideChar)
  ADD_FUN(WideCharToMultiByte)
#undef ADD_FUN
  return 0;
}
bool _1 = _1f();
/* MeguLit 2026-11-19: every function replaced here, with its MinHook trampoline and its detour, so that removal can
   go through the shared safe flow (native/shared/MeguLitSafeUnhook.h) instead of MH_RemoveHook freeing the trampoline
   under a game thread that is still in the detour (the detour calls the trampoline) */
static std::mutex replacedLock;
static std::unordered_map<void *, std::pair<void *, void *>> replacedHooks; // target -> {trampoline, detour}
static bool RemoveReplaced(void *target)
{
  void *original, *detour;
  {
    std::lock_guard _(replacedLock);
    auto found = replacedHooks.find(target);
    if (found == replacedHooks.end())
      return true;
    original = found->second.first;
    detour = found->second.second;
    replacedHooks.erase(found);
  }
  MeguLitUnhook::Span body = MeguLitUnhook::FunctionSpan(detour);
  if (MeguLitUnhook::RemoveMinHook(target, original, &body, 1, nullptr, 0, 2000))
    return true;
  Msg::Log("MeguLit replaced function %p kept, not freed: a thread may still be in its detour", target);
  return false;
}
bool ReplaceFunction(PVOID oldf, PVOID newf, PVOID *pOrigin)
{
  PVOID oldx;
  if (!pOrigin)
    pOrigin = &oldx;
  RemoveHook((uintptr_t)oldf);
  MeguLitUnhook::RetryKept(oldf);
  MH_STATUS created = MH_CreateHook(oldf, newf, pOrigin);
  if (MH_OK == created)
  {
    if (MH_OK == MH_EnableHook(oldf))
    {
      std::lock_guard _(replacedLock);
      replacedHooks[oldf] = {*pOrigin, newf};
      return true;
    }
    MH_RemoveHook(oldf); /* created just now and never enabled: no thread can be in it */
    return false;
  }
  if (created == MH_ERROR_ALREADY_CREATED) /* as before, the hook already there is removed (now safely) and this call fails */
    RemoveReplaced(oldf);
  return false;
}
void attachFunction(uintptr_t _hook_font_flag)
{
  for (auto &_func : funcs)
  {
    if (_func.first & _hook_font_flag)
    {
      if (_func.second.attached)
        continue;

      if (ReplaceFunction((PVOID)_func.second.addr, (PVOID)_func.second.newFunction, (PVOID *)_func.second.oldFunction))
      {
        _func.second.attached = true;
        replacedfuns.push_back(_func.first);
      }
      else
        Msg::Log("MeguLit hijack failed flag=%x", (unsigned)_func.first);
    }
  }
}
/* Removes every function replaced here through the safe flow. True when all trampolines were freed; a kept one stays
   disabled. The attached flags are reset so that a later host (the hook DLL can stay loaded) attaches them again. */
bool detachall()
{
  bool freed = true;
  for (auto _flag : replacedfuns)
  {
    auto &info = funcs.at(_flag);
    freed = RemoveReplaced((LPVOID)info.addr) && freed;
    info.attached = false;
  }
  replacedfuns.clear();

  if (!patch_fun_ptrs_patch_once_flag.load())
  {
    for (auto &&[ptr1, ptr2] : patch_fun_ptrs)
      freed = RemoveReplaced(ptr1) && freed;
    patch_fun_ptrs_patch_once_flag = true;
  }
  return freed;
}
void patch_fun_ptrs_patch_once()
{
  if (auto cur_patch_fun_ptrs_patch_once_flag = patch_fun_ptrs_patch_once_flag.exchange(false))
  {
    // 理论上搞个激活内嵌的行的使用计数是可以更早的detach的，但感觉好麻烦，算了。
    for (auto &&[ptr1, ptr2] : patch_fun_ptrs)
    {
      ReplaceFunction(ptr1, ptr2);
    }
  }
}
void solvefont(HookParam hp)
{
  if (!wcslen(commonsharedmem->fontFamily))
    return;
  if (hp.embed_hook_font & DISABLE_FONT_SWITCH)
  {
    Hijack::Disable_Font_Switch = true;
  }
  if (hp.embed_hook_font)
  {
    MeguLitGdiHide::FontWanted = true;
    attachFunction(hp.embed_hook_font);
  }
  if (hp.embed_hook_font & F_MultiByteToWideChar)
    disable_mbwc = true;
  if (hp.embed_hook_font & F_WideCharToMultiByte)
    disable_wcmb = true;

  if (auto current_patch_fun = patch_fun.exchange(nullptr))
  {
    current_patch_fun();
  }
  patch_fun_ptrs_patch_once();
}
static std::wstring alwaysInsertSpacesSTD(const std::wstring &text)
{
  std::wstring ret;
  ret.reserve(text.size() * 2);
  for (auto c : text)
  {
    ret.push_back(c);
    if (c >= 32)           // ignore non-printable characters
      ret.push_back(L' '); // or insert \u3000 if needed
  }
  return ret;
}
bool charEncodableSTD(const wchar_t &ch, UINT codepage)
{

  if (ch <= 127) // ignore ascii characters
    return true;
  std::wstring s;
  s.push_back(ch);
  return StringToWideString(WideStringToString(s, codepage), codepage).value() == s;
}
static std::wstring insertSpacesAfterUnencodableSTD(const std::wstring &text, HookParam hp, DWORD hostcodepage)
{

  std::wstring ret;
  ret.reserve(text.size() * 2);
  for (const wchar_t &c : text)
  {
    ret.push_back(c);
    if (!charEncodableSTD(c, hp.codepage ? hp.codepage : hostcodepage))
      ret.push_back(L' ');
  }
  return ret;
}
std::wstring adjustSpacesSTD(const std::wstring &text, HookParam hp, DWORD hostcodepage)
{
  if (hp.type & EMBED_INSERT_SPACE_ALWAYS)
    return alwaysInsertSpacesSTD(text);
  else if (hp.type & EMBED_INSERT_SPACE_AFTER_UNENCODABLE)
    return insertSpacesAfterUnencodableSTD(text, hp, hostcodepage);
  return text;
}
bool isPauseKeyPressed()
{
  return WinKey::isKeyControlPressed() || WinKey::isKeyShiftPressed() && !WinKey::isKeyReturnPressed();
}
static MeguLitEmbed::Cache translatecache;
bool check_is_thread_selected(const ThreadParam &tp)
{
  for (int i = 0; i < ARRAYSIZE(commonsharedmem->embedtps); i++)
  {
    if (commonsharedmem->embedtps[i].use && (commonsharedmem->embedtps[i].tp == tp))
      return true;
  }
  return false;
}
bool check_embed_able(const ThreadParam &tp)
{
  return host_connected && check_is_thread_selected(tp) && ((isPauseKeyPressed() == false) ? true : !commonsharedmem->fastskipignore);
}
/* MeguLit 2026-11-19: the answer event comes from MeguLitEmbedArm (made before the line went out), see MeguLitEmbedWait.h */
/* MeguLit 2026-11-19: how long the game thread waited for the bridge's answer, as a histogram in the hook diagnostics every
   30 s (milliseconds: <5 <20 <50 <100 <500 >=500, and how many ran out); measures the stutter an embed stream costs */
static volatile LONG MeguLitWaitBuckets[7];
static volatile LONG MeguLitWaitReported;
bool waitforevent(UINT32 timems, const ThreadParam &tp, const std::wstring &origin)
{
  LARGE_INTEGER f, t0, t1;
  QueryPerformanceFrequency(&f);
  QueryPerformanceCounter(&t0);
  HANDLE ev = MeguLitEmbed::Take(LUNA_EMBED_notify_event, GetCurrentProcessId(), simplehash::djb2_n2((const unsigned char *)(origin.c_str()), origin.size() * 2));
  bool ok = MeguLitEmbed::Wait(ev, timems, [&]()
                               { return check_embed_able(tp); });
  if (ev)
    CloseHandle(ev);
  QueryPerformanceCounter(&t1);
  double ms = (double)(t1.QuadPart - t0.QuadPart) * 1000.0 / (double)f.QuadPart;
  InterlockedIncrement(&MeguLitWaitBuckets[ms < 5 ? 0 : ms < 20 ? 1 : ms < 50 ? 2 : ms < 100 ? 3 : ms < 500 ? 4 : 5]);
  if (!ok)
    InterlockedIncrement(&MeguLitWaitBuckets[6]);
  LONG now = (LONG)(GetTickCount() / 1000), last = MeguLitWaitReported;
  if (now - last >= 30 && InterlockedCompareExchange(&MeguLitWaitReported, now, last) == last)
  {
    LONG b[7];
    for (int i = 0; i < 7; i++)
      b[i] = InterlockedExchange(&MeguLitWaitBuckets[i], 0);
    Msg::Log("MeguLit embed waits ms <5:%d <20:%d <50:%d <100:%d <500:%d >=500:%d timeout:%d", b[0], b[1], b[2], b[3], b[4], b[5], b[6]);
  }
  return ok;
}

void TextHook::parsenewlineseperator(TextBuffer *buff)
{
  if (!(hp.lineSeparator))
    return;

  if (hp.type & CODEC_UTF16)
  {
    StringCharReplacer(buff, hp.lineSeparator, wcslen(hp.lineSeparator), L'\n');
  }
  else if (hp.type & CODEC_UTF32)
    return;
  else
  {
    // ansi/utf8，newlineseperator都是简单字符
    std::string newlineseperatorA = wcasta(hp.lineSeparator);
    StringCharReplacer(buff, newlineseperatorA.c_str(), newlineseperatorA.size(), '\n');
  }
}
static std::string textkey(const void *data, size_t len)
{
  return std::string(static_cast<const char *>(data), len);
}
static_assert(offsetof(CommonSharedMem, hash) == 16, "HookBridge.cs SyncEmbedGeneration writes the generation at offset 16");
/* MeguLit: the cache generation (MeguLitEmbedWait.h): what the bridge bumped plus what the hook sees itself */
static UINT64 embedgeneration()
{
  UINT64 h = 1469598103934665603ull;
  h = MeguLitEmbed::Fold(h, &commonsharedmem->hash, sizeof(commonsharedmem->hash));
  h = MeguLitEmbed::Fold(h, &commonsharedmem->waittime, sizeof(commonsharedmem->waittime));
  h = MeguLitEmbed::Fold(h, &commonsharedmem->displaymode, sizeof(commonsharedmem->displaymode));
  h = MeguLitEmbed::Fold(h, commonsharedmem->embedtps, sizeof(commonsharedmem->embedtps));
  return h;
}
static DWORD embedcodepage(HookParam &hp, TextBuffer &buff)
{
  auto hostcodepage = hp.codepage ? hp.codepage : (commonsharedmem->codepage ? commonsharedmem->codepage : hp.detectedCodepage);
  if (hp.isAscii() && !hostcodepage)
  {
    if (all_ascii(buff.viewA()))
      return CP_UTF8;
    return 0;
  }
  return hostcodepage;
}
bool checktranslatedok(TextBuffer buff)
{
  if (buff.size > 1000)
    return true;
  return translatecache.Find(textkey(buff.data, buff.size), embedgeneration(), GetTickCount64(), nullptr) != MeguLitEmbed::Miss;
}
/* MeguLit 2026-11-19, before the line goes out (texthook.cc). 1: cached, no wait and no question to the bridge;
   0: the bridge is asked and the answer event already exists; -1: no write-back for this line (not selected, unreadable);
   -2: too long to write back, the bridge is not asked.
   Only a stream that will wait clears the shared answer buffer: another stream clearing it could wipe the selected stream's answer. */
int MeguLitEmbedArm(HookParam &hp, TextBuffer &buff, const ThreadParam &tp)
{
  if (!check_embed_able(tp))
    return -1;
  if (buff.size > 1000)
    return -2; /* upstream: never asked, so it only waited the full time for nothing */
  if (commonsharedmem->clearText)
    return 0;
  if (translatecache.Find(textkey(buff.data, buff.size), embedgeneration(), GetTickCount64(), nullptr) != MeguLitEmbed::Miss)
    return 1;
  auto hostcodepage = embedcodepage(hp, buff);
  if (hp.isAscii() && !hostcodepage)
    return -1;
  auto t = commonparsestring(buff.data, buff.size, &hp, hostcodepage);
  if (!t)
    return -1;
  ZeroMemory(commonsharedmem->text, sizeof(commonsharedmem->text)); /* clear trans before call */
  auto &origin = t.value();
  MeguLitEmbed::Arm(LUNA_EMBED_notify_event, GetCurrentProcessId(), simplehash::djb2_n2((const unsigned char *)(origin.c_str()), origin.size() * 2));
  return 0;
}
bool TextHook::waitfornotify(TextBuffer *buff, ThreadParam tp)
{
  auto hostcodepage = hp.codepage ? hp.codepage : (commonsharedmem->codepage ? commonsharedmem->codepage : hp.detectedCodepage);
  if (hp.isAscii() && !hostcodepage)
  {
    if (all_ascii(buff->viewA()))
      hostcodepage = CP_UTF8;
    else
      return false;
  }
  if (commonsharedmem->clearText)
  {
    if (hp.isAscii() && (hostcodepage == 932))
      buff->from(" \x81\x40");
    else
      buff->from(" ");
    return true;
  }
  std::wstring origin;
  if (auto t = commonparsestring(buff->data, buff->size, &hp, hostcodepage))
    origin = t.value();
  else
    return false;
  std::wstring translate;
  auto key = textkey(buff->data, buff->size);
  auto generation = embedgeneration();
  auto hit = translatecache.Find(key, generation, GetTickCount64(), &translate);
  if (hit == MeguLitEmbed::Unchanged)
    return false;
  if (hit == MeguLitEmbed::Miss)
  {
    if (waitforevent(commonsharedmem->waittime, tp, origin) == false)
      return false;
    translate = commonsharedmem->text;
    /* an empty answer is cached too (short-lived): the next redraw of this line does not wait again */
    translatecache.Put(key, generation, GetTickCount64(), translate);
    if ((translate.size() == 0))
      return false;
  }
  if (hp.lineSeparator)
    strReplace(translate, L"\n", hp.lineSeparator);
  translate = adjustSpacesSTD(translate, hp, hostcodepage);
  switch (commonsharedmem->displaymode)
  {
  case Displaymode::TRANS:
    break;
  case Displaymode::ORI_TRANS:
    translate = origin + L" " + translate;
    break;
  case Displaymode::TRANS_ORI:
    translate = translate + L" " + origin;
    break;
  }
  solvefont(hp);
  cast_back(hp, buff, translate, false, hostcodepage);
  return true;
}
