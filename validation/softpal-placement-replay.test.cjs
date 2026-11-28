// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GalNative } = require('../core/gal-native.cjs');
const { HookNative } = require('../core/hook-native.cjs');
const { OverlayPlacement, parsePage } = require('../core/overlay-placement.cjs');
const { startEdge } = require('./library-views-perf.cjs');

const fixtures = path.join(__dirname, '..', 'native', 'gpuhide', 'selftest', 'replay-fixtures');
const read = name => fs.readFileSync(path.join(fixtures, name), 'utf8');
const edgeInstalled = [
  process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].some(file => file && fs.existsSync(file));

// Synthetic: the one GPU page is replayed before, during, and after write-back.
function replayPlacement(transcript) {
  const record = transcript.split(/\r?\n/).find(line => line.startsWith('ToMe_PAGE '));
  const page = parsePage(record);
  assert.ok(page?.awake && !page.armed, 'expected an awake GPU page with no hide permission');

  const messages = [];
  const preferences = { hookProfile: 'embed', hookHide: true, textRenderer: 'compositor' };
  const hooks = Object.assign(Object.create(HookNative.prototype), { enabled: true, preferences, state: {} });
  const placement = new OverlayPlacement({
    send: message => { if (message.type === 'textPlacePage') messages.push(message); },
  });
  placement.configure(preferences, { bound: true, clientWidth: page.sw, clientHeight: page.sh });
  const host = { hooks, placement };
  for (const state of ['unverified', 'callback-acknowledged', 'unverified']) {
    hooks.state.replacementState = state;
    GalNative.prototype.hookEvent.call(host, page);
  }
  return messages;
}

async function replayReader(messages) {
  const dir = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-softpal-replay-'));
  const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
  const html = '<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">' +
    '<span class="char-token">仮</span><span class="char-token">想</span></div>' +
    '<div class="tomoyo-cn-row">合成译文</div></div></main>';
  let browser;
  try {
    browser = await startEdge(path.join(dir, 'edge'));
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    return await browser.evaluate(`(async () => {
      document.body.innerHTML = ${JSON.stringify(html)};
      window.__tomoyoChinese = {};
      (0, eval)(${JSON.stringify(source)});
      const reader = window.__tomoyoChinese;
      reader.textPlaceAnchor(true);
      reader.textPlaceMode({ on: true });
      const results = [];
      for (const message of ${JSON.stringify(messages)}) {
        reader.textPlacePage(message);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const visibility = selector => getComputedStyle(document.querySelector(selector)).visibility;
        results.push({ original: visibility('.sentence-text'), translation: visibility('.tomoyo-cn-row') });
      }
      return results;
    })()`);
  } finally {
    await browser?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('SoftPal write-back changes where the unarmed GPU page leaves the original', () => {
  const transcript = read('softpal.expected');
  const expected = JSON.parse(read('softpal-placement.expected.json'));
  const first = replayPlacement(transcript);
  assert.deepEqual(first, expected.placement);
  assert.deepEqual(replayPlacement(transcript), first);
});

test('SoftPal write-back keeps both the original and the translation in the reader',
  { skip: !edgeInstalled && 'Edge not installed', timeout: 60_000 }, async () => {
    const expected = JSON.parse(read('softpal-placement.expected.json'));
    assert.deepEqual(await replayReader(replayPlacement(read('softpal.expected'))), expected.visibility);
  });
