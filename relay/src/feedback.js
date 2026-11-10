// SPDX-License-Identifier: GPL-3.0-or-later
/* Website feedback: the game-request and feedback forms on megulit.com post here, and each one becomes a GitHub
   issue (same GITHUB_TOKEN and GITHUB_REPO as diagnostics). Nothing is stored; the IP is only used, hashed, for the
   rate limits in worker.js. Bodies are capped, mentions are defused so an issue never pings anyone, and a hidden
   honeypot field catches simple bots. */

export const FEEDBACK_KINDS = { game: { tag: '想玩', label: 'game-request' }, feedback: { tag: '反馈', label: 'website-feedback' } };
const LANGS = new Set(['zh', 'ja', 'en']);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
// "@name" would notify that GitHub user; a zero-width joiner after "@" keeps the text readable and silent
const defuse = s => s.replace(/@/g, '@‍');

export function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'INVALID_BODY' };
  if (clean(body.website, 200)) return { ok: false, error: 'REJECTED' };              // honeypot
  const kind = String(body.kind || '');
  if (!FEEDBACK_KINDS[kind]) return { ok: false, error: 'INVALID_KIND' };
  const text = clean(body.text, kind === 'game' ? 200 : 2000);
  if (!text) return { ok: false, error: 'EMPTY' };
  const contact = clean(body.contact, 120);
  const lang = LANGS.has(body.lang) ? body.lang : 'zh';
  const page = clean(body.page, 120).replace(/[^\w\/#.-]/g, '');
  return { ok: true, value: { kind, text, contact, lang, page } };
}

export function feedbackIssue({ kind, text, contact, lang, page }) {
  const k = FEEDBACK_KINDS[kind];
  const first = text.split(/\r?\n/)[0].slice(0, 80);
  const title = `[官网${k.tag}] ${defuse(first)}`.slice(0, 200);
  const lines = [
    kind === 'game' ? `**想玩的游戏**：${defuse(text)}` : defuse(text).split(/\r?\n/).map(l => `> ${l}`).join('\n'),
    '',
    contact ? `联系方式：${defuse(contact)}` : '联系方式：（未留）',
    `网站语言：${lang}${page ? ` · 页面：${page}` : ''}`,
    '',
    '_来自 megulit.com 的表单，由 relay 自动创建_',
  ];
  return { title, body: lines.join('\n'), labels: [k.label] };
}

export async function feedbackPost(request, env, { readJSON, fail, json, hit }, ip, now = new Date()) {
  if (!await hit(env, 'feedback', ip, now.getTime()) || !await hit(env, 'feedback-day', ip, now.getTime())) return fail('RATE_LIMITED', 429);
  const body = await readJSON(request, 8 * 1024);
  if (body.error) return fail(body.error, body.error === 'PAYLOAD_TOO_LARGE' ? 413 : 400);
  const checked = validateFeedback(body.value);
  if (!checked.ok) return fail(checked.error);
  if (!env.GITHUB_TOKEN) return fail('NOT_CONFIGURED', 503);
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : 'ilynthn/MeguLit';
  const r = await (env.fetch || fetch)(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'megulit-relay', 'content-type': 'application/json' },
    body: JSON.stringify(feedbackIssue(checked.value)),
  });
  if (!r.ok) return fail('UPSTREAM', 502);
  const data = await r.json().catch(() => ({}));
  return json({ ok: true, url: typeof data.html_url === 'string' ? data.html_url : '' }, 201);
}
