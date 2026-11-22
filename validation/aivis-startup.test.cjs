// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Services } = require('../core/services.cjs');

// AivisSpeech's own download messages, reduced from the #777 startup trace.
const model = 'https://api.aivis-project.com/v1/aivm-models/22e8ed77-94fe-4ef2-871f-a86f94e9a579/download?model_type=AIVMX';
const rateLimitedDownload = [
 '[2026/11/22 14:45:40.835] INFO:     Downloading AIVMX file from '+model+' (Attempt 3/3)...',
 '[2026/11/22 14:45:45.481] ERROR:    Failed to download AIVMX file from '+model+' after 3 attempts.',
 '[2026/11/22 14:45:45.519] ERROR:    Failed to install default model.',
 "httpx.HTTPStatusError: Client error '429 Too Many Requests' for url '"+model+"'",
].join('\n')+'\n';

function startup(t, engineLog, { oldLog = '', cpuReady = false } = {}) {
 const temp = fs.realpathSync(os.tmpdir());
 const root = fs.mkdtempSync(path.join(temp, 'megulit-aivis-startup-'));
 assert.equal(path.dirname(fs.realpathSync(root)), temp);
 t.after(() => fs.rmSync(root, { recursive: true, force: true }));
 const exe = path.join(root, 'run.exe');
 fs.writeFileSync(exe, '');
 fs.mkdirSync(path.join(root, 'logs'));
 fs.mkdirSync(path.join(root, 'cache'));
 fs.writeFileSync(path.join(root, 'logs', 'speech-engine.log'), oldLog);
 const gpuMarker = path.join(root, 'cache', 'speech-gpu-unavailable');
 const starts = [];
 let ready = false;
 const services = new Services(root, {
  exe, prepare: async () => {}, killTree: async () => {},
  fetch: async () => ({ ok: ready }),
  spawn(_exe, args, options) {
   const child = new EventEmitter();
   starts.push(args.at(-1));
   fs.writeSync(options.stdio[1], engineLog);
   if (cpuReady && args.at(-1) === '--no-use_gpu') ready = true;
   else queueMicrotask(() => child.emit('exit', 1));
   return child;
  },
 });
 return { services, starts, gpuMarker };
}

test('#777: a rate-limited default voice does not retry as CPU or mark GPU unsupported', async t => {
 const { services, starts, gpuMarker } = startup(t, rateLimitedDownload);
 await assert.rejects(services.ensureSpeech(), /默认语音模型下载.*HTTP 429/);
 assert.deepEqual(starts, ['--use_gpu']);
 assert.equal(fs.existsSync(gpuMarker), false);
});

test('a current GPU failure still falls back to CPU when only an old attempt was rate-limited', async t => {
 const { services, starts, gpuMarker } = startup(t, 'CUDA startup failed\n', { oldLog: rateLimitedDownload, cpuReady: true });
 await services.ensureSpeech();
 assert.deepEqual(starts, ['--use_gpu', '--no-use_gpu']);
 assert.equal(fs.existsSync(gpuMarker), true);
});

test('a ready engine keeps running even if it reported a rate-limited voice during startup', async t => {
 const { services, starts, gpuMarker } = startup(t, rateLimitedDownload, { cpuReady: true });
 await services.ensureSpeech(undefined, false);
 assert.deepEqual(starts, ['--no-use_gpu']);
 assert.equal(fs.existsSync(gpuMarker), false);
});
