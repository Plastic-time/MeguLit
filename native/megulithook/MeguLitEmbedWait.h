#pragma once
/* MeguLit embed wait (2026-11-19, アマカノ2 / CatSystem2: "挂上以后卡卡的"). The game thread that hands a line to the bridge
   for write-back blocks until the bridge answers. Three things made that wait long:
   - the answer event was created by the hook only after the line had gone out; LunaHost creates it, signals it and closes
     it, so a fast answer that came first was lost and the game waited the full wait time;
   - an empty answer ("leave it as it is") was never cached, so every redraw of the same line asked and waited again;
   - checktranslatedok cleared the shared answer buffer for every stream, also for streams that never wait, which could wipe
     the answer meant for the selected stream.
   This header holds the parts that do not need LunaHook types, so selftest/embedwait.cpp runs the same code. */
#include <windows.h>
#include <string>
#include <unordered_map>

namespace MeguLitEmbed
{
  /* an empty answer is cached only this long: the bridge also answers by time (skip bursts, twins within 1.5 s) */
  const ULONGLONG UnchangedTtlMs = 500;
  const size_t MaxEntries = 4096;

  enum Hit
  {
    Miss = 0,
    Replace = 1,
    Unchanged = 2
  };

  struct Entry
  {
    std::wstring text;
    bool unchanged;
    ULONGLONG at;
  };

  class Cache
  {
    SRWLOCK lock = SRWLOCK_INIT;
    // Binary string equality also checks length and embedded NULs after a bucket hash collision
    std::unordered_map<std::string, Entry> map;
    UINT64 gen = 0;
    /* caller holds lock exclusively */
    void Roll(UINT64 g)
    {
      if (g != gen || map.size() > MaxEntries)
      {
        map.clear();
        gen = g;
      }
    }

  public:
    Hit Find(const std::string &key, UINT64 g, ULONGLONG now, std::wstring *out)
    {
      AcquireSRWLockExclusive(&lock);
      Roll(g);
      Hit hit = Miss;
      auto found = map.find(key);
      if (found != map.end())
      {
        if (!found->second.unchanged)
        {
          if (out)
            *out = found->second.text;
          hit = Replace;
        }
        else if (now - found->second.at < UnchangedTtlMs)
          hit = Unchanged;
        else
          map.erase(found);
      }
      ReleaseSRWLockExclusive(&lock);
      return hit;
    }
    /* an empty answer is "unchanged" (the bridge sends "" for passthrough); a non-empty one, also the line itself (glyph dots
       passthrough), is cached for good as before */
    void Put(const std::string &key, UINT64 g, ULONGLONG now, const std::wstring &answer)
    {
      AcquireSRWLockExclusive(&lock);
      Roll(g);
      bool unchanged = answer.empty();
      map[key] = Entry{answer, unchanged, now};
      ReleaseSRWLockExclusive(&lock);
    }
    size_t Size()
    {
      AcquireSRWLockShared(&lock);
      size_t n = map.size();
      ReleaseSRWLockShared(&lock);
      return n;
    }
  };

  /* the cache key: the stream that asks (LunaHook's ThreadParam fields; the process id is the same for every call in this
     process, and the padding after it is never read) and the complete raw line. An answer is the bridge's answer for one
     stream: another stream that writes back the same line (a Japanese twin of the selected setter, a backlog row) asks the
     bridge itself, which decides per stream (HookBridge.cs OnEmbedAnswer: the twin window, TwinCrowd's at most two twins),
     and an empty answer given to a twin never makes the selected stream's line "unchanged". (#696 review: three enabled
     contexts showing the selected line were written back from its cached answer, so TwinCrowd never saw them.) */
  inline std::string Key(UINT64 addr, UINT64 ctx, UINT64 ctx2, const void *data, size_t len)
  {
    std::string key;
    key.reserve(3 * sizeof(UINT64) + len);
    key.append(reinterpret_cast<const char *>(&addr), sizeof(addr));
    key.append(reinterpret_cast<const char *>(&ctx), sizeof(ctx));
    key.append(reinterpret_cast<const char *>(&ctx2), sizeof(ctx2));
    key.append(static_cast<const char *>(data), len);
    return key;
  }

  /* generation: the bridge bumps CommonSharedMem::hash (unused upstream) when the selected stream, the mode or any switch
     that changes its answer changes; the hook also folds in what it can see itself (selection table, wait time, display mode) */
  inline UINT64 Fold(UINT64 h, const void *data, size_t n)
  {
    auto p = (const unsigned char *)data;
    for (size_t i = 0; i < n; i++)
      h = (h ^ p[i]) * 1099511628211ull;
    return h;
  }

  /* the answer event, created on the game thread before the line goes out, kept open until the wait is over */
  struct Ticket
  {
    HANDLE ev = NULL;
    DWORD pid = 0;
    UINT64 name = 0;
  };
  inline Ticket &ThreadTicket()
  {
    static thread_local Ticket t;
    return t;
  }
  inline void Drop()
  {
    Ticket &t = ThreadTicket();
    if (t.ev)
      CloseHandle(t.ev);
    t = Ticket();
  }
  inline HANDLE Open(const char *format, DWORD pid, UINT64 name)
  {
    char eventname[200];
    sprintf_s(eventname, format, (unsigned long)pid, (unsigned long long)name);
    return CreateEventA(nullptr, TRUE, FALSE, eventname);
  }
  inline void Arm(const char *format, DWORD pid, UINT64 name)
  {
    Drop();
    Ticket &t = ThreadTicket();
    t.ev = Open(format, pid, name);
    t.pid = pid;
    t.name = name;
  }
  /* the armed event when it is for this line, else a fresh one; the caller closes it */
  inline HANDLE Take(const char *format, DWORD pid, UINT64 name)
  {
    Ticket &t = ThreadTicket();
    if (t.ev && t.pid == pid && t.name == name)
    {
      HANDLE ev = t.ev;
      t = Ticket();
      return ev;
    }
    Drop();
    return Open(format, pid, name);
  }
  /* waits in short steps so a stream switched off stops waiting at once; true when answered */
  template <class StillOk>
  bool Wait(HANDLE ev, UINT32 timems, StillOk stillOk)
  {
    if (!ev)
      return false;
    while (timems)
    {
      if (!stillOk())
        return false;
      UINT32 step = timems < 20 ? timems : 20;
      if (WaitForSingleObject(ev, step) == WAIT_OBJECT_0)
        return true;
      timems -= step;
    }
    return false;
  }
}
