'use strict';
/* Read-only evidence collection for the existing stock hook. No hook or application is started. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fixture = require('../fixtures/engine-sigs/circus-stock-runtime.json');
const { pe } = require('../../tools/engine-sigs/draw-sites.cjs');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function pinnedRead(file, identity) {
  if (fs.statSync(file).size !== identity.bytes) throw Error('CIRCUS_STOCK_SIZE_MISMATCH');
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== identity.sha256) throw Error('CIRCUS_STOCK_IDENTITY_MISMATCH');
  return bytes;
}

function countPattern(bytes, pattern) {
  let count = 0;
  for (let offset = bytes.indexOf(pattern); offset >= 0; offset = bytes.indexOf(pattern, offset + 1)) count++;
  return count;
}

function verifyImage(bytes) {
  const image = pe(bytes);
  if (image.base !== fixture.sample.imageBase) throw Error('CIRCUS_STOCK_IMAGE_BASE');
  for (const span of fixture.spans) {
    const section = image.secs.find(section => span.rva >= section.rva && span.rva + span.size <= section.rva + section.raw);
    if (!section) throw Error('CIRCUS_STOCK_SECTION');
    const offset = section.ptr + span.rva - section.rva;
    if (sha256(bytes.subarray(offset, offset + span.size)) !== span.sha256) throw Error('CIRCUS_STOCK_CODE_CHANGED');
  }
  const legacySignatureHits = countPattern(bytes, Buffer.from('3c2475', 'hex'));
  if (legacySignatureHits !== 0) throw Error('CIRCUS_STOCK_EARLIER_VARIANT_PRESENT');
  const literal = Buffer.from('SetStr overflow\0');
  const literalOffset = bytes.indexOf(literal);
  if (literalOffset < 0) throw Error('CIRCUS_STOCK_OVERFLOW_LITERAL');
  const section = image.secs.find(section => literalOffset >= section.ptr && literalOffset < section.ptr + section.raw);
  if (!section) throw Error('CIRCUS_STOCK_LITERAL_SECTION');
  const literalRva = section.rva + literalOffset - section.ptr;
  const push = Buffer.alloc(5);
  push[0] = 0x68;
  push.writeUInt32LE(image.base + literalRva, 1);
  const pushReferences = image.code.flatMap(code => {
    const refs = [];
    for (let offset = code.bytes.indexOf(push); offset >= 0; offset = code.bytes.indexOf(push, offset + 1)) refs.push(code.va - image.base + offset);
    return refs;
  });
  if (pushReferences[0] !== 0x428ce) throw Error('CIRCUS_STOCK_PRIMARY_REFERENCE');
  return { legacySignatureHits, overflowLiteralRva: literalRva, pushReferences, hook: fixture.normalHook };
}

function auditSample(sampleDirectory, runtimeRoot) {
  if (!sampleDirectory || !runtimeRoot) throw Error('CIRCUS_STOCK_EXPLICIT_PATHS_REQUIRED');
  const exe = pinnedRead(path.join(sampleDirectory, fixture.sample.executable), fixture.sample);
  const image = verifyImage(exe);
  const pins = fixture.sample.scriptPins.map(pin => {
    pinnedRead(path.join(sampleDirectory, pin.name), pin);
    return pin;
  });
  const launcher = fixture.sample.publisherLauncher;
  const launcherBytes = pinnedRead(path.join(sampleDirectory, launcher.name), launcher);
  const readme = pinnedRead(path.join(sampleDirectory, launcher.readme.name), launcher.readme);
  if (!new TextDecoder('shift_jis', { fatal: true }).decode(readme).includes(launcher.name)) throw Error('CIRCUS_STOCK_PUBLISHER_START_INSTRUCTIONS');
  for (const span of launcher.spans) {
    if (sha256(launcherBytes.subarray(span.fileOffset, span.fileOffset + span.size)) !== span.sha256) throw Error('CIRCUS_STOCK_PUBLISHER_LOADER_CHANGED');
  }
  const requiredBeforeBridge = ['LunaHost64.dll', 'LunaHook32.dll', 'LunaHook64.dll'];
  for (const name of requiredBeforeBridge) {
    if (!fs.existsSync(path.join(runtimeRoot, 'runtime/hook', name))) throw Error('CIRCUS_STOCK_HOOK_PREFLIGHT_MISSING');
  }
  const artifacts = fixture.deploymentSnapshot.files.map(expected => {
    const file = path.join(runtimeRoot, expected.name);
    const bytes = fs.readFileSync(file);
    return { name: expected.name, bytes: bytes.length, sha256: sha256(bytes), matchesSnapshot: bytes.length === expected.bytes && sha256(bytes) === expected.sha256 };
  });
  const hook = fs.readFileSync(path.join(runtimeRoot, 'runtime/megulithook/MeguLitHook32.dll'));
  const fingerprint = ['AdvData', 'GRP', 'NAMES.DAT'].join(String.fromCharCode(92));
  const markers = {
    ordinaryHookName: hook.includes(Buffer.from('Circus2_1\0')),
    ordinaryOverflowSearch: hook.includes(Buffer.from('SetStr overflow\0')),
    detectorFingerprint: hook.includes(Buffer.from(fingerprint + '\0', 'utf16le'))
  };
  if (!Object.values(markers).every(Boolean)) throw Error('CIRCUS_STOCK_RUNTIME_MARKERS_MISSING');
  return {
    status: 'STOCK_SIGNATURE_EXACT_SAMPLE_VERIFIED_LIVE_PENDING',
    executable: { name: fixture.sample.executable, bytes: exe.length, sha256: sha256(exe) },
    pins,
    publisherStartup: { launcher: launcher.name, sha256: launcher.sha256, hookTarget: launcher.hookTarget, childCallRva: launcher.childCallRva, readmeSha256: launcher.readme.sha256, liveChildObserved: false },
    image,
    artifacts,
    markers,
    deploymentMatchesSnapshot: artifacts.every(artifact => artifact.matchesSnapshot),
    loader: { hook: 'runtime/megulithook/MeguLitHook32.dll', host: 'runtime/megulithook/MeguLitHost64.dll', injector: 'native/HookInjector32.exe', preflight: requiredBeforeBridge },
    newHookAdded: false,
    advancedGrantAdded: false,
    gameStarted: false,
    minhookInstalled: false,
    readerOutputObserved: false,
    foregroundAccepted: false
  };
}

module.exports = { pinnedRead, countPattern, verifyImage, auditSample };
if (require.main === module) {
  const [sampleDirectory, runtimeRoot, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw Error('CIRCUS_STOCK_ARGUMENTS');
    console.log(JSON.stringify(auditSample(sampleDirectory, runtimeRoot), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
