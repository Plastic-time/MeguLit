// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { identify } = require('./registry.cjs');
const naninovel = require('./naninovel.cjs');
const unityfs = require('./unityfs.cjs');

const ADAPTER = 'folder-diagnostic';
const MAX_ENTRIES = 4096;
const MAX_SOURCES = 128;
const MAX_FILE = 16 << 20;
const MAX_LOOSE_SCRIPT = 2 << 20;
const MAX_BYTES = 64 << 20;
const MAX_EXPANDED = 128 << 20;
const MAX_ROWS = 200000;
const SKIP = /^(?:\.megulit|\.|save|backup|node_modules$)/i;
const UNITY_DATA = /^[^/]+_Data\//i;
const ADDRESSABLE = /^[^/]+_Data\/StreamingAssets\/aa\/StandaloneWindows(?:64|32)?\/[^/]+$/i;
const LOCALIZATION = rel => ADDRESSABLE.test(rel) && naninovel._internal.isLocalizationBundle(path.posix.basename(rel));
const KANA = /[ぁ-ゖァ-ヺ]/;
const CJK = /[ぁ-ゖァ-ヺ㐀-鿿]/;
const CHINESE = /[㐀-鿿]/;
const body = text => typeof text === 'string' && text.trim() && !/^(?:[【\[][^】\]]+[】\]]|\*[^*]+\*)$/.test(text.trim());
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function inspectFolder(dir, { progress = () => {}, budgetMs = 45000 } = {}) {
  const start = Date.now();
  const files = new Map(), folders = new Map(), sources = [], warnings = new Set();
  let entries = 0, readBytes = 0, expanded = 0, complete = true;
  const coverage = { tables: 0, rows: 0, japaneseLines: 0, kanaLines: 0, localTranslations: 0, missingTranslations: 0, voicedLines: 0 };
  function check() {
    if (Date.now() - start >= budgetMs) throw Error('EMBEDDED_TIME_BUDGET');
    if (process.memoryUsage().rss >= 384 << 20) throw Error('EMBEDDED_MEMORY_BUDGET');
  }
  function read(file, max, prefix = false) {
    check();
    if (!samePath(fs.realpathSync(file), file) || !fs.lstatSync(file).isFile()) throw Error('EMBEDDED_SOURCE_UNREADABLE');
    const fd = fs.openSync(file, 'r');
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) throw Error('EMBEDDED_SOURCE_UNREADABLE');
      const length = prefix ? Math.min(stat.size, max) : stat.size;
      if (length > max || readBytes + length > MAX_BYTES) throw Error('EMBEDDED_BYTE_BUDGET');
      const bytes = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        const size = fs.readSync(fd, bytes, offset, length - offset, offset);
        if (!size) throw Error('EMBEDDED_SOURCE_UNREADABLE');
        offset += size;
        readBytes += size;
      }
      return bytes;
    } finally { fs.closeSync(fd); }
  }
  function failed(error, fallback = 'EMBEDDED_SOURCE_UNREADABLE') {
    complete = false;
    const code = error?.message;
    warnings.add(/^EMBEDDED_[A-Z_]+_BUDGET$/.test(code) ? code : fallback);
  }
  function walk(relative, depth) {
    check();
    const children = [];
    folders.set(relative.toLowerCase(), children);
    const handle = fs.opendirSync(path.join(dir, relative));
    try {
      let entry;
      while ((entry = handle.readSync())) {
        if (++entries > MAX_ENTRIES) throw Error('EMBEDDED_ENTRY_BUDGET');
        check();
        if (entry.isSymbolicLink() || SKIP.test(entry.name)) continue;
        const rel = relative ? relative + '/' + entry.name : entry.name;
        if (entry.isFile()) files.set(rel.toLowerCase(), rel);
        if (entry.isDirectory() && depth > 0) children.push({ name: entry.name, rel, directory: true });
        else if (entry.isFile()) children.push({ name: entry.name, rel, directory: false });
      }
    } finally { handle.closeSync(); }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.directory) walk(child.rel, depth - 1);
    }
  }
  progress({ phase: 'detecting' });
  try { walk('', 4); } catch (error) { failed(error); }
  const root = folders.get('') || [];
  const dataFolders = root.filter(entry => entry.directory && /_Data$/i.test(entry.name));
  const available = [...files.values()].sort();
  const addressable = available.filter(LOCALIZATION);
  const utagePatch = available.some(rel => UNITY_DATA.test(rel) && /\.scenarios\.asset$/i.test(rel));
  function childNames(rel) { return (folders.get(rel.toLowerCase()) || []).map(entry => entry.name); }
  function peek(rel, test, max) {
    const file = files.get(rel.toLowerCase());
    if (!file) return false;
    try { return test.test(read(path.join(dir, file), max, true).toString('latin1')); }
    catch (error) { failed(error); return false; }
  }
  const magic = (test, header, max = 1) => root.filter(entry => !entry.directory && test.test(entry.name)).slice(0, max)
    .some(entry => peek(entry.rel, new RegExp('^' + header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), header.length));
  const assemblyNames = dataFolders.flatMap(({ rel }) => childNames(rel + '/Managed'));
  for (const data of dataFolders) {
    const rel = files.get((data.rel + '/ScriptingAssemblies.json').toLowerCase());
    if (!rel) continue;
    try {
      const { names } = JSON.parse(read(path.join(dir, rel), 256 << 10).toString('utf8'));
      if (Array.isArray(names)) for (const name of names) if (typeof name === 'string') assemblyNames.push(name);
    } catch (error) { failed(error); }
  }
  // The library's signature table runs against this inventory. Deeper probes may
  // unpack archives, start helpers or access caches, so only name and header checks run here.
  const known = identify({
    names: root.map(entry => entry.name),
    has: test => root.some(entry => test.test(entry.name)),
    sub: (rel, test) => childNames(rel).some(name => test.test(name)),
    managed: test => assemblyNames.some(name => test.test(name) || test.test(name.replace(/^Elringus\./i, ''))),
    peek, magic, magicAny: (test, header, max = 4) => magic(test, header, max),
    probe: () => false, inspect: () => false,
  })?.name || '';
  const detected = addressable.length && (!known || known === 'Unity') ? 'Unity (Naninovel)' : known;
  const tryUtage = dataFolders.length > 0 &&
    (utagePatch || !detected || detected === 'Unity' || detected === 'Unity (Utage)');

  function source(rel, max = MAX_LOOSE_SCRIPT) {
    if (sources.length >= MAX_SOURCES) throw Error('EMBEDDED_SOURCE_BUDGET');
    const file = path.join(dir, rel), bytes = read(file, max);
    progress({ phase: 'reading', file, bytes: readBytes });
    sources.push({ path: file, bytes: bytes.length, sha256: digest(bytes) });
    return bytes;
  }
  function addRows(lines, japanese, translations = []) {
    if (coverage.rows + lines.length > MAX_ROWS) throw Error('EMBEDDED_ROW_BUDGET');
    coverage.rows += lines.length;
    if (lines.length) coverage.tables++;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (!body(text) || !japanese(text)) continue;
      coverage.japaneseLines++;
      if (KANA.test(text)) coverage.kanaLines++;
      const zh = translations[i];
      if (zh && CHINESE.test(zh) && !KANA.test(zh) && zh !== text) coverage.localTranslations++;
    }
  }
  function localizationRows(buffer, explicitBundle) {
    const documents = [];
    naninovel._internal.scan(buffer, documents, { blocksOnly: true, check: () => {
      check();
      if (documents.length >= 512) throw Error('EMBEDDED_ROW_BUDGET');
    } });
    let readDocs = 0;
    for (const doc of documents) {
      if (!doc.script) continue;
      const { blocks, tidy } = naninovel._internal;
      const jaSource = /^ja(?:-|$)/.test(doc.src), jaTarget = /^ja(?:-|$)/.test(doc.dst);
      const zhSource = /^zh/.test(doc.src), zhTarget = /^zh/.test(doc.dst);
      const lines = [], translations = [];
      for (const row of blocks(doc.text).values()) {
        const src = tidy(row.src.join('\n')), dst = tidy(row.dst.join('\n'));
        lines.push(jaTarget ? dst : src);
        translations.push(jaSource && zhTarget ? dst : jaTarget && zhSource ? src : '');
      }
      if (!lines.length) continue;
      readDocs++;
      // The declared Japanese side supplies row identity, including sound lines
      // with no kana. Require kana in the same document before counting it.
      const japanese = (jaSource || jaTarget) && lines.some(line => KANA.test(line));
      addRows(lines, text => japanese && CJK.test(text), translations);
    }
    return readDocs > 0 || explicitBundle && documents.some(doc => doc.script);
  }
  function readLocalization(rel) {
    const bytes = source(rel, MAX_FILE);
    if (!ADDRESSABLE.test(rel)) return localizationRows(bytes, false);
    const nodes = unityfs.read(bytes, {
      maxUnpacked: Math.min(MAX_EXPANDED - expanded, MAX_FILE), check,
      consume: size => { expanded += size; },
    });
    let decoded = false;
    for (const node of nodes) {
      if (/\.(?:resS|resource)$/i.test(node.name)) continue;
      if (localizationRows(node.data, true)) decoded = true;
    }
    return decoded;
  }
  function diagnose(utageError = '') {
    const loose = looseScripts(available, files, detected);
    const engine = detected || loose?.engine || '';
    const readNaninovel = engine === 'Unity (Naninovel)';
    const candidates = readNaninovel ? (addressable.length ? addressable : available.filter(rel => /^[^/]+_Data\/(?:resources|sharedassets\d+)\.assets$/i.test(rel))) : loose?.files || [];
    let decoded = false;
    const japaneseLine = candidates.length && !readNaninovel ? require('../original-text.cjs').japaneseLine : null;
    for (const file of candidates) {
      try {
        if (readNaninovel) {
          if (!readLocalization(file)) failed(null, 'EMBEDDED_SCRIPT_LAYOUT');
        } else {
          const parsed = loose.parse(source(file));
          addRows(parsed.lines, japaneseLine, parsed.zh);
        }
        decoded = true;
      } catch (error) {
        failed(error, 'EMBEDDED_SCRIPT_LAYOUT');
        if (['EMBEDDED_TIME_BUDGET', 'EMBEDDED_MEMORY_BUDGET', 'EMBEDDED_SOURCE_BUDGET', 'EMBEDDED_ROW_BUDGET'].includes(error.message)) break;
      }
    }
    if (utageError && utageError !== 'EMBEDDED_UNSUPPORTED') warnings.add(utageError);
    if (utageError.endsWith('_BUDGET') || utageError === 'EMBEDDED_SOURCE_UNREADABLE') complete = false;
    const utageNoJapanese = utageError === 'EMBEDDED_NO_JAPANESE_BODY';
    const format = utageNoJapanese || /^EMBEDDED_(?:UNSUPPORTED_COLUMNS|UNSUPPORTED_COMMAND|UNVERIFIED_UTAGE_CLASS|ROW_WIDTH|DUPLICATE_ROW_ID|AMBIGUOUS_PATCH|CONFLICT)$/.test(utageError)
      ? 'Unity (Utage)' : engine || (dataFolders.length ? 'Unity' : '');
    coverage.missingTranslations = coverage.japaneseLines - coverage.localTranslations;
    const state = coverage.japaneseLines ? 'read-only' : (decoded && coverage.rows || utageNoJapanese) && complete
      ? 'no-japanese' : format ? 'detected' : 'unknown';
    return { state, adapter: ADAPTER, engine: format, canRestore: false, scanToken: '', sources, coverage, warnings: [...warnings], partial: !complete, readBytes };
  }
  return { tryUtage, diagnose, remainingMs: () => Math.max(0, budgetMs - (Date.now() - start)) };
}

function looseScripts(files, byName, detected) {
  const scripts = (engine, files, parse) => files.length ? { engine, files, parse } : null;
  const scenes = () => require('./scenes.cjs');
  if (detected === "Ren'Py" || !detected) {
    const renpy = scripts("Ren'Py", files.filter(rel => /^(?:game\/)?[^/]+\.rpy$|^game\/(?!tl\/).+\.rpy$/i.test(rel)), bytes => scenes().parseRpy(plainScript(bytes)));
    if (renpy) return renpy;
  }
  if (detected === 'RPG Maker MV/MZ' || !detected) {
    const data = ['www/data/', 'data/'].find(prefix => byName.has(prefix + 'system.json') && byName.has(prefix + 'mapinfos.json'));
    if (data) return scripts('RPG Maker MV/MZ', files.filter(rel => rel.toLowerCase().startsWith(data) && require('./rpgmaker.cjs').test(rel.slice(data.length))), require('./rpgmaker.cjs').parse);
  }
  if (detected === 'TyranoScript') {
    return scripts(detected, files.filter(rel => /^data\/scenario\/.+\.ks$/i.test(rel)), bytes => require('./tyrano.cjs').parse(plainScript(bytes)));
  }
  if (detected === 'KiriKiri' || !detected) {
    const kag = scripts('KiriKiri', files.filter(rel => /^(?:data\/)?scenario\/.+\.ks$/i.test(rel) || detected === 'KiriKiri' && /^[^/]+\.ks$/i.test(rel)),
      bytes => scenes().parseKs(plainScript(bytes)));
    if (kag) return kag;
  }
  if (detected === 'Artemis' || !detected) {
    return scripts('Artemis', files.filter(rel => /^(?:scenario\/.*|[^/]*)\.(?:ast|asb)$/i.test(rel) || detected === 'Artemis' && /^scenario\/.+\.txt$/i.test(rel)),
      bytes => scenes().ENGINES.artemis.parse(plainScript(bytes)));
  }
  return null;
}

function plainScript(bytes) {
  // Compressed KAG mode uses an unbounded legacy decoder.
  if (bytes[0] === 0xfe && bytes[1] === 0xfe && bytes[2] === 2) throw Error('EMBEDDED_SCRIPT_LAYOUT');
  return bytes;
}

module.exports = { ADAPTER, inspectFolder };
