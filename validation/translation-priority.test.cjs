// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: flush } = require('node:timers/promises');
const { translateFree } = require('../core/translate.cjs');
const { createTranslationService } = require('../core/providers.cjs');
const { Reader } = require('../services/reader.cjs');
const { ahead } = require('../services/script-prefetch.cjs');

const google = 'translate.googleapis.com';
const microsoft = 'edge.microsoft.com';
const web = 'translate.google.com';
const gpt = 'api.openai.com';

function transport(t, status = () => 200, latency = () => 0) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  const start = Date.now(), calls = [];
  const fetcher = async (url, { body }) => {
    const host = new URL(url).hostname;
    const text = host === microsoft ? JSON.parse(body)[0]
      : host === gpt ? JSON.parse(body).messages.at(-1).content : new URLSearchParams(body).get('q');
    calls.push({ host, text, at: Date.now() - start });
    const code = status(host, text);
    const delay = latency(host);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const translated = '译文 ' + text;
    return {
      ok: code === 200,
      status: code,
      headers: new Headers({ 'retry-after': '120' }),
      json: async () => host === microsoft ? [{ translations: [{ text: translated }] }]
        : host === gpt ? { choices: [{ message: { content: translated } }] } : [[[translated]]],
    };
  };
  return {
    fetcher, calls,
    async tick(ms) {
      t.mock.timers.tick(ms);
      await flush();
    },
  };
}

function readerFixture(fetcher, provider) {
  const events = [];
  const reader = new Reader({ root: '', folder: '', libraryOnly: () => false, emit: (_event, data) => events.push(data) });
  reader.prefs = () => ({ provider, scriptTranslation: false, contextEnabled: false });
  reader.localReady = async () => {};
  reader.loadKeys = () => {};
  reader.translation = createTranslationService(fetcher, provider === 'gpt' ? 'offline-key' : '');
  reader.scriptPrefetch = { service: createTranslationService(fetcher), keysAt: Date.now() };
  return { reader, events };
}

test('Google gives visible dialogue the next free slot ahead of prefetch and old backfill', async t => {
  const { fetcher, calls, tick } = transport(t);
  const { reader, events } = readerFixture(fetcher, 'google');
  const first = '準備はもう済ませた。', future = '明日は遠くへ旅に出よう。';
  const old = '昨日の雨は激しかったね。', visible = 'ここはどこなんだろう？';
  const originalText = { fill: new Map(), upcoming: () => [{ text: future, context: [] }] };
  reader.gal = { hooks: { originalText } };
  await reader.message({ id: 1, text: first });
  const prefetch = ahead(reader);
  await flush();
  await reader.message({ type: 'translateGuard', text: old });
  const dialogue = reader.message({ id: 2, text: visible });
  await flush();
  await tick(349);
  assert.deepEqual(calls, [{ host: google, text: first, at: 0 }]);
  await tick(1);
  assert.deepEqual(calls.at(-1), { host: google, text: visible, at: 350 });
  assert.equal((await dialogue).replies[0].args[1], '译文 ' + visible);
  await tick(350);
  await tick(350);
  assert.deepEqual(calls.map(call => call.text), [first, visible, future, old]);
  assert.equal(await prefetch, 1);
  assert.equal(originalText.fill.get(future), '译文 ' + future);
  assert.ok(events.some(event => event.method === 'deliverBackfill' && event.args[0] === old && event.args[1] === '译文 ' + old));
  assert.equal((await reader.message({ id: 3, text: future })).replies[0].args[1], '译文 ' + future);
  assert.equal(calls.length, 4);
});

test('a visible guard can take the next slot even if the original request was lost', async t => {
  const { fetcher, calls, tick } = transport(t);
  const { reader, events } = readerFixture(fetcher, 'google');
  await reader.message({ id: 1, text: '準備はもう済ませた。' });
  await reader.message({ type: 'translateGuard', text: '昨日の雨は激しかったね。' });
  await flush();
  const visible = 'ここはどこなんだろう？';
  await reader.message({ type: 'translateGuard', text: visible, visibleSerial: 2 });
  await tick(350);
  assert.equal(calls.at(-1).text, visible);
  assert.ok(events.some(event => event.method === 'deliverBackfill' && event.args[0] === visible));
  await tick(350);
  assert.equal(calls.at(-1).text, '昨日の雨は激しかったね。');
});

test('the visible page row goes first even when another row requests later', async t => {
  const { fetcher, calls, tick } = transport(t);
  const { reader } = readerFixture(fetcher, 'google');
  const warm = '準備はもう済ませた。', older = '昨日の雨は激しかったね。';
  const pageKey = 'chapter:1', earlierRow = '雨上がりの夜は静かだった。', visible = 'ここはどこなんだろう？';
  await reader.message({ id: 1, text: warm });
  await reader.message({ type: 'translateGuard', text: older });
  await reader.message({ type: 'pageTranslationScope', key: pageKey });
  await reader.message({ type: 'pageTranslationCurrent', key: pageKey, currentId: 2, revision: 1 });
  const current = reader.message({ id: 2, pageKey, text: visible });
  const earlier = reader.message({ id: 3, pageKey, text: earlierRow });
  await flush();
  await tick(350);
  assert.equal(calls.at(-1).text, visible);
  assert.equal((await current).replies[0].args[1], '译文 ' + visible);
  await tick(350);
  await tick(350);
  assert.equal((await earlier).replies[0].args[1], '译文 ' + earlierRow);
  assert.deepEqual(calls.map(call => call.text), [warm, visible, older, earlierRow]);
});

test('late page priorities cannot revive an old page or replace a newer visible row', async t => {
  const { fetcher, calls, tick } = transport(t);
  const { reader } = readerFixture(fetcher, 'google');
  const warm = '準備はもう済ませた。', old = '昨日の雨は激しかったね。';
  const past = '雨上がりの夜は静かだった。', visible = 'ここはどこなんだろう？';
  const scope = key => reader.message({ type: 'pageTranslationScope', key });
  const prioritize = (key, currentId, revision) => reader.message({ type: 'pageTranslationCurrent', key, currentId, revision });

  await reader.message({ id: 1, text: warm });
  await scope('page-a');
  const oldPage = reader.message({ id: 2, pageKey: 'page-a', text: old });
  await flush();
  await prioritize('page-b', 4, 2);
  await scope('page-b');
  const earlier = reader.message({ id: 3, pageKey: 'page-b', text: past });
  const current = reader.message({ id: 4, pageKey: 'page-b', text: visible });
  await prioritize('page-b', 3, 1);
  await prioritize('page-a', 2, 1);
  await tick(350);
  assert.deepEqual(calls.map(call => call.text), [warm, visible]);
  assert.equal((await current).replies[0].args[1], '译文 ' + visible);
  await tick(350);
  assert.equal((await earlier).replies[0].args[1], '译文 ' + past);
  assert.equal((await oldPage).replies[0].args[1], '');
  assert.deepEqual(calls.map(call => call.text), [warm, visible, past]);
});

test('a delayed guard for an old visit cannot remove the current visit’s priority', async t => {
  const { fetcher, calls, tick } = transport(t);
  const { reader } = readerFixture(fetcher, 'google');
  const repeated = 'ここはどこなんだろう？';
  await reader.message({ id: 1, text: '準備はもう済ませた。' });
  await reader.message({ type: 'translateGuard', text: '昨日の雨は激しかったね。' });
  const first = reader.message({ id: 2, text: repeated });
  await flush();
  const revisit = reader.message({ id: 3, text: repeated });
  await reader.message({ type: 'translateGuard', text: repeated, visibleSerial: 2 });
  await flush();
  await tick(350);
  assert.equal(calls.at(-1).text, repeated);
  assert.equal((await revisit).replies[0].args[1], '译文 ' + repeated);
  await tick(350);
  await first;
  assert.equal(calls.filter(call => call.text === repeated).length, 1);
});

test('Microsoft queued behind a running API call stays canceled after the reader moves on', async t => {
  const { fetcher, calls, tick } = transport(t, () => 200, host => host === gpt ? 3000 : 350);
  const { reader } = readerFixture(fetcher, 'gpt');
  const text = 'ここはどこなんだろう？', next = '遠くへ旅に出よう。';
  reader.embedCached(next, '缓存译文', { language: 'zh', source: 'script' });
  const first = reader.message({ id: 1, text });
  await flush();
  await tick(2500);
  await tick(50);
  assert.equal((await reader.message({ id: 2, text: next })).replies[0].args[1], '缓存译文');
  await tick(450);
  await tick(350);
  assert.equal((await first).replies[0].args[1], '译文 ' + text);
  assert.deepEqual(calls, [{ host: gpt, text, at: 0 }]);
});

test('a visible request moves its queued duplicate ahead without a second HTTP request', async t => {
  const { fetcher, calls, tick } = transport(t);
  const run = (text, options) => translateFree(text, { fetcher, ...options });
  await run('warm');
  const old = run('old');
  const future = run('same line');
  await flush();
  const visible = run('same line', { foreground: () => true });
  assert.equal(visible, future);
  await tick(350);
  assert.deepEqual(calls.map(call => call.text), ['warm', 'same line']);
  assert.equal(await visible, '译文 same line');
  await tick(350);
  await old;
  assert.equal(await run('same line'), '译文 same line');
  assert.deepEqual(calls.map(call => call.text), ['warm', 'same line', 'old']);
});

test('a promoted prefetch returns to background when the reader moves on', async t => {
  const { fetcher, calls, tick } = transport(t);
  const run = (text, options) => translateFree(text, { fetcher, ...options });
  await run('warm');
  const prefetch = run('previous');
  let onPrevious = true;
  const prioritise = () => onPrevious;
  assert.equal(run('previous', { foreground: prioritise, isCurrent: prioritise }), prefetch);
  await flush();
  onPrevious = false;
  const obsolete = assert.rejects(run('skipped', { foreground: () => true, isCurrent: prioritise }), /Superseded sentence/);
  const visible = run('visible', { foreground: () => true });
  await tick(350);
  assert.equal(calls.at(-1).text, 'visible');
  await visible;
  await tick(350);
  await prefetch;
  await obsolete;
  assert.deepEqual(calls.map(call => call.text), ['warm', 'visible', 'previous']);
});

test('a new visit to the same sentence can reuse the queued request after the first visit expires', async t => {
  const { fetcher, calls, tick } = transport(t);
  const run = (text, current) => translateFree(text, { fetcher, isCurrent: current, foreground: current });
  await run('warm', () => true);
  let firstVisit = true;
  const first = run('repeated', () => firstVisit);
  first.catch(() => {});
  await flush();
  firstVisit = false;
  const second = run('repeated', () => true);
  assert.equal(first, second);
  await tick(350);
  assert.equal(await second, '译文 repeated');
  assert.deepEqual(calls.map(call => call.text), ['warm', 'repeated']);
});

test('foreground can pass a waiting fallback while Google retains its retry-after cooldown', async t => {
  const { fetcher, calls, tick } = transport(t, (host, text) => host === google && text === 'background' ? 429 : 200);
  const run = (text, options) => translateFree(text, { fetcher, ...options });
  const background = run('background');
  await flush();
  const visible = run('visible', { foreground: () => true });
  await tick(349);
  assert.equal(calls.length, 1);
  await tick(1);
  assert.deepEqual(calls.at(-1), { host: microsoft, text: 'visible', at: 350 });
  assert.equal(await visible, '译文 visible');
  await tick(350);
  assert.equal(await background, '译文 background');
  await tick(119_299);
  assert.equal(await run('still cooling'), '译文 still cooling');
  assert.deepEqual(calls.at(-1), { host: microsoft, text: 'still cooling', at: 119_999 });
  await tick(1);
  const ready = run('cooled down');
  await flush();
  await tick(349);
  assert.equal(await ready, '译文 cooled down');
  assert.deepEqual(calls.at(-1), { host: google, text: 'cooled down', at: 120_349 });
});

test('google-web remains the last fallback and a queued abort costs no HTTP request', async t => {
  const { fetcher, calls, tick } = transport(t, host => host === web ? 200 : 403);
  const started = translateFree('fallback', { fetcher });
  await flush();
  const abort = new AbortController();
  const canceled = assert.rejects(translateFree('canceled', { fetcher, signal: abort.signal }), { name: 'AbortError' });
  abort.abort();
  await tick(350);
  await tick(350);
  assert.equal(await started, '译文 fallback');
  await canceled;
  assert.deepEqual(calls, [
    { host: google, text: 'fallback', at: 0 },
    { host: microsoft, text: 'fallback', at: 350 },
    { host: web, text: 'fallback', at: 700 },
  ]);
});
