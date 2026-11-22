'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const fixture = require('./fixtures/engine-sigs/circus-stock-runtime.json');
const audit = require('./helpers/circus-stock-audit.cjs');
const consoleFixture = require('./helpers/circus-stock-console.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function span(name) {
  const item = fixture.spans.find(item => item.name === name);
  const bytes = Buffer.from(item.hex, 'hex');
  assert.equal(bytes.length, item.size);
  assert.equal(sha256(bytes), item.sha256);
  return { ...item, bytes };
}

test('the unchanged stock source matches the fixed Luna source and c3 ordinary registration contract', () => {
  assert.equal(sha256(read(fixture.stockSource.path).trimEnd()), fixture.stockSource.normalizedSha256);
  const c3 = consoleFixture.stockC3();
  assert.match(c3, /hp\.offset = stackoffset\(1\)/);
  assert.match(c3, /hp\.type = USING_STRING;/);
  assert.match(c3, /hp\.filter_fun = filter;/);
  assert.match(c3, /return NewHook\(hp, "Circus2_1"\)/);
  assert.equal((c3.match(/return NewHook/g) || []).length, 1);
  assert.throws(() => consoleFixture.stockC3('not the stock function'), /REGION_CHANGED/);
});

test('the existing x86 detector and registration have an eligible stock path without a new grant', () => {
  const header = read('preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32/Circus.h');
  assert.match(header, /c2 = Util::CheckFileAny\(\{L"AdvData\\\\GRP\\\\NAMES\.DAT"/);
  assert.match(read('native/megulithook/enginecollection32.cpp'), /new Circus,/);
  const source = read(fixture.stockSource.path);
  assert.match(source, /succ \|= c2 && Circus2_attach_function\(\)/);
  assert.match(source, /bool _1 = ch2 \|\| c3\(\) \|\| c4\(\)/);
  assert.match(source, /bool embed = ScenarioHook::attach/);
  assert.equal(fixture.normalHook.requiresDrawRoles, false);
  assert.equal(fixture.normalHook.requiresNewOwnerGrant, false);
});

test('real c3 entry bytes prove stack[1], overflow bound and ret4, while old generic signature is absent', () => {
  const entry = span('c3-entry');
  assert.equal(entry.bytes.subarray(0x10, 0x16).toString('hex'), '81ec08010000');
  assert.ok(entry.bytes.includes(Buffer.from('8bb42414010000', 'hex')));
  assert.ok(entry.bytes.includes(Buffer.from('3d04010000', 'hex')));
  assert.equal(entry.bytes.subarray(0x10d, 0x110).toString('hex'), 'c20400');
  const literal = span('overflow-string');
  assert.equal(literal.bytes.toString('ascii'), 'SetStr overflow\0');
  assert.equal(fixture.normalHook.legacySignatureHits, 0);
});

test('real body and name call bytes target the same narrow setter but preserve separate return contexts', () => {
  for (const [name, callRva, returnRva] of [
    ['body-call', fixture.normalHook.bodyCallRva, fixture.normalHook.bodyReturnRva],
    ['name-call', fixture.normalHook.nameCallRva, fixture.normalHook.nameReturnRva]
  ]) {
    const sample = span(name);
    const at = callRva - sample.rva;
    assert.equal(sample.bytes[at], 0xe8);
    assert.equal(callRva + 5 + sample.bytes.readInt32LE(at + 1), fixture.normalHook.entryRva);
    assert.equal(callRva + 5, returnRva);
  }
  assert.notEqual(fixture.normalHook.bodyReturnRva, fixture.normalHook.nameReturnRva);
  assert.match(read('native/megulithook/texthook.cc'), /relative -= \(uintptr_t\)info\.AllocationBase/);
});

test('normal NewHook data has an existing host callback and Reader route, not a draw diagnostic route', () => {
  const bridge = read('native/HookBridge.cs');
  assert.match(bridge, /OutputEvent output=OnOutput/);
  assert.match(bridge, /OutputFrame\(code,name,tp,text\)/);
  assert.ok(bridge.includes('type="hookSource"'));
  const kernel = read('core/hook-native.cjs');
  assert.match(kernel, /m\.type==='hookSource'/);
  assert.match(read('services/reader.cjs'), /reader-event/);
  assert.match(read('web/reader/modules/hook-reader.js'), /hookSource|galStatus/);
});

test('the existing loader selects MeguLitHost and the x86 hook/injector for this sample', () => {
  const bridge = read('native/HookBridge.cs');
  assert.ok(bridge.includes('File.Exists(Path.Combine(root,"MeguLitHost64.dll")))Host="MeguLitHost64.dll"'));
  assert.ok(bridge.includes('Path.Combine(root,"MeguLitHook"+bit+".dll")'));
  assert.ok(bridge.includes('loader=Path.Combine(folder,"HookInjector"+bit+".exe")'));
  assert.match(read('native/HookInjector.cs'), /HookTarget\.Validate|Validate\(/);
});

test('publisher launcher bytes name DC4UP.exe and call its launch helper, separate from the hooked child', () => {
  const launcher = fixture.sample.publisherLauncher;
  assert.equal(launcher.name, 'DC4UP_dstart.exe');
  assert.equal(launcher.hookTarget, fixture.sample.executable);
  for (const span of launcher.spans) assert.equal(sha256(Buffer.from(span.hex, 'hex')), span.sha256);
  const name = launcher.spans.find(span => span.name === 'publisher-child-name');
  assert.equal(Buffer.from(name.hex, 'hex').toString('ascii'), 'DC4UP.exe\0');
  const call = launcher.spans.find(span => span.name === 'publisher-launch-branch');
  const bytes = Buffer.from(call.hex, 'hex'), at = launcher.childCallRva - call.rva;
  assert.equal(bytes[at], 0xe8);
  assert.equal(launcher.childCallRva + 5 + bytes.readInt32LE(at + 1), launcher.childHelperRva);
  const api = launcher.spans.find(span => span.name === 'publisher-create-process');
  assert.equal(Buffer.from(api.hex, 'hex').subarray(0, 2).toString('hex'), 'ff15');
});

test('the generated console is a source matcher and NewHook recorder, never a game injector', () => {
  const source = consoleFixture.consoleSource();
  assert.ok(source.includes(consoleFixture.stockC3()));
  assert.ok(source.includes('return acceptHook;'));
  assert.ok(source.includes('PAGE_READWRITE'));
  assert.equal(/CreateRemoteThread|OpenProcess\(|MH_CreateHook|PAGE_EXECUTE|LoadLibrary[AW]\(/.test(source), false);
  assert.ok(source.includes('minhookInstalled\\\":false'));
  assert.ok(source.includes('filterExecuted\\\":false'));
});

test('sample identity refuses altered files before they can be interpreted as the known executable', () => {
  const directory = fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP || os.tmpdir(), 'circus-stock-'));
  try {
    const file = path.join(directory, 'sample.bin');
    fs.writeFileSync(file, Buffer.alloc(8));
    assert.throws(() => audit.pinnedRead(file, fixture.sample), /SIZE_MISMATCH/);
    const bytes = Buffer.from('same-size');
    fs.writeFileSync(file, bytes);
    assert.throws(() => audit.pinnedRead(file, { bytes: bytes.length, sha256: sha256(Buffer.from('different')) }), /IDENTITY_MISMATCH/);
    assert.throws(() => audit.auditSample(), /EXPLICIT_PATHS_REQUIRED/);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
