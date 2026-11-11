/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E426 Local dictionary text is raw (glosses joined by semicolons, cross-reference arrows such as an arrow plus 英和, numbering and
   part-of-speech codes inline). formatDefinition turns it into senses: { tags, glosses } so the page can show a numbered list. */

const ARROW = /[→⇒]\s*(?:英和|和英|英|和|参照|cf\.?)?\s*/g;
const NUMBERED = /(?:^|\s)(?:\(\d{1,2}\)|（\d{1,2}）|[①-⑳]|\d{1,2}[.)．])\s*/g;
const TAG = /^\s*(?:\(([^()]{1,24})\)|（([^（）]{1,24})）|【([^【】]{1,24})】|\[([^[\]]{1,24})\])\s*/;

function cleanGloss(text) { return String(text).replace(ARROW, '').replace(/\s+/g, ' ').replace(/^[\s,，、;；/]+|[\s,，、;；/]+$/g, '').trim(); }

export function formatDefinition(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim(); if (!text) return [];
  const lines = text.split(/\n+/).flatMap(line => line.replace(NUMBERED, '\n').split('\n')).map(s => s.trim()).filter(Boolean);
  const senses = [];
  for (let line of lines) {
    const tags = []; let match;
    while ((match = TAG.exec(line))) { tags.push(...match.slice(1).find(Boolean).split(/[,，、]/).map(s => s.trim()).filter(Boolean)); line = line.slice(match[0].length); }
    const seen = new Set(), glosses = [];
    for (const part of line.split(/[;；]|\s*\/\s*/)) { const g = cleanGloss(part); if (g && !seen.has(g.toLowerCase())) { seen.add(g.toLowerCase()); glosses.push(g); } }
    if (glosses.length) senses.push({ tags, glosses });
    else if (tags.length && senses.length) senses[senses.length - 1].tags.push(...tags);
  }
  return senses;
}

export function definitionHtml(raw, esc) {
  const senses = formatDefinition(raw); if (!senses.length) return '';
  return `<ol class="dict-senses">${senses.map(s => `<li>${s.tags.length ? `<span class="dict-sense-tags">${s.tags.map(t => `<span class="moji-tag">${esc(t)}</span>`).join('')}</span>` : ''}<span class="dict-sense-text">${s.glosses.map(esc).join('<span class="dict-sep">；</span>')}</span></li>`).join('')}</ol>`;
}
