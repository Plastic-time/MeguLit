import {authenticate,sha256} from './accounts.js';
import works from './torch-works.json' with {type:'json'};

export const nameKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/gu,'');

export async function rosterOwner(request,env,now){
 if(!request.headers.has('authorization'))return null;
 const auth=await authenticate(request,env,now);
 return auth?'account:'+await sha256('torch-roster:'+auth.account.id):null;
}

export const carvingFor=(db,no)=>db.prepare(`SELECT c.torch_no,c.name,c.alias,c.at FROM torch_roster_links l
 JOIN torch_carvings c ON c.torch_no=l.carving_no WHERE l.torch_no=? AND c.name_key IS NOT NULL`).bind(no).first();

// D1 serializes this batch, including both name claims and the first upload of a work.
// An exhausted pool leaves the contribution available for an explicit signature.
export async function engrave(db,{owner,key,no,time,credit,preferred,declaredWork}){
 const work=works[key];
 if(!owner||!work||(declaredWork&&declaredWork!==work))return;
 const statements=[];
 const q=(sql,...args)=>statements.push(db.prepare(sql).bind(...args));
 if(credit.name)q('INSERT OR IGNORE INTO torch_roster_names VALUES(?,?,?,0)',nameKey(credit.name),credit.name,owner);
 q(`INSERT OR IGNORE INTO torch_roster_names(name_key,label,owner,automatic)
    SELECT lower(label),label,?,1 FROM (
     SELECT ? AS label,-1 AS priority UNION ALL
     SELECT name,(slot-?%24+24)%24 FROM torch_alias_pool
    ) candidate WHERE label IS NOT NULL AND NOT EXISTS(SELECT 1 FROM torch_roster_names WHERE owner=? AND automatic=1)
     AND NOT EXISTS(SELECT 1 FROM torch_roster_names WHERE name_key=lower(candidate.label))
    ORDER BY priority LIMIT 1`,owner,preferred??null,no,owner);
 q('INSERT OR IGNORE INTO torch_carvings(torch_no,owner,work,game_key,at) VALUES(?,?,?,?,?)',no,owner,work,key,time);
 q('INSERT OR IGNORE INTO torch_roster_links SELECT ?,torch_no FROM torch_carvings WHERE owner=? AND work=?',no,owner,work);
 if(credit.name!==undefined)q(`UPDATE torch_carvings SET name=(
   SELECT label FROM torch_roster_names WHERE name_key=? AND owner=?
 ) WHERE owner=? AND work=? AND (? IS NULL OR EXISTS(SELECT 1 FROM torch_roster_names WHERE name_key=? AND owner=?))`,nameKey(credit.name),owner,owner,work,credit.name,nameKey(credit.name),owner);
 q(`UPDATE torch_carvings SET alias=(SELECT label FROM torch_roster_names WHERE owner=? AND automatic=1),
   name_key=CASE WHEN name IS NOT NULL THEN (SELECT name_key FROM torch_roster_names WHERE owner=? AND label=torch_carvings.name)
      ELSE (SELECT name_key FROM torch_roster_names WHERE owner=? AND automatic=1) END WHERE owner=? AND work=?`,owner,owner,owner,owner,work);
 await db.batch(statements);
}
