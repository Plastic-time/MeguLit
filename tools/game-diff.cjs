// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 maintainer tool for game diffs (docs/auto-profile.md).
   node tools/game-diff.cjs keygen                          a new Ed25519 key: the private one (PKCS#8 DER, base64) for
                                                            `wrangler secret put AUTO_PROFILE_SIGNING_KEY` and the public one
                                                            (SPKI DER, base64) for services/auto-profile-keys.json
   node tools/game-diff.cjs key <game.exe>                  the diff key of a program file ('x-' + 40 hex of its SHA-256)
   node tools/game-diff.cjs make <key> <settings.json> [--mode hide|read] [--exe name] [--engine id] > diff.json
                                                            an official diff from settings (only domain keys survive; the
                                                            dropped ones are listed on stderr)
   node tools/game-diff.cjs sign <diff.json> <private-key.pem> <keyId> > signed.json
                                                            sign with an adapter-pack key (services/adapter-pack-keys.json)
   node tools/game-diff.cjs check <signed.json>             shape, values and signature as the app checks them
   Publishing is POST /api/auto-profile/official {diff} with the maintainer token; this tool never talks to the relay. */
const fs=require('node:fs'),crypto=require('node:crypto');
const gameDiff=require('../core/game-diff.cjs'),{clean}=require('../core/profiles/domains.cjs');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const [cmd,a,b,c]=process.argv.slice(2);
function signDoc(doc,privateKey,keyId){const body=gameDiff.unsigned(doc);return {...body,signature:{alg:'ed25519',keyId,value:crypto.sign(null,Buffer.from(gameDiff.canonical(body)),privateKey).toString('base64')}};}
if(require.main===module){
 if(cmd==='keygen'){const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  console.log(JSON.stringify({secret:privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')},null,1));}
 else if(cmd==='key'){console.log('x-'+crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex').slice(0,40));}
 else if(cmd==='make'){const settings=JSON.parse(fs.readFileSync(b,'utf8'));const r=clean(settings);if(r.rejected.length)console.error('dropped: '+r.rejected.join(', '));
  const d=gameDiff.build({key:a,source:'official',mode:arg('mode','hide'),settings:r.value,exe:arg('exe',''),engine:arg('engine','')});const v=gameDiff.validate(d);if(!v.ok){console.error('invalid: '+v.error);process.exit(1);}console.log(JSON.stringify(d,null,1));}
 else if(cmd==='sign'){const d=JSON.parse(fs.readFileSync(a,'utf8'));const v=gameDiff.validate(d);if(!v.ok){console.error('invalid: '+v.error);process.exit(1);}console.log(JSON.stringify(signDoc(d,crypto.createPrivateKey(fs.readFileSync(b,'utf8')),c),null,1));}
 else if(cmd==='check'){const d=JSON.parse(fs.readFileSync(a,'utf8'));const v=gameDiff.validate(d);const feed=require('../services/auto-profile-feed.cjs');const k=feed.keys();
  const ok=v.ok&&feed.verify(d,d.source==='official'?k.official:k.auto);console.log(v.ok?(ok?'ok':'bad signature'):'invalid: '+v.error);process.exit(ok?0:1);}
 else{console.error('usage: keygen | key <exe> | make <key> <settings.json> | sign <diff.json> <key.pem> <keyId> | check <signed.json>');process.exit(2);}}
module.exports={signDoc};
