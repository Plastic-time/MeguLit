const test=require('node:test'),assert=require('node:assert');
const {RepeatNormalizer}=require('../core/repeat-normalizer.cjs');
test('2026-11-16: a stream learned as drawing lines twice keeps repeated stretches inside a sentence',()=>{
 const r=new RepeatNormalizer();
 for(const l of ['だが、それは現れた。　だが、それは現れた。　','唐突に出現して、人間の世界を全てひっくり返した。　唐突に出現して、人間の世界を全てひっくり返した。　','そこには普段と変わらない日常の姿があった。そこには普段と変わらない日常の姿があった。'])r.normalize('s',l);
 assert.strictEqual(r.normalize('s','今日も明日も明後日も、こんな日々が永遠に続くと信じない理由がなかった。'),'今日も明日も明後日も、こんな日々が永遠に続くと信じない理由がなかった。');
 assert.strictEqual(r.normalize('s','誰もが信じていた。誰もが信じていた。'),'誰もが信じていた。','whole copies are still undone');
});
test('2026-11-19 audit: on a stream learned as drawing lines twice a short repeat is divided by the factor, never kept as drawn (that is how a single 「うん」 arrives)',()=>{
 const r=new RepeatNormalizer();
 for(const l of ['だが、それは現れた。　だが、それは現れた。　','唐突に出現して、人間の世界を全てひっくり返した。　唐突に出現して、人間の世界を全てひっくり返した。　','そこには普段と変わらない日常の姿があった。そこには普段と変わらない日常の姿があった。'])r.normalize('s',l);
 assert.strictEqual(r.normalize('s','「うん」「うん」'),'「うん」','a single 「うん」 drawn twice');
 assert.strictEqual(r.normalize('s','「うん」「うん」「うん」「うん」'),'「うん」「うん」','the script\'s own 「うん」「うん」 drawn twice keeps both');
 const fresh=new RepeatNormalizer();assert.strictEqual(fresh.normalize('t','「うん」「うん」'),'「うん」「うん」','a stream not known to repeat passes it through');
});
