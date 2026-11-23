# Installer scene: what it needs from the download engine

The one-take scene (`scene.js`) draws one tile per download segment. It is fed by `Scene.render(snap)`; the demo
(`demo.js`) fakes the feed with the same shape.

## What `MeguFetch` (setup/setup-runtime.ps1) exposes today

Public, read from the UI poll: `Phase`, `Received`, `Size`, `TotalSpeed`, `Resumed`, `Error`, `Sources` (host, Speed, Bytes, Active, Dead), `SourceLabel()`, `LogText()`.
Not public (private fields): `done[]` (segment finished), `segCount`, `SegmentSize`, `conns` (running connections with `Seg`, `Offset`, `Len`, `Got`, `Src`, `IsDup`, `Lost`), `retry`/`pending` lists.
So the scene can show the total, speed, ETA and current source today, but **not which segment is done / running / retrying**.

## Minimal read-only interface the download side must add (not done here: this branch does not touch download logic)

```csharp
public class MeguSegView { public int Count; public int SegmentSize; public byte[] State; public float[] Frac; public string[] Src; }
/* State: 0 waiting, 1 running, 2 done, 3 retry / source switching, 4 dead (all sources failed) */
public MeguSegView Snapshot()   // lock (gate); O(segments); cheap, called every 200 ms by the poll timer
```
Fill rule, under the existing `gate` lock:
- `State[i] = 2` when `done[i]`; `1` for a segment with a live non-`Lost` connection (`Frac[i] = Got / Len` of the owning part, parts of a split segment summed); `3` while its connection was killed (slow/stall/error) and the segment is back in `pending`/`retry`; `0` otherwise
- `Src[i]` = host of the connection that is (or last was) fetching it; `Phase == "failed"` turns every 1/3 into 4
- one view per pack (the packs are fetched one after another): the UI concatenates packs in `$script:dl` order, so the whole install is one field of ~142 tiles

The PowerShell host then sends it to the page as one JSON message per tick (see below). `doneAt[i]` (flash timing) is stamped by the host/page when it first sees `State[i] == 2`; no engine support needed.

## Snapshot the page takes (`Scene.render`)

```
{ t,                    // seconds, any monotonic clock (page uses it only for flashes / breathing)
  phase,                // probe | download | unpack | done
  st: Int8Array(N), fr: Float32Array(N), doneAt: Float32Array(N),
  got, total, speed, eta, pack, src, dir, unpack /*0..1*/,
  err: { title, en, msg, tip } | undefined }
```
Actions out (`chrome.webview.postMessage`): `install {path,desktop,menu}`, `browse`, `retry`, `copylog`, `manual`, `launch`.

## Hosting

The setup is PowerShell + WinForms today. The scene is a web page; hosting it needs Microsoft.Web.WebView2 (Core + WinForms managed dlls
+ WebView2Loader.dll, ~1.3 MB, bundled in setup/) on top of the WebView2 Runtime that MeguLit needs anyway (the old window already links to the
Runtime download when it is missing). The WinForms themes in `setup-ui.ps1` stay as the fallback when the Runtime is absent.
