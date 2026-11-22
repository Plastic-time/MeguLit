// SPDX-License-Identifier: GPL-3.0-or-later
/* A receipt describes an installed adaptation, never the player's save or story progress. */
const HEX=/^[a-f0-9]{64}$/;
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function receiptTime(value){
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);if(!m)return null;
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return null;
 const expected=[+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6],+(m[7]||'').padEnd(3,'0')];
 const actual=[d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds()];
 return expected.every((v,i)=>v===actual[i])?d:null;
}
function credit(value){if(!plain(value)||!Number.isSafeInteger(value.torchNo)||value.torchNo<0)return null;
 let name=null;if(typeof value.name==='string'){const s=value.name.trim();if(s&&[...s].length<=30&&!/[\p{Cc}\p{Cf}]/u.test(s))name=s;}
 return {torchNo:value.torchNo,name};
}
export function installedReceipt(dto){const r=dto?.receipt;
 if(!plain(r)||r.version!==1||r.status!=='installed'||r.verified!==true||!HEX.test(r.key)||r.key!==dto.key||!HEX.test(r.hash)||!Number.isSafeInteger(r.revision)||r.revision<1)return null;
 return {key:r.key,hash:r.hash,revision:r.revision,serverTime:receiptTime(r.serverTime)?.toISOString()||null,credit:credit(r.credit),cardinalRev:typeof r.cardinalRev==='string'&&/^[A-Za-z0-9._-]{1,40}$/.test(r.cardinalRev)?r.cardinalRev:null};
}
const COPY={
 zh:{installed:'已安装此版本的适配',unconfirmed:'适配数据已收到，尚未确认本机安装',installing:'正在匹配并安装适配',failed:'适配安装未完成，稍后会再检查',from:'传火来源',unknown:'来源未提供',time:'发布时间',noTime:'时间未提供',revision:'适配版本',hash:'内容校验值',cardinal:'Cardinal 修订'},
 ja:{installed:'このバージョンの適応をインストール済み',unconfirmed:'適応データを受信しました。この PC へのインストールは未確認です',installing:'適応を照合してインストール中',failed:'適応のインストールは未完了です。後ほど再確認します',from:'火の提供元',unknown:'提供元は未登録',time:'公開日時',noTime:'日時は未登録',revision:'適応リビジョン',hash:'内容の検証値',cardinal:'Cardinal リビジョン'},
 en:{installed:'Adaptation installed for this version',unconfirmed:'Adaptation data received; installation on this PC is not yet confirmed',installing:'Matching and installing the adaptation',failed:'Adaptation installation is incomplete; it will be checked again later',from:'Flame shared by',unknown:'Source not provided',time:'Published',noTime:'Time not provided',revision:'Adaptation revision',hash:'Content checksum',cardinal:'Cardinal revision'}
};
const LOOKUP_COPY={
 zh:{missing:'此版本暂无可接收的已发布适配',unavailable:'暂时无法查询传火服务，稍后会再检查'},
 ja:{missing:'このバージョンで受け取れる公開済みの適応はありません',unavailable:'伝火サービスに問い合わせできませんでした。後でもう一度確認します'},
 en:{missing:'No published adaptation is available for this version',unavailable:'The relay could not be reached. It will be checked again later'}
};
export function receiptView(dto,{locale='zh',esc,torch=n=>'#'+n}={}){const w=COPY[locale]||COPY.zh,r=installedReceipt(dto),state=dto?.state;
 const lookup=LOOKUP_COPY[locale]||LOOKUP_COPY.zh;
 const text=state==='not-published'?lookup.missing:state==='installing'?w.installing:state==='install-failed'?(dto.code==='TORCH_RELAY_UNAVAILABLE'?lookup.unavailable:w.failed):r?w.installed:w.unconfirmed;
 if(state!=='received'||!r)return {signature:JSON.stringify([state,text]),html:`<p class="first-player-from" role="status">${esc(text)}</p>`};
 const who=r.credit?(r.credit.name||torch(r.credit.torchNo)):w.unknown;
 const date=r.serverTime?new Date(r.serverTime).toLocaleString(({zh:'zh-CN',ja:'ja-JP',en:'en-US'})[locale]||'zh-CN',{dateStyle:'medium',timeStyle:'short'}):w.noTime;
 const rows=[[w.revision,String(r.revision)],[w.hash,r.hash],...(r.cardinalRev?[[w.cardinal,r.cardinalRev]]:[])];
 return {signature:JSON.stringify(r),html:`<p class="first-player-from">${esc(text)}</p><p class="first-player-receipt-source">${esc(w.from)} · ${esc(who)}</p><p class="first-player-receipt-time">${esc(w.time)} · ${r.serverTime?`<time datetime="${esc(r.serverTime)}">${esc(date)}</time>`:esc(date)}</p><details class="first-player-receipt-details"><summary>${esc(w.hash)} · ${esc(r.hash.slice(0,12))}</summary><dl>${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>`};
}
