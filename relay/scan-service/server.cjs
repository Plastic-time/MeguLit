// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const ordinary = require('../../core/ordinary-seed.cjs');
const diff = require('../../core/game-diff.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function command(connection, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(connection);
    const timer = setTimeout(() => socket.destroy(Error('clamd timeout')), 6000);
    let reply = Buffer.alloc(0);
    socket.on('connect', () => socket.write(bytes));
    socket.on('error', reject);
    socket.on('close', () => { clearTimeout(timer); reject(Error('incomplete clamd reply')); });
    socket.on('data', chunk => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > 512) return socket.destroy(Error('oversized clamd reply'));
      if (reply.includes(0)) {
        if (reply.indexOf(0) === reply.length - 1) resolve(reply.subarray(0,-1).toString('ascii'));
        socket.destroy();
      }
    });
  });
}
async function scan(connection, bytes) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const result = await command(connection, Buffer.concat([Buffer.from('zINSTREAM\0'), length, bytes, Buffer.alloc(4)]));
  if (/^stream: [^\r\n]+ FOUND$/.test(result)) return 'infected';
  if (result === 'stream: OK') return 'clean';
  throw Error('indeterminate clamd reply');
}
async function scannerInfo(config) {
  const connection = {host:config.CLAMD_HOST || '127.0.0.1', port:Number(config.CLAMD_PORT || 3310)};
  const version = await command(connection, Buffer.from('zVERSION\0'));
  const match = /^ClamAV ([\d.]+)\/(\d+)\/(.+)$/.exec(version);
  const age = Date.now() - Date.parse(match?.[3]);
  if (!match || !Number.isFinite(age) || age < -3600000 || age > 7*86400000) throw Error('clamd definitions unavailable');
  return {connection,version:match[1],definitions:match[2]};
}
async function inspect(doc, bytes, config) {
  const {connection,version,definitions}=await scannerInfo(config);
  const receipt = {subject:hash(bytes), scanner:'ClamAV',version,definitions,scannedAt:new Date().toISOString()};
  if (await scan(connection, bytes) === 'infected') return {...receipt,state:'infected'};
  if (!ordinary.keyId(config.ORDINARY_KEY_ID)) throw Error('publisher unavailable');
  const key = crypto.createPrivateKey(fs.readFileSync(config.ORDINARY_PRIVATE_KEY_FILE));
  if (key.asymmetricKeyType !== 'ed25519') throw Error('publisher unavailable');
  const signature = {alg:'ed25519',keyId:config.ORDINARY_KEY_ID,value:crypto.sign(null, bytes, key).toString('base64')};
  const artifact = Buffer.from(diff.canonical({...doc, signature}));
  const state = await scan(connection, artifact);
  return {...receipt,state,artifact:hash(artifact),...(state === 'clean' ? {signature} : {})};
}
function server(config) {
  if (!config.ORDINARY_SCAN_TOKEN || config.ORDINARY_SCAN_TOKEN.length < 32) throw Error('Configure ORDINARY_SCAN_TOKEN');
  const auth = Buffer.from(hash('Bearer ' + config.ORDINARY_SCAN_TOKEN));
  let active = 0;
  return http.createServer({requestTimeout:15000,headersTimeout:10000}, async (req,res) => {
    const send = (status,value) => { res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(value)); };
    const health=req.method==='GET'&&req.url==='/health';
    if (!health && (req.method !== 'POST' || req.url !== '/scan')) return send(404,{});
    if (!crypto.timingSafeEqual(auth,Buffer.from(hash(req.headers.authorization || '')))) return send(401,{});
    if(health){try{await scannerInfo(config);return send(200,{scanner:'online'});}catch{return send(200,{scanner:'unready'});}}
    if (active >= 2) return send(503,{});
    active++;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) return send(413,{});
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks), text = bytes.toString('utf8');
      let doc;
      try { doc = JSON.parse(text); } catch { return send(422,{}); }
      if (!ordinary.valid(doc) || !bytes.equals(Buffer.from(diff.canonical(doc)))) return send(422,{});
      send(200,await inspect(doc,bytes,config));
    } catch { send(503,{state:'unavailable'}); }
    finally { active--; }
  });
}
if (require.main === module) server(process.env).listen(Number(process.env.PORT || 8093),'127.0.0.1');
module.exports = {server};
