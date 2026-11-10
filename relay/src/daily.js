// SPDX-License-Identifier: GPL-3.0-or-later
/* E415 每日 page: Galgame news and today's hot Japanese words, fetched on a cron and cached in D1 (daily_cache).
   The app reads only GET /api/news and GET /api/hotwords/daily, so it works where the source sites are slow or blocked.

   Sources (public RSS only; each site's robots.txt allows these paths; we keep title, date, source, a one-or-two
   sentence summary, a thumbnail URL and the link, never the article body):
     Moepedia 美少女ゲームカレンダー  https://moepedia.net/feed/                      (all items: it is a galgame site)
     4Gamer.net                     https://www.4gamer.net/rss/index.xml            (only items matching GAL_WORDS)
     電ファミニコゲーマー             https://news.denfaminicogamer.jp/feed           (only items matching GAL_WORDS)
     Google トレンド (JP daily)      https://trends.google.com/trending/rss?geo=JP   (hot words, with one related headline)
     NHK ニュース                    https://www3.nhk.or.jp/rss/news/cat0.xml        (fallback hot words when Trends fails:
                                                                                     「」-quoted terms in the headlines) */
const UA='MeguLitRelay/1.0 (+https://megulit.com)';
export const NEWS_FEEDS=[
 {id:'moepedia',name:'Moepedia',url:'https://moepedia.net/feed/',all:true},
 {id:'4gamer',name:'4Gamer.net',url:'https://www.4gamer.net/rss/index.xml'},
 {id:'denfami',name:'電ファミニコゲーマー',url:'https://news.denfaminicogamer.jp/feed'}
];
export const TRENDS_URL='https://trends.google.com/trending/rss?geo=JP',NHK_URL='https://www3.nhk.or.jp/rss/news/cat0.xml';
export const GAL_WORDS=/ノベル|美少女|ギャルゲ|エロゲ|恋愛|乙女ゲ|Key|ゆずソフト|サガプラネッツ|ぱれっと|オーガスト|TYPE-MOON|ニトロプラス|アリスソフト|Navel|まどそふと|ういんどみる|クロシェット|SMEE|HOOKSOFT|あざらしそふと|ensemble|feng|minori|CIRCUS|ねこねこ|Frontwing|フロントウイング|MAGES|ヒロイン|Galgame|galgame/;
const MAX_NEWS=40,MAX_WORDS=20;

/* ---- tiny RSS/RDF reader (no DOM in Workers) ------------------------------------------------------------------ */
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function decode(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1))):ENT[e.toLowerCase()]??m);}
const text=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>'));return m?m[1]:'';};
const safeUrl=v=>{try{const u=new URL(decode(v).trim());return u.protocol==='https:'||u.protocol==='http:'?u.href.slice(0,500):'';}catch{return '';}};
/* one or two sentences, at most 120 characters */
export function summary(s){const t=text(s).replace(/\s*\[…\]$|\s*\[&#8230;\]$/,'');const parts=t.match(/[^。！？!?]+[。！？!?]?/g)||[];let out='';for(const p of parts.slice(0,2)){if((out+p).length>120)break;out+=p;}return (out||t.slice(0,118)+(t.length>118?'…':'')).trim();}
export function items(xml){return [...String(xml||'').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].map(m=>m[1]);}
export function parseNews(xml,feed){
 return items(xml).map(it=>{
  const title=text(tag(it,'title')).slice(0,160),link=safeUrl(tag(it,'link')||(it.match(/rdf:about="([^"]+)"/)||[])[1]||'');
  const when=Date.parse(text(tag(it,'pubDate')||tag(it,'dc:date')));
  const body=tag(it,'content:encoded');
  const image=safeUrl((it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/)||it.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/)||decode(body).match(/<img[^>]*src="([^"]+)"/)||[])[1]||'');
  return {title,link,date:Number.isFinite(when)?new Date(when).toISOString():'',source:feed.name,sourceId:feed.id,summary:summary(tag(it,'description')||body),image};
 }).filter(n=>n.title&&n.link&&(feed.all||GAL_WORDS.test(n.title+' '+n.summary)));
}
const KANA=/^[ぁ-ゟ゠-ヿー・\s]+$/;
export function parseTrends(xml){
 return items(xml).map(it=>{const term=text(tag(it,'title')).slice(0,40),news=tag(it,'ht:news_item');
  return {term,reading:KANA.test(term)?term:'',traffic:text(tag(it,'ht:approx_traffic')).slice(0,12),headline:text(tag(news,'ht:news_item_title')).slice(0,160),url:safeUrl(tag(news,'ht:news_item_url')),source:text(tag(news,'ht:news_item_source')).slice(0,40)};})
  .filter(w=>w.term&&/[぀-ヿ一-鿿]/.test(w.term));
}
/* NHK fallback: terms in 「」 from today's headlines (names of laws, events, catchphrases) */
export function parseNhk(xml){
 const seen=new Set(),out=[];
 for(const it of items(xml)){const title=text(tag(it,'title')),url=safeUrl(tag(it,'link'));
  for(const m of title.matchAll(/「([^」]{2,16})」/g)){const term=m[1].trim();if(seen.has(term)||!/[぀-ヿ一-鿿]/.test(term))continue;seen.add(term);out.push({term,reading:KANA.test(term)?term:'',traffic:'',headline:title.slice(0,160),url,source:'NHK'});}}
 return out;
}

/* ---- fetch + cache --------------------------------------------------------------------------------------------- */
async function get(url,fetcher){try{const r=await fetcher(url,{headers:{'user-agent':UA,accept:'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(10000)});return r.ok?await r.text():'';}catch{return '';}}
export const dayKey=(now=new Date())=>new Date(now.getTime()+9*3600e3).toISOString().slice(0,10); /* Japan date */
async function save(env,kind,day,payload,now){await env.DB.prepare('INSERT INTO daily_cache(kind,day,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,day) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(kind,day,JSON.stringify(payload),now.getTime()).run();}
async function load(env,kind,day){const row=day?await env.DB.prepare('SELECT payload,updated_at FROM daily_cache WHERE kind=? AND day=?').bind(kind,day).first():await env.DB.prepare('SELECT payload,updated_at FROM daily_cache WHERE kind=? ORDER BY day DESC LIMIT 1').bind(kind).first();if(!row)return null;try{return {...JSON.parse(row.payload),updatedAt:new Date(row.updated_at).toISOString()};}catch{return null;}}
export async function refreshNews(env,now=new Date(),fetcher=fetch){
 const lists=await Promise.all(NEWS_FEEDS.map(async f=>parseNews(await get(f.url,fetcher),f)));
 const seen=new Set(),all=lists.flat().filter(n=>!seen.has(n.link)&&seen.add(n.link)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,MAX_NEWS);
 if(!all.length)return 0;
 if(env.BUCKET)await mirrorImages(env,all,now,fetcher).catch(()=>0);else for(const n of all)n.image='';
 await save(env,'news',dayKey(now),{items:all,sources:NEWS_FEEDS.map(f=>({id:f.id,name:f.name}))},now);return all.length;
}
export async function refreshWords(env,now=new Date(),fetcher=fetch){
 let words=parseTrends(await get(TRENDS_URL,fetcher)),source='Google トレンド';
 if(words.length<10){const nhk=parseNhk(await get(NHK_URL,fetcher));const have=new Set(words.map(w=>w.term));words=[...words,...nhk.filter(w=>!have.has(w.term))];source=!have.size?'NHK':nhk.length?'Google トレンド · NHK':source;}
 words=words.slice(0,MAX_WORDS);if(!words.length)return 0;
 await save(env,'hotwords',dayKey(now),{words,source},now);return words.length;
}
export async function refreshDaily(env,now=new Date(),fetcher=fetch){const [news,words]=await Promise.all([refreshNews(env,now,fetcher).catch(()=>0),refreshWords(env,now,fetcher).catch(()=>0)]);const images=env.BUCKET?await cleanupImages(env,now).catch(()=>0):0;return {news,words,removed:images};}
const STALE=3*3600e3;
async function cached(env,kind,now,refresh){
 let row=await load(env,kind,'');
 /* first request after deploy (or a missed cron): fetch inline once */
 if(!row||now.getTime()-Date.parse(row.updatedAt)>STALE*2){await refresh(env,now).catch(()=>0);row=await load(env,kind,'')||row;}
 return row;
}
export async function newsGet(env,{json},now=new Date()){const row=await cached(env,'news',now,refreshNews);return json({items:row?.items||[],sources:row?.sources||NEWS_FEEDS.map(f=>({id:f.id,name:f.name})),updatedAt:row?.updatedAt||null},200,{'cache-control':'public, max-age=600'});}
export async function hotWordsDailyGet(env,url,{json,fail},now=new Date()){
 const day=url.searchParams.get('day')||'';if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return fail('INVALID_DAY',400);
 const row=day?await load(env,'hotwords',day):await cached(env,'hotwords',now,refreshWords);
 return json({day:day||dayKey(now),words:row?.words||[],source:row?.source||'',updatedAt:row?.updatedAt||null},200,{'cache-control':'public, max-age=600'});
}

/* ---- thumbnails mirrored into R2 -------------------------------------------------------------------------------
   The app's CSP allows only its own images, and the source sites can be slow from mainland China, so every thumbnail
   is copied to R2 (daily-img/<id>) and served as GET /api/news/img/<id>. Stories without an RSS picture get their
   page's og:image (only for the top MIRROR stories, to stay under the Worker's subrequest limit). Objects older than
   KEEP_DAYS are deleted by the same cron. */
export const MIRROR=16,IMG_MAX=900*1024,KEEP_DAYS=2;
const IMG_TYPES=/^image\/(jpeg|png|webp|gif|avif)$/;
async function hex(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);}
async function ogImage(link,fetcher){try{const r=await fetcher(link,{headers:{'user-agent':UA,accept:'text/html'},signal:AbortSignal.timeout(8000)});if(!r.ok)return '';const html=(await r.text()).slice(0,200000);const m=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);return m?safeUrl(new URL(decode(m[1]),link).href):'';}catch{return '';}}
async function copyImage(env,key,url,fetcher,now){
 try{const r=await fetcher(url,{headers:{'user-agent':UA,accept:'image/*'},signal:AbortSignal.timeout(10000)});const type=(r.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!r.ok||!IMG_TYPES.test(type)||Number(r.headers?.get?.('content-length')||0)>IMG_MAX)return false;
  const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>IMG_MAX)return false;
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{at:String(now.getTime())}});return true;}catch{return false;}
}
export async function mirrorImages(env,items,now=new Date(),fetcher=fetch){
 let done=0;
 for(const [i,n] of items.entries()){
  const id=await hex(n.link),key='daily-img/'+id;
  if(i>=MIRROR){n.image='';continue;}
  let have=!!(await env.BUCKET.head?.(key));
  if(!have){const src=n.image||await ogImage(n.link,fetcher);have=!!src&&await copyImage(env,key,src,fetcher,now);}
  n.image=have?'/api/news/img/'+id:'';if(have)done++;
 }
 return done;
}
export async function imageGet(env,id){
 const obj=await env.BUCKET.get('daily-img/'+id);if(!obj)return new Response('',{status:404});
 return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'image/jpeg','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
}
export async function cleanupImages(env,now=new Date()){
 let removed=0,cursor;
 do{const page=await env.BUCKET.list({prefix:'daily-img/',cursor,include:['customMetadata']});
  for(const o of page.objects||[]){const at=Number(o.customMetadata?.at)||new Date(o.uploaded||0).getTime();if(now.getTime()-at>KEEP_DAYS*864e5){await env.BUCKET.delete(o.key);removed++;}}
  cursor=page.truncated?page.cursor:undefined;}while(cursor);
 return removed;
}
