// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const npa = require('./nitroplus-npa.cjs');
const zip = require('./zip-extract.cjs');
const { importLayout } = require('../services/original-engines/nitro-npa.cjs');

const KIND = 'single-npa';
const MAX_ARCHIVE = 32 << 20;
const MAX_EXPANDED = 64 << 20;
const MAX_INDEX = 8 << 20;
const MAX_SCRIPT = 2 << 20;
const MAX_ROWS = 100000;
const JP = /[ぁ-ゖァ-ヺ]/g;
const HAN = /[一-鿿]/g;
const CONTAINS_KANA = /[ぁ-ゖァ-ヺ]/;
const CONTAINS_HAN = /[一-鿿]/;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safeArchive = name => typeof name === 'string' && /^[^<>:"|?*\/\\\x00-\x1f]+\.npa$/i.test(name);
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const snapshot = file => {
 const s=fs.lstatSync(file);
 return [s.size,s.ino,s.mtimeMs,s.ctimeMs].join('|');
};

function readBounded(file, max, reason) {
 if (!fs.lstatSync(file).isFile() || !samePath(fs.realpathSync(file), file)) throw Error(reason);
 const fd = fs.openSync(file, 'r');
 try {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) throw Error(reason);
  if (stat.size > max) throw Error('IMPORT_NPA_LIMIT');
  const bytes = Buffer.alloc(stat.size);
  let offset = 0;
  while (offset < bytes.length) {
   const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
   if (!read) throw Error('IMPORT_NPA_STALE');
   offset += read;
  }
  const after = fs.fstatSync(fd);
  if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw Error('IMPORT_NPA_STALE');
  return bytes;
 } finally { fs.closeSync(fd); }
}

async function selected(source) {
 const info = fs.lstatSync(source, { throwIfNoEntry: false });
 if (!info || info.isDirectory() || !/\.(?:npa|zip)$/i.test(source)) return null;
 if (!info.isFile() || !samePath(fs.realpathSync(source), source)) throw Error('IMPORT_NPA_UNSUPPORTED');
 if (/\.npa$/i.test(source)) return { name: path.basename(source), bytes: readBounded(source, MAX_ARCHIVE, 'IMPORT_NPA_UNSUPPORTED') };
 const before = snapshot(source);
 const entries = (await zip.entries(source, { maxIndex: 8 << 20, maxEntries: 40000 }))
  .filter(entry => !/[\\/]$/.test(entry.name));
 if (!entries.some(entry => /\.npa$/i.test(entry.name))) return null;
 if (entries.length !== 1) throw Error('IMPORT_NPA_ZIP_CONTENTS');
 const member = entries[0], parts = member.name.split(/[\\/]/);
 if (parts.some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part))) throw Error('IMPORT_NPA_ZIP');
 const bytes = await zip.readMember(source, member, MAX_ARCHIVE);
 if (snapshot(source) !== before) throw Error('IMPORT_NPA_STALE');
 return { name: parts.at(-1), bytes };
}

function archive(bytes) {
 let parsed;
 try { parsed = npa.readIndex(bytes, null, { maxIndex: 2 << 20, maxEntries: 4096 }); }
 catch (error) {
  if (error.message === 'NPA_SCHEME') throw Error('IMPORT_NPA_ENCRYPTED');
  if (error.message === 'NPA_LIMIT') throw Error('IMPORT_NPA_LIMIT');
  throw Error(error.message === 'NPA_MAGIC' ? 'IMPORT_NPA_UNSUPPORTED' : 'IMPORT_NPA_CORRUPT');
 }
 let expanded = 0;
 const entries = new Map();
 for (const entry of parsed.entries) {
  const name = entry.name.toLowerCase();
  if (entries.has(name) || name.split('/').some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f�]/.test(part))) throw Error('IMPORT_NPA_CORRUPT');
  expanded += entry.unpacked;
  if (expanded > MAX_EXPANDED || entry.unpacked > (/\.nss$/i.test(name) ? MAX_SCRIPT : MAX_ARCHIVE)) throw Error('IMPORT_NPA_LIMIT');
  entries.set(name, entry);
 }
 return { parsed, entries };
}

function entryBytes(arc, entry) {
 try { return npa.npaData(arc, entry, { maxOutputLength: Math.max(1, entry.unpacked) }); }
 catch { throw Error('IMPORT_NPA_CORRUPT'); }
}

function isJapanese(text) {
 const kana = (text.match(JP) || []).length, han = (text.match(HAN) || []).length;
 return /[ぁ-ゖ]/.test(text) && kana >= 2 && kana / Math.max(1, kana + han) >= .25;
}

function codeProof(source, target) {
 const a = archive(source), b = archive(target);
 if (a.entries.size !== b.entries.size) throw Error('IMPORT_NPA_MISMATCH');
 const rows = [], references = new Set();
 let scripts = 0, japanese = 0, paired = 0;
 for (const [name, entry] of a.entries) {
  const other = b.entries.get(name);
  if (!other || entry.name !== other.name) throw Error('IMPORT_NPA_MISMATCH');
  const jp = entryBytes(a.parsed, entry), installed = entryBytes(b.parsed, other);
  if (!/\.nss$/i.test(name)) {
   if (/\.nsb$/i.test(name)) throw Error('IMPORT_NPA_UNSUPPORTED');
   if (!jp.equals(installed)) throw Error('IMPORT_NPA_MISMATCH');
   continue;
  }
  const left = importLayout(jp), right = importLayout(installed);
  if (left.structure !== right.structure || left.dialogue.length !== right.dialogue.length) throw Error('IMPORT_NPA_MISMATCH');
  if (rows.length + left.dialogue.length > MAX_ROWS) throw Error('IMPORT_NPA_LIMIT');
  if (left.dialogue.length) scripts++;
  let changed = false;
  for (const [i, text] of left.dialogue.entries()) {
   const local = right.dialogue[i];
   const jpBody=isJapanese(text);
   if (jpBody) japanese++;
   const chinese = jpBody && text !== local && !CONTAINS_KANA.test(local) && CONTAINS_HAN.test(local) ? local : '';
   if (chinese) { paired++; changed = true; }
   rows.push([text, chinese]);
  }
  if (changed) {
   if (!left.references.length) throw Error('IMPORT_NPA_IDENTITY');
   for (const ref of left.references) references.add(ref);
  }
 }
 if (japanese < 2 || japanese < rows.length * .5) throw Error('IMPORT_NPA_NO_JAPANESE');
 if (!paired || references.size < 2) throw Error('IMPORT_NPA_IDENTITY');
 return { rows, coverage: { scripts, japaneseLines: japanese, paired, missing: japanese - paired } };
}

async function plan(gameDir, source, executable) {
 const input = await selected(source);
 if (!input) return null;
 if (!safeArchive(input.name)) throw Error('IMPORT_NPA_UNSUPPORTED');
 // Validate the selected container before consulting the installed game's file names.
 archive(input.bytes);
 const target = path.join(gameDir, input.name), exe = path.resolve(String(executable || ''));
 if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isFile() || !samePath(path.dirname(exe), gameDir) ||
  !/\.exe$/i.test(exe) || !fs.lstatSync(exe, { throwIfNoEntry: false })?.isFile()) throw Error('IMPORT_NPA_TARGET');
 const launcher = readBounded(exe, MAX_ARCHIVE, 'IMPORT_NPA_TARGET');
 const file = path.basename(fs.realpathSync(target));
 if (!['utf8', 'utf16le'].some(encoding => [file, file.toLowerCase(), file.toUpperCase()].some(name => launcher.includes(Buffer.from(name, encoding))))) throw Error('IMPORT_NPA_TARGET');
 const original = readBounded(target, MAX_ARCHIVE, 'IMPORT_NPA_TARGET');
 const originalSha256 = sha(original), importedSha256 = sha(input.bytes);
 if (originalSha256 === importedSha256) throw Error('NOTHING_TO_IMPORT');
 const { rows, coverage } = codeProof(input.bytes, original);
 const exeSha256 = sha(launcher);
 const token = sha(JSON.stringify([KIND, gameDir, source, file, path.basename(exe), exeSha256, originalSha256, importedSha256]));
 return { gameDir, file, target, exe, original, bytes: input.bytes, originalSha256, importedSha256, exeSha256, token, rows, coverage };
}

async function discover(gameDir, executable) {
 const candidates=[],targets=new Set();
 let visited=0,matched=null;
 const skip=/^(?:\.|saves?$|savedata$|userdata$|cache$)/i;
 function walk(dir,depth) {
  const children=[],folder=fs.opendirSync(dir);
  try {
   let entry;
   while((entry=folder.readSync())) {
    if(++visited>1500)throw Error('IMPORT_NPA_SEARCH_LIMIT');
    if(skip.test(entry.name))continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()&&depth<2)children.push(file);
    if(!entry.isFile())continue;
    const name=entry.name.toLowerCase();
    if(depth===0&&safeArchive(name))targets.add(name);
    if(/\.zip$/i.test(name)||depth>0&&targets.has(name)){
     if(candidates.length>=8)throw Error('IMPORT_NPA_SEARCH_LIMIT');
     candidates.push(file);
    }
   }
  } finally { folder.closeSync(); }
  for(const child of children.sort())walk(child,depth+1);
 }
 walk(gameDir,0);
 if(!targets.size)throw Error('IMPORT_NPA_TARGET');
 const deadline=Date.now()+5000;
 for(const source of candidates.sort()){
  if(Date.now()>deadline)throw Error('IMPORT_NPA_SEARCH_LIMIT');
  let proof;
  try{proof=await plan(gameDir,source,executable);}
  catch(error){if(!/^IMPORT_NPA_|^NOTHING_TO_IMPORT$|^IMPORT_EXTRACT_FAILED$/.test(error.message))throw error;continue;}
  if(Date.now()>deadline)throw Error('IMPORT_NPA_SEARCH_LIMIT');
  if(!proof)continue;
  if(matched&&(matched.archive.file!==proof.file||matched.archive.importedSha256!==proof.importedSha256))throw Error('IMPORT_NPA_MULTIPLE');
  // Keep only what the preview needs. The chosen bytes are read and verified again on confirmation.
  matched={source,archive:{file:proof.file,importedSha256:proof.importedSha256,token:proof.token,coverage:proof.coverage,size:proof.bytes.length}};
 }
 if(!matched)throw Error('IMPORT_NPA_NOT_FOUND');
 return matched;
}

function regularDirectory(dir) {
 return fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() && samePath(fs.realpathSync(dir), dir);
}
function writeVerified(file, bytes) {
 const fd = fs.openSync(file, 'wx');
 try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
 finally { fs.closeSync(fd); }
 if (sha(readBounded(file, Math.max(MAX_ARCHIVE, bytes.length), 'IMPORT_NPA_VERIFY')) !== sha(bytes)) throw Error('IMPORT_NPA_VERIFY');
}
function clean(backup, file) {
 if(!regularDirectory(backup)||fs.existsSync(path.join(backup,'files'))&&!regularDirectory(path.join(backup,'files')))throw Error('IMPORT_NPA_RECOVERY');
 for (const name of ['pending.npa', 'pending-undo.npa', 'pairs.json', 'manifest.json', path.join('files', file)]) {
  fs.rmSync(path.join(backup, name), { force: true });
 }
 if (fs.existsSync(path.join(backup, 'files'))) fs.rmdirSync(path.join(backup, 'files'));
 fs.rmdirSync(backup);
}

function apply(p, backup, adapter, token, beforeWrite) {
 if (!/^[0-9a-f]{64}$/.test(token || '') || p.token !== token) throw Error('IMPORT_NPA_CONFIRM');
 let owned = false, swapped = false, manifest;
 const keep = path.join(backup, 'files', p.file), staged = path.join(backup, 'pending.npa');
 try {
  try { fs.mkdirSync(backup); owned = true; }
  catch (error) { if (error.code === 'EEXIST') throw Error('ALREADY_IMPORTED'); throw error; }
  const index = Buffer.from(JSON.stringify(p.rows));
  if (index.length > MAX_INDEX) throw Error('IMPORT_NPA_LIMIT');
  manifest = {
   version: 1, kind: KIND, adapter, at: new Date().toISOString(), exe: '', previousExe: path.basename(p.exe),
   exeSha256: p.exeSha256, indexSha256: sha(index), coverage: p.coverage,
   files: [{ file: p.file, kind: 'replace', originalSha256: p.originalSha256, importedSha256: p.importedSha256 }],
  };
  writeVerified(path.join(backup, 'manifest.json'), Buffer.from(JSON.stringify(manifest)));
  fs.mkdirSync(path.dirname(keep));
  writeVerified(keep, p.original);
  writeVerified(path.join(backup, 'pairs.json'), index);
  writeVerified(staged, p.bytes);
  beforeWrite?.();
  if (sha(readBounded(p.target, MAX_ARCHIVE, 'IMPORT_NPA_STALE')) !== p.originalSha256 || sha(readBounded(p.exe, MAX_ARCHIVE, 'IMPORT_NPA_STALE')) !== p.exeSha256) throw Error('IMPORT_NPA_STALE');
  fs.renameSync(staged, p.target);
  swapped = true;
  if (sha(readBounded(p.target, MAX_ARCHIVE, 'IMPORT_NPA_VERIFY')) !== p.importedSha256) throw Error('IMPORT_NPA_VERIFY');
  return { archive: true, imported: 1, replaced: 1, added: 0, removed: 0, exe: '', coverage: p.coverage };
 } catch (error) {
  if (swapped) {
   if (restore(p.gameDir, backup, manifest).skipped.length) throw Error('IMPORT_NPA_RECOVERY');
   throw Error('IMPORT_NPA_VERIFY');
  }
  else if (owned) clean(backup, p.file);
  throw error;
 }
}

const digest = /^[0-9a-f]{64}$/;
function fileRecord(manifest) {
 const item = manifest?.files?.[0];
 if (manifest?.kind !== KIND || manifest.version !== 1 || manifest.files?.length !== 1 || !safeArchive(item?.file) ||
  !digest.test(item.originalSha256) || !digest.test(item.importedSha256)) throw Error('IMPORT_NPA_RECOVERY');
 return item;
}
function restore(gameDir, backup, manifest) {
 const item = fileRecord(manifest), target = path.join(gameDir, item.file);
 const skipped = () => ({ restored: 0, skipped: [item.file], exe: '' });
 if (!regularDirectory(backup)) return skipped();
 try {
  const current = sha(readBounded(target, MAX_ARCHIVE, 'IMPORT_NPA_STALE'));
  if (current === item.originalSha256) {
   clean(backup, item.file);
   return { restored: 1, skipped: [], exe: '' };
  }
  if (current !== item.importedSha256 || !regularDirectory(path.join(backup, 'files'))) return skipped();
  const bytes = readBounded(path.join(backup, 'files', item.file), MAX_ARCHIVE, 'IMPORT_NPA_RECOVERY');
  if (sha(bytes) !== item.originalSha256) return skipped();
  const staged = path.join(backup, 'pending-undo.npa');
  fs.rmSync(staged, { force: true });
  writeVerified(staged, bytes);
  if (sha(readBounded(target, MAX_ARCHIVE, 'IMPORT_NPA_STALE')) !== item.importedSha256) return skipped();
  fs.renameSync(staged, target);
  if (sha(readBounded(target, MAX_ARCHIVE, 'IMPORT_NPA_VERIFY')) !== item.originalSha256) return skipped();
  clean(backup, item.file);
  return { restored: 1, skipped: [], exe: '' };
 } catch { return skipped(); }
}

function local(executable, backup, manifest) {
 try {
  const item = fileRecord(manifest), dir = path.dirname(executable), target = path.join(dir, item.file), index = path.join(backup, 'pairs.json');
  if (!regularDirectory(backup) || !samePath(path.basename(executable), manifest.previousExe)) return null;
  const current = () => [snapshot(executable), snapshot(target), snapshot(index)].join('|');
  const initial = current();
  if (sha(readBounded(executable, MAX_ARCHIVE, 'IMPORT_NPA_STALE')) !== manifest.exeSha256 ||
   sha(readBounded(target, MAX_ARCHIVE, 'IMPORT_NPA_STALE')) !== item.importedSha256) return null;
  const bytes = readBounded(index, MAX_INDEX, 'IMPORT_NPA_STALE');
  if (sha(bytes) !== manifest.indexSha256 || current() !== initial) return null;
  const rows = JSON.parse(bytes);
  if (!Array.isArray(rows) || rows.length > MAX_ROWS || rows.some(row => !Array.isArray(row) || row.length !== 2 || row.some(value => typeof value !== 'string'))) return null;
  return { rows, coverage: manifest.coverage, valid: () => { try { return current() === initial; } catch { return false; } } };
 } catch { return null; }
}

module.exports = { KIND, plan, discover, apply, restore, local, snapshot };
