// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Pre-work duplicate check: prints only the rows that collide with the work you are about to start, so an agent does
   not have to read all of HANDOFF.md (16 KB, edited 180 times in a week) before every task.
     node tools/claim-check.cjs [关键词...] [文件或目录/...] [v<VNDB 号>...] [--no-fetch] [--json]
   Each argument is sorted by shape: a tracked path or anything with a slash is a file (a trailing slash means the
   whole directory), v<digits> is a VNDB work, everything else is a keyword (case-insensitive substring).
   With no file argument, the files this branch changes against origin/main (committed and uncommitted) are used.
   It reports, newest data first (origin/main is fetched unless --no-fetch):
     - open PRs that change the same files (the real source of merge conflicts), and open PRs whose title or branch
       matches a keyword; the PR for the current branch is skipped
     - HANDOFF.md 进行中 rows that match a keyword, and rows whose pushed branch (no PR yet) changes the same files
     - HANDOFF.md 已适配的游戏 rows for each VNDB work
     - HANDOFF-done.md lines and merged PRs that match a keyword (already done: do not redo)
   Exit code 1 when an open PR or in-progress row collides, 0 otherwise. */
const fs = require('node:fs'), path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LIMIT = 5;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 },
    (err, stdout) => resolve(err ? null : stdout)));
}

/* Sort arguments into keywords, files and VNDB works. */
function classifyArgs(argv, tracked) {
  const out = { keywords: [], files: [], vndb: [], fetch: true, json: false };
  for (const a of argv) {
    if (a === '--no-fetch') out.fetch = false;
    else if (a === '--json') out.json = true;
    else if (/^v\d+$/i.test(a)) out.vndb.push(a.toLowerCase());
    else if (a.includes('/') || a.includes('\\') || tracked.has(a)) out.files.push(a.replace(/\\/g, '/').replace(/^\.\//, ''));
    else out.keywords.push(a);
  }
  return out;
}

/* A file argument ending in "/" covers everything under it. */
function overlap(mine, theirs) {
  const hits = [];
  for (const t of theirs) {
    if (mine.some((m) => (m.endsWith('/') ? t.startsWith(m) : t === m))) hits.push(t);
  }
  return hits;
}

function matchesAny(text, keywords) {
  const low = String(text || '').toLowerCase();
  return keywords.some((k) => low.includes(k.toLowerCase()));
}

/* Rows of the markdown table under a "## <heading>" in HANDOFF.md, as arrays of trimmed cells. */
function tableRows(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const l = lines[i].trim();
    if (!l.startsWith('|') || /^\|[\s|:-]+\|$/.test(l)) continue;
    rows.push(l.slice(1, l.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim()));
  }
  return rows.slice(1); /* drop the header row */
}

/* Branch names written in a 分支 cell: "fix/a、fix/b", "（未开）" -> ["fix/a", "fix/b"]. */
function branchesIn(cell) {
  return String(cell || '').split(/[、,，\s]+/).filter((b) => /^[\w.-]+\/[\w./-]+$/.test(b));
}

const clip = (s, n = 48) => { s = String(s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function repoSlug() {
  const url = git(['remote', 'get-url', 'origin']).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  return m ? m[1] : 'ilynthn/MeguLit';
}

function myFiles() {
  const names = new Set();
  const add = (s) => s.split(/\r?\n/).filter(Boolean).forEach((f) => names.add(f));
  try { add(git(['diff', '--name-only', 'origin/main...HEAD'])); } catch {}
  try { add(git(['diff', '--name-only', 'HEAD'])); } catch {}
  try { add(git(['ls-files', '--others', '--exclude-standard'])); } catch {}
  return [...names];
}

async function main() {
  let tracked = new Set();
  try { tracked = new Set(git(['ls-files']).split(/\r?\n/)); } catch {}
  const opt = classifyArgs(process.argv.slice(2), tracked);
  if (opt.fetch) { try { git(['fetch', '-q', 'origin', 'main']); } catch {} }
  const branch = (() => { try { return git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { return ''; } })();
  const autoFiles = opt.files.length === 0;
  const files = autoFiles ? myFiles() : opt.files;
  const slug = repoSlug();
  const show = (p) => { try { return git(['show', `origin/main:${p}`]); } catch { return fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : ''; } };
  const handoff = show('HANDOFF.md'), done = show('HANDOFF-done.md');

  const openJson = await run('gh', ['pr', 'list', '-R', slug, '--state', 'open', '--limit', '200',
    '--json', 'number,title,headRefName,author,files']);
  const open = openJson ? JSON.parse(openJson).filter((p) => p.headRefName !== branch) : null;
  const openHeads = new Set((open || []).map((p) => p.headRefName));

  const r = { files, autoFiles, keywords: opt.keywords, vndb: opt.vndb, openFiles: [], openKeyword: [], doing: [],
    doingFiles: [], adapted: [], done: [], merged: [], warnings: [] };
  if (!open) r.warnings.push('gh pr list 失败：没查 open PR');

  for (const p of open || []) {
    const hit = overlap(files, (p.files || []).map((f) => f.path));
    const who = p.author && p.author.login;
    if (hit.length) r.openFiles.push({ pr: p.number, branch: p.headRefName, who, title: p.title, files: hit });
    else if (opt.keywords.length && matchesAny(`${p.title} ${p.headRefName}`, opt.keywords))
      r.openKeyword.push({ pr: p.number, branch: p.headRefName, who, title: p.title });
  }

  const doing = tableRows(handoff, '进行中');
  const pending = [];
  for (const row of doing) {
    const [who, what, , cell, , state] = row;
    if (branchesIn(cell).includes(branch)) continue;
    if (opt.keywords.length && matchesAny(row.join(' '), opt.keywords)) r.doing.push({ who, what, branch: cell, state });
    for (const b of branchesIn(cell)) if (!openHeads.has(b) && files.length) pending.push({ b, who, what });
  }
  /* Branches registered as in progress but without an open PR: compare the pushed branch, if any, with main. */
  await Promise.all(pending.map(async ({ b, who, what }) => {
    const out = await run('gh', ['api', `repos/${slug}/compare/main...${encodeURIComponent(b)}`, '--jq', '[.files[].filename]']);
    if (!out) return; /* not pushed yet */
    const hit = overlap(files, JSON.parse(out));
    if (hit.length) r.doingFiles.push({ who, what, branch: b, files: hit });
  }));

  for (const v of opt.vndb) {
    for (const row of tableRows(handoff, '已适配的游戏')) if (row.some((c) => c.toLowerCase() === v)) r.adapted.push({ vndb: v, row });
  }

  if (opt.keywords.length) {
    r.done = done.split(/\r?\n/).filter((l) => l.startsWith('- ') && matchesAny(l, opt.keywords));
    for (const k of opt.keywords) {
      const out = await run('gh', ['pr', 'list', '-R', slug, '--state', 'merged', '--limit', String(LIMIT),
        '--search', `${k} in:title`, '--json', 'number,title,mergedAt']);
      /* GitHub search splits CJK text loosely ("名字" finds unrelated titles), so keep exact substring hits only. */
      if (out) for (const p of JSON.parse(out)) if (matchesAny(p.title, [k]) && !r.merged.some((m) => m.pr === p.number))
        r.merged.push({ pr: p.number, title: p.title, mergedAt: String(p.mergedAt).slice(0, 10) });
    }
  }

  const collide = r.openFiles.length + r.openKeyword.length + r.doing.length + r.doingFiles.length > 0;
  if (opt.json) { process.stdout.write(JSON.stringify(r, null, 1) + '\n'); return collide ? 1 : 0; }

  const lines = [];
  const section = (title, items, fmt) => {
    if (!items.length) return;
    lines.push(`${title}（${items.length}）`);
    items.slice(0, LIMIT).forEach((x) => lines.push('  ' + fmt(x)));
    if (items.length > LIMIT) lines.push(`  …另有 ${items.length - LIMIT} 条，加 --json 看全部`);
  };
  const fileList = (fs) => clip(fs.join(' '), 60);
  section('撞文件的 open PR', r.openFiles, (x) => `#${x.pr} ${x.who} ${x.branch}「${clip(x.title, 36)}」 ${fileList(x.files)}`);
  section('撞文件的进行中分支（还没开 PR）', r.doingFiles, (x) => `${x.who} ${x.branch}「${clip(x.what, 36)}」 ${fileList(x.files)}`);
  section('关键词命中的 open PR', r.openKeyword, (x) => `#${x.pr} ${x.who} ${x.branch}「${clip(x.title)}」`);
  section('关键词命中的进行中', r.doing, (x) => `${x.who}「${clip(x.what)}」 ${clip(x.branch, 30)} | ${clip(x.state, 30)}`);
  section('已适配', r.adapted, (x) => `${x.vndb} ${clip(x.row.join(' | '), 90)}`);
  section('已完成（HANDOFF-done）', r.done, (x) => clip(x.slice(2), 90));
  section('已合并 PR', r.merged, (x) => `#${x.pr} ${x.mergedAt}「${clip(x.title)}」`);
  r.warnings.forEach((w) => lines.push('注意：' + w));
  const scope = `${files.length} 个文件${autoFiles ? '（本分支改动）' : ''}`;
  lines.push(collide ? `有撞车：先和上面的人确认再动手。查了 ${scope}。` : `无冲突。查了 ${scope}。`);
  process.stdout.write(lines.join('\n') + '\n');
  return collide ? 1 : 0;
}

module.exports = { classifyArgs, overlap, tableRows, branchesIn, matchesAny };
if (require.main === module) main().then((code) => { process.exitCode = code; });
