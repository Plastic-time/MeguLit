// SPDX-License-Identifier: GPL-3.0-or-later
import {readFileSync} from 'node:fs';
import {randomBytes,createPublicKey} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {unstable_readConfig as readConfig} from 'wrangler';
import ordinary from '../core/ordinary-seed.cjs';
import {scan} from './src/ordinary-seed.js';

function spki(key){
 const bytes=Buffer.from(key.publicKey,'base64');
 const publicKey=createPublicKey({key:bytes,type:'spki',format:'der'});
 if(publicKey.asymmetricKeyType!=='ed25519')throw Error('expected Ed25519 public key');
 return publicKey.export({type:'spki',format:'der'}).toString('base64');
}

export async function checkGateway(vars,desktop,token){
 const keys=JSON.parse(vars.ORDINARY_PUBLIC_KEYS||'[]');
 if(!Array.isArray(keys)||!keys.some(k=>!k.revoked)||!isDeepStrictEqual(keys,desktop))
  throw Error('configure matching ordinary public keys in the Worker and receiver');
 const elevatedKeys=['PROFILE_PUBLIC_KEYS','TORCH_RELEASE_PUBLIC_KEYS','CARDINAL_REVIEW_PUBLIC_KEYS']
  .flatMap(name=>JSON.parse(vars[name]||'[]')).map(spki);
 if(new Set(keys.map(k=>k.id)).size!==keys.length||keys.some(k=>
  !ordinary.keyId(k.id)||k.alg!=='ed25519'||elevatedKeys.includes(spki(k))))
  throw Error('use unique ordinary IDs and dedicated Ed25519 key material');
 // scan() checks URL, digests, receipt freshness and signature, just as the Worker does.
 const doc=ordinary.document({key:randomBytes(32).toString('hex'),mode:'read',
  settings:{hide:{textEffectsRead:true}}},1,new Date().toISOString());
 const result=await scan({...vars,ORDINARY_SCAN_TOKEN:token},doc);
 if(!result.signed)throw Error('gateway did not return a clean signed receipt');
 return {...JSON.parse(result.receipt),keyId:result.signed.signature.keyId,artifact:result.hash};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [config,trust]=process.argv.slice(2);
  if(!config||!trust)throw Error('usage: node relay/check-ordinary.mjs <wrangler.toml> <installed ordinary-seed-keys.json>');
  const {vars}=readConfig({config});
  console.log(JSON.stringify(await checkGateway(vars,JSON.parse(readFileSync(trust,'utf8')).keys,process.env.ORDINARY_SCAN_TOKEN)));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
