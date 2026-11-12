// SPDX-License-Identifier: GPL-3.0-or-later
import { STEPS, OK, LABEL, pick, guideCards } from './guide.js';
// The welcome notice and the feedback form. The notice opens on every visit once the entrance is over: MeguLit is in
// development, here is where to ask for a game; its second pane (also opened by every .js-open-feedback link) takes
// free-form feedback. Both post to the relay (api.megulit.com/api/feedback), which turns them into GitHub issues.

const API = 'https://api.megulit.com/api/feedback';
const ISSUES = 'https://github.com/ilynthn/MeguLit/issues/new';

export function notice({ t, lang, after }) {
  const box = document.querySelector('.notice');
  if (!box || typeof box.showModal !== 'function') return;
  const welcome = box.querySelector('.nt-welcome'), feedback = box.querySelector('.nt-feedback'), guide = box.querySelector('.nt-guide');
  const pane = which => {
    welcome.hidden = which !== 'welcome';
    feedback.hidden = which !== 'feedback';
    if (guide) guide.hidden = which !== 'guide';
    if (which === 'guide') { step(0); guide.querySelector('.js-gd-next')?.focus({ preventScroll: true }); return; }
    (which === 'feedback' ? feedback : welcome).querySelector('.nt-input')?.focus({ preventScroll: true });
  };
  const open = which => { pane(which); if (!box.open) box.showModal(); };

  const send = async form => {
    const status = form.querySelector('.nt-status'), button = form.querySelector('.nt-submit');
    const field = n => form.elements[n]?.value || '';
    const text = field('text').trim();
    status.classList.remove('err', 'ok');
    if (!text) { status.textContent = t('ntEmpty'); status.classList.add('err'); form.elements.text.focus(); return; }
    /* E456 a very short game name may be an abbreviation (夏天, GG): ask once, a second Send goes through */
    if (form.dataset.kind === 'game' && [...text].length <= 3 && form.dataset.shortOk !== text) { form.dataset.shortOk = text; status.textContent = t('ntShort'); status.classList.add('err'); form.elements.text.focus(); return; }
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
  // the usage guide: a few steps, one at a time (guide.js holds the words, also shown in the Get started section)
  let at = 0;
  const q = s => box.querySelector(s);
  const step = i => {
    if (!guide) return;
    const l = lang(); at = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[at];
    q('.js-gd-head').textContent = pick(LABEL.guide, l);
    q('.js-gd-count').textContent = `${at + 1} / ${STEPS.length}`;
    q('.js-gd-title').textContent = pick(s.t, l);
    q('.js-gd-body').innerHTML = pick(s.d, l).map(x => `<li>${x}</li>`).join('');
    q('.js-gd-dots').replaceChildren(...STEPS.map((x, k) => { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = pick(x.t, l); b.setAttribute('aria-current', String(k === at)); b.addEventListener('click', () => step(k)); li.append(b); return li; }));
    q('.js-gd-prev').textContent = at ? pick(LABEL.prev, l) : pick(LABEL.prev, l);
    q('.js-gd-prev').style.visibility = at ? 'visible' : 'hidden';
    q('.js-gd-next').textContent = at === STEPS.length - 1 ? pick(LABEL.done, l) : pick(LABEL.next, l);
  };
  q('.js-gd-prev')?.addEventListener('click', () => step(at - 1));
  q('.js-gd-next')?.addEventListener('click', () => { if (at === STEPS.length - 1) box.close(); else step(at + 1); });
  q('.js-open-guide')?.addEventListener('click', () => pane('guide'));
  // the words that change with the language: the "how to tell it works" box, the guide button, the Get started cards
  const paintGuide = () => {
    const l = lang();
    const ok = q('.js-guide-ok'); if (ok) ok.innerHTML = pick(OK, l);
    const gb = q('.js-open-guide'); if (gb) gb.textContent = pick(LABEL.more, l);
    const cards = document.querySelector('.js-guide-cards'); if (cards) guideCards(cards, l);
    const after = document.querySelector('.js-gd-after'); if (after) after.textContent = pick(LABEL.adv, l);
    if (guide && !guide.hidden) step(at);
  };
  paintGuide();
  addEventListener('megulit:lang', paintGuide);
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
    const l = lang(), rows = (Array.isArray(items) ? items : []).slice(0, 300);
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
