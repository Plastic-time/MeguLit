'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalizeBase } = require('./providers.cjs');

async function findRunningController(state, isAlive, fetcher) {
  if (!Number.isSafeInteger(state?.pid) || !Number.isInteger(state?.port) || state.port < 1 || state.port > 65535) return null;
  try {
    if (!isAlive(state.pid)) return null;
    const response = await fetcher(`http://127.0.0.1:${state.port}/json/list`, { signal: AbortSignal.timeout(1800) });
    if (!response.ok) return null;
    const pages = await response.json();
    return Array.isArray(pages) && pages.some(page => page.type === 'page' && /^https?:\/\/tauri\.localhost\//.test(page.url)) ? state : null;
  } catch { return null; }
}

function cleanPreferences(value = {}) {
  const result = {};
  if (typeof value.font === 'string' && value.font.length < 100) result.font = value.font;
  if (Number.isFinite(value.size) && value.size >= 10 && value.size <= 60) result.size = value.size;
  if (value.color === '' || /^#[0-9a-f]{6}$/i.test(value.color)) result.color = value.color;
  if (typeof value.bold === 'boolean') result.bold = value.bold;
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled;
  if (typeof value.transparent === 'boolean') result.transparent = value.transparent;
  if (['google', 'gpt', 'deepseek', 'bing', 'deepl'].includes(value.provider) || Object.hasOwn(require('./engines.cjs').ENGINES, value.provider)) result.provider = value.provider;
  if (typeof value.region === 'string' && /^[a-z0-9-]{0,60}$/i.test(value.region)) result.region = value.region;
  if (['free','pro'].includes(value.deeplTier)) result.deeplTier = value.deeplTier;
  if (typeof value.contextEnabled === 'boolean') result.contextEnabled = value.contextEnabled;
  if (['zh','en'].includes(value.learnerLanguage)) result.learnerLanguage=value.learnerLanguage;
  if (['sudachi','unidic'].includes(value.readingEngine)) result.readingEngine=value.readingEngine;
  if (Number.isFinite(value.contextLines)) result.contextLines = Math.max(1,Math.min(8,Math.round(value.contextLines)));
  // One bad field must not discard every other saved setting.
  if (typeof value.baseUrl === 'string') try { result.baseUrl = normalizeBase(value.baseUrl); } catch {}
  if (typeof value.model === 'string' && value.model.length < 201 && !/[\r\n]/.test(value.model)) result.model = value.model.trim();
  if(typeof value.themeColor==='string'&&/^#[0-9a-f]{6}$/i.test(value.themeColor))result.themeColor=value.themeColor;
  try { Object.assign(result,require('./lookup-models.cjs').cleanLookup(value)); }
  catch { const {lookupProfiles,...rest}=value; try { Object.assign(result,require('./lookup-models.cjs').cleanLookup(rest)); } catch {} }
  return result;
}

function readPreferences(folder) {
  // preferences.json.bak is the previous good copy; it rescues a file that was
  // truncated by a crash or power loss instead of silently resetting everything.
  for (const name of ['preferences.json', 'preferences.json.bak']) {
    try { return cleanPreferences(JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'))); }
    catch {}
  }
  return {};
}

function writePreferences(folder, value) {
  const target = path.join(folder, 'preferences.json');
  const temporary = target + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(cleanPreferences({...readPreferences(folder),...value}), null, 2));
  try { JSON.parse(fs.readFileSync(target, 'utf8')); fs.copyFileSync(target, target + '.bak'); } catch {}
  fs.renameSync(temporary, target);
}

function createProfile(folder) {
  return fs.mkdtempSync(path.join(folder, 'webview-session-'));
}

// Chromium keeps <profile>/EBWebView/lockfile open without sharing while a
// WebView2 browser process owns the profile. Opening it for writing then fails.
function profileInUse(profile) {
  const lock = path.join(profile, 'EBWebView', 'lockfile');
  if (!fs.existsSync(lock)) return false;
  let fd;
  try { fd = fs.openSync(lock, 'r+'); return false; }
  catch (error) { return ['EBUSY', 'EPERM', 'EACCES'].includes(error.code); }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// The theme, interface mode and reader page live in the page's localStorage.
// A throw-away profile per launch wiped them every time, so use one stable
// profile and only fall back to a temporary one when it is genuinely locked
// (for example an orphaned tomoyo.exe from a crashed launch still holds it).
function acquireProfile(folder) {
  const stable = path.join(folder, 'webview-profile');
  if (fs.existsSync(stable) && fs.lstatSync(stable).isSymbolicLink()) throw new Error('Refusing profile link');
  if (!profileInUse(stable)) { fs.mkdirSync(stable, { recursive: true }); return { path: stable, temporary: false }; }
  return { path: createProfile(folder), temporary: true };
}

// Temporary profiles from earlier crashes are never cleaned by their launcher.
function cleanStaleProfiles(folder, keep) {
  let removed = 0;
  for (const name of fs.readdirSync(folder)) {
    if (!/^webview-session-[a-z0-9]+$/i.test(name)) continue;
    const target = path.join(folder, name);
    if (keep && path.resolve(target) === path.resolve(keep)) continue;
    if (profileInUse(target)) continue;
    try { removeProfile(folder, target); removed++; } catch {}
  }
  return removed;
}

function removeProfile(folder, profile) {
  const root = path.resolve(folder);
  const target = path.resolve(profile);
  if (path.dirname(target) !== root || !/^webview-session-[a-z0-9]+$/i.test(path.basename(target))) throw new Error('Refusing unexpected profile path');
  if (!fs.existsSync(target)) return;
  if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Refusing profile link');
  if (!fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Refusing profile outside launcher folder');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}

module.exports = { findRunningController, cleanPreferences, readPreferences, writePreferences, createProfile, removeProfile, acquireProfile, cleanStaleProfiles, profileInUse };
