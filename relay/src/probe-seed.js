// SPDX-License-Identifier: GPL-3.0-or-later
import fingerprints from '../../services/engine-fingerprint.cjs';
import {itemId} from './seed-admin.js';

const HEX = /^[a-f0-9]{64}$/;
const APP = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/;
const readers = /^[a-z0-9][a-z0-9-]{0,29}$/;
const missingByStep = {
  'parse-failed': 'readable-script',
  'unsupported-engine': 'supported-reader',
  'decrypt-failed': 'readable-archive',
  'chinese-build': 'japanese-source',
  'not-japanese': 'japanese-source',
  'decode-suspect': 'reliable-decoding',
  'low-pairing': 'runtime-pairing',
  'unknown-pack': 'container-identification',
  timeout: 'complete-probe'
};

export function probeStep(value) {
  return typeof value === 'string' && Object.hasOwn(missingByStep, value) ? value : 'unknown';
}

export async function probeDraft(game, app, digest, index) {
  const identity = typeof game.identity === 'string' && HEX.test(game.identity) ? game.identity : null;
  const fingerprint = game.fingerprintKind === 'exe-head-v1' && typeof game.key === 'string' &&
    HEX.test(game.key) ? game.key : null;
  const archives = Array.isArray(game.inventory?.archives) ? game.inventory.archives.slice(0, 48) : [];
  const markers = Array.isArray(game.inventory?.markers) ? game.inventory.markers.slice(0, 8) : [];
  const inventory = {
    archives: archives.filter(a => typeof a?.magic === 'string' && /^[a-f0-9]{2,16}$/.test(a.magic))
      .map(a => ({magic: a.magic})),
    markers: markers.filter(m => ['unity', 'unity-data-dir', 'siglus', 'nwjs'].includes(m))
  };
  const attempts = Array.isArray(game.engines) ? game.engines.slice(0, 60) : [];
  const detected = typeof game.detected === 'string' && readers.test(game.detected) &&
    Number.isSafeInteger(game.lines) && game.lines > 0 &&
    attempts.some(r => r?.id === game.detected && Number.isSafeInteger(r.lines) && r.lines > 0);
  const identified = fingerprints.fingerprint(inventory);
  const engine = detected ? game.detected : identified?.engine || null;
  const step = probeStep(game.step);
  const missing = ['work-identity', 'exe-sha256', 'game-build-version', 'cardinal-runtime'];
  if (!engine) missing.push('engine-evidence');
  if (!identity) missing.push('probe-identity');
  if (!fingerprint) missing.push('exe-head-fingerprint');
  missing.push(missingByStep[step] || 'classified-probe');
  if (step === 'parse-failed' && attempts.some(r => r?.id === 'spike-wad' && r.error === 'WAD_NO_JAPANESE')) {
    missing.push('japanese-source');
  }
  const body = {status: identity ? 'skeleton' : 'awaiting-evidence', step, missing,
    ...(typeof app === 'string' && APP.test(app) ? {probeAppVersion: app} : {}),
    ...(identity ? {probeIdentity: identity} : {}),
    ...(fingerprint ? {exeHeadFingerprint: fingerprint} : {}),
    ...(engine ? {engineEvidence: detected ? 'reader-output' : 'container-fingerprint'} : {})};
  const kind = identity ? 'probe-skeleton' : 'probe-backlog';
  // The namespace is separate from the game/EXE keys used for Cardinal and publication.
  const key = await itemId({kind, layer: 'game', key: identity || digest + ':' + index});
  if (!identity) {
    body.markdown = ['# Adapter probe awaiting evidence','',
      '- Review item: ' + key, '- Probe stage: ' + step, '- Missing: ' + missing.join(', '),
      '- Retry: submit a new desensitized probe from the same build with its probe identity',''].join('\n');
  }
  return {id: key, kind, engine: engine || '', body: JSON.stringify(body)};
}

export function enqueueProbeDrafts(db, drafts, receipt, now) {
  return db.prepare(`INSERT INTO seed_admin_items
    (id,kind,layer,game_key,body,engine,uploaded_at,updated_at,reason)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),'game',json_extract(value,'$.id'),
      json_extract(value,'$.body'),json_extract(value,'$.engine'),?,?,'awaiting-probe-evidence'
    FROM json_each(?) WHERE EXISTS (SELECT 1 FROM probe_bundles WHERE id=?)
    ON CONFLICT(id) DO UPDATE SET body=excluded.body,engine=excluded.engine,
      updated_at=excluded.updated_at,revision=seed_admin_items.revision+1
    WHERE seed_admin_items.state IN ('pending','reviewing','needs-change')
      AND seed_admin_items.body<>excluded.body`)
    .bind(now.toISOString(), now.toISOString(), JSON.stringify(drafts), receipt);
}
