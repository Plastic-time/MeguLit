// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-20 (owner: 「内嵌现在这边太臃肿了」, then 「原文隐藏放下面去 常用和排障看不懂」). The Alt+T 内嵌 tab put every hook control in one long column and said the
   same status three times. This module only re-arranges and re-words what hook-panel.js already built (every node keeps its data- hook, so
   hook-panel.js / source-indicator.js / menu-layout.js keep working; nothing is removed, no setting logic is touched):
     1. 「文字来源」 is a card of its own at the very top (how the text is read, why, retry, the picture-recognition switch, one status sentence),
        because where the text comes from is not part of hiding it;
     2. 「原文隐藏」 follows: the two switches people use, then one fold 「文字不对或没反应？」 that holds everything meant for when something is wrong;
     3. the status chips are replaced by the one sentence in the source card, the grey notes at the top are cut to one line, and the jargon
        (Hook, 文本流, 基线) gets plain words. */
(function installEmbedLayout() {
  'use strict';
  if (document.readyState === 'loading' || !window.__tomoyoChinese?.tomeSourceIndicator) { document.addEventListener('DOMContentLoaded', installEmbedLayout, { once: true }); return; }
  const b = window.__tomoyoChinese;
  if (b.tomeEmbedLayout) return;
  b.tomeEmbedLayout = true;
  const lang = (document.documentElement.lang || 'zh').slice(0, 2);
  const ALL = {
    zh: { tHide: '隐藏原文', tWait: '沉浸与等待图标', tOcr: '图形识别', tDiag: '诊断', trouble: '文字不对或没反应？', troubleHint: '点开：重新选来源、重新读取、反馈', reselect: '文字读错了？换一个来源', reselectTip: '游戏里可能同时有好几处文字来源（称为文本流），读到乱码或不是台词时，点这里让 MeguLit 重新挑',
      advanced: '更多：读取方式与来源列表', check: '检查原文有没有藏好', restart: '重新开始读取', stop: '停止读取', streams: '游戏里找到的文字来源', auto: '全自动：自动读台词、同步原文样式、替换原文',
      autoTip: '开启后进游戏就自动读取台词并把原文换成 MeguLit 的显示', blur: '只在本机处理游戏画面，不会调用翻译 API；少数游戏可能读不到', method: '原文隐藏方式', methodOpt: '读取台词并替换原文（推荐）' },
    en: { tHide: 'Hide original', tWait: 'Immersion & wait icon', tOcr: 'Picture recognition', tDiag: 'Diagnostics', trouble: 'Wrong text or nothing happens?', troubleHint: 'Open for: pick another source, restart reading, send feedback', reselect: 'Text misread? Try another source', reselectTip: 'A game can have several places its text comes from (called streams). If the text is garbled or not dialogue, click to let MeguLit pick again',
      advanced: 'More: reading method and source list', check: 'Check the original is hidden', restart: 'Restart reading', stop: 'Stop reading', streams: 'Text sources found in the game', auto: 'Automatic: read lines, match the style, replace the original',
      autoTip: 'When on, MeguLit reads the lines as soon as the game starts and replaces the original text with its own', blur: 'Only processes the game picture on this PC and never calls a translation API; a few games may not be readable', method: 'How the original is hidden', methodOpt: 'Read the lines and replace the original (recommended)' },
    ja: { tHide: '原文を隠す', tWait: '没入と待機アイコン', tOcr: '画像認識', tDiag: '診断', trouble: '文字が違う・反応しない？', troubleHint: '開く：別の取得元を選ぶ・読み取りをやり直す・フィードバック', reselect: '文字が違う？別の取得元にする', reselectTip: 'ゲームには文字の取得元（ストリーム）が複数ある場合があります。文字化けや台詞でないときはここで選び直します',
      advanced: '詳細：読み取り方式と取得元一覧', check: '原文が隠れているか確認', restart: '読み取りをやり直す', stop: '読み取りを停止', streams: 'ゲーム内で見つかった取得元', auto: '全自動：台詞を読み取り、スタイルを合わせ、原文を置き換える',
      autoTip: 'オンにすると起動後すぐに台詞を読み取り、原文を MeguLit の表示に置き換えます', blur: '画面の処理はこのPC内だけで行い、翻訳APIは呼びません。一部のゲームは読み取れないことがあります', method: '原文の隠し方', methodOpt: '台詞を読み取り原文を置き換える（推奨）' }
  };
  const T = ALL[lang] || ALL.zh;
  const css = document.createElement('style');
  css.textContent = `
  .tome-mask-src{padding-top:12px!important}.tome-mask-src .tome-src{margin:0}
  .tome-hooks[data-embed-layout]{padding:0;border:0;background:none;margin:0}
  .tome-hooks[data-embed-layout] .tome-hook-summary,.tome-hooks[data-embed-layout] .tome-hook-mode,.tome-hooks[data-embed-layout] .tome-hook-hint{display:none}
  .tome-hooks[data-embed-layout] .tome-hook-main{margin:0;gap:0}
  .tome-emb-rows{display:grid}.tome-emb-rows>label{margin:0!important;padding:9px 2px;display:flex;align-items:center;flex-direction:row-reverse;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,var(--theme-text,#e9eaf0) 8%,transparent)}
  .tome-emb-rows>label:first-child{border-top:0}
  .tome-trouble{margin-top:6px;border-top:1px solid color-mix(in srgb,var(--theme-text,#e9eaf0) 8%,transparent);padding-top:6px}
  .tome-trouble>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:13px;font-weight:600}
  .tome-trouble>summary::-webkit-details-marker{display:none}
  .tome-trouble>summary::after{content:"";margin-left:auto;flex:none;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);opacity:.6;transition:transform .16s ease}
  .tome-trouble[open]>summary::after{transform:rotate(-135deg)}
  .tome-trouble>summary small{font-weight:400;opacity:.65;font-size:12px;min-width:0}
  .tome-trouble>summary:focus-visible{outline:2px solid var(--theme-primary,#ad1539);outline-offset:2px;border-radius:6px}
  .tome-trouble-body{display:grid;gap:10px;padding:6px 0 2px}.tome-trouble-body .tome-hook-actions{display:flex;flex-wrap:wrap;gap:8px}
  .tome-trouble-body .tome-hook-proof{margin:0}.tome-hooks[data-embed-layout] .tome-hook-chips{display:none}
  @media (prefers-reduced-motion:reduce){.tome-trouble>summary::after{transition:none}}
  `;
  document.head.append(css);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  /* replace the visible words of a control without touching its inputs or handlers */
  const retext = (node, text) => {
    if (!node) return;
    const t = [...node.childNodes].reverse().find(c => c.nodeType === 3 && c.textContent.trim());
    if (t) { if (t.textContent !== text) t.textContent = text; } else if (!node.children.length) { if (node.textContent !== text) node.textContent = text; }
  };
  function arrange(p) {
    const q = s => p.querySelector(s);
    const src = q('.tome-src'), main = q('.tome-hook-main'), proof = q('[data-hook-proof]'), adv = q('.tome-hook-advanced'), card = p.closest('.tome-mask-hide');
    const hideLabel = q('[data-hook-pref=hookHide]')?.closest('label'), autoLabel = q('[data-hook-pref=hookAutoStart]')?.closest('label');
    const reselect = q('[data-hook-reselect]'), hint = q('.tome-hook-hint');
    if (!src || !main || !proof || !adv || !hideLabel || !autoLabel || !reselect || !card) return false;
    if (hint?.textContent) hideLabel.title = hint.textContent;
    autoLabel.title = T.autoTip; retext(autoLabel, T.auto);
    reselect.title = T.reselectTip; retext(reselect, T.reselect);
    retext(adv.querySelector('summary'), T.advanced); retext(q('[data-hook-check]'), T.check); retext(q('[data-hook-restart]'), T.restart); retext(q('[data-hook-stop]'), T.stop); retext(adv.querySelector('h5'), T.streams);
    /* 1. the source card sits above the hiding card, with no title of its own: its first line is the title */
    const srcCard = el('div', 'tome-mask-card tome-mask-src'); srcCard.append(src); card.before(srcCard);

    /* 2. two everyday switches, then the fold */
    const toggles = el('div', 'tome-emb-rows'); toggles.append(hideLabel, autoLabel);
    const fix = el('div', 'tome-trouble-body'); fix.append(proof, reselect.parentElement, adv); adv.open = false;
    const fold = el('details', 'tome-trouble'), sum = el('summary'); sum.innerHTML = `<span>${T.trouble}</span><small>${T.troubleHint}</small>`; fold.append(sum, fix);
    /* the single-choice method select is re-placed by menu-layout, so it stays put and shows together with the fold */
    const method = document.querySelector('select[name=galMaskMode]')?.closest('label'), showMethod = on => { if (method) method.hidden = !on; };
    if (method) { retext(method, T.method); const o = method.querySelector('option'); if (o && o.textContent.includes('Hook')) o.textContent = T.methodOpt; }
    showMethod(false); fold.addEventListener('toggle', () => { showMethod(fold.open); b.refreshHitRegions?.(); });
    const keep = [q('[data-hook-summary]'), q('[data-hook-mode]'), hint].filter(Boolean);
    main.replaceChildren(toggles, fold, ...keep);
    /* 3. the grey notes that stacked at the top of the tab */
    for (const s of document.querySelectorAll('.tomoyo-menu-content small, .tomoyo-menu-content .tomoyo-hotkey-hint')) {
      if (s.textContent.startsWith('局部模糊只在本机')) { s.title = s.textContent; s.textContent = T.blur; }
    }
    return true;
  }
  /* second-level tabs: the reusable .mg-subtabs from altt-compact.js; one page per tab, the source card stays on top */
  const tabState = { i: 0 };
  function tabs(panel) {
    const sub = window.__megulitSubTabs?.mount, hide = panel.querySelector(':scope>.tome-mask-hide');
    if (!sub || !hide) return;
    const k = s => () => [...panel.querySelectorAll(':scope>' + s)];
    sub(panel, hide, 'embed', [
      { label: () => T.tHide, nodes: k('.tome-mask-hide') },
      { label: () => T.tWait, nodes: () => [...panel.querySelectorAll(':scope>.tome-mask-wait, :scope>.tomoyo-v4-immersion')] },
      { label: () => T.tOcr, pane: true, nodes: () => [...panel.querySelectorAll(':scope>details:not(.tome-mask-diag)')] },
      { label: () => T.tDiag, pane: true, nodes: k('details.tome-mask-diag') }
    ], tabState);
    /* 2026-11-21 (user: 文字来源也给我放到下面去): the source card and its OCR switch sit under the tab pages, not above the tabs */
    const srcCard = panel.querySelector(':scope>.tome-mask-src'); if (srcCard && panel.lastElementChild !== srcCard) panel.append(srcCard);
  }
  function mount() {
    for (const p of document.querySelectorAll('.tome-hooks')) {
      const panel = p.closest('.tome-mask-hide')?.parentElement;
      if (p.dataset.embedLayout && panel) tabs(panel);
      if (p.dataset.embedLayout || !p.querySelector('.tome-src')) continue;
      if (arrange(p)) { p.dataset.embedLayout = '1'; tabs(p.closest('.tome-mask-hide').parentElement); }
    }
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
