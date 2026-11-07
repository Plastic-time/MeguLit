// SPDX-License-Identifier: GPL-3.0-or-later
// Retained ToMe voice style translations.
  const STYLE_RAW=[
   ['ノーマル','普通','Normal'],['ふつう','普通','Normal'],['ふつー','普通','Normal'],['普通','普通','Normal'],['通常','普通','Normal'],['標準','标准','Standard'],['ニュートラル','中性','Neutral'],['デフォルト','默认','Default'],
   ['あまあま','甜美','Sweet'],['甘々','甜美','Sweet'],['甘い','甜美','Sweet'],['ちょいあま','微甜','Slightly sweet'],['甘え','撒娇','Clingy'],['甘えんぼ','撒娇','Clingy'],['デレ','娇羞','Lovey'],['デレデレ','黏人','Lovey-dovey'],['ぶりっこ','装可爱','Cutesy'],['かわいい','可爱','Cute'],['可愛い','可爱','Cute'],
   ['ツンツン','傲娇','Tsun'],['ツンデレ','傲娇','Tsundere'],['ツンギレ','傲娇暴怒','Tsun (angry)'],['ヤンデレ','病娇','Yandere'],['やむやむ','病娇','Yandere'],['病み','病娇','Unstable'],
   ['セクシー','性感','Sexy'],['色っぽい','妩媚','Alluring'],['大人っぽい','成熟','Mature'],
   ['ささやき','耳语','Whisper'],['囁き','耳语','Whisper'],['ひそひそ','悄悄话','Hushed'],['内緒話','悄悄话','Secret talk'],['ぼそぼそ','嘟囔','Mumbling'],['小声','小声','Quiet'],
   ['喜び','喜悦','Joy'],['よろこび','喜悦','Joy'],['嬉しい','开心','Happy'],['うれしい','开心','Happy'],['楽しい','愉快','Fun'],['たのしい','愉快','Fun'],['楽々','轻松','Easygoing'],['上機嫌','心情好','Cheerful'],['ご機嫌','心情好','Cheerful'],['うきうき','雀跃','Bubbly'],['わくわく','期待','Excited'],['にこにこ','笑眯眯','Smiling'],['笑い','笑','Laughing'],
   ['怒り','生气','Angry'],['いかり','生气','Angry'],['おこ','生气','Mad'],['激おこ','暴怒','Furious'],['不機嫌','不高兴','Grumpy'],['むかむか','恼火','Irritated'],['いらいら','烦躁','Annoyed'],['ぷんぷん','气鼓鼓','Huffy'],
   ['悲しみ','悲伤','Sad'],['かなしみ','悲伤','Sad'],['悲しい','悲伤','Sad'],['泣き','哭泣','Crying'],['なみだめ','泪眼','Teary'],['涙目','泪眼','Teary'],['びえーん','哭腔','Sobbing'],['めそめそ','啜泣','Weepy'],['しょんぼり','沮丧','Dejected'],['落ち込み','低落','Down'],['沈み','消沉','Gloomy'],
   ['せつなめ','略带伤感','Wistful'],['せつない','伤感','Wistful'],['切ない','伤感','Wistful'],['寂しい','寂寞','Lonely'],['さみしい','寂寞','Lonely'],['不安','不安','Anxious'],['怯え','胆怯','Frightened'],['おびえ','胆怯','Frightened'],['こわがり','胆小','Timid'],['恐怖','害怕','Scared'],['怖い','害怕','Scared'],
   ['驚き','惊讶','Surprised'],['おどろき','惊讶','Surprised'],['びっくり','吃惊','Startled'],['呆れ','无语','Exasperated'],['あきれ','无语','Exasperated'],['嫌悪','厌恶','Disgust'],['軽蔑','轻蔑','Contempt'],['嘲笑','嘲笑','Mocking'],['煽り','挑衅','Taunting'],['あおり','挑衅','Taunting'],
   ['からかい','调侃','Teasing'],['いたずら','恶作剧','Mischievous'],['どや','得意','Smug'],['どや顔','得意','Smug'],['自信','自信','Confident'],['余裕','从容','Composed'],['照れ','害羞','Bashful'],['てれ','害羞','Bashful'],['恥ずかしい','害羞','Shy'],['はずかしい','害羞','Shy'],['恥ずかしがり','害羞','Shy'],
   ['落ち着き','沉稳','Calm'],['おちつき','沉稳','Calm'],['しっとり','温婉','Soft'],['おっとり','温吞','Mellow'],['のんびり','悠闲','Relaxed'],['ゆったり','舒缓','Leisurely'],['くーる','冷静','Cool'],['冷静','冷静','Composed'],['優しい','温柔','Gentle'],['やさしい','温柔','Gentle'],['穏やか','平和','Mild'],['おだやか','平和','Mild'],
   ['真剣','认真','Serious'],['しんけん','认真','Serious'],['真面目','认真','Earnest'],['まじめ','认真','Earnest'],['きりっ','干练','Crisp'],['はきはき','爽朗','Clear'],['元気','元气','Energetic'],['げんき','元气','Energetic'],['明るい','开朗','Bright'],['あかるい','开朗','Bright'],
   ['テンション高め','兴奋','High energy'],['ハイテンション','兴奋','High energy'],['テンション低め','无精打采','Low energy'],['ローテンション','无精打采','Low energy'],['だうなー','慵懒','Downer'],['あっぱー','高昂','Upper'],['気だるげ','慵懒','Languid'],['けだるげ','慵懒','Languid'],['無気力','无精打采','Listless'],
   ['熱血','热血','Fiery'],['叫び','呐喊','Shouting'],['さけび','呐喊','Shouting'],['絶叫','尖叫','Screaming'],
   ['眠たい','困倦','Sleepy'],['ねむたい','困倦','Sleepy'],['眠い','困倦','Sleepy'],['ねむい','困倦','Sleepy'],['ねむねむ','迷糊','Drowsy'],['寝起き','刚睡醒','Just woke up'],['へろへろ','疲惫','Exhausted'],['疲れ','疲惫','Tired'],['つかれ','疲惫','Tired'],
   ['低音','低沉','Low'],['低め','偏低','Lower'],['高音','高亢','High'],['高め','偏高','Higher'],['ゆっくり','慢速','Slow'],['早口','快语速','Fast'],['なれーしょん','旁白','Narration'],['朗読','朗读','Reading'],['読み聞かせ','讲故事','Storytelling'],['あなうんす','播报','Announcer'],['実況風','解说风','Commentary'],['にゅーす','新闻播报','News'],
   ['人間ver.','人类版','Human ver.'],['ぬいぐるみver.','布偶版','Plush ver.'],['鬼ver.','鬼版','Demon ver.'],['人間','人类','Human'],['ぬいぐるみ','布偶','Plush'],
   ['Angry','生气','Angry'],['Fear','害怕','Fear'],['Happy','开心','Happy'],['Sad','悲伤','Sad'],['Disgust','厌恶','Disgust'],['Surprised','惊讶','Surprised'],['close','近距离','Close'],['far','远距离','Far'],['close-shout','近距离喊叫','Close shout'],['far-shout','远距离喊叫','Far shout'],['子供','童声','Child'],['こども','童声','Child'],['大人','成熟','Adult'],['おとな','成熟','Adult'],['少年','少年','Boy'],['少女','少女','Girl'],['お姉さん','大姐姐','Big sister'],['おねえさん','大姐姐','Big sister'],['お嬢様','大小姐','Ojousama'],['ぎゃる','辣妹','Gal'],['関西弁','关西腔','Kansai dialect']];
  const fold=t=>String(t).normalize('NFKC').trim().toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96)).replace(/\s+/g,'');
  const STYLE=new Map(STYLE_RAW.map(([k,zh,en])=>[fold(k),[zh,en]]));
  // Exact match first; then a "base（inner）ver." compound piece by piece; then without a trailing number / "め".
  function styleText(name,i){const key=fold(name);if(!key)return '';const hit=STYLE.get(key);if(hit)return hit[i];
   const m=/^(.*?)[(（](.+?)[)）](.*)$/.exec(String(name).normalize('NFKC'));if(m){const parts=[m[1],m[2],m[3]].map(p=>p.trim()?styleText(p,i)||(!i&&/^ver\.?$/i.test(p.trim())?'版':p.trim()):'');if(parts.some((p,n)=>p&&p!==[m[1],m[2],m[3]][n].trim()))return parts[0]+(parts[1]?'（'+parts[1]+'）':'')+(parts[2]?(i?' ':'')+parts[2]:'');}
   const bare=key.replace(/[0-9]+$/,'').replace(/ver\.?$/,'');if(bare&&bare!==key){const t=STYLE.get(bare);if(t)return t[i]+(key.endsWith('ver.')||key.endsWith('ver')?(i?' ver.':'版'):'');}
   if(key.length>2&&key.endsWith('め')){const t=STYLE.get(key.slice(0,-1));if(t)return (i?'Slightly ':'略')+t[i];}
   return '';}
  export const styleLabel=(n,lang='zh')=>{if(lang==='ja')return n;const t=styleText(n,lang==='en'?1:0);return t&&fold(t)!==fold(n)?n+' · '+t:n;};

export const defaultPreview="黒より黒く闇より暗き漆黒に我が深紅の混淆を望みたもう。";
