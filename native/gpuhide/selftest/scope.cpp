// SPDX-License-Identifier: GPL-3.0-or-later
#include "../GlyphQuads.h"
#include <assert.h>
int main() {
 GlyphLearner g;
 g.Line(L"これは会話です。", 100);
 g.Preset(24, 640, 480);
 GlyphLearner::PPos p{ {60,400,84,424},100,0,0,-1,true };
 assert(!g.PageHidden(p)); // a newly drawn menu glyph is not dialogue evidence
 p.line=-2; assert(!g.PageHidden(p));
 p.line=1; assert(g.PageHidden(p)); // confirmed dialogue still hides
 g.readOnly=true; assert(!g.PageHidden(p));g.readOnly=false;
 g.texRt=true;g.pageRtW=640;g.pageRtH=480;
 g.plines.back().claimed=8;
 Quad q{60,400,84,424,0,0,.1f,.1f,0};bool leave=true;
 assert(!g.PageQuad(q,(void*)1,128,128,nullptr,800,600,110,&leave)&&!leave);
 // A sheet may also draw an unrelated menu/ruby size: no nearby claimed character, no hiding.
 g.sheetNow.insert((void*)1);q.y0=20;q.y1=32;
 assert(g.PageQuad(q,(void*)1,128,128,nullptr,640,480,110,&leave)&&!leave);
 g.Off(); assert(!g.PageHidden(p));
 // Ordinary matched atlas dialogue is still hidden, while a button outside its box is kept.
 g.Line(L"これは会話です。",200);g.texRt=false;g.learned=true;g.areaW=640;g.areaH=480;
 g.area={40,380,400,450};g.glyphH=24;g.atlases.insert(GlyphLearner::AtlasKey(nullptr,(void*)1));
 q={60,400,84,424,0,0,.1f,.1f,0};Quad button=q;button.y0=20;button.y1=44;
 auto drop=g.Draw((void*)1,128,128,nullptr,640,480,640,480,{q,button},210);
 assert(drop.size()==1&&drop[0]==0);
 g.readOnly=true;assert(g.Draw((void*)1,128,128,nullptr,640,480,640,480,{q},211).empty());
 puts("PASS dialogue scope: unclaimed title/menu, foreign target, unmatched ruby kept; confirmed dialogue hides; read/OFF restore");
}
