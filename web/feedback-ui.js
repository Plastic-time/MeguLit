/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E394/E395 Problem reports inside MeguLit, never a GitHub link (GitHub does not open for many users in mainland China):
   - openFeedback: 一键上传问题反馈. The reader must say what went wrong (short or long both fine); the reason and a
     whole-app log package go up together through MeguLit's relay (POST /api/diagnostics with meta.note). If the log
     upload fails, the reason alone is still sent through /api/feedback so it is never lost.
   - mountDevNotice: the "MeguLit 还在开发中" notice from the website, once per version on the home page, with a
     "想玩的游戏" box and the same report button. */

const T = {
  zh: {
    kicker: '一键上传问题反馈', title: '遇到什么问题了？', hint: '写一下原因，简短或详细都可以。会和最近的日志一起直接发给作者，不需要打开 GitHub',
    placeholder: '比如：打开某某游戏后没有翻译 / 点了某个按钮没反应 / 启动很慢……', contact: '联系方式（选填，QQ 或邮箱，方便回复你）',
    privacy: '日志里的 Windows 用户名和邮箱会先去掉', send: '上传', sending: '正在打包日志并上传…', sent: '已收到，谢谢！作者会尽快看',
    sentTextOnly: '日志没传上去，但你写的原因已经收到了，谢谢！', failed: '上传失败，请稍后再试', cancel: '取消', empty: '请先写一下原因，一句话也可以',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit 还在开发中',
    noticeText: '有些游戏现在还没适配好。想玩什么游戏，把名字写在下面点提交，快的话半天，最晚一周内就能支持',
    gamePlaceholder: '想玩的游戏名字', submit: '提交', gameSent: '收到了，会尽快适配',
    noticeMore: '遇到问题了，可以在「关于」页点「一键上传问题反馈」，写一下原因，简短或详细都可以，日志会一起发过来。有什么建议，或者只是想留句话，也都很欢迎。谢谢支持！',
    report: '一键上传问题反馈', ok: '知道了',
  },
  ja: {
    kicker: '不具合をまとめて送る', title: 'どんな問題がありましたか？', hint: '原因をひとこと書いてください（短くても詳しくても OK）。最近のログと一緒に作者へ直接届きます。GitHub は不要です',
    placeholder: '例：〇〇を開いても翻訳が出ない／ボタンを押しても反応しない／起動が遅い…', contact: '連絡先（任意・返信用の QQ やメール）',
    privacy: 'ログの Windows ユーザー名とメールアドレスは先に取り除きます', send: '送信', sending: 'ログをまとめて送信中…', sent: '受け取りました。ありがとうございます！',
    sentTextOnly: 'ログは送れませんでしたが、書いていただいた内容は届きました。ありがとうございます！', failed: '送信できませんでした。少し待ってからもう一度お試しください', cancel: 'キャンセル', empty: '原因をひとこと書いてください',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit は開発中です',
    noticeText: 'まだ対応できていないゲームもあります。遊びたいゲームの名前を下に入れて送信してください。早ければ半日、遅くとも一週間以内に対応します',
    gamePlaceholder: '遊びたいゲームの名前', submit: '送信', gameSent: '受け取りました。できるだけ早く対応します',
    noticeMore: '困ったときは「について」ページの「不具合をまとめて送る」から、原因をひとこと書いて送ってください（短くても詳しくても OK）。ログも一緒に届きます。ご意見やひとことも大歓迎です',
    report: '不具合をまとめて送る', ok: 'わかった',
  },
  en: {
    kicker: 'Report a problem', title: 'What went wrong?', hint: 'Say what happened, briefly or in detail. It goes to the author together with recent logs; no GitHub needed',
    placeholder: 'For example: no translation after opening some game / a button does nothing / startup is slow…', contact: 'Contact (optional, QQ or e-mail, so we can reply)',
    privacy: 'The Windows user name and e-mail addresses are removed from the logs first', send: 'Upload', sending: 'Packing logs and uploading…', sent: 'Got it, thank you!',
    sentTextOnly: 'The logs did not go through, but what you wrote arrived. Thank you!', failed: 'Could not upload; please try again later', cancel: 'Cancel', empty: 'Please say what went wrong; one sentence is fine',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit is still in development',
    noticeText: 'Some games are not supported yet. Type the name of a game you want to play and submit it; it usually takes half a day, a week at most',
    gamePlaceholder: 'A game you want to play', submit: 'Submit', gameSent: 'Got it; support is on the way',
    noticeMore: 'If something goes wrong, open About and use Report a problem: say what happened, briefly or in detail, and the logs come along. Ideas or just a hello are welcome too. Thanks for the support!',
    report: 'Report a problem', ok: 'Got it',
  },
};
const words = locale => T[locale] || T.zh;

export async function sendFeedback({ api, kind, text, contact = '', locale = 'zh', version = '' }) {
  try { return await api('feedback_send', { kind, text, contact, lang: locale, version }); } catch { return { ok: false, error: 'NETWORK' }; }
}

/* reason + whole-app logs; resolves 'full', 'text' (logs failed, reason sent) or '' (nothing sent) */
async function report({ api, reason, contact, locale, version }) {
  const note = (contact ? `${reason}\n\n联系方式：${contact}` : reason).slice(0, 2000);
  try {
    const pack = await api('diagnostics_build_all', { version });
    const result = await api('diagnostics_upload', { path: pack.path, meta: { version, game: { id: '', title: 'MeguLit', engine: '' }, note } });
    if (result?.state === 'uploaded') return 'full';
  } catch { /* fall through to the text-only report */ }
  const text = await sendFeedback({ api, kind: 'feedback', text: reason, contact, locale, version });
  return text?.ok ? 'text' : '';
}

export function openFeedback({ api, locale = 'zh', esc, toast, version = '' }) {
  const t = words(locale), dialog = document.createElement('dialog');
  dialog.className = 'game-dialog feedback-dialog';
  dialog.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(t.title)}</h2><p>${esc(t.hint)}</p></div>
<textarea class="feedback-text" rows="6" maxlength="1800" placeholder="${esc(t.placeholder)}" required></textarea>
<input class="feedback-contact" maxlength="120" placeholder="${esc(t.contact)}">
<p class="feedback-privacy">${esc(t.privacy)}</p>
<p class="feedback-status" role="status" aria-live="polite"></p>
<div class="dialog-actions"><button type="button" class="text-button" data-cancel>${esc(t.cancel)}</button><button type="button" class="primary" data-send>${esc(t.send)}</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  const text = dialog.querySelector('.feedback-text'), contact = dialog.querySelector('.feedback-contact'), status = dialog.querySelector('.feedback-status'), send = dialog.querySelector('[data-send]');
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  send.onclick = async () => {
    const reason = text.value.trim();
    if (!reason) { status.textContent = t.empty; status.dataset.state = 'bad'; text.focus(); return; }
    send.disabled = true; send.textContent = t.sending; status.textContent = ''; delete status.dataset.state;
    const outcome = await report({ api, reason, contact: contact.value.trim(), locale, version });
    if (!dialog.isConnected) return;
    send.textContent = t.send;
    if (outcome) { toast && toast(outcome === 'full' ? t.sent : t.sentTextOnly); dialog.close(); return; }
    send.disabled = false; status.textContent = t.failed; status.dataset.state = 'bad';
  };
  text.focus();
}

const NOTICE_KEY = 'megulit-dev-notice';
function seen(version) { try { return localStorage.getItem(NOTICE_KEY) === version; } catch { return false; } }
function remember(version) { try { localStorage.setItem(NOTICE_KEY, version); } catch { /* storage unavailable: the notice shows again next start */ } }

/* once per version, on the home page */
export function mountDevNotice({ api, locale = 'zh', esc, toast, version = '' }) {
  if (seen(version) || document.querySelector('.dev-notice')) return;
  const t = words(locale), dialog = document.createElement('dialog');
  dialog.className = 'game-dialog dev-notice';
  dialog.innerHTML = `<div class="dev-notice-top"><span>${esc(t.noticeKicker)}</span><span>${esc(t.noticeTag)}</span></div>
<h2>${esc(t.noticeTitle)}</h2><p class="dev-notice-text">${esc(t.noticeText)}</p>
<form class="dev-notice-form"><input class="dev-notice-game" maxlength="200" placeholder="${esc(t.gamePlaceholder)}"><button type="submit" class="primary">${esc(t.submit)}</button></form>
<p class="feedback-status" role="status" aria-live="polite"></p>
<p class="dev-notice-more">${esc(t.noticeMore)}</p>
<div class="dev-notice-actions"><button type="button" class="text-button" data-report>${esc(t.report)}</button><button type="button" class="secondary" data-ok>${esc(t.ok)}</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => { remember(version); dialog.remove(); }, { once: true });
  const form = dialog.querySelector('form'), game = dialog.querySelector('.dev-notice-game'), status = dialog.querySelector('.feedback-status');
  form.onsubmit = async event => {
    event.preventDefault();
    if (!game.value.trim()) { game.focus(); return; }
    const button = form.querySelector('button'); button.disabled = true;
    const result = await sendFeedback({ api, kind: 'game', text: game.value, locale, version });
    button.disabled = false;
    if (!dialog.isConnected) return;
    status.dataset.state = result?.ok ? 'ok' : 'bad'; status.textContent = result?.ok ? t.gameSent : t.failed;
    if (result?.ok) game.value = '';
  };
  dialog.querySelector('[data-ok]').onclick = () => dialog.close();
  dialog.querySelector('[data-report]').onclick = () => { dialog.close(); openFeedback({ api, locale, esc, toast, version }); };
  dialog.showModal();
}
