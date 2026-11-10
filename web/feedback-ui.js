/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E394 Feedback inside MeguLit, never a GitHub link (GitHub does not open for many users in mainland China):
   - openFeedback: a small form that posts through MeguLit's relay (POST /api/feedback, the same form as megulit.com)
   - mountDevNotice: the "MeguLit 还在开发中" notice from the website, once per version on the home page, with a
     "想玩的游戏" box, 问题反馈 and 一键上传日志 */
import { openDiagnostics } from './diagnostics-ui.js';

const T = {
  zh: {
    kicker: '问题反馈', title: '遇到问题，或者想说点什么', hint: '会直接发给作者，不需要打开 GitHub',
    placeholder: '哪里不好用、出了什么错、想要什么功能，都可以写', contact: '联系方式（选填，QQ 或邮箱，方便回复你）',
    send: '发送', sending: '正在发送…', sent: '已收到，谢谢！', failed: '发送失败，请稍后再试', cancel: '取消', empty: '先写点内容再发送',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit 还在开发中',
    noticeText: '有些游戏现在还没适配好。想玩什么游戏，把名字写在下面点提交，快的话半天，最晚一周内就能支持',
    gamePlaceholder: '想玩的游戏名字', submit: '提交', gameSent: '收到了，会尽快适配',
    noticeMore: '用的时候遇到问题，点「问题反馈」写一下就行；在游戏里出错时，点「一键上传日志」把日志打包发过来。有什么问题、建议，或者只是想留句话，都很欢迎。谢谢支持！',
    feedback: '问题反馈', logs: '一键上传日志', ok: '知道了',
  },
  ja: {
    kicker: 'フィードバック', title: '不具合やご意見をどうぞ', hint: '作者に直接届きます。GitHub を開く必要はありません',
    placeholder: '使いにくい所、エラー、欲しい機能など何でも', contact: '連絡先（任意・返信用の QQ やメール）',
    send: '送信', sending: '送信中…', sent: '受け取りました。ありがとうございます！', failed: '送信できませんでした。少し待ってからもう一度お試しください', cancel: 'キャンセル', empty: '内容を入力してください',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit は開発中です',
    noticeText: 'まだ対応できていないゲームもあります。遊びたいゲームの名前を下に入れて送信してください。早ければ半日、遅くとも一週間以内に対応します',
    gamePlaceholder: '遊びたいゲームの名前', submit: '送信', gameSent: '受け取りました。できるだけ早く対応します',
    noticeMore: '困ったときは「フィードバック」から一言どうぞ。ゲーム中のエラーは「ログを送る」でログをまとめて送れます。ご意見やひとことも大歓迎です',
    feedback: 'フィードバック', logs: 'ログを送る', ok: 'わかった',
  },
  en: {
    kicker: 'Feedback', title: 'Found a problem, or want to say something?', hint: 'It goes straight to the author; no GitHub needed',
    placeholder: 'What is awkward, what went wrong, what you would like to see', contact: 'Contact (optional, QQ or e-mail, so we can reply)',
    send: 'Send', sending: 'Sending…', sent: 'Got it, thank you!', failed: 'Could not send; please try again later', cancel: 'Cancel', empty: 'Write something first',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit is still in development',
    noticeText: 'Some games are not supported yet. Type the name of a game you want to play and submit it; it usually takes half a day, a week at most',
    gamePlaceholder: 'A game you want to play', submit: 'Submit', gameSent: 'Got it; support is on the way',
    noticeMore: 'If something goes wrong, tell us through Feedback; if a game errors, Upload logs packs the logs and sends them. Questions, ideas or just a hello are all welcome. Thanks for the support!',
    feedback: 'Feedback', logs: 'Upload logs', ok: 'Got it',
  },
};
const words = locale => T[locale] || T.zh;

export async function sendFeedback({ api, kind, text, contact = '', locale = 'zh', version = '' }) {
  try { return await api('feedback_send', { kind, text, contact, lang: locale, version }); } catch { return { ok: false, error: 'NETWORK' }; }
}

export function openFeedback({ api, locale = 'zh', esc, toast, version = '' }) {
  const t = words(locale), dialog = document.createElement('dialog');
  dialog.className = 'game-dialog feedback-dialog';
  dialog.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(t.title)}</h2><p>${esc(t.hint)}</p></div>
<textarea class="feedback-text" rows="6" maxlength="2000" placeholder="${esc(t.placeholder)}"></textarea>
<input class="feedback-contact" maxlength="120" placeholder="${esc(t.contact)}">
<p class="feedback-status" role="status" aria-live="polite"></p>
<div class="dialog-actions"><button type="button" class="text-button" data-cancel>${esc(t.cancel)}</button><button type="button" class="primary" data-send>${esc(t.send)}</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  const text = dialog.querySelector('.feedback-text'), contact = dialog.querySelector('.feedback-contact'), status = dialog.querySelector('.feedback-status'), send = dialog.querySelector('[data-send]');
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  send.onclick = async () => {
    if (!text.value.trim()) { status.textContent = t.empty; text.focus(); return; }
    send.disabled = true; send.textContent = t.sending; status.textContent = '';
    const result = await sendFeedback({ api, kind: 'feedback', text: text.value, contact: contact.value, locale, version });
    if (!dialog.isConnected) return;
    send.textContent = t.send;
    if (result?.ok) { toast && toast(t.sent); dialog.close(); return; }
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
<div class="dev-notice-actions"><button type="button" class="text-button" data-feedback>${esc(t.feedback)}</button><button type="button" class="text-button" data-logs>${esc(t.logs)}</button><button type="button" class="secondary" data-ok>${esc(t.ok)}</button></div>`;
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
  dialog.querySelector('[data-feedback]').onclick = () => { dialog.close(); openFeedback({ api, locale, esc, toast, version }); };
  dialog.querySelector('[data-logs]').onclick = () => { dialog.close(); openDiagnostics({ api, id: '', locale, esc, toast }); };
  dialog.showModal();
}
