// SPDX-License-Identifier: GPL-3.0-or-later
import {enqueueProbeDrafts, probeDraft, probeStep} from './probe-seed.js';
import {seedAdminAuthorized} from './seed-admin.js';

const DEFAULT_REPO = 'ilynthn/MeguLit';
const repoOf = env => env.GITHUB_REPO || DEFAULT_REPO;
const sizeLimit = 512 * 1024;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const sha = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const issueUrl = (repo, number) => `https://github.com/${repo}/issues/${number}`;
const intro = 'MeguLit desensitized probe uploaded through the relay';

function isAdapterProbe(issue, env, repo, number) {
  const author = env.ADAPTER_PROBE_ISSUE_AUTHOR || (repo === DEFAULT_REPO ? 'ilynthn' : '');
  return !!author && issue?.number === number && !issue.pull_request &&
    issue.html_url === issueUrl(repo, number) && issue.user?.login === author &&
    Array.isArray(issue.labels) && issue.labels.some(label => label?.name === 'adapter-probe') &&
    typeof issue.body === 'string' && issue.body.startsWith(intro);
}

function github(env, repo, number, method = 'GET') {
  return (env.fetch || fetch)(`https://api.github.com/repos/${repo}/issues/${number}`, {
    method,
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

async function closeIssue(env, repo, number, now) {
  const job = await env.DB.prepare('SELECT closed_at FROM probe_issue_disposition WHERE repo=? AND issue=?')
    .bind(repo, number).first();
  if (!job || job.closed_at) return true;
  await env.DB.prepare('UPDATE probe_issue_disposition SET last_attempt_at=? WHERE repo=? AND issue=?')
    .bind(now.toISOString(), repo, number).run();
  const response = await github(env, repo, number);
  if (!response.ok) return false;
  const issue = await response.json();
  if (!isAdapterProbe(issue, env, repo, number)) return false;
  if (issue.state !== 'closed' && !(await github(env, repo, number, 'PATCH')).ok) return false;
  await env.DB.prepare('UPDATE probe_issue_disposition SET closed_at=? WHERE repo=? AND issue=? AND closed_at IS NULL')
    .bind(now.toISOString(), repo, number).run();
  return true;
}

export async function retryProbeIssues(env, now) {
  if (!env.ADAPTER_PROBE_WEBHOOK_SECRET || !env.GITHUB_TOKEN) return;
  const {results} = await env.DB.prepare(`SELECT repo,issue FROM probe_issue_disposition
    WHERE repo=? AND closed_at IS NULL ORDER BY last_attempt_at,created_at LIMIT 10`).bind(repoOf(env)).all();
  for (const row of results) {
    try {
      if (!await closeIssue(env, row.repo, row.issue, now)) console.error('PROBE_ISSUE_CLOSE_PENDING', row.issue);
    } catch {
      console.error('PROBE_ISSUE_CLOSE_PENDING', row.issue);
    }
  }
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

function backlogMarkdown(repo, issue, stored) {
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
  const repo = repoOf(env), issue = event?.issue, number = issue?.number;
  if (event?.repository?.full_name !== repo || !['opened', 'labeled', 'reopened'].includes(event.action) ||
      !Number.isSafeInteger(number) || number < 1 || !isAdapterProbe(issue, env, repo, number)) {
    return json({ok: true, ignored: true});
  }
  const db = env.DB;
  const prior = await db.prepare('SELECT markdown FROM probe_issue_disposition WHERE repo=? AND issue=?').bind(repo, number).first();
  if (!prior) {
    const stored = await readStoredDrafts(env, issueUrl(repo, number));
    const needsBacklog = !stored?.drafts.length || stored.drafts.some(d => d.kind !== 'probe-skeleton');
    const writes = [db.prepare('INSERT OR IGNORE INTO probe_issue_disposition(repo,issue,markdown,created_at) VALUES(?,?,?,?)')
      .bind(repo, number, needsBacklog ? backlogMarkdown(repo, issue, stored) : null, now.toISOString())];
    if (stored) writes.push(enqueueProbeDrafts(db, stored.drafts, stored.receipt, now));
    await db.batch(writes);
  }
  if (!await closeIssue(env, repo, number, now)) return fail('PROBE_ISSUE_CLOSE_PENDING', 502);
  return json({ok: true, processed: true});
}

export async function probeIssueMarkdown(request, env, url, {fail}) {
  if (!seedAdminAuthorized(request, env)) return fail('UNAUTHORIZED', 401);
  if (request.method !== 'GET') return fail('METHOD_NOT_ALLOWED', 405);
  const number = Number(url.searchParams.get('issue'));
  if (!Number.isSafeInteger(number) || number < 1) return fail('INVALID_ISSUE', 400);
  const row = await env.DB.prepare('SELECT markdown FROM probe_issue_disposition WHERE repo=? AND issue=?')
    .bind(repoOf(env), number).first();
  if (!row?.markdown) return fail('NOT_FOUND', 404);
  return new Response(row.markdown, {headers: {'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store'}});
}
