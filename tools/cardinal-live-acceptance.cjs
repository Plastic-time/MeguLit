// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const Runner = require('../services/cardinal-trusted-runner.cjs');
const Release = require('../core/torch-release.cjs');
const Pairs = require('../core/cardinal/display-pairs.cjs');
const { Conn } = require('../services/cardinal/cdp.cjs');
const reader = 'http://tauri.localhost/reader/index.html';
const snapshot = String(() => {
  const status = window.__tomoyoChinese?.tomeHookStatus();
  const jp = document.querySelector('.tomoyo-hook-reader .sentence-text');
  const cn = document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output');
  const visible = el => el && el.getClientRects().length && el.checkVisibility();
  if (window.__TAURI_INTERNALS__ && window.__TOME_READER_READY__ && status?.processAttached &&
      visible(jp) && visible(cn)) return [jp.__tomeHookText, cn.textContent, String(status.gameProcessId), String(status.gameStarted)];
});
function check(report, challenge, samples) {
  assert.ok(report && report.challenge === challenge, 'wrong capture challenge');
  assert.ok(report.domAcks?.length, 'empty report');
  assert.ok(samples.some(s => s.target === report.readerTargetId && s.pid === String(report.process?.pid) && s.birth === report.process?.birth && report.domAcks.some(a =>
    s.source === a.sourceKey && s.translation === Pairs.normalize(a.translation))), 'no matching live Reader');
}
function observer(port) {
  const origin = 'http://127.0.0.1:' + port;
  let stopped = true, task, samples = [];
  async function poll() {
    while (!stopped) {
      let conn;
      try {
        const res = await fetch(origin + '/json/list', {signal: AbortSignal.timeout(600), redirect:'error'});
        const pages = (await res.json()).filter(p => p.type === 'page' && p.url.split(/[?#]/)[0] === reader);
        if (pages.length === 1) {
          const p = pages[0], ws = new URL(p.webSocketDebuggerUrl);
          assert.equal(ws.origin, origin.replace('http:', 'ws:'));
          assert.equal(ws.pathname, '/devtools/page/' + p.id);
          conn = new Conn(ws.href, {connectMs:500,commandMs:600});
          await conn.ready;
          const response = await conn.send('Runtime.evaluate',{expression:'(' + snapshot + ')()', returnByValue:true});
          const pair = response.result?.value;
          if (Array.isArray(pair) && pair.every(x => typeof x === 'string' && x.trim()))
            samples.push({target:p.id,pid:pair[2],birth:pair[3],source:Pairs.key(pair[0]),translation:Pairs.normalize(pair[1])});
        }
      } catch { /* Target discovery can race WebView startup or shutdown */ }
      finally { conn?.close(); }
      await delay(180);
    }
  }
  async function stop() { stopped = true; await task; }
  return {
    async start() {
      const net = require('node:net');
      await new Promise((resolve,reject) => {
        const probe = net.createServer();
        probe.once('error',reject);
        probe.listen(port,'127.0.0.1',() => probe.close(resolve));
      });
      samples = []; stopped = false; task = poll();
    },
    async exited(p) {
      await stop();
      assert.ok(Number.isSafeInteger(p?.pid) && p.pid > 0 && /^[1-9]\d*$/.test(p.birth));
      const ps = '$ErrorActionPreference="Stop"; try {$p=[Diagnostics.Process]::GetProcessById(' + p.pid +
        ')} catch [ArgumentException] {exit 0}; if ($p.StartTime.ToUniversalTime().Ticks.ToString() -eq "' + p.birth + '"){exit 3}';
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true,timeout:5000});
    },
    check(report, challenge) { try { check(report, challenge, samples); } catch (error) { throw Object.assign(error,{code:'TRUSTED_READER_WITNESS'}); } },
    stop
  };
}
async function main([requestPath, policyPath, portArg, ...signArgs]) {
  assert.ok(requestPath && policyPath && portArg,'expected request.json policy.json port [reviewer flags]');
  const port = Number(portArg);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  const {signing,positional} = require('./cardinal-trusted-runner.cjs').argumentsFor(signArgs);
  assert.equal(positional.length,0);
  const request = Runner.readJSON(requestPath,Runner.MAX_REQUEST), policy = Runner.readJSON(policyPath);
  assert.equal(policy.slots,1,'acceptance requires the shared single-slot policy');
  const watch = observer(port), abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT',cancel); process.once('SIGTERM',cancel);
  try {
    const result = await Runner.runHost(request,policy,{signing,signal:abort.signal,observer:watch});
    const dir = fs.mkdtempSync(path.join(policy.stateRoot,'acceptance-'));
    console.log(dir);
    const {review,...status} = result;
    Runner.atomic(path.join(dir,'status.json'),status);
    assert.deepEqual(Runner.readJSON(path.join(dir,'status.json')),status);
    assert.equal(status.state,'reviewed',status.reason);
    const file = path.join(dir,'review.json');
    Runner.atomic(file,review);
    const stored = Runner.readJSON(file);
    Release.reviewShape(stored);
    assert.ok(await Release.verify(stored,policy.reviewKeys));
    assert.equal(stored.candidateHash,await Release.hash(request.candidate));
    assert.equal(stored.lines,status.summary.lines);
    assert.equal(stored.reporters,3);
    console.log('verified reviewer',stored.signature.keyId);
  } finally { await watch.stop(); process.off('SIGINT',cancel); process.off('SIGTERM',cancel); }
}
module.exports = {check};
if (require.main === module) main(process.argv.slice(2)).catch(e => {console.error(e.message);process.exitCode=2;});
