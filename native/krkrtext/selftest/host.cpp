// SPDX-License-Identifier: GPL-3.0-or-later
// Stand-in KiriKiri host for MeguLitKrkr32.dll (no game involved): it exports TVPGetFunctionExporter with a cdecl
// exporter that answers the SDK functions the DLL uses, owns a visible window with a message loop, and implements a
// global object whose Scripts.eval stands in for script.inc: each eval calls the registered __megulitKrkrReport with
// a begin and an end line (the end text carries a line break) and returns "ok ...". The host listens on the DLL's
// pipe and passes when it reads the status, the begin and the end line with the break turned into U+001F.
// An SDK function the host does not answer is reported by name (exit 4), so a missing one shows up here, not in a game.
#include <windows.h>
#include <objidl.h>
#include <stdio.h>
#include <string>
#include <map>
#include "../sdk/tp_stub.h"

static std::string Missing;
static int Evals;

// ---- the engine side: strings ------------------------------------------------------------------------------------
struct VS { tjs_int RefCount; tjs_char *LongString; tjs_char ShortString[TJS_VS_SHORT_LEN + 1]; tjs_int Length; tjs_uint32 HeapFlag; tjs_uint32 Hint; };
static VS *Alloc(const tjs_char *s) {
 VS *v = (VS *)calloc(1, sizeof(VS)); size_t n = s ? wcslen(s) : 0; v->Length = (tjs_int)n;
 if (n <= TJS_VS_SHORT_LEN) { if (n) memcpy(v->ShortString, s, n * 2); }
 else { v->LongString = (tjs_char *)calloc(n + 1, 2); memcpy(v->LongString, s, n * 2); }
 return v;
}
static tTJSVariantString *__stdcall F_Alloc(const tjs_char *s) { return (tTJSVariantString *)Alloc(s); }
static void __stdcall F_AddRef(VS *v) { v->RefCount++; }
static void __stdcall F_Release(VS *v) { if (v->RefCount == 0) { free(v->LongString); free(v); } else v->RefCount--; }
static const tjs_char *__stdcall F_Chars(const VS *v) { return v->LongString ? v->LongString : v->ShortString; }
static tjs_int __stdcall F_Length(const VS *v) { return v->Length; }
// ---- the engine side: variants (void, object, string; enough for what the DLL and this host use) -------------------
struct V { union { struct { iTJSDispatch2 *o, *t; } obj; VS *s; long long i; }; int vt; };
static void Drop(V *v) { if (v->vt == tvtObject) { if (v->obj.o) v->obj.o->Release(); if (v->obj.t) v->obj.t->Release(); } else if (v->vt == tvtString && v->s) F_Release(v->s); v->vt = tvtVoid; v->i = 0; }
static void Copy(V *v, const V *r) { *v = *r; if (v->vt == tvtObject) { if (v->obj.o) v->obj.o->AddRef(); if (v->obj.t) v->obj.t->AddRef(); } else if (v->vt == tvtString && v->s) F_AddRef(v->s); }
static void __stdcall V_New(V *v) { v->i = 0; v->vt = tvtVoid; }
static void __stdcall V_Copy(V *v, const V *r) { Copy(v, r); }
static void __stdcall V_Obj2(V *v, iTJSDispatch2 *o, iTJSDispatch2 *t) { v->vt = tvtObject; v->obj.o = o; v->obj.t = t; if (o) o->AddRef(); if (t) t->AddRef(); }
static void __stdcall V_Obj(V *v, iTJSDispatch2 *o) { V_Obj2(v, o, NULL); }
static void __stdcall V_Str(V *v, const tjs_char *s) { v->vt = tvtString; v->s = Alloc(s); }
static void __stdcall V_Ttstr(V *v, VS *const *ref) { v->vt = tvtString; v->s = *ref; if (v->s) F_AddRef(v->s); }
static void __stdcall V_Free(V *v) { Drop(v); }
static int __stdcall V_Type(const V *v) { return v->vt; }
static iTJSDispatch2 *__stdcall V_AsObj(const V *v) { return v->vt == tvtObject ? v->obj.o : NULL; }
static VS *__stdcall V_AsStr(const V *v) { return v->vt == tvtString ? v->s : NULL; }
static V *__stdcall V_Assign(V *v, const V *r) { if (v != r) { V t; Copy(&t, r); Drop(v); *v = t; } return v; }
static void __stdcall S_FromVariant(VS **s, const V *v) { *s = v->vt == tvtString ? v->s : NULL; if (*s) F_AddRef(*s); }
static void __stdcall S_FromChars(VS **s, const tjs_char *c) { *s = c && *c ? Alloc(c) : NULL; }
static void __stdcall S_New(VS **s) { *s = NULL; }
static void __stdcall S_Copy(VS **s, VS *const *r) { *s = *r; if (*s) F_AddRef(*s); }
static void __stdcall S_Free(VS **s) { if (*s) F_Release(*s); *s = NULL; }
static const tjs_char *__stdcall S_Chars(VS *const *s) { return *s ? F_Chars(*s) : L""; }
static VS **__stdcall S_AssignChars(VS **s, const tjs_char *c) { if (*s) F_Release(*s); *s = c && *c ? Alloc(c) : NULL; return s; }
static void __stdcall F_Unbound(const char *name) { printf("FAIL the DLL asked for an SDK function the host lacks: %s\n", name); fflush(stdout); ExitProcess(4); }

// ---- the engine side: try blocks and the script global -------------------------------------------------------------
static void __stdcall F_Try(tTVPTryBlockFunction t, tTVPCatchBlockFunction c, tTVPFinallyBlockFunction f, void *data) {
 try { t(data); } catch (...) { tTVPExceptionDesc d; d.type = TJS_W("eTJS"); d.message = TJS_W("thrown"); if (c(data, d)) throw; }
 if (f) f(data);
}
static iTJSDispatch2 *Report;
class Scripts : public tTJSDispatch {
public:
 tjs_error TJS_INTF_METHOD FuncCall(tjs_uint32, const tjs_char *member, tjs_uint32 *, tTJSVariant *result, tjs_int n, tTJSVariant **param, iTJSDispatch2 *) {
  if (!member || wcscmp(member, L"eval") || n != 1 || param[0]->Type() != tvtString) return TJS_E_INVALIDPARAM;
  ttstr source(*param[0]);
  if (++Evals == 3) throw 1; // one eval fails inside the engine: the DLL must survive it through TVPDoTryBlock
  if (Report) {
   const wchar_t *lines[] = {L"ToMe_KRKR begin line=1 same=0 nvl=1 x0=60 y0=80 x1=1180 y1=80 size=28 sw=1280 sh=720 n=0",
                             L"ToMe_KRKR end line=1 same=0 nvl=1 x0=60 y0=80 x1=1150 y1=120 size=28 sw=1280 sh=720 n=12 text=一行目の文\n二行目の文。",
                             L"not a protocol line"};
   for (auto l : lines) { tTJSVariant v(l), *a[1] = {&v}; Report->FuncCall(0, NULL, NULL, NULL, 1, a, NULL); }
  }
  if (result) *result = tTJSVariant(source.c_str()[0] == L'(' && wcsstr(source.c_str(), L"__megulitKrkrState") ? L"ok layers=2 lines=1 wait=11" : L"unexpected script");
  return TJS_S_OK;
 }
};
static Scripts *ScriptsObj;
class Global : public tTJSDispatch {
public:
 tjs_error TJS_INTF_METHOD PropGet(tjs_uint32, const tjs_char *member, tjs_uint32 *, tTJSVariant *result, iTJSDispatch2 *) {
  if (member && !wcscmp(member, L"Scripts") && result) { *result = tTJSVariant(ScriptsObj, ScriptsObj); return TJS_S_OK; }
  return TJS_E_MEMBERNOTFOUND;
 }
 tjs_error TJS_INTF_METHOD PropSet(tjs_uint32, const tjs_char *member, tjs_uint32 *, const tTJSVariant *param, iTJSDispatch2 *) {
  if (member && !wcscmp(member, L"__megulitKrkrReport") && param->Type() == tvtObject) {
   iTJSDispatch2 *o = param->AsObjectNoAddRef(); if (o != Report) { if (Report) Report->Release(); Report = o; o->AddRef(); }
   return TJS_S_OK;
  }
  return TJS_E_MEMBERNOTFOUND;
 }
};
static Global *GlobalObj;
static iTJSDispatch2 *__stdcall F_Global() { GlobalObj->AddRef(); return GlobalObj; }

// ---- the exporter -------------------------------------------------------------------------------------------------
static std::map<std::string, void *> Table;
struct Exporter : iTVPFunctionExporter {
 bool TJS_INTF_METHOD QueryFunctions(const tjs_char **, void **, tjs_uint) { return false; }
 bool TJS_INTF_METHOD QueryFunctionsByNarrowString(const char **names, void **out, tjs_uint count) {
  bool all = true;
  static std::map<std::string, int> seen;
  if (getenv("MEGULIT_TRACE")) for (tjs_uint i = 0; i < count; i++) if (!seen[names[i]]++) fprintf(stderr, "query %s\n", names[i]);
  for (tjs_uint i = 0; i < count; i++) { auto it = Table.find(names[i]); out[i] = it == Table.end() ? NULL : it->second; if (!out[i]) { all = false; if (Missing.empty()) Missing = names[i]; } }
  return all;
 }
};
static Exporter TheExporter;
extern "C" iTVPFunctionExporter *__stdcall TVPGetFunctionExporter() { return &TheExporter; }
#ifdef _M_IX86
#pragma comment(linker, "/EXPORT:TVPGetFunctionExporter=_TVPGetFunctionExporter@0")
#else
#pragma comment(linker, "/EXPORT:TVPGetFunctionExporter")
#endif

// ---- the pipe ------------------------------------------------------------------------------------------------------
static HWND Window;
static DWORD WINAPI Listen(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitKrkr-%lu", GetCurrentProcessId());
 HANDLE p = CreateNamedPipeW(name, PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE | PIPE_WAIT, 1, 0, 65536, 0, NULL);
 if (p == INVALID_HANDLE_VALUE || (!ConnectNamedPipe(p, NULL) && GetLastError() != ERROR_PIPE_CONNECTED)) { printf("FAIL pipe\n"); ExitProcess(2); }
 std::string all; char buf[4096]; DWORD got;
 bool status = false, begin = false, end = false, junk = false;
 while (ReadFile(p, buf, sizeof buf, &got, NULL) && got) {
  all.append(buf, got);
  size_t at;
  while ((at = all.find('\n')) != std::string::npos) {
   std::string line = all.substr(0, at); all.erase(0, at + 1);
   printf("  pipe: %s\n", line.c_str());
   if (line.rfind("ToMe_KRKR status ok layers=2", 0) == 0) status = true;
   if (line.rfind("ToMe_KRKR begin line=1 same=0 nvl=1 x0=60", 0) == 0) begin = true;
   if (line.rfind("ToMe_KRKR end line=1", 0) == 0 && line.find("text=\xe4\xb8\x80\xe8\xa1\x8c\xe7\x9b\xae\xe3\x81\xae\xe6\x96\x87\x1f\xe4\xba\x8c") != std::string::npos) end = true;
   if (line.find("not a protocol") != std::string::npos) junk = true;
  }
  if (status && begin && end && Evals >= 4) { printf(junk ? "FAIL a non-protocol line was forwarded\n" : "PASS exporter, cdecl check, game-thread eval, failed eval survived, report function, pipe, line breaks\n"); fflush(stdout); ExitProcess(junk ? 3 : 0); }
 }
 printf("FAIL pipe closed\n"); ExitProcess(2);
}

int wmain(int argc, wchar_t **argv) {
 if (argc != 2) { printf("usage: host <MeguLitKrkr32.dll>\n"); return 1; }
 Table["iTJSDispatch2 * ::TVPGetScriptDispatch()"] = (void *)&F_Global;
 Table["void ::TVPDoTryBlock(tTVPTryBlockFunction,tTVPCatchBlockFunction,tTVPFinallyBlockFunction,void *)"] = (void *)&F_Try;
 Table["tTJSVariantString * ::TJSAllocVariantString(const tjs_char *)"] = (void *)&F_Alloc;
 Table["void tTJSVariantString::AddRef()"] = (void *)&F_AddRef;
 Table["void tTJSVariantString::Release()"] = (void *)&F_Release;
 Table["tTJSVariantString::operator const tjs_char *() const"] = (void *)&F_Chars;
 Table["tjs_int tTJSVariantString::GetLength() const"] = (void *)&F_Length;
 Table["void ::TVPThrowPluginUnboundFunctionError(const char *)"] = (void *)&F_Unbound;
 Table["tTJSVariant::tTJSVariant()"] = (void *)&V_New;
 Table["tTJSVariant::tTJSVariant(const tTJSVariant &)"] = (void *)&V_Copy;
 Table["tTJSVariant::tTJSVariant(iTJSDispatch2 *)"] = (void *)&V_Obj;
 Table["tTJSVariant::tTJSVariant(iTJSDispatch2 *,iTJSDispatch2 *)"] = (void *)&V_Obj2;
 Table["tTJSVariant::tTJSVariant(const tjs_char *)"] = (void *)&V_Str;
 Table["tTJSVariant::tTJSVariant(const tTJSString &)"] = (void *)&V_Ttstr;
 Table["tTJSVariant::~ tTJSVariant()"] = (void *)&V_Free;
 Table["void tTJSVariant::Clear()"] = (void *)&V_Free;
 Table["tTJSVariantType tTJSVariant::Type()"] = (void *)&V_Type;
 Table["tTJSVariantType tTJSVariant::Type() const"] = (void *)&V_Type;
 Table["iTJSDispatch2 * tTJSVariant::AsObjectNoAddRef() const"] = (void *)&V_AsObj;
 Table["tTJSVariantString * tTJSVariant::AsStringNoAddRef() const"] = (void *)&V_AsStr;
 Table["tTJSVariant & tTJSVariant::operator =(const tTJSVariant &)"] = (void *)&V_Assign;
 Table["tTJSString::tTJSString(const tTJSVariant &)"] = (void *)&S_FromVariant;
 Table["tTJSString::tTJSString(const tjs_char *)"] = (void *)&S_FromChars;
 Table["tTJSString::tTJSString()"] = (void *)&S_New;
 Table["tTJSString::tTJSString(const tTJSString &)"] = (void *)&S_Copy;
 Table["tTJSString::~ tTJSString()"] = (void *)&S_Free;
 Table["tTJSString & tTJSString::operator =(const tjs_char *)"] = (void *)&S_AssignChars;
 Table["const tjs_char * tTJSString::c_str() const"] = (void *)&S_Chars;
 TVPInitImportStub(&TheExporter);
 ScriptsObj = new Scripts(); GlobalObj = new Global();
 CreateThread(NULL, 0, Listen, NULL, 0, NULL);
 WNDCLASSW wc = {}; wc.lpfnWndProc = DefWindowProcW; wc.hInstance = GetModuleHandleW(NULL); wc.lpszClassName = L"MeguLitKrkrHost";
 RegisterClassW(&wc);
 Window = CreateWindowW(L"MeguLitKrkrHost", L"stand-in", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 0, 0, 640, 400, NULL, NULL, wc.hInstance, NULL);
 if (!LoadLibraryW(argv[1])) { printf("FAIL load %lu\n", GetLastError()); return 1; }
 DWORD until = GetTickCount() + 30000;
 // KiriKiri's own loop peeks messages; the DLL's tick arrives through its WH_GETMESSAGE hook.
 while (GetTickCount() < until) {
  MSG m; while (PeekMessageW(&m, NULL, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); }
  Sleep(10);
 }
 printf("FAIL timed out after %d evals%s%s\n", Evals, Missing.empty() ? "" : "; first missing ", Missing.c_str());
 return 5;
}
