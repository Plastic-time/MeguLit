// SPDX-License-Identifier: GPL-3.0-or-later
import {enqueueProbeDrafts, probeDraft, probeStep} from './probe-seed.js';
import {gameRequestSelector, retryGameRequests, resolveGameRequest, trackGameRequest} from './game-requests.js';
import {seedAdminAuthorized} from './seed-admin.js';

const DEFAULT_REPO = 'ilynthn/MeguLit';
export const repoOf = env => env.GITHUB_REPO || DEFAULT_REPO;
const sizeLimit = 512 * 1024;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const sha = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const issueUrl = (repo, number) => `https://github.com/${repo}/issues/${number}`;
const intro = 'MeguLit desensitized probe uploaded through the relay';

export function isAdapterProbe(issue, env, repo, number) {
  const author = env.ADAPTER_PROBE_ISSUE_AUTHOR || (repo === DEFAULT_REPO ? 'ilynthn' : '');
  return !!author && issue?.number === number && !issue.pull_request &&
    issue.html_url === issueUrl(repo, number) && issue.user?.login === author &&
    Array.isArray(issue.labels) && issue.labels.length === 1 && issue.labels[0]?.name === 'adapter-probe' &&
    typeof issue.body === 'string' && issue.body.startsWith(intro);
}

function github(env, repo, number, method = 'GET') {
  return (env.fetch || fetch)(`https://api.github.com/repos/${repo}/issues/${number}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {authorization: 'Bearer ' + env.GITHUB_TOKEN, 'user-agent': 'megulit-relay',
      accept: 'application/vnd.github+json', 'content-type': 'application/json'},
    ...(method === 'PATCH' ? {body: JSON.stringify({state: 'closed', state_reason: 'not_planned'})} : {})
  });
}

export function legacyProbeDisposition(env, url, now, receipt) {
  const repo = repoOf(env);
  const number = Number(url?.slice(issueUrl(repo, '').length));
  if (!Number.isSafeInteger(number) || number < 1 || url !== issueUrl(repo, number)) return null;
  return env.DB.prepare(`INSERT OR IGNORE INTO probe_issue_disposition(repo,issue,created_at)
    SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM probe_bundles WHERE id=?)`)
    .bind(repo, number, now.toISOString(), receipt);
}

async function closeIssue(env, repo, number, now, expectedBody) {
  const job = await env.DB.prepare('SELECT closed_at FROM probe_issue_disposition WHERE repo=? AND issue=?')
    .bind(repo, number).first();
  if (!job) return true;
  await env.DB.prepare('UPDATE probe_issue_disposition SET last_attempt_at=? WHERE repo=? AND issue=?')
    .bind(now.toISOString(), repo, number).run();
  const response = await github(env, repo, number);
  if (!response.ok) return false;
  const issue = await response.json();
  if (!isAdapterProbe(issue, env, repo, number) || (expectedBody !== undefined && issue.body !== expectedBody)) return false;
  if (issue.state !== 'closed' && !(await github(env, repo, number, 'PATCH')).ok) return false;
  await env.DB.prepare('UPDATE probe_issue_disposition SET closed_at=? WHERE repo=? AND issue=? AND closed_at IS NULL')
    .bind(now.toISOString(), repo, number).run();
  return true;
}

export async function closeReceiptIssue(env, receipt, now) {
  if (!env.ADAPTER_PROBE_WEBHOOK_SECRET || !env.GITHUB_TOKEN) return true;
  const game = await env.DB.prepare('SELECT issue_url FROM probe_games WHERE bundle_id=?').bind(receipt).first();
  const repo = repoOf(env);
  const number = Number(game?.issue_url?.split('/').pop());
  if (!Number.isSafeInteger(number) || number < 1 || game.issue_url !== issueUrl(repo, number)) return true;
  return closeIssue(env, repo, number, now);
}

export async function resolveRegisteredGameRequests(env, now, selector) {
  if (env.ADAPTER_PROBE_WEBHOOK_SECRET && env.GITHUB_TOKEN) await retryGameRequests(env, repoOf(env), now, github, selector);
}

async function readStoredDrafts(env, url) {
  const row = await env.DB.prepare('SELECT id,object_key,sha256 FROM probe_bundles WHERE issue_url=? ORDER BY created_at DESC LIMIT 1')
    .bind(url).first();
  if (!row) return null;
  const object = await env.BUCKET.get(row.object_key);
  if (!object) return null;
  const bytes = await new Response(object.body).arrayBuffer();
  if (await sha(bytes) !== row.sha256) return null;
  let bundle;
  try { bundle = JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
  if (bundle?.schema !== 'megulit.probe-bundle' || bundle.version !== 1 || !Array.isArray(bundle.games) ||
      !bundle.games.length || bundle.games.some(game => !game || typeof game !== 'object' || Array.isArray(game))) return null;
  const drafts = await Promise.all(bundle.games.map((game, i) => probeDraft(game, bundle.app, row.sha256, i)));
  return encoder.encode(JSON.stringify(drafts)).length <= sizeLimit ? {receipt: row.id, drafts} : null;
}

export function backlogMarkdown(repo, issue, stored) {
  const stages = [...new Set(Array.from(issue.body.matchAll(/^- step: \*\*([a-z-]+)\*\*/gm), match => probeStep(match[1])))];
  const evidence = stored?.drafts.map(draft => JSON.parse(draft.body));
  const missing = [...new Set(evidence?.flatMap(item => item.missing) || ['probe-identity', 'verified-fingerprint', 'work-identity'])];
  const fingerprints = [...new Set(evidence?.map(item => item.exeHeadFingerprint).filter(Boolean) || [])];
  return ['# Adapter probe awaiting evidence', '', `- Issue: #${issue.number}`,
    `- URL: ${issueUrl(repo, issue.number)}`, `- Stages: ${stages.join(', ') || 'unknown'}`,
    `- EXE head fingerprints: ${fingerprints.join(', ') || 'unavailable'}`,
    `- Missing: ${missing.join(', ')}`,
    '- Retry: submit a new desensitized probe from the same build with its probe identity and engine evidence', ''].join('\n');
}

export async function probeIssueWebhook(request, env, now, {json, fail}) {
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);
  if (!env.ADAPTER_PROBE_WEBHOOK_SECRET || !env.GITHUB_TOKEN) return fail('NOT_FOUND', 404);
  if (Number(request.headers.get('content-length')) > sizeLimit) return fail('PAYLOAD_TOO_LARGE', 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > sizeLimit) return fail('PAYLOAD_TOO_LARGE', 413);
  const sig = /^sha256=([a-f0-9]{64})$/.exec(request.headers.get('x-hub-signature-256') || '');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.ADAPTER_PROBE_WEBHOOK_SECRET),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
  if (!sig || !await crypto.subtle.verify('HMAC', key, Uint8Array.from(sig[1].match(/../g), b => parseInt(b, 16)), bytes)) {
    return fail('UNAUTHORIZED', 401);
  }
  if (request.headers.get('x-github-event') !== 'issues') return json({ok: true, ignored: true});
  let event;
  try { event = JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail('INVALID_JSON', 400); }
  const repo = repoOf(env), number = event?.issue?.number;
  if (event?.repository?.full_name !== repo || !Number.isSafeInteger(number) || number < 1) {
    return json({ok: true, ignored: true});
  }
  const openEvent = ['opened', 'edited', 'labeled', 'reopened'].includes(event.action);
  if (!openEvent || (!isAdapterProbe(event.issue,env,repo,number) && !gameRequestSelector(event.issue,env,repo,number))) {
    return json({ok:true,ignored:true});
  }
  const live = await github(env,repo,number);
  if (!live.ok) return fail('ISSUE_LOOKUP_FAILED',502);
  const issue = await live.json();
  const selector = gameRequestSelector(issue, env, repo, number);
  if (selector) {
    if (issue.state === 'open') await env.DB.prepare('UPDATE game_request_jobs SET closed_at=NULL WHERE repo=? AND issue=? AND closed_at IS NOT NULL')
      .bind(repo,number).run();
    await trackGameRequest(env, repo, number, selector, now);
    const state = await resolveGameRequest(env, repo, number, now, github);
    return state === 'retry' ? fail('GAME_REQUEST_CLOSE_PENDING', 502) : json({ok: true, gameRequest: state});
  }
  if (!isAdapterProbe(issue, env, repo, number)) return json({ok: true, ignored: true});
  const db = env.DB;
  const prior = await db.prepare('SELECT markdown FROM probe_issue_disposition WHERE repo=? AND issue=?').bind(repo, number).first();
  if (!prior || issue.state === 'open') {
    const stored = await readStoredDrafts(env, issueUrl(repo, number));
    const needsBacklog = !stored?.drafts.length || stored.drafts.some(d => d.kind !== 'probe-skeleton');
    const writes = [db.prepare(`INSERT INTO probe_issue_disposition(repo,issue,markdown,created_at) VALUES(?,?,?,?)
      ON CONFLICT(repo,issue) DO UPDATE SET markdown=excluded.markdown WHERE probe_issue_disposition.markdown IS NOT NULL`)
      .bind(repo, number, needsBacklog ? backlogMarkdown(repo, issue, stored) : null, now.toISOString())];
    if (stored) writes.push(enqueueProbeDrafts(db, stored.drafts, stored.receipt, now));
    await db.batch(writes);
  }
  if (!await closeIssue(env, repo, number, now,issue.body)) return fail('PROBE_ISSUE_CLOSE_PENDING', 502);
  return json({ok: true, processed: true});
}

export async function probeIssueMarkdown(request, env, url, {fail}) {
  if (!seedAdminAuthorized(request, env)) return fail('UNAUTHORIZED', 401);
  if (request.method !== 'GET') return fail('METHOD_NOT_ALLOWED', 405);
  const headers = {'content-type':'text/markdown; charset=utf-8','cache-control':'no-store'};
  if (url.searchParams.has('item')) {
    const id = url.searchParams.get('item');
    if (!/^[a-f0-9]{64}$/.test(id)) return fail('INVALID_ITEM',400);
    const draft = await env.DB.prepare(`SELECT json_extract(body,'$.markdown') AS markdown
      FROM seed_admin_items WHERE id=? AND kind='probe-backlog' AND state<>'deleted'`).bind(id).first();
    return draft?.markdown ? new Response(draft.markdown,{headers}) : fail('NOT_FOUND',404);
  }
  const number = Number(url.searchParams.get('issue'));
  if (!Number.isSafeInteger(number) || number < 1) return fail('INVALID_ISSUE', 400);
  const row = await env.DB.prepare('SELECT markdown FROM probe_issue_disposition WHERE repo=? AND issue=?')
    .bind(repoOf(env), number).first();
  if (!row?.markdown) return fail('NOT_FOUND', 404);
  return new Response(row.markdown, {headers});
}
