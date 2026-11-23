/* End-to-end check of the REAL setup entry (setup\setup-runtime.ps1 + web skin) on HidDesk's hidden desktop, driven over the WebView2
   DevTools port with genuine mouse events. Test mode keeps it off the real registry/Start menu/Desktop (MEGULIT_SETUP_TEST).
   node tools/setup-web-test.cjs <stage> <srcRoot> <workDir>
   stages: install (location -> Install -> done -> launch), close-resume, alt-f4, fail-fallback is covered by validation/setup-flow.test.cjs (MEGULIT_SETUP_WEB_TEST=...) */
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const [stage, SRC, WORK] = [process.argv[2] || 'install', path.resolve(process.argv[3] || 'E:/try/src/MeguLit'), path.resolve(process.argv[4] || 'E:/try')];
const HID = process.env.MEGULIT_HIDDESK || 'E:/Apps/megu-testbed/HidDesk.exe', DST = path.join(WORK, 'dst', 'MeguLit'), STAGE = path.join(WORK, 'stage'), LOG = path.join(WORK, 'setup-test.log'), OUT = path.join(WORK, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const results = []; const ok = (n, p, i) => { results.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + (typeof i === 'string' ? i : JSON.stringify(i)) : '')); };
const events = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^\uFEFF/, ''))); } catch (e) { return []; } };
const waitFor = async (fn, ms, what) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(400); } throw new Error('timeout: ' + what); };
function launch(extraEnv) {
  const cmd = path.join(WORK, 'run-setup.cmd'); const env = Object.assign({ MEGULIT_SETUP_TEST: LOG, MEGULIT_SETUP_WEB: '1', MEGULIT_SETUP_WEB_HOLD: '1', MEGULIT_SETUP_TARGET: DST, MEGULIT_SETUP_STAGING: STAGE, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9333' }, extraEnv || {});
  fs.writeFileSync(cmd, '@echo off\r\n' + Object.entries(env).map(([k, v]) => `set "${k}=${v}"`).join('\r\n') + `\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "${SRC}\\setup\\setup-runtime.ps1" -Root "${SRC}"\r\necho EXIT %ERRORLEVEL% > "${path.join(WORK, 'exit.txt')}"\r\n`);
  try { fs.rmSync(path.join(WORK, 'exit.txt')); } catch (e) { /* none */ } try { fs.rmSync(LOG); } catch (e) { /* none */ }
  cp.spawn(HID, ['run', cmd], { stdio: 'ignore', detached: true }).unref();
}
async function connect() {
  let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get('http://127.0.0.1:9333/json/list')); if (list.find((x) => x.type === 'page' && /megulit-setup/.test(x.url))) break; } catch (e) { /* wait */ } await sleep(500); }
  const t = list.find((x) => x.type === 'page' && /megulit-setup/.test(x.url)); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { res({}); } });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  const shot = async (n) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); if (r.result) fs.writeFileSync(path.join(OUT, stage + '-' + n + '.png'), Buffer.from(r.result.data, 'base64')); };
  const click = async (sel) => { for (let i = 0; i < 200; i++) { const h = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;var b=e.getBoundingClientRect();var t=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return !!t&&(t===e||e.contains(t)||t.contains(e))})()`); if (h) break; await sleep(300); }
    const r = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`); for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type: t, x: r.x, y: r.y, button: 'left', buttons: t === 'mousePressed' ? 1 : 0, clickCount: 1 }); await sleep(250); return true; };
  const state = () => ev('fetch("/api/state").then(function(r){return r.json()})');
  return { ws, ev, shot, click, state };
}
const dirStat = (root, skip) => { let n = 0, b = 0; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (skip && skip(p)) continue; if (e.isDirectory()) w(p); else { n++; b += fs.statSync(p).size; } } })(root); return { files: n, bytes: b }; };
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'setup', 'runtime.json'), 'utf8').replace(/^\uFEFF/, ''));
(async () => {
  if (stage === 'install') {
    for (const d of [DST, STAGE]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* none */ }
    launch(); const c = await connect(); await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 60000, 'location screen'); ok('new interface is up in the real entry', events().some((e) => e.kind === 'web' && /web skin active/.test(e.text)), events().filter((e) => e.kind === 'web').map((e) => e.text)[0]);
    const p0 = await c.ev('document.getElementById("path").value'); ok('default location comes from the real setup (the test target)', path.resolve(p0).toLowerCase() === DST.toLowerCase(), p0); await sleep(1500); await c.shot('1-location');
    const t0 = Date.now(); await c.click('#install'); await waitFor(() => events().some((e) => e.kind === 'confirmed'), 60000, 'confirmed'); ok('Install press reaches the real logic', true, events().find((e) => e.kind === 'confirmed'));
    let shot = false; await waitFor(async () => { const s = await c.state(); if (!shot && s && s.got > 100e6) { shot = true; await c.shot('2-downloading'); console.log('mid', JSON.stringify({ phase: s.phase, got: Math.round(s.got / 1048576), speed: Math.round(s.speed / 1048576), src: s.src, done: (s.st.match(/2/g) || []).length, running: (s.st.match(/1/g) || []).length, n: s.n })); } return events().some((e) => e.kind === 'installed'); }, 600000, 'installed');
    ok('real install finished', true, ((Date.now() - t0) / 1000).toFixed(0) + ' s'); await sleep(7000); await c.shot('3-done'); ok('done screen shown and held', (await c.ev('Scene.section')) === 'done' && !fs.existsSync(path.join(WORK, 'exit.txt')));
    const rt = dirStat(path.join(DST, 'runtime')), want = ['base', 'reading', 'voice'].reduce((a, k) => a + manifest.packs[k].unpacked, 0); ok('runtime matches the declared unpacked size', rt.bytes === want, { installed: rt.bytes, declared: want, files: rt.files });
    ok('MeguLit.exe was copied to the chosen folder', fs.existsSync(path.join(DST, 'MeguLit.exe')));
    await c.click('#launch'); await waitFor(() => fs.existsSync(path.join(WORK, 'exit.txt')), 30000, 'script exit'); const ex = fs.readFileSync(path.join(WORK, 'exit.txt'), 'utf16le').trim() || fs.readFileSync(path.join(WORK, 'exit.txt'), 'utf8').trim(); ok('"开读" lets the setup finish (exit 3 = moved to the chosen folder)', /EXIT\s+3/.test(ex.replace(/\0/g, '')) || /EXIT\s+3/.test(fs.readFileSync(path.join(WORK, 'exit.txt'), 'utf8')), ex);
  }
  if (stage === 'close-resume') {
    for (const d of [DST, STAGE]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* none */ }
    launch(); let c = await connect(); await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 60000, 'location screen'); await sleep(800);
    await waitFor(async () => { const s = await c.state(); return s && s.got > 150e6; }, 120000, '150 MB'); await c.click('#btnClose'); await sleep(900); ok('close during download asks first', (await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility')) === 'visible'); await c.shot('1-confirm');
    await c.click('#stay'); await waitFor(async () => (await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility')) === 'hidden', 20000, 'confirm hides'); ok('"等它到" keeps going', true);
    const got1 = (await c.state()).got; await c.click('#btnClose'); await sleep(600); await c.click('#leave'); await waitFor(() => fs.existsSync(path.join(WORK, 'exit.txt')), 30000, 'script exit after close'); ok('closing the window ends the setup (not done = exit 1)', /EXIT\s+1/.test(fs.readFileSync(path.join(WORK, 'exit.txt'), 'utf8')), 'closed at ' + Math.round(got1 / 1048576) + ' MB');
    launch(); c = await connect(); await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 60000, 'location screen 2'); const s0 = await waitFor(async () => { const s = await c.state(); return s && s.got > 0 ? s : null; }, 60000, 'resumed'); ok('reopening resumes from the staged files', s0.got >= got1 * 0.8, Math.round(s0.got / 1048576) + ' MB at first poll');
    await c.click('#install'); await waitFor(() => events().some((e) => e.kind === 'installed'), 600000, 'installed'); await sleep(3000); ok('finishes after resume', fs.existsSync(path.join(DST, 'runtime', 'node.exe')) || fs.existsSync(path.join(DST, 'runtime')));
    await c.click('#launch'); await waitFor(() => fs.existsSync(path.join(WORK, 'exit.txt')), 30000, 'exit');
  }
  if (stage === 'controls' || stage === 'lowspace') {
    const dpi = +(process.argv[5] || 96), factor = dpi / 96, tag = stage + '-' + dpi;
    for (const d of [DST, STAGE]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* none */ }
    const env = { MEGULIT_SETUP_WEB_DPI: String(dpi), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9333' + (factor !== 1 ? ' --force-device-scale-factor=' + factor : '') }; if (stage === 'lowspace') env.MEGULIT_SETUP_FREE = '1000000000';
    launch(env); const c = await connect(); await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 60000, 'location screen'); await sleep(2500);
    const pid = +cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', "(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.ProcessId -ne $PID -and $_.CommandLine -match '-File .*setup-runtime.ps1' } | Sort-Object CreationDate -Descending | Select-Object -First 1).ProcessId"], { encoding: 'utf8' }).trim();
    const hwnd = () => { const o = cp.execFileSync(HID, ['list', String(pid)], { encoding: 'utf8' }); const l = o.split('\n').find((x) => /vis=True/.test(x) && / (1000|1500|1940)x/.test(x)); return l ? l.split(' ')[0] : ''; };
    const logs = () => events().filter((e) => e.kind === 'web').map((e) => e.text);
    /* window handles only exist on the hidden desktop: the message has to be posted from a process that runs there too */
    const post = (h, m, w) => {
      const f = path.join(WORK, 'post-msg.ps1'), res = path.join(WORK, 'post-result.txt');
      fs.writeFileSync(f, "Add-Type -Name P -Namespace A -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);'\r\n[A.P]::PostMessage([IntPtr]" + h + "," + m + ",[IntPtr]" + w + ",[IntPtr]0) | Out-File '" + res + "'\r\n");
      try { fs.rmSync(res); } catch (e) { /* none */ }
      cp.spawn(HID, ['run', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f], { stdio: 'ignore', detached: true }).unref();
    };
    const dims = await c.ev('JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})'); ok(`${dpi} dpi: CSS viewport stays 1000x640 and the device ratio is ${factor}`, /"w":1000,"h":640/.test(dims) && Math.abs(JSON.parse(dims).dpr - factor) < 0.01, dims); await c.shot(tag + '-1-location');
    ok('skin window enabled and in the taskbar; the control surface is not', logs().some((t) => /enabled=True visible=True taskbar: skin=True classic=False/.test(t)), logs().filter((t) => /enabled=/.test(t))[0]);
    if (stage === 'lowspace') {
      const txt = await c.ev('document.getElementById("ui-loc").innerText'); ok('not enough space is said on the page', /装不下|只剩/.test(txt), txt.split('\n').filter((l) => /装不下|只剩/.test(l))[0]); await c.shot(tag + '-2-lowspace');
      await c.click('#btnClose'); await sleep(700); await c.click('#leave'); await waitFor(() => fs.existsSync(path.join(WORK, 'exit.txt')), 30000, 'exit');
    } else {
      const th0 = await c.ev('document.documentElement.getAttribute("data-theme")'); await c.click('#btnTheme'); await waitFor(async () => (await c.ev('document.documentElement.getAttribute("data-theme")')) !== th0, 15000, 'theme change'); await sleep(1500); await c.shot(tag + '-3-dark'); ok('theme switch to dark by real click', true); await c.click('#btnTheme'); await sleep(1500);
      await c.ev('(function(){var e=document.getElementById("path");e.value="Q:\\\\MeguLit";e.dispatchEvent(new Event("input",{bubbles:true}))})()'); await sleep(1500);
      const txt2 = await c.ev('document.getElementById("ui-loc").innerText'); ok('unwritable location is refused with a message', /写不进去|不能写/.test(txt2), txt2.split('\n').filter((l) => /写不进去|不能写/.test(l))[0]); await c.shot(tag + '-4-unwritable');
      await c.ev(`(function(){var e=document.getElementById("path");e.value=${JSON.stringify(DST)};e.dispatchEvent(new Event("input",{bubbles:true}))})()`); await sleep(800);
      await c.click('#drag'); await sleep(900); ok('drag: the system move loop starts', logs().some((t) => /drag: system move loop starts/.test(t)));
      try { cp.execFileSync(HID, ['key', String(pid), '1B']); } catch (e) { /* ignore */ } await sleep(900); ok('drag: the window answers again after the loop ends', logs().some((t) => /drag: loop ended/.test(t)), logs().filter((t) => /loop ended/.test(t))[0]);
      await c.click('#btnMin'); await sleep(900); ok('minimize', logs().some((t) => /minimized: state=Minimized/.test(t))); fs.writeFileSync(LOG + '.restore', 'x'); await waitFor(async () => logs().some((t) => /restored: state=Normal/.test(t)), 8000, 'restore').catch(() => null); ok('restore', logs().some((t) => /restored: state=Normal/.test(t)));
      await waitFor(async () => { const s = await c.state(); return s && s.got > 20e6; }, 90000, 'some download'); const h = hwnd(); ok('window handle found for Alt+F4', !!h, h);
      post(h, '0x112', '0xF060'); await sleep(1500); ok('Alt+F4 during the download opens the "still downloading" confirm instead of closing', (await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility')) === 'visible' && !fs.existsSync(path.join(WORK, 'exit.txt'))); await c.shot(tag + '-5-altf4');
      await c.click('#stay'); await waitFor(async () => (await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility')) === 'hidden', 20000, 'confirm hides');
      post(h, '0x112', '0xF060'); await sleep(1200); await c.click('#leave'); await waitFor(() => fs.existsSync(path.join(WORK, 'exit.txt')), 30000, 'exit after Alt+F4 + confirm'); ok('Alt+F4, then "回头再来", ends the setup', true);
    }
  }
  if (stage === 'formal') {
    const REAL = 'E:\\try\\real\\MeguLit', STAGE2 = 'E:\\try\\stage-real';
    const ps = (mode) => cp.execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'E:\\try\\formal-backup.ps1', '-Mode', mode], { encoding: 'utf8' });
    for (const combo of [{ desk: true, menu: false }, { desk: false, menu: true }].filter((x, i) => !process.env.COMBO || +process.env.COMBO === i + 1)) {
      const tag = 'desk' + (combo.desk ? 'ON' : 'OFF') + '-menu' + (combo.menu ? 'ON' : 'OFF');
      for (const d of [REAL, STAGE2]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* none */ }
      launch({ MEGULIT_SETUP_TEST: '', MEGULIT_SETUP_TARGET: REAL, MEGULIT_SETUP_STAGING: STAGE2 }); const c = await connect();
      await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 60000, 'location screen'); await sleep(3500);
      for (const [sel, want] of [['#swDesk', combo.desk], ['#swMenu', combo.menu]]) { let cur = (await c.ev(`document.querySelector("${sel}").getAttribute("aria-checked")`)) === 'true'; for (let n = 0; n < 4 && cur !== want; n++) { await c.click(sel); await sleep(1200); cur = (await c.ev(`document.querySelector("${sel}").getAttribute("aria-checked")`)) === 'true'; } }
      const sw = await c.ev('document.getElementById("swDesk").getAttribute("aria-checked")+"/"+document.getElementById("swMenu").getAttribute("aria-checked")'); ok(tag + ': switches set on the page (desktop/menu)', sw === `${combo.desk}/${combo.menu}`, sw);
      await c.click('#install'); await waitFor(async () => (await c.ev('Scene.section')) === 'done', 600000, 'done screen'); await sleep(3000); await c.shot(tag + '-done'); ok(tag + ': real (non-test) install reached the done screen', true);
      await c.click('#launch'); await waitFor(() => fs.existsSync(path.join(WORK, 'exit.txt')), 60000, 'script exit'); await sleep(1500);
      const st = ps('state'); console.log(st);
      const lnk = st.split('\n').filter((l) => l.startsWith('LNK ')).map((l) => JSON.parse(l.slice(4)));
      const desk = lnk.find((l) => l.where === 'Desktop' && l.name === 'MeguLit.lnk'), menu = lnk.find((l) => l.where === 'Programs' && l.name === 'MeguLit.lnk'), unl = lnk.find((l) => l.where === 'Programs' && /Uninstall MeguLit/.test(l.name));
      ok(tag + ': desktop shortcut ' + (combo.desk ? 'created and points to the new folder' : 'not created'), combo.desk ? (desk && desk.target.toLowerCase() === (REAL + '\\MeguLit.exe').toLowerCase()) : !desk, desk && desk.target);
      ok(tag + ': start-menu shortcut ' + (combo.menu ? 'created and points to the new folder' : 'not created'), combo.menu ? (menu && menu.target.toLowerCase() === (REAL + '\\MeguLit.exe').toLowerCase()) : !menu, menu && menu.target);
      ok(tag + ': uninstall shortcut only with the start-menu entry', combo.menu ? !!(unl && unl.args.includes(REAL)) : !unl, unl && unl.args);
      const reg = JSON.parse(st.split('\n').find((l) => l.startsWith('REG ')).slice(4)); ok(tag + ': uninstall registry entry written with the new location', reg.InstallLocation === REAL && /uninstall\.ps1/.test(reg.UninstallString) && reg.UninstallString.includes(REAL) && reg.DisplayName === 'MeguLit' && !!reg.DisplayVersion, { InstallLocation: reg.InstallLocation, DisplayVersion: reg.DisplayVersion });
      ok(tag + ': files installed', fs.existsSync(path.join(REAL, 'MeguLit.exe')) && fs.existsSync(path.join(REAL, 'runtime', 'node.exe')) && fs.existsSync(path.join(REAL, 'setup', 'uninstall.ps1')));
      try { cp.execFileSync('taskkill', ['/F', '/IM', 'whoami.exe'], { stdio: 'ignore' }); } catch (e) { /* none */ }
      if (combo.menu) { try { const dry = cp.execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(REAL, 'setup', 'uninstall.ps1'), '-Root', REAL, '-DryRun'], { encoding: 'utf8', timeout: 60000 }); ok(tag + ': uninstall.ps1 -DryRun lists this install (plan printed, nothing changed)', /MeguLit/.test(dry) && fs.existsSync(path.join(REAL, 'MeguLit.exe')), dry.split('\n').slice(0, 6).join(' | ').slice(0, 300)); } catch (e) { ok(tag + ': uninstall.ps1 -DryRun', false, String(e).slice(0, 200)); } }
      console.log('restore: ' + ps('restore').replace(/\r?\n/g, ' | '));
    }
  }
  fs.writeFileSync(path.join(WORK, stage + '-results.json'), JSON.stringify(results, null, 1)); console.log('\n' + results.filter((x) => x.p).length + '/' + results.length + ' passed'); process.exit(results.every((x) => x.p) ? 0 : 2);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
