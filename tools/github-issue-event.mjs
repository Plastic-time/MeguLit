// SPDX-License-Identifier: GPL-3.0-or-later
// One signed GitHub event, or one explicitly requested issue replay, per invocation.
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {backlogMarkdown, isAdapterProbe} from '../relay/src/probe-issues.js';
import {probeDraft, enqueueProbeDrafts} from '../relay/src/probe-seed.js';
import {gameRequestSelector} from '../relay/src/game-requests.js';

const repo = 'ilynthn/MeguLit';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const limit = 8 * 1024 * 1024;
const downloadLine = /^Download \(expires in \d{1,2} days\): (https:\/\/(?:api|cn-api)\.megulit\.com\/api\/probe\/download\/([a-f0-9-]{36})\?exp=(\d{1,12})&sig=[a-f0-9]{64})$/gm;

export function receiptFrom(body) {
  const hits = [...body.replaceAll('\r\n', '\n').matchAll(downloadLine)];
  if (hits.length !== 1) return null;
  const [,url,id,exp] = hits[0];
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) return null;
  return {url,id,exp:Number(exp)};
}

export async function readProbe(body, fetcher = fetch) {
  const receipt = receiptFrom(body);
  if (!receipt) return null;
  const res = await fetcher(receipt.url, {redirect:'error', signal:AbortSignal.timeout(30000)});
  if (!res.ok) {
    if ([403,404,410].includes(res.status)) return {reason:'relay-http-' + res.status, drafts:[]};
    throw Error('probe relay HTTP ' + res.status);
  }
  const chunks = [];
  let size = 0;
  for await (const bytes of res.body) {
    size += bytes.length;
    if (size > limit) throw Error('probe exceeds relay size limit');
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks);
  const hash = digest(bytes);
  let data;
  try { data = JSON.parse(bytes); } catch { return {reason:'invalid-probe-json',drafts:[]}; }
  const keys = [...body.matchAll(/^- key: \x60([a-f0-9]{64})\x60\r?$/gm)].map(m => m[1]);
  const count = /^- Games: ([1-9]\d*)\r?$/m.exec(body);
  if (data?.schema !== 'megulit.probe-bundle' || data.version !== 1 || !Array.isArray(data.games) ||
      !count || data.games.length !== Number(count[1]) || data.games.length > 1024 ||
      keys.length !== Math.min(data.games.length,30) || !keys.every((key,i) => data.games[i]?.key === key) ||
      !data.games.every(game => game && typeof game === 'object' && !Array.isArray(game))) {
    return {reason:'receipt-summary-mismatch',drafts:[]};
  }
  const drafts = await Promise.all(data.games.map((game,i) => probeDraft(game,data.app,hash,i)));
  return {id:receipt.id,exp:receipt.exp,size,hash,drafts};
}

export function matchesVersion(selector, game, version) {
  return game?.schema === 'megulit.game-diff' && game.layer === 'game' && game.status === 'skeleton' &&
    game.prints?.vndb === selector.work && game.engine === selector.engine &&
    game.sourceLangs?.length === 1 && game.sourceLangs[0] === selector.lang &&
    game.prints?.script === selector.script && game.builds?.includes(selector.exe) &&
    version?.schema === 'megulit.game-diff' && version.layer === 'version' && version.engine === selector.engine &&
    version.key === selector.exe && version.prints?.exe === selector.exe &&
    (!version.prints.script || version.prints.script === selector.script);
}

function repositoryEvidence(selector) {
  // Resolve against the current public default branch, never a submitted ref.
  const commit = github('repos/' + repo + '/git/ref/heads/main').object.sha;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('invalid catalog commit');
  const tree = github('repos/' + repo + '/git/trees/' + commit + '?recursive=1');
  if (tree.truncated) throw Error('incomplete public Seed catalog');
  const paths = new Map(tree.tree.filter(x=>x.type==='blob').map(x=>[x.path,x.sha]));
  const jsonBlob = file => {
    const sha = paths.get(file);
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw Error('missing catalog blob');
    const blob = github('repos/' + repo + '/git/blobs/' + sha);
    return JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
  };
  for (const file of paths.keys()) {
    if (!file.startsWith('The Seed/' + selector.engine + '/') || !file.endsWith('/versions/' + selector.exe + '.json')) continue;
    if (!/^The Seed\/[a-z0-9-]+\/[a-z0-9._-]+\/versions\/[a-f0-9]{64}\.json$/.test(file)) continue;
    const gamePath = file.split('/versions/')[0] + '/game.json';
    const game = jsonBlob(gamePath);
    const version = jsonBlob(file);
    if (matchesVersion(selector,game,version)) return 'https://github.com/' + repo + '/blob/' + commit + '/' + encodeURI(file);
  }
  return null;
}

async function exactEvidence(selector) {
  const link = repositoryEvidence(selector);
  if (link) return {status:'skeleton',ref:link};
  const token = process.env.MEGULIT_ADAPTER_ADMIN_TOKEN || process.env.ADAPTER_ADMIN_TOKEN;
  if (!token) return null;
  const url = new URL('https://api.megulit.com/api/seed-admin/game-request-evidence');
  url.searchParams.set('selector',selector.key);
  const res = await fetch(url,{headers:{authorization:'Bearer ' + token},redirect:'error',signal:AbortSignal.timeout(15000)});
  if (res.status === 404) return null;
  if (!res.ok) throw Error('evidence service HTTP ' + res.status);
  const row = await res.json();
  const formats = new Map([['available',/^[a-f0-9]{64}$/],['skeleton',/^[a-f0-9]{64}$/],
    ['generating',/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/],['backlog',/^[1-9]\d{0,8}$/]]);
  if (row.selector !== selector.key || typeof row.ref !== 'string' || !formats.get(row.kind)?.test(row.ref)) return null;
  return {status:row.kind,ref:row.ref};
}

function github(...args) {
  const out = execFileSync('gh',['api',...args],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:45000,stdio:['ignore','pipe','pipe']});
  return JSON.parse(out);
}

function liveIssue(number) {
  const endpoint = 'repos/' + repo + '/issues/' + number;
  const issue = github(endpoint);
  if (issue.number !== number || issue.html_url !== 'https://github.com/' + repo + '/issues/' + number || issue.pull_request) {
    throw Error('unexpected issue identity');
  }
  if (issue.comments && isAdapterProbe(issue,{},repo,number)) {
    const pages = github('--paginate','--slurp',endpoint + '/comments?per_page=100');
    const improved = pages.flat().filter(c => c.user?.login === issue.user.login && c.issue_url === issue.url &&
      c.body?.startsWith('**更完整的探针 / a more complete probe**') &&
      c.body.includes('\n\nMeguLit desensitized probe uploaded through the relay'));
    if (improved.length) issue.probeBody = improved.at(-1).body;
  }
  return issue;
}

export function openQueue(directory) {
  fs.mkdirSync(directory,{recursive:true});
  const db = new DatabaseSync(path.join(directory,'probe-review.sqlite'));
  db.exec('PRAGMA busy_timeout=30000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  for (const migration of ['0016_adapters.sql','0028_seed_admin.sql']) {
    db.exec(fs.readFileSync(path.join(root,'relay/migrations',migration),'utf8'));
  }
  db.exec('CREATE TABLE IF NOT EXISTS github_issue_receipts(issue INTEGER,source TEXT,status TEXT,detail TEXT,closed_at TEXT,PRIMARY KEY(issue,source))');
  return db;
}

function writeRecord(directory, name, data) {
  const file = path.join(directory,name);
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp,data,{flag:'wx',flush:true});
    fs.renameSync(temp,file);
    if (fs.readFileSync(file,'utf8') !== data) throw Error('Markdown readback failed');
  } finally { fs.rmSync(temp,{force:true}); }
}

const sourceOf = issue => digest(JSON.stringify([issue.title,issue.body,issue.probeBody,issue.labels?.map(l=>l.name).sort(),issue.user?.login]));
export async function handleIssue(number,{db,directory,read=liveIssue,download=readProbe,evidence=exactEvidence,
  close=n=>github('--method','PATCH','repos/' + repo + '/issues/' + n,'-f','state=closed','-f','state_reason=not_planned')}){
  if (!Number.isSafeInteger(number) || number < 1) throw Error('invalid issue number');
  const issue = read(number);
  const source = sourceOf(issue);
  const probe = isAdapterProbe(issue,{},repo,number);
  const selector = gameRequestSelector(issue,{},repo,number);
  if (!probe && !selector) return {number,status:'unmatched'};
  const now = new Date();
  let status, detail, stored, markdown;
  const prior = db.prepare('SELECT status,detail FROM github_issue_receipts WHERE issue=? AND source=?').get(number,source);
  if (probe && prior?.status === 'skeleton') {
    status = prior.status;
    detail = JSON.parse(prior.detail);
    if (!detail.length || !detail.every(id=>db.prepare("SELECT 1 FROM seed_admin_items WHERE id=? AND kind='probe-skeleton' AND state<>'deleted'").get(id))) {
      throw Error('previous draft no longer available');
    }
  } else if (probe) {
    const body = issue.probeBody || issue.body;
    stored = await download(body);
    const drafts = stored?.drafts || [];
    status = drafts.length && drafts.every(d=>d.kind === 'probe-skeleton') ? 'skeleton' : 'backlog';
    detail = drafts.map(d=>d.id);
    if (status === 'backlog') {
      const name = 'issue-' + number + '-' + source.slice(0,16) + '.md';
      markdown = backlogMarkdown(repo,{...issue,body},drafts.length ? stored : null);
      if (stored?.reason) markdown += '\n- Receipt status: ' + stored.reason + '\n';
      writeRecord(directory,name,markdown);
      detail.push(name);
    }
  } else {
    const match = await evidence(selector);
    if (!match) return {number,status:'no-exact-evidence'};
    status = match.status;
    detail = [selector.key,match.ref];
  }

  // Persist only the sanitized queue item and receipt. The signed URL and raw samples stay out of the queue.
  const snapshot = read(number);
  if (sourceOf(snapshot) !== source) return {number,status:'source-changed'};
  db.exec('BEGIN IMMEDIATE');
  try {
    if (stored?.hash) {
      db.prepare('INSERT OR IGNORE INTO probe_bundles(id,object_key,issue_url,ip_hash,size,sha256,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(stored.id,'relay-receipt/' + stored.id,issue.html_url,'',stored.size,stored.hash,Math.floor(+now/1000),stored.exp);
      if (db.prepare('SELECT sha256 FROM probe_bundles WHERE id=?').get(stored.id)?.sha256 !== stored.hash) throw Error('receipt collision');
      const adapter = {prepare:sql=>({bind:(...args)=>({run:()=>db.prepare(sql).run(...args)})})};
      enqueueProbeDrafts(adapter,stored.drafts,stored.id,now).run();
      for (const draft of stored.drafts) {
        const row = db.prepare('SELECT kind,state FROM seed_admin_items WHERE id=?').get(draft.id);
        if (row?.kind !== draft.kind || row.state === 'deleted') throw Error('draft unavailable for review');
      }
    }
    db.prepare('INSERT INTO github_issue_receipts(issue,source,status,detail) VALUES(?,?,?,?) ON CONFLICT(issue,source) DO UPDATE SET status=excluded.status,detail=excluded.detail')
      .run(number,source,status,JSON.stringify(detail));
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  const saved = db.prepare('SELECT detail FROM github_issue_receipts WHERE issue=? AND source=?').get(number,source);
  if (saved?.detail !== JSON.stringify(detail)) throw Error('receipt readback failed');
  // Concurrent deliveries share this lock only after the evidence transaction is durable.
  db.exec('BEGIN IMMEDIATE');
  try {
    const live = read(number);
    if (sourceOf(live) !== source) {
      db.exec('ROLLBACK');
      return {number,status:'source-changed'};
    }
    if (live.state === 'open') {
      const result = close(number);
      if (result.number !== number || result.state !== 'closed') throw Error('close not confirmed');
    } else if (live.state !== 'closed') throw Error('unexpected issue state');
    db.prepare('UPDATE github_issue_receipts SET closed_at=COALESCE(closed_at,?) WHERE issue=? AND source=?')
      .run(now.toISOString(),number,source);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  return {number,status,detail};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [directory,...numbers] = process.argv.slice(2);
  if (!directory || !numbers.length || !numbers.every(n=>/^[1-9]\d{0,8}$/.test(n))) throw Error('usage: node github-issue-event.mjs QUEUE_DIRECTORY ISSUE_NUMBER [...]');
  const db = openQueue(directory);
  try {
    for (const n of numbers) {
      try { console.log(JSON.stringify(await handleIssue(Number(n),{db,directory}))); }
      catch (err) { console.error('#' + n + ' processing failed: ' + (err.code || err.name)); process.exitCode=1; }
    }
  } finally { db.close(); }
}
