/* A6 (2026-11-19, アマカノ2 / CatSystem2 "卡卡的"): replay of the embed wait in MeguLitEmbedWait.h, the code the hook DLL
   runs on the game thread. A fake LunaHost answers like the real one (create the answer event, fill the shared buffer, set
   the event, close it) after a short bridge delay. Scenarios:
   - the selected stream redraws the same CatSystem2 line 200 times (once with a hide answer, once with an empty answer);
   - a stream that is not selected sends its own text all the time;
   - the selected stream shows new lines;
   - #696 review: other enabled contexts (Japanese twins) show the line the selected stream has cached.
   Asserts: the stream that is not selected never waits and never clears the answer buffer; redraws hit the cache (the bridge
   is asked once); a new line waits p95 < 5 ms; every new line gets its own answer; every context asks the bridge for its
   own answer and never borrows the selected stream's.
   "--old" runs the waiting as it was before (event made after the line went out, empty answers not cached, every stream
   clearing the answer buffer); run.cmd requires that run to FAIL, so the test cannot pass by accident. Exit code = failures. */
#include "../MeguLitEmbedWait.h"
#include <atomic>
#include <cstdio>
#include <deque>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <vector>
#include <algorithm>
#include <chrono>
#pragma comment(lib, "winmm.lib")

static const char *Format = "MEGULIT_EMBEDWAIT_TEST.%lu.%llu";
static const UINT32 WaitMs = 100; /* HookBridge.cs HideWaitMs */
static bool Old = false;

/* the parts of CommonSharedMem the wait uses */
static wchar_t SharedText[1000];
static std::atomic<UINT64> SharedGen{1};
static MeguLitEmbed::Cache Cache;

static UINT64 Hash(const std::wstring &s)
{
  return MeguLitEmbed::Fold(1469598103934665603ull, s.data(), s.size() * 2);
}

struct Request
{
  std::wstring text;
  bool selected;
  UINT64 stream;
};
/* streams (ThreadParam ctx): the selected setter and three other contexts of it; LeaveAlone: the stream the bridge answers ""
   (HookBridge.cs OnEmbedAnswer: a twin before the selected stream wrote the line, or the third twin within 2 s) */
static const UINT64 Sel = 1, Twin1 = 2, Twin2 = 3, Twin3 = 4, Noise = 9;
static std::atomic<UINT64> LeaveAlone{0};
static std::mutex QueueLock;
static std::condition_variable QueueSignal;
static std::deque<Request> Queue;
static std::atomic<bool> Stop{false};
static std::atomic<int> Asked{0};
static std::atomic<int> Mode{0}; /* 0: hide answer, 1: empty answer (left unchanged) */

static double Now()
{
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

/* LunaHost + HookBridge: OnEmbed answers a selected line, Luna_EmbedCallback creates/sets/closes the named event */
static void Host()
{
  while (!Stop)
  {
    Request r;
    {
      std::unique_lock<std::mutex> l(QueueLock);
      QueueSignal.wait_for(l, std::chrono::milliseconds(5), []
                           { return !Queue.empty() || Stop; });
      if (Queue.empty())
        continue;
      r = Queue.front();
      Queue.pop_front();
    }
    if (!r.selected)
      continue; /* the bridge answers "" to a stream it does not hide, nobody waits for it */
    Asked++;
    double until = Now() + 0.3; /* bridge work */
    while (Now() < until)
      ;
    std::wstring answer = Mode == 0 && r.stream != LeaveAlone ? std::wstring(r.text.size(), L'　') : std::wstring();
    wcsncpy_s(SharedText, answer.c_str(), _TRUNCATE);
    HANDLE ev = MeguLitEmbed::Open(Format, GetCurrentProcessId(), Hash(r.text));
    SetEvent(ev);
    CloseHandle(ev);
  }
}

static void Send(const std::wstring &text, bool selected, UINT64 stream)
{
  {
    std::lock_guard<std::mutex> l(QueueLock);
    Queue.push_back(Request{text, selected, stream});
  }
  QueueSignal.notify_one();
}

struct Result
{
  double waited;
  bool waitedAtAll;
  std::wstring answer;
};

/* one hooked call, the order of texthook.cc / embed_util.cc */
static Result Hooked(const std::wstring &text, bool selected, UINT64 stream = Sel)
{
  Result res{0, false, L""};
  double start = Now();
  UINT64 eventKey = Hash(text), gen = SharedGen;
  const std::string key = MeguLitEmbed::Key(0x401000, stream, 0, text.data(), text.size() * sizeof(wchar_t));
  int armed = -1;
  if (Old)
  {
    ZeroMemory(SharedText, sizeof(SharedText)); /* upstream checktranslatedok: every embeddable stream */
    armed = selected ? (Cache.Find(key, gen, GetTickCount64(), nullptr) != MeguLitEmbed::Miss ? 1 : 0) : -1;
  }
  else if (selected)
  {
    if (Cache.Find(key, gen, GetTickCount64(), nullptr) != MeguLitEmbed::Miss)
      armed = 1;
    else
    {
      ZeroMemory(SharedText, sizeof(SharedText));
      MeguLitEmbed::Arm(Format, GetCurrentProcessId(), eventKey);
      armed = 0;
    }
  }
  if (armed != 1)
    Send(text, selected, stream); /* TextOutput: a cached line is not asked again */
  if (armed < 0 || !selected)
  {
    res.waited = Now() - start;
    return res;
  }
  Sleep(1); /* the rest of the hook (GDI hide feed, marks) before the write-back */
  std::wstring answer;
  auto hit = Cache.Find(key, gen, GetTickCount64(), &answer);
  if (hit == MeguLitEmbed::Miss)
  {
    res.waitedAtAll = true;
    HANDLE ev = Old ? MeguLitEmbed::Open(Format, GetCurrentProcessId(), eventKey) : MeguLitEmbed::Take(Format, GetCurrentProcessId(), eventKey);
    double w = Now();
    bool ok = MeguLitEmbed::Wait(ev, WaitMs, []
                                 { return true; });
    res.waited = Now() - w;
    if (ev)
      CloseHandle(ev);
    if (ok)
    {
      answer = SharedText;
      if (!Old || !answer.empty())
        Cache.Put(key, gen, GetTickCount64(), answer);
    }
  }
  res.answer = answer;
  return res;
}

static int Failures = 0;
static void Check(bool ok, const char *what)
{
  printf("%s %s\n", ok ? "PASS" : "FAIL", what);
  if (!ok)
    Failures++;
}
static double P95(std::vector<double> v)
{
  if (v.empty())
    return 0;
  std::sort(v.begin(), v.end());
  return v[(size_t)(v.size() * 0.95)];
}

static UINT64 OldTextHash(const std::string &bytes)
{
  UINT64 sum = 0;
  for (unsigned char byte : bytes)
    sum = (sum + byte) << 1;
  return sum;
}

static void CheckCacheIdentity()
{
  MeguLitEmbed::Cache cache;
  const std::wstring suffix(35, L'あ');
  const std::wstring first = L"違う前文甲" + suffix, second = L"別の前文乙" + suffix;
  const std::string a(reinterpret_cast<const char *>(first.data()), first.size() * sizeof(wchar_t));
  const std::string b(reinterpret_cast<const char *>(second.data()), second.size() * sizeof(wchar_t));
  Check(a != b && OldTextHash(a) == OldTextHash(b), "regression fixture: different Japanese with same 70-byte suffix collided in old hash");
  cache.Put(a, 1, 1000, L"first answer");
  std::wstring out;
  Check(cache.Find(b, 1, 1001, &out) == MeguLitEmbed::Miss, "different Japanese never borrows the first answer");
  cache.Put(b, 1, 1002, L"second answer");
  Check(cache.Find(a, 1, 1003, &out) == MeguLitEmbed::Replace && out == L"first answer", "first sentence retains its own cached answer");
  Check(cache.Find(b, 1, 1003, &out) == MeguLitEmbed::Replace && out == L"second answer", "second sentence retains its own cached answer");
  const std::string nulA("a\0b", 3), nulB("a\0c", 3), shortKey("a", 1);
  cache.Put(nulA, 1, 1000, L"embedded NUL answer");
  Check(cache.Find(nulB, 1, 1001, nullptr) == MeguLitEmbed::Miss && cache.Find(shortKey, 1, 1001, nullptr) == MeguLitEmbed::Miss, "binary key compares bytes after NUL and the complete length");
  Check(cache.Find(nulA, 1, 1001, &out) == MeguLitEmbed::Replace && out == L"embedded NUL answer", "binary key preserves UTF16-like NUL bytes");
  const std::string cpA("\x82\xa0", 2), cpB("\x82\xa2", 2);
  cache.Put(cpA, 1, 1000, L"CP932 answer");
  Check(cache.Find(cpB, 1, 1001, nullptr) == MeguLitEmbed::Miss, "different CP932 bytes remain different cache entries");
  cache.Put(b, 1, 1000, L"");
  Check(cache.Find(b, 1, 1499, nullptr) == MeguLitEmbed::Unchanged && cache.Find(a, 1, 1499, &out) == MeguLitEmbed::Replace && out == L"first answer", "empty answer affects only its exact sentence");
  Check(cache.Find(b, 1, 1500, nullptr) == MeguLitEmbed::Miss, "empty answer keeps the 500ms expiry");
  Check(cache.Find(a, 2, 1501, nullptr) == MeguLitEmbed::Miss, "generation changes still invalidate binary-key answers");
  /* #696 review: one answer per stream */
  const std::string sel = MeguLitEmbed::Key(0x401000, Sel, 0, first.data(), first.size() * sizeof(wchar_t));
  cache.Put(sel, 3, 2000, L"selected answer");
  bool own = cache.Find(sel, 3, 2001, &out) == MeguLitEmbed::Replace && out == L"selected answer";
  int borrowed = 0;
  for (UINT64 twin : {Twin1, Twin2, Twin3})
    if (cache.Find(MeguLitEmbed::Key(0x401000, twin, 0, first.data(), first.size() * sizeof(wchar_t)), 3, 2001, nullptr) != MeguLitEmbed::Miss)
      borrowed++;
  Check(own && borrowed == 0, "another context with the selected line finds no answer of the selected stream");
  Check(cache.Find(MeguLitEmbed::Key(0x402000, Sel, 0, first.data(), first.size() * sizeof(wchar_t)), 3, 2001, nullptr) == MeguLitEmbed::Miss &&
            cache.Find(MeguLitEmbed::Key(0x401000, Sel, 7, first.data(), first.size() * sizeof(wchar_t)), 3, 2001, nullptr) == MeguLitEmbed::Miss,
        "another hook address or subcontext is another stream");
}

int main(int argc, char **argv)
{
  Old = argc > 1 && !strcmp(argv[1], "--old");
  CheckCacheIdentity();
  timeBeginPeriod(1);
  std::thread host(Host);
  std::atomic<bool> noise{true};
  std::atomic<int> noiseWaited{0};
  std::vector<double> noiseTimes; /* written by the other thread only, read after join */
  /* a stream that is not selected keeps sending text (a name plate / backlog stream) */
  std::thread other([&]
                    {
    int i = 0;
    while (noise) {
      Result r = Hooked(L"その他のテキスト" + std::to_wstring(i++ % 7), false, Noise);
      if (r.waitedAtAll) noiseWaited++;
      noiseTimes.push_back(r.waited);
      Sleep(1); /* a few lines per frame, not a busy loop */
    } });

  const std::wstring line = L"「……おはよう。今日もいい天気だね」";
  /* 1. CatSystem2 redraws the shown line: hide answer */
  Mode = 0;
  SharedGen++;
  Asked = 0;
  std::vector<double> redraw;
  int answered = 0;
  for (int i = 0; i < 200; i++)
  {
    Result r = Hooked(line, true);
    redraw.push_back(r.waited);
    if (r.answer.size() == line.size())
      answered++;
  }
  Check(Asked <= 1, "hide answer: 200 redraws of one line ask the bridge once");
  Check(answered == 200, "hide answer: every redraw is written back");
  /* 2. the same with the bridge leaving the line unchanged (skip, unreadable, text window hidden) */
  Mode = 1;
  SharedGen++;
  Asked = 0;
  std::vector<double> unchanged;
  double began = Now();
  for (int i = 0; i < 200; i++)
    unchanged.push_back(Hooked(line, true).waited);
  int allowed = 1 + (int)((Now() - began) / MeguLitEmbed::UnchangedTtlMs);
  printf("empty answer: asked %d time(s) in %.0f ms of redraws\n", Asked.load(), Now() - began);
  Check(Asked <= allowed && Asked < 20, "empty answer: 200 redraws ask the bridge at most once per 500 ms");
  Check(P95(unchanged) < 1.0, "empty answer: redraws do not wait");
  /* 3. a switch changes (generation): the cached answer is dropped, hiding works again */
  Mode = 0;
  SharedGen++;
  Result again = Hooked(line, true);
  Check(again.answer.size() == line.size(), "after a generation change the line is asked again and hidden");
  /* 3b. #696 review: the selected stream has the line cached, three other enabled contexts then show it. Each asks the bridge
     (which hides two twins and switches embedding off at the third); none is written back from the selected stream's answer */
  Asked = 0;
  int twinsAsked = 0;
  for (UINT64 twin : {Twin1, Twin2, Twin3})
    if (Hooked(line, true, twin).waitedAtAll)
      twinsAsked++;
  Check(twinsAsked == 3 && Asked == 3, "three contexts with the selected line ask the bridge themselves");
  Asked = 0;
  Result selAgain = Hooked(line, true, Sel), twinAgain = Hooked(line, true, Twin1);
  Check(Asked == 0 && selAgain.answer.size() == line.size() && twinAgain.answer.size() == line.size(), "each context's redraw reuses its own answer");
  /* 3c. a twin asked first is left alone (E610: before the selected stream wrote the line); the selected stream still gets its answer */
  SharedGen++;
  LeaveAlone = Twin1;
  Result early = Hooked(line, true, Twin1), selected = Hooked(line, true, Sel);
  LeaveAlone = 0;
  Check(early.answer.empty() && selected.answer.size() == line.size(), "an empty answer for a twin does not leave the selected line unchanged");
  /* 4. new lines on the selected stream */
  std::vector<double> fresh;
  int right = 0;
  for (int i = 0; i < 120; i++)
  {
    std::wstring t = L"新しい台詞その" + std::to_wstring(i);
    Result r = Hooked(t, true);
    fresh.push_back(r.waited);
    if (r.answer.size() == t.size())
      right++;
  }
  noise = false;
  other.join();
  Stop = true;
  QueueSignal.notify_all();
  host.join();
  printf("selected new line wait p95 %.2f ms (max %.2f), redraw p95 %.3f ms, other stream waits %d (hook time p95 %.3f ms)\n",
         P95(fresh), *std::max_element(fresh.begin(), fresh.end()), P95(redraw), noiseWaited.load(), P95(noiseTimes));
  Check(P95(fresh) < 5.0, "selected stream: a new line waits p95 < 5 ms");
  Check(right == 120, "selected stream: every new line gets its answer although another stream sends text");
  Check(noiseWaited == 0 && P95(noiseTimes) < 1.0, "a stream that is not selected never waits");
  timeEndPeriod(1);
  printf("%s: %d failure(s)\n", Old ? "old wait" : "embed wait", Failures);
  return Failures;
}
