/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E426 Local dictionary text is raw (glosses joined by semicolons, cross-reference arrows such as an arrow plus 英和, numbering and
   part-of-speech codes inline). formatDefinition turns it into senses: { tags, glosses } so the page can show a numbered list. */

const ARROW = /[→⇒]\s*(?:英和|和英|英|和|参照|cf\.?)?\s*/g;
const NUMBERED = /(?:^|\s)(?:\(\d{1,2}\)|（\d{1,2}）|[①-⑳]|\d{1,2}(?:\)|[.．](?![0-9０-９])))\s*/g;
// A slash between digits is part of a fraction in the definition.
const GLOSS_SEPARATOR = /[;；]|(?<![0-9０-９])\/|\/(?![0-9０-９])/;
const TAG = /^\s*(?:\(([^()]{1,24})\)|（([^（）]{1,24})）|【([^【】]{1,24})】|\[([^[\]]{1,24})\])\s*/;

function cleanGloss(text) { return String(text).replace(ARROW, '').replace(/\s+/g, ' ').replace(/^[\s,，、;；/]+|[\s,，、;；/]+$/g, '').trim(); }

export function formatDefinition(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim(); if (!text) return [];
  let nextNumber = null;
  const lines = text.split(/\n+/).flatMap(line => {
    // A numbered line may itself begin with a quantity, e.g. "1.成人\n2.18歳未満".
    const marker = /^\s*(\d{1,2})[.．]/.exec(line);
    if (marker && (Number(marker[1]) === nextNumber || !/^[0-9０-９]/.test(line.slice(marker[0].length)))) {
      nextNumber = Number(marker[1]) + 1;
      line = line.slice(marker[0].length);
    } else nextNumber = null;
    return line.replace(NUMBERED, '\n').split('\n');
  }).map(s => s.trim()).filter(Boolean);
  const senses = [];
  for (let line of lines) {
    const tags = []; let match;
    while ((match = TAG.exec(line))) { tags.push(...match.slice(1).find(Boolean).split(/[,，、]/).map(s => s.trim()).filter(Boolean)); line = line.slice(match[0].length); }
    const seen = new Set(), glosses = [];
    for (const part of line.split(GLOSS_SEPARATOR)) { const g = cleanGloss(part); if (g && !seen.has(g.toLowerCase())) { seen.add(g.toLowerCase()); glosses.push(g); } }
    if (glosses.length) senses.push({ tags, glosses });
    else if (tags.length && senses.length) senses[senses.length - 1].tags.push(...tags);
  }
  return senses;
}

export function definitionHtml(raw, esc) {
  const senses = formatDefinition(raw); if (!senses.length) return '';
  return `<ol class="dict-senses">${senses.map(s => `<li>${s.tags.length ? `<span class="dict-sense-tags">${s.tags.map(t => `<span class="moji-tag">${esc(t)}</span>`).join('')}</span>` : ''}<span class="dict-sense-text">${s.glosses.map(esc).join('<span class="dict-sep">；</span>')}</span></li>`).join('')}</ol>`;
}
