/* SPDX-License-Identifier: GPL-3.0-or-later */
/* UI-only real MP4 decode evidence, with no installer host, mock install state, download, or native window. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'playwright-core');
const repo = path.resolve(__dirname, '../..'), ui = path.join(repo, 'setup/ui-web');
const ownerRoot = 'H:/MeguLit-Work/night-1423/installer-owner-test', out = path.join(ownerRoot, 'log/animation-ui-only');
async function main() {
  for (const drive of ['C:/','E:/','H:/']) { const s = fs.statfsSync(drive); assert.ok(s.bavail * s.bsize >= 10 * 2 ** 30, `low disk ${drive}`); }
  assert.ok(os.freemem() >= 4 * 2 ** 30, 'low memory');
  fs.mkdirSync(out, { recursive: true });
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.mp4':'video/mp4', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
  const server = http.createServer((req, res) => {
    try {
      const file = path.resolve(ui, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(ui + path.sep) || req.method !== 'GET') { res.writeHead(403); return res.end(); }
      const size = fs.statSync(file).size, range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      const start = range ? +range[1] : 0, end = range && range[2] ? Math.min(+range[2], size - 1) : size - 1;
      if (start > end) { res.writeHead(416); return res.end(); }
      res.writeHead(range ? 206 : 200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Content-Length':end - start + 1, 'Accept-Ranges':'bytes', ...(range ? { 'Content-Range':`bytes ${start}-${end}/${size}` } : {}) });
      fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const evidence = { scope:'UI-only, real repository MP4s; no setup host, install, or download attempted', pageErrors:[], frames:[], screenshots:[] };
  try {
    browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport:{ width:1000, height:640 } });
    page.on('pageerror', error => evidence.pageErrors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?lang=zh`, { waitUntil:'domcontentloaded' });
    await page.evaluate(() => document.documentElement.classList.add('native'));
    async function capture(id) {
      await page.waitForFunction(id => window.__playerFrame?.id === id && window.__playerFrame.frame > 1 && !window.Player.state.dead, id, { timeout:20000 });
      const frame = await page.evaluate(() => ({ frame:window.__playerFrame, verdict:window.Player.verdict(), video:[...document.querySelectorAll('video.on')].map(v => ({ time:v.currentTime, width:v.videoWidth, height:v.videoHeight, error:v.error?.code || null })) }));
      evidence.frames.push(frame); const file = path.join(out, `ui-only-${id}.png`);
      await page.screenshot({ path:file }); evidence.screenshots.push(file);
    }
    await capture('intro'); await capture('welcome');
    await page.evaluate(() => { void Scene.goTo('loc'); }); await capture('loc');
    evidence.playerLog = await page.evaluate(() => Player.log.filter(x => x.k !== 'want').slice(-20));
    assert.deepEqual(evidence.pageErrors, []);
    assert.ok(evidence.frames.every(x => x.verdict.result === 'ok'));
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    evidence.browserClosed = true;
    fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify({ frames:evidence.frames.length, pageErrors:evidence.pageErrors.length, output:out, browserClosed:true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
