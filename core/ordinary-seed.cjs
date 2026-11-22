// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const diff = require('./game-diff.cjs');
const { DOMAINS, okValue } = require('./profiles/domains.cjs');
// Only the data produced by the ordinary player calibration. Broader profile
// domains include regular expressions, native offsets and private capabilities.
const fields = {
  calibrate: ['positionSource', 'textBox', 'hideMethod'],
  hide: ['textEffectsRead'],
  page: ['effectFrames', 'presentation'],
  placement: ['firstLineAnchor'],
  choice: ['filters']
};
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v, names) => plain(v) && Object.keys(v).every(k => names.includes(k));
function normalize(input) {
  if (!only(input, ['key', 'mode', 'settings', 'prints']) || typeof input.key !== 'string' ||
      !diff.KEY.test(input.key) || !['hide','read'].includes(input.mode) ||
      !only(input.settings, Object.keys(fields))) return null;
  if (input.prints !== undefined && (!only(input.prints,['script']) ||
      typeof input.prints.script !== 'string' || !diff.KEY.test(input.prints.script))) return null;
  const settings = {};
  for (const [group, block] of Object.entries(input.settings)) {
    if (!only(block, fields[group]) || !Object.keys(block).length) return null;
    for (const [field, value] of Object.entries(block)) {
      if (group === 'choice') {
        if (!Array.isArray(value) || value.length) return null;
      } else if (!okValue(DOMAINS[group + '.' + field], value)) return null;
    }
    settings[group] = {...block};
  }
  if (!Object.keys(settings).length) return null;
  if (input.mode === 'read') settings.hide = {...settings.hide, textEffectsRead:true};
  return {key:input.key, mode:input.mode, ...(input.prints ? {prints:{script:input.prints.script}} : {}), settings};
}
const keyId = id => typeof id === 'string' && /^ordinary-[a-z0-9-]{1,20}$/.test(id);
const signed = doc => keyId(doc?.signature?.keyId);
function document(input, rev, issuedAt) {
  const data = normalize(input);
  if (!data || !Number.isSafeInteger(rev) || rev < 1 || rev > 1e9 ||
      typeof issuedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(issuedAt) ||
      !Number.isFinite(Date.parse(issuedAt)) || new Date(issuedAt).toISOString() !== issuedAt) return null;
  return {...data, schema:'megulit.game-diff', version:1, layer:'version', source:'auto', rev, issuedAt};
}
function valid(doc) {
  if (!only(doc, ['key','mode','settings','schema','version','layer','source','rev','issuedAt','prints'])) return false;
  const expected = document({key:doc.key,mode:doc.mode,settings:doc.settings,prints:doc.prints}, doc.rev, doc.issuedAt);
  return !!expected && diff.canonical(expected) === diff.canonical(doc);
}
module.exports = {normalize, keyId, signed, document, valid};
