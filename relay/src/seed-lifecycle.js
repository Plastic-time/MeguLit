// SPDX-License-Identifier: GPL-3.0-or-later
export async function seedStatus(db,id){
  const row=await db.prepare(`SELECT s.*, b.reason,
    EXISTS(SELECT 1 FROM game_diffs d WHERE d.game_key=s.game_key AND d.layer='version'
      AND d.source='auto' AND d.rev=s.scan_rev AND d.withdrawn_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM game_diffs x WHERE x.game_key=s.game_key AND x.layer='version'
        AND x.source='official' AND x.withdrawn_at IS NULL)) AS active_scan,
    (SELECT h.profile_hash FROM torch_release_winners w JOIN torch_release_history h ON h.hash=w.hash
      WHERE w.game_key=s.game_key) AS winner,
    EXISTS(SELECT 1 FROM seed_deliveries d WHERE d.seed_id=s.id) AS delivered
    FROM seed_lifecycle s LEFT JOIN seed_lifecycle_block b ON b.id=s.id WHERE s.id=?`).bind(id).first();
  if(!row)return null;
  let state='received';
  if(row.reason)state=row.reason;
  else if(row.winner&&row.winner===row.review_hash||!row.winner&&row.scan==='published'&&row.active_scan)state='published';
  else if(row.scan==='pending'||row.review==='pending')state='pending';
  else if(row.scan||row.review)state='superseded';
  return {id,state,steps:{scan:row.scan,review:row.review},notificationKey:row.delivered?id:null};
}

export async function pendingSeeds(db){
  return (await db.prepare(`SELECT count(*) AS n FROM (
    SELECT coalesce(seed_id,id) AS id FROM ordinary_seed_jobs WHERE state='pending'
    UNION SELECT j.id FROM enhanced_seed_jobs j WHERE j.state='pending'
  ) p WHERE NOT EXISTS(SELECT 1 FROM seed_lifecycle_block b WHERE b.id=p.id)`).first()).n;
}
