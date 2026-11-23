// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 user test (素晴らしき日々 BGI, 11:17Z): after the player opened the game's LOG screen, the reader read old lines, the
   game's text was no longer hidden and names stopped (「はぁ……」 shown as narration). Bridge log:
     11:17:12 last story line on EmbedBGI 98b350:0:1 (write-back), then 17 s of LOG reading;
     11:17:29 「follow EmbedBGI: the selected context went quiet, the same hook carries the dialogue in 98b350:0:0」: the LOG page
              drew 50 old lines through the same hook in another context within 0.3 s, and the follow moved the selection there
              and set the dialogue context read-only (was.embed=false);
     11:17:38 back in the story, 「leave dialogue-less stream 98b350:0:0 for EmbedBGI id=98b350:0:1」 → 「select … embed=False」:
              read-only with a GDI probe, no write-back, no names through the embed callback.
   Now a burst (lines under 0.35 s apart: a LOG, backlog or recollection page) never counts toward the same-hook follow, and a
   context that is left keeps what it was verified as. Any engine. Timings below are the real ones from that log. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const cs=fs.readFileSync(path.join(__dirname,'../native/HookBridge.cs'),'utf8');
const dumpBody=/public static bool PageDump\(string text\)\{string t=text\?\?"";int breaks=0,quotes=0;foreach\(char ch in t\)\{if\(ch=='\\n'\)breaks\+\+;else if\(ch=='「'\|\|ch=='『'\)quotes\+\+;\}(return [^}]*)\}/.exec(cs);
const PageDump=t=>{t=t||'';let breaks=0,quotes=0;for(const ch of t){if(ch==='\n')breaks++;else if(ch==='「'||ch==='『')quotes++;}return Function('breaks','quotes','t',dumpBody[1])(breaks,quotes,t);};
const pace=(hits,since,text)=>PageDump(text)?0:since>=0.35?hits+1:0;
const at=t=>Date.parse('2026-11-19T'+t+'Z')/1000;
/* the LOG page lines on 98b350:0:0 (11:17:29.767 … 11:17:31.665, 50 lines) and the story lines on 98b350:0:1 before it */
const LOG=['11:17:29.767','11:17:29.773','11:17:29.817','11:17:29.860','11:17:29.885','11:17:29.888','11:17:29.924','11:17:29.962','11:17:29.980','11:17:30.095','11:17:30.135','11:17:30.172','11:17:30.191','11:17:30.201','11:17:30.213','11:17:30.266','11:17:30.276','11:17:30.287','11:17:30.338','11:17:30.394','11:17:30.441','11:17:30.501','11:17:30.505','11:17:30.571','11:17:30.791','11:17:30.804','11:17:30.815','11:17:30.847','11:17:30.869','11:17:30.885','11:17:30.921','11:17:30.940','11:17:30.967','11:17:30.969','11:17:30.982','11:17:31.013','11:17:31.032','11:17:31.099','11:17:31.164','11:17:31.183','11:17:31.233','11:17:31.244','11:17:31.343','11:17:31.353','11:17:31.393','11:17:31.416','11:17:31.431','11:17:31.459','11:17:31.483','11:17:31.552','11:17:31.585','11:17:31.643','11:17:31.665'].map(at);
const STORY=['11:17:01.515','11:17:03.126','11:17:05.674','11:17:07.334','11:17:08.519','11:17:09.935','11:17:11.888'].map(at);
const replay=(times,text='「お？」')=>{let hits=0,last=null,max=0;for(const t of times){hits=pace(hits,last===null?Infinity:t-last,typeof text==='function'?text(t):text);last=t;max=Math.max(max,hits);}return max;};
/* the flushed LOG page as the hook gave it (bridge 11:17:29.447: 1820 chars), the start of it */
const LOG_PAGE='【ざくろ】「な、なにが？」【由岐】「V系だ！」【ざくろ】「？」【ざくろ】「？」　いや……それは私も同じだ……。\n　もっと核心に迫るならば……。\n　知ってる……。';

test('the LOG page (real timings) never reaches the two paced lines the follow needs',()=>{
 assert.ok(replay(LOG)<2,'LOG burst: '+replay(LOG));
 /* the player scrolls the LOG: every scroll redraws a page as a burst, seconds apart */
 assert.ok(replay([...LOG,...LOG.map(t=>t+4),...LOG.map(t=>t+9)])<2,'scrolled LOG pages');
 assert.ok(replay([at('11:17:27.400'),at('11:17:29.447')],LOG_PAGE)<2,'whole LOG pages flushed seconds apart are dumps, not lines');
 assert.equal(PageDump(LOG_PAGE),true);assert.equal(PageDump('「そこに覆い被さる……重く真っ青な空は、\nいつでも当たり前の姿を私達に見せてくれる。」'),false,'a two-row message is one line');
});

test('dialogue that moved to a new context, paced like reading, is still followed (name-entry screen, new chapter)',()=>{
 assert.ok(replay(STORY.slice(0,2),'　週の終わり、だからこそもっとも忙しい昼。')>=2);
});

test('the context left keeps its write-back, and the native self-test covers the rule',()=>{
 const follow=/hits>=2\)\{SameHookHits\.Clear\(\);SelectedTextAt=DateTime\.UtcNow;Candidate was=Candidates\[Selected\];c\.embed=was\.embed;c\.hideOnly=was\.hideOnly;c\.gdiProbe=was\.gdiProbe;c\.glyphHide=was\.glyphHide;(.{0,400}?)Diagnostic\("follow "/s.exec(cs);
 assert.ok(follow,'follow block');assert.doesNotMatch(follow[1],/was\.embed=false|was\.hideOnly=false/,'the dialogue context is not made read-only');
 assert.match(cs,/hits=SameHookPace\(hits,since,text\);SameHookHits\[tp\.Key\(\)\]=hits;/);assert.match(cs,/public static int SameHookPace\(int hits,double sinceLast,string text\)\{return PageDump\(text\)\?0:sinceLast>=0\.35\?hits\+1:0;\}/,'the test mirrors the native rule');
 assert.match(cs,/if\(!SameHookSelfTest\(\)\)\{Console\.Error\.WriteLine\("FAIL same-hook follow/);
});
