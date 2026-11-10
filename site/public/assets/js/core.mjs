// SPDX-License-Identifier: GPL-3.0-or-later
// Pure helpers for the website (also run by validation/site-mirror.test.cjs).

export const MIRROR = 'https://dl.megulit.com';
export const GH_PROXIES = ['https://gh-proxy.com/', 'https://ghproxy.net/'];

// Download sources in the order the site tries them: the R2 mirror, gh-proxy mirrors, then GitHub itself.
export function downloadSources(latest, mirror = MIRROR) {
  const gh = latest?.github;
  const out = [];
  if (latest?.key) out.push({ id: 'mirror', url: `${mirror}/${latest.key}` });
  else if (latest?.url) out.push({ id: 'mirror', url: latest.url });
  if (gh && /^https:\/\/github\.com\//.test(gh)) {
    for (const p of GH_PROXIES) out.push({ id: 'proxy', host: new URL(p).host, url: p + gh });
    out.push({ id: 'github', url: gh });
  }
  return out;
}

export function formatSize(bytes, lang = 'zh') {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / 1048576;
  return `${mb.toFixed(1)} MB`;
}

export function formatDate(iso, lang = 'zh') {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'ja' ? 'ja-JP' : lang === 'en' ? 'en-US' : 'zh-CN';
  return d.toLocaleDateString(locale, { year: 'numeric', month: lang === 'en' ? 'short' : 'long', day: 'numeric', timeZone: 'Asia/Shanghai' });
}

// zh / ja / en from a saved choice or the browser languages. Simplified Chinese is the default.
export function pickLang(saved, languages = []) {
  if (['zh', 'ja', 'en'].includes(saved)) return saved;
  for (const l of languages) {
    const s = String(l).toLowerCase();
    if (s.startsWith('zh')) return 'zh';
    if (s.startsWith('ja')) return 'ja';
    if (s.startsWith('en')) return 'en';
  }
  return 'zh';
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The small Markdown subset release notes use: ### headings, - lists, **bold**, `code`, [links](https://...).
// Everything is escaped first; only https links survive, so notes can never inject markup.
export function renderMarkdown(md) {
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
  const out = [];
  let list = false;
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(item[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (!line || /^-{3,}$/.test(line) || /^<\/?(details|summary)/i.test(line)) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) out.push(`<h4>${inline(h[2])}</h4>`);
    else out.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
