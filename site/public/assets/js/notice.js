// SPDX-License-Identifier: GPL-3.0-or-later
// The welcome notice and the feedback form. The notice opens on every visit once the entrance is over: MeguLit is in
// development, here is where to ask for a game; its second pane (also opened by every .js-open-feedback link) takes
// free-form feedback. Both post to the relay (api.megulit.com/api/feedback), which turns them into GitHub issues.

const API = 'https://api.megulit.com/api/feedback';
const ISSUES = 'https://github.com/ilynthn/MeguLit/issues/new';

export function notice({ t, lang, after }) {
  const box = document.querySelector('.notice');
  if (!box || typeof box.showModal !== 'function') return;
  const welcome = box.querySelector('.nt-welcome'), feedback = box.querySelector('.nt-feedback');
  const pane = which => {
    welcome.hidden = which !== 'welcome';
    feedback.hidden = which !== 'feedback';
    (which === 'feedback' ? feedback : welcome).querySelector('.nt-input')?.focus({ preventScroll: true });
  };
  const open = which => { pane(which); if (!box.open) box.showModal(); };

  const send = async form => {
    const status = form.querySelector('.nt-status'), button = form.querySelector('.nt-submit');
    const field = n => form.elements[n]?.value || '';
    const text = field('text').trim();
    status.classList.remove('err', 'ok');
    if (!text) { status.textContent = t('ntEmpty'); status.classList.add('err'); form.elements.text.focus(); return; }
    button.disabled = true;
    status.textContent = t('ntSending');
    try {
      const res = await fetch(API, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: form.dataset.kind, text, contact: field('contact').trim(), website: field('website'), lang: lang(), page: location.pathname }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        status.classList.add('ok');
        status.replaceChildren(document.createTextNode(t('ntDone') + ' '));
        if (data.url) { const a = document.createElement('a'); a.href = data.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t('ntView'); status.append(a); }
        form.elements.text.value = '';
        if (form.elements.contact) form.elements.contact.value = '';
      } else throw new Error(res.status === 429 ? 'limit' : 'fail');
    } catch (e) {
      status.classList.add('err');
      if (e.message === 'limit') status.textContent = t('ntLimit');
      else {
        const a = document.createElement('a');
        a.href = `${ISSUES}?title=${encodeURIComponent((form.dataset.kind === 'game' ? '想玩：' : '') + text.split('\n')[0].slice(0, 80))}&body=${encodeURIComponent(text)}`;
        a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'GitHub Issues';
        status.replaceChildren(document.createTextNode(t('ntFail')), a);
      }
    } finally { button.disabled = false; }
  };
  for (const form of [welcome, feedback]) form.addEventListener('submit', e => { e.preventDefault(); send(form); });

  box.querySelector('.nt-close').addEventListener('click', () => box.close());
  box.querySelector('.js-back').addEventListener('click', () => pane('welcome'));
  box.addEventListener('click', e => { if (e.target === box) box.close(); });
  document.addEventListener('click', e => {
    const link = e.target.closest('.js-open-feedback');
    if (!link) return;
    e.preventDefault();
    open('feedback');
  });
  // Recently finished adaptations (assets/updates.json, newest first): "2026年11月11日 完善了《X》的内嵌使用"
  const list = box.querySelector('.nt-updates');
  if (list) fetch('/assets/updates.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : []).then(items => {
    const l = lang(), rows = (Array.isArray(items) ? items : []).slice(0, 8);
    list.replaceChildren(...rows.map(it => {
      const [y, m, d] = String(it.date || '').split('-').map(Number), li = document.createElement('li');
      const title = (l !== 'zh' && it['title_' + l]) || it.title || '';
      const own = (l !== 'zh' && it['text_' + l]) || it.text;
      li.textContent = own ? own : l === 'en' ? `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })} · embedded mode for ${title} improved`
        : l === 'ja' ? `${y}年${m}月${d}日 「${title}」の埋め込み表示を改善しました`
        : `${y}年${m}月${d}日 完善了《${title}》的内嵌使用`;
      return li;
    }));
    list.hidden = !rows.length;
    // these were only tested on the developer's own machine: say so right under them, small
    let note = list.nextElementSibling?.classList.contains('nt-updates-note') ? list.nextElementSibling : null;
    if (!note) { note = document.createElement('p'); note.className = 'nt-updates-note'; list.after(note); }
    note.textContent = ({
      zh: '以上游戏只在作者本地做过部分测试，实际游玩中如果还有问题，欢迎继续反馈，会跟进修复',
      ja: '上のゲームは作者の手元で一部しか確認していません。実際に遊んで問題があれば、引き続き知らせてください。修正していきます',
      en: 'These were only partly tested on the author’s own machine. If anything still goes wrong when you play, please keep telling us and we’ll fix it',
    })[l] || '';
    note.hidden = !rows.length;
  }).catch(() => {});
  // every visit, once the entrance has finished
  Promise.resolve(after).then(() => setTimeout(() => open('welcome'), 350));
}
