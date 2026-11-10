/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 日语核心体系总览 (2026-11-11). The order of the map follows a whole-system walk through Japanese grammar the user
   pointed to (sentence order → particles → word classes → conjugation → auxiliaries → politeness → tense and aspect →
   viewpoint → compound sentences); the explanations are MeguLit's own words. Each N5 point sits on one node, and may
   touch others. */
export const MAP=[
 {id:'order',no:'一',title:{zh:'句子骨架',ja:'文の骨組み',en:'Sentence skeleton'},
  line:{zh:'谓语永远在最后，修饰语永远在前面，主语能省就省',ja:'述語は最後、修飾語は前、主語はよく省かれる',en:'The predicate comes last, modifiers come first, the subject is often dropped'},
  body:{zh:'中文是「我 吃 苹果」，日语是「我 苹果 吃」。一句话最重要的部分在句尾：是「是」、是「做」还是「怎么样」，全看最后一个词。所以读 gal 的长台词时，先找句尾，再往前看。',ja:'日本語は「私 りんご 食べる」の順。大事なことは文末に来ます。',en:'Japanese says "I apple eat". The key part waits at the end, so read long lines from the end back.'},
  demo:[{ja:'私は　りんごを　食べる',zh:'我 / 苹果 / 吃'}]},
 {id:'particles',no:'二',title:{zh:'助词：名词的角色牌',ja:'助詞＝役割の札',en:'Particles: role tags'},
  line:{zh:'名词后面贴一张小牌子，说明它在句子里演什么角色',ja:'名詞の後ろに付いて、その役割を示す',en:'A small tag after a noun says what role it plays'},
  body:{zh:'「先輩を」「先輩に」「先輩と」——名词没变，后面的小字一换，意思就全变了。因为有这些牌子，名词的顺序可以自由一点，只要谓语还在最后。',ja:'名詞は同じでも、助詞が変われば役割が変わります。',en:'Same noun, different tag, different role. With the tags in place, word order can move a little.'},
  demo:[{ja:'先輩を待つ　／　先輩に会う　／　先輩と帰る',zh:'等学长 / 见学长 / 和学长一起回去'}]},
 {id:'classes',no:'三',title:{zh:'词类：会变的和不会变的',ja:'品詞：変わる語と変わらない語',en:'Word classes: changing and fixed'},
  line:{zh:'名词不变形；动词、形容词会变形，变的是词尾',ja:'名詞は変わらない。動詞・形容詞は語尾が変わる',en:'Nouns stay put; verbs and adjectives change their endings'},
  body:{zh:'先分清两大类：不变形的（名词、代词、こそあど 这类指示词）和会变形的（动词、い形容词、な形容词）。会变形的那一类，后面能直接当谓语。',ja:'変わらない語（名詞・指示語など）と、変わる語（動詞・形容詞）に分けます。',en:'Split words into fixed (nouns, pointing words) and changing (verbs, adjectives). The changing ones can end a sentence.'},
  demo:[{ja:'学生　／　高い → 高くない　／　静か → 静かだった',zh:'学生 / 高→不高 / 安静→那时很安静'}]},
 {id:'conjugation',no:'四',title:{zh:'活用：词尾怎么变',ja:'活用：語尾の変化',en:'Conjugation: how endings change'},
  line:{zh:'词干不动，词尾换形状，后面才能接别的东西',ja:'語幹はそのまま、語尾が形を変えて次につながる',en:'The stem stays; the ending changes shape so more can attach'},
  body:{zh:'动词分三组：一类（五段，词尾在 あいうえお 一行里移动）、二类（一段，去掉 る 再接）、三类（只有 する 和 来る）。N5 先掌握 ます形、て形、ない形、た形 这四个最常用的形。',ja:'動詞は三つのグループ。まずは ます形・て形・ない形・た形 の四つ。',en:'Three verb groups; at N5 learn the ます, て, ない and た forms first.'},
  demo:[{ja:'書く → 書きます・書いて・書かない・書いた',zh:'写 → 礼貌 / 连接 / 否定 / 过去'}]},
 {id:'auxiliary',no:'五',title:{zh:'助动词：一块块粘上去',ja:'助動詞：後ろに貼り付ける',en:'Auxiliaries: pieces stuck on the end'},
  line:{zh:'想要、否定、过去、礼貌……都是粘在词尾后面的小零件',ja:'願望・否定・過去・丁寧などは語尾に付く部品',en:'Wanting, not, past, polite: little parts stuck to the end'},
  body:{zh:'「食べ＋たい」「食べ＋ない」「食べ＋た」「食べ＋ます」。读到一长串词尾时，从左往右一块一块拆开，每一块都有固定的意思。',ja:'長い語尾は左から一つずつ分けて読む。',en:'Split a long ending piece by piece from the left; each piece has one meaning.'},
  demo:[{ja:'食べ　たく　なかっ　た',zh:'吃 / 想 / 不 / 过去 → （那时）不想吃'}]},
 {id:'politeness',no:'六',title:{zh:'敬体和常体：说给谁听',ja:'丁寧体と普通体',en:'Polite and plain style'},
  line:{zh:'同一句话，对前辈用 です・ます，对朋友用 だ 和原形',ja:'目上には です・ます、友達には だ・辞書形',en:'Same sentence: です/ます for seniors, だ and the plain form for friends'},
  body:{zh:'gal 里角色之间的距离感，很大一部分藏在这里：一直用 です・ます 的后辈，某一天突然对你说「だ」，那就是关系变了。',ja:'キャラ同士の距離はここに表れます。',en:'Distance between characters shows here: when someone switches to plain speech, the relationship changed.'},
  demo:[{ja:'明日行きます。（对前辈）／ 明日行く。（对朋友）',zh:'明天去'}]},
 {id:'aspect',no:'七',title:{zh:'时和体：发生了没有、进行到哪',ja:'時制とアスペクト',en:'Tense and aspect'},
  line:{zh:'日语只分「过去」和「非过去」，进行和状态靠 ている',ja:'時制は「過去」と「非過去」の二つ。進行・状態は ている',en:'Only past and non-past; ongoing actions and states use ている'},
  body:{zh:'「食べる」可以是现在也可以是将来，「食べた」是过去或已经完成。「食べている」是正在吃；但「結婚している」是「已婚」——同一个 ている，看动词是持续的还是一下子完成的。',ja:'同じ ている でも、動詞によって「進行中」か「結果の状態」かが変わります。',en:'ている is "doing now" with lasting verbs, and "in the resulting state" with instant ones.'},
  demo:[{ja:'雨が降っている　／　窓が開いている',zh:'正在下雨 / 窗户开着'}]},
 {id:'viewpoint',no:'八',title:{zh:'视角：谁为谁做',ja:'視点：だれがだれのために',en:'Viewpoint: who does it for whom'},
  line:{zh:'给与受、请求，都要站在「我」这一边说',ja:'授受や依頼は「私」の側から言う',en:'Giving, receiving and requests are said from "my" side'},
  body:{zh:'「てください」是请对方为我做；以后还会学 てあげる・てくれる・てもらう。台词里谁帮了谁，常常不写主语，全靠这些词来判断。',ja:'主語がなくても、誰が誰のためにしたかが分かります。',en:'Even without a subject, these words tell you who helped whom.'},
  demo:[{ja:'待ってください。',zh:'请（为我）等一下'}]},
 {id:'clauses',no:'九',title:{zh:'复句：把短句连成长句',ja:'複文：文をつなぐ',en:'Compound sentences'},
  line:{zh:'て形、から、けど……把几句话串成一句',ja:'て形・から・けど で文をつなぐ',en:'te form, から, けど chain clauses into one line'},
  body:{zh:'gal 的长台词大多是几句短句串起来的。看到 て、から、けど、のに，就在那里切一刀，分成几段来读。修饰名词的长从句也放在名词前面：「昨日買った赤い本」。',ja:'て・から・けど の所で区切って読む。',en:'Cut long lines at て, から, けど and read them in parts.'},
  demo:[{ja:'顔を洗って、学校に行く。',zh:'洗把脸，（然后）去学校'}]}
];
/* Where each N5 point sits: the main node, then nodes it also touches. */
export const POINT_NODES={
 wa:['particles','order'],ga:['particles','order'],wo:['particles'],ni:['particles'],de:['particles'],he:['particles'],to:['particles','clauses'],mo:['particles'],no:['particles','order'],
 desu:['politeness','order'],masu:['politeness','auxiliary','conjugation'],te:['conjugation','clauses'],nai:['conjugation','auxiliary'],ta:['aspect','conjugation','auxiliary'],
 iadj:['classes','conjugation'],naadj:['classes','conjugation'],kosoado:['classes'],tai:['auxiliary'],teiru:['aspect'],tekudasai:['viewpoint','politeness'],mashou:['politeness','auxiliary']
};
export const nodeOf=id=>POINT_NODES[id]?.[0]||'order';
