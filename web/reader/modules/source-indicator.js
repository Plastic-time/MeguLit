// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-20 (issue #468: "游戏实际在用图形识别取字，但界面上找不到哪个按钮控制它"). One place in the Alt+T hook panel says how this
   game's text is being read right now (memory hook / script / picture recognition as a fallback), why, and gives the way back
   ("重试读内存") plus the one switch that decides whether recognition may step in at all (ocrReadLines).
   Reads only fields the backend already sends, plus one optional message field the text-source session fills:
     galStatus({ textSource: { kind: 'hook'|'script'|'ocr'|'none', stream?: string, reason?: 'no-stream'|'stalled'|'garbled'|'user'|'disabled', since?: ms } })
   Without textSource the kind is derived: a selected hook stream = hook, otherwise none. Nothing here touches how text is read. */
(function installSourceIndicator() {
  'use strict';
  if (document.readyState === 'loading' || !window.__tomoyoChinese?.galStatus) { document.addEventListener('DOMContentLoaded', installSourceIndicator, { once: true }); return; }
  const b = window.__tomoyoChinese;
  if (b.tomeSourceIndicator) return;
  b.tomeSourceIndicator = true;
  const lang = (document.documentElement.lang || 'zh').slice(0, 2);
  const ALL = ({
    zh: { title: '文字来源', hook: '读内存（Hook）', script: '游戏脚本', ocr: '图形识别（兜底）', none: '等待游戏',
      hookSub: '直接从游戏内存取字，最准确', scriptSub: '从游戏脚本取字', ocrSub: '读内存没取到，改用画面识别，生僻字可能认错', noneSub: '连接游戏并推进一句后显示',
      reasons: { 'no-stream': '原因：还没发现可用的文本流', stalled: '原因：读内存好几秒没有新台词', garbled: '原因：读到的文本像乱码', user: '原因：你选择了只用图形识别', disabled: '', other: '' },
      retry: '重试读内存', retrying: '正在重试…', stream: '文本流', policy: '读内存没取到时，用图形识别兜底',
      policyHint: '关闭后只读内存，不会再出现识别错字；但图片里的字（标题卡等）读不到',
      st: ['还没连上游戏：先打开游戏，再绑定游戏窗口', '已连上游戏，在游戏里点一下推进一句就会开始读', n => '已连上游戏，读到了 ' + n + ' 个字', '，原文已藏好', '，原文还没藏好'],
      chip: '图形识别中', chipTip: '读内存没取到，当前用图形识别；点击重试读内存' },
    en: { title: 'Text source', hook: 'Memory hook', script: 'Game script', ocr: 'Picture recognition (fallback)', none: 'Waiting for the game',
      hookSub: 'Read straight from the game\'s memory, the most accurate', scriptSub: 'Read from the game script', ocrSub: 'Memory reading got nothing, so the picture is being recognised. Rare characters may be misread', noneSub: 'Shown once the game is connected and a line is advanced',
      reasons: { 'no-stream': 'Why: no usable text stream found yet', stalled: 'Why: no new line from memory for several seconds', garbled: 'Why: the text read looks like garbage', user: 'Why: you chose picture recognition only', disabled: '', other: '' },
      retry: 'Retry memory reading', retrying: 'Retrying…', stream: 'Stream', policy: 'Fall back to picture recognition when memory reading gets nothing',
      policyHint: 'Off: memory only, no misrecognised characters, but text inside pictures (title cards) is not read',
      st: ['Not connected: open the game and bind its window first', 'Connected. Advance one line in the game to start reading', n => 'Connected, read ' + n + ' characters', ', original hidden', ', original not hidden yet'],
      chip: 'Reading the picture', chipTip: 'Memory reading got nothing; click to retry it' },
    ja: { title: 'テキストの取得元', hook: 'メモリ読み取り（フック）', script: 'ゲームスクリプト', ocr: '画面認識（フォールバック）', none: 'ゲーム待ち',
      hookSub: 'ゲームのメモリから直接取得。最も正確です', scriptSub: 'ゲームのスクリプトから取得', ocrSub: 'メモリから取れなかったため画面認識中。珍しい漢字は誤認識することがあります', noneSub: 'ゲームに接続して一文進めると表示されます',
      reasons: { 'no-stream': '理由：使えるテキストストリームが未検出', stalled: '理由：数秒間メモリから新しい台詞がありません', garbled: '理由：読み取った文字が文字化けしています', user: '理由：画面認識のみを選択しています', disabled: '', other: '' },
      retry: 'メモリ読み取りを再試行', retrying: '再試行中…', stream: 'ストリーム', policy: 'メモリから取れないとき画面認識で補う',
      policyHint: 'オフ：メモリのみ。誤認識は出ませんが、画像内の文字（タイトルカード等）は読めません',
      st: ['未接続：ゲームを起動してウィンドウを紐付けてください', '接続済み。ゲームで一文進めると読み取りを始めます', n => '接続済み、' + n + ' 文字を読み取りました', '、原文は非表示です', '、原文はまだ非表示になっていません'],
      chip: '画面認識中', chipTip: 'メモリから取れず画面認識中。クリックで再試行' }
  });
  const T = ALL[lang] || ALL.zh;
  let state = { ocrReadLines: true }, panels = new Set(), retryUntil = 0;
  const send = m => window.__tomoyoTranslateRequest(JSON.stringify(m));
  const info = () => {
    const ts = state.textSource, threads = state.hookThreads || [], sel = threads.find(t => t.selected);
    if (ts && ts.kind) return { kind: ts.kind, stream: ts.stream || sel?.name || '', reason: ts.reason || '' };
    if (state.hookProfile === 'off') return { kind: 'none', stream: '', reason: '' };
    return sel ? { kind: 'hook', stream: sel.name, reason: '' } : { kind: 'none', stream: '', reason: '' };
  };
  const css = document.createElement('style');
  css.textContent = `
  .tome-src{display:grid;gap:8px;margin:0 0 12px;padding:2px 0;font-size:12.5px}
  .tome-src[data-tone=ok]{--src-c:#58b886}.tome-src[data-tone=warn]{--src-c:#e0a24a}.tome-src[data-tone=idle]{--src-c:#7891ad}
  .tome-src-head{display:flex;align-items:center;gap:10px}.tome-src-head>i{flex:none;width:9px;height:9px;border-radius:50%;background:var(--src-c)}
  .tome-src-head>strong{flex:1;min-width:0}.tome-src-body{display:grid;gap:2px;padding-left:19px;margin-top:-4px}.tome-src strong{font-size:13.5px;font-weight:650}.tome-src[data-tone=warn] strong{color:var(--src-c)}.tome-src small{opacity:.78;line-height:1.55;font-size:12px}
  .tome-src button{margin:0;padding:4px 12px;border-radius:8px;font-size:12.5px;cursor:pointer;border:1px solid color-mix(in srgb,var(--src-c,#7891ad) 55%,transparent);background:color-mix(in srgb,var(--src-c,#7891ad) 16%,transparent);color:inherit}
  .tome-src button:hover{background:color-mix(in srgb,var(--src-c,#7891ad) 28%,transparent)}.tome-src button[disabled]{opacity:.55;cursor:default}
  .tome-src label.tome-src-switch{display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:0}.tome-src-switch input{appearance:none;-webkit-appearance:none;flex:none;box-sizing:border-box;width:18px;height:18px;margin:1px 0 0;border-radius:6px;border:1.5px solid color-mix(in srgb,var(--theme-text,#e9eaf0) 38%,transparent);background:color-mix(in srgb,var(--theme-text,#e9eaf0) 6%,transparent);display:grid;place-items:center;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .12s ease}
  .tome-src-switch input::after{content:"";width:9px;height:5px;margin-top:-2px;border:2px solid #fff;border-top:0;border-right:0;transform:rotate(-45deg) scale(0);transition:transform .16s cubic-bezier(.3,1.5,.5,1)}
  .tome-src-switch input:hover{border-color:var(--src-c,#7891ad)}.tome-src-switch input:active{transform:scale(.92)}
  .tome-src-switch input:checked{background:var(--theme-primary,#ad1539);border-color:var(--theme-primary,#ad1539)}.tome-src-switch input:checked::after{transform:rotate(-45deg) scale(1)}
  .tome-src-switch input:focus-visible{outline:2px solid var(--src-c,#7891ad);outline-offset:2px}
  @media (prefers-reduced-motion:reduce){.tome-src-switch input,.tome-src-switch input::after{transition:none}}
  .megulit-src-chip{position:absolute;right:10px;top:-14px;z-index:3;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font:600 12px/1.5 "Microsoft YaHei",sans-serif;color:#ffe9c7;background:rgba(60,38,12,.9);border:1px solid rgba(224,162,74,.55);cursor:pointer;text-shadow:none;-webkit-text-stroke:0}
  .megulit-src-chip i{width:7px;height:7px;border-radius:50%;background:#e0a24a}.sentence-window{position:relative}
  `;
  document.head.append(css);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const policyRow = () => `<label class="tome-src-switch"><input type="checkbox" data-src-ocr><span>${esc(T.policy)}</span></label><small>${esc(T.policyHint)}</small>`;
  const retryBtn = () => `<button type="button" data-src-retry hidden>${esc(T.retry)}</button>`;
  const markup = () => `<div class="tome-src-head"><i></i><strong data-src-line></strong>${retryBtn()}</div><div class="tome-src-body"><small data-src-sub></small><small data-src-status></small><small data-src-reason hidden></small></div>${policyRow()}`;
  const setText = (n, v) => { if (n && n.textContent !== v) n.textContent = v; };
  function paint(p) {
    const i = info(), kindName = T[i.kind] || T.none, tone = i.kind === 'ocr' ? 'warn' : i.kind === 'none' ? 'idle' : 'ok';
    p.dataset.tone = tone;
    const line = T.title + ' · ' + kindName;
    setText(p.querySelector('[data-src-line]'), line);
    setText(p.querySelector('[data-src-sub]'), (i.kind === 'hook' && i.stream ? T.stream + '：' + i.stream.replace('EmbedEuphoria474_DrawHide_TEST2', 'YU-RIS 0.474') + ' · ' : '') + T[i.kind + 'Sub']);
    const st = T.st, n = Number(state.hookCaptureCharacters) || 0;
    let line2 = state.processAttached !== true ? st[0] : !(state.receivedText && n) ? st[1] : st[2](n) + (state.hookVisualVerified ? st[3] : state.hookCheckState === 'visible' ? st[4] : '');
    if (state.hookProfile === 'off') line2 = '';
    setText(p.querySelector('[data-src-status]'), line2);
    const why = p.querySelector('[data-src-reason]'), reason = i.kind === 'ocr' ? (T.reasons[i.reason] || '') : '';
    if (why) { setText(why, reason); why.hidden = !reason; }
    const retry = p.querySelector('[data-src-retry]');
    if (retry) { retry.hidden = i.kind !== 'ocr' && i.kind !== 'none'; if (i.kind === 'none' && state.processAttached !== true) retry.hidden = true; const busy = Date.now() < retryUntil; retry.disabled = busy; setText(retry, busy ? T.retrying : T.retry); }
    const sw = p.querySelector('[data-src-ocr]');
    if (sw && sw.checked !== (state.ocrReadLines !== false) && document.activeElement !== sw) sw.checked = state.ocrReadLines !== false;
  }
  function chip() {
    const i = info(), want = i.kind === 'ocr', host = document.querySelector('.sentence-window');
    let c = document.querySelector('.megulit-src-chip');
    if (!want || !host) { c?.remove(); return; }
    if (!c) { c = el('button', 'megulit-src-chip', `<i></i><span></span>`); c.type = 'button'; c.title = T.chipTip; c.onclick = e => { e.stopPropagation(); retry(); }; host.appendChild(c); }
    setText(c.querySelector('span'), T.chip);
  }
  function retry() { retryUntil = Date.now() + 6000; send({ type: 'hookStart', profile: 'auto' }); repaint(); setTimeout(repaint, 6100); }
  function setOcr(on) { state = { ...state, ocrReadLines: on }; send({ type: 'hookPrefs', settings: { ocrReadLines: on } }); repaint(); }
  function repaint() { for (const p of panels) { if (p.isConnected) paint(p); else panels.delete(p); } chip(); }
  function mount() {
    for (const host of document.querySelectorAll('.tome-hooks')) {
      if (host.dataset.srcMounted) continue;
      host.dataset.srcMounted = '1';
      const p = el('section', 'tome-src', markup()); p.setAttribute('aria-label', T.title);
      host.prepend(p); panels.add(p);
      p.querySelector('[data-src-retry]').onclick = retry;
      const sw = p.querySelector('[data-src-ocr]'); if (sw) sw.onchange = () => setOcr(sw.checked);
      paint(p);
    }
  }
  const previous = b.galStatus;
  b.galStatus = m => { previous(m); if (m && typeof m === 'object') { const keep = {}; for (const k of ['textSource', 'ocrReadLines', 'hookThreads', 'hookProfile', 'processAttached', 'receivedText', 'hookCaptureCharacters', 'hookVisualVerified', 'hookCheckState']) if (k in m) keep[k] = m[k]; state = { ...state, ...keep }; if (m.textSource?.kind !== 'ocr' && retryUntil) retryUntil = 0; repaint(); } };
  new MutationObserver(() => { mount(); chip(); }).observe(document.documentElement, { childList: true, subtree: true });
  mount();
  b.tomeSourceState = () => ({ ...state, info: info() });
})();
