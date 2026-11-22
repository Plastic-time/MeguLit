// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function parseSelector(value) {
  if (typeof value !== 'string' || !/^[0-9A-Za-z| \t-]+$/.test(value)) return null;
  const fields = value.toLowerCase().split('|').map(s => s.trim());
  const [work, engine, lang, exe, script] = fields;
  if (fields.length !== 5 || !/^v[1-9]\d{0,7}$/.test(work) || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(engine) ||
      !/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(lang) || !/^[a-f0-9]{64}$/.test(exe) ||
      !/^[a-f0-9]{64}$/.test(script)) return null;
  return {key: fields.join('|'), work, engine, lang, exe, script};
}

module.exports = {parseSelector};
