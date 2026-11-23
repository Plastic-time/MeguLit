// SPDX-License-Identifier: GPL-3.0-or-later
// Pure ISLAND state, shared by the adapter and offline replay tests. No process or rendering side effects.
#pragma once
#include <string>
#include <vector>
#include <algorithm>
namespace ToMeIslandFlow {
static bool Lead(unsigned char c){return (c>=0x81&&c<=0x9f)||(c>=0xe0&&c<=0xfc);}
static std::vector<unsigned> Prefix(const std::string& text){std::vector<unsigned> out;for(size_t i=0;i<text.size()&&out.size()<12;){unsigned char c=text[i++];unsigned v=c;if(Lead(c)&&i<text.size())v=(c<<8)|(unsigned char)text[i++];if(v!=0x20&&v!=0x8140&&v!=10&&v!=13)out.push_back(v);}return out;}
static bool Matches(const std::vector<unsigned>& expected,const std::vector<unsigned>& actual){return !expected.empty()&&expected.size()<=actual.size()&&std::equal(expected.begin(),expected.end(),actual.begin());}
// name+open-quote, lenticular-bracketed name+quote and name+newline+quote carry the speaker in the script string, but the dialogue records start at
// the bracket. Same rules as ToMe's splitDialogue, so the token also matches the sentence ToMe displays.
static std::string Spoken(const std::string& text){
 std::vector<size_t> at;std::vector<unsigned> ch;for(size_t i=0;i<text.size();){at.push_back(i);unsigned char c=text[i++];unsigned v=c;if(Lead(c)&&i<text.size())v=(c<<8)|(unsigned char)text[i++];ch.push_back(v);}
 auto open=[](unsigned v){return v==0x8175||v==0x8177;};auto blank=[](unsigned v){return v==0x20||v==0x8140||v==13;};size_t n=ch.size();
 if(n>2&&ch[0]==0x8179){for(size_t k=1;k<n&&k<=41;k++)if(ch[k]==0x817a){size_t j=k+1;while(j<n&&blank(ch[j]))j++;return j<n&&open(ch[j])?text.substr(at[j]):text;}return text;}
 for(size_t k=0;k<n&&k<=12;k++){unsigned v=ch[k];
  if(open(v))return k&&(ch[n-1]==0x8176||ch[n-1]==0x8178)?text.substr(at[k]):text;
  if(v==10){size_t j=k+1;while(j<n&&blank(ch[j]))j++;return k&&j<n&&open(ch[j])?text.substr(at[j]):text;}
  if(blank(v)||v==0x8169||v=='('||v==0x8141||v==0x8142)return text;}
 return text;
}
// Layout drops line breaks and normalises spacing. Identity follows its visible glyphs; UI retains the full source.
static std::string GlyphText(const std::string& text){std::string out;for(size_t i=0;i<text.size();){unsigned char c=text[i++];if(Lead(c)&&i<text.size()){unsigned char d=text[i++];if(c==0x81&&d==0x40)continue;out+=(char)c;out+=(char)d;}else if(c!=0x20&&c!=10&&c!=13)out+=(char)c;}return out;}
static unsigned Token(const std::wstring& text){unsigned h=2166136261u;for(wchar_t c:text){if(c==L' '||c==0x3000||c==10||c==13)continue;h^=(unsigned short)c;h*=16777619u;}return h;}
struct PageState {
 bool seen=false;long line=0,lastX=0,lastY=0;
 static long Slot(long y){return y>=0?y/720:-((-y+719)/720);}
 bool Glyph(long next,long x,long y,bool& same){
  bool first=next!=line;
  // Coordinates are in the message texture, whose pages occupy separate 720-high slots: a different slot is a new page.
  if(first){same=seen&&Slot(y)==Slot(lastY)&&(y>lastY+2||(y>=lastY-2&&x>lastX+2));line=next;}
  lastX=x;lastY=y;seen=true;return first;
 }
};
struct SourceState {
 struct Candidate {std::string text;unsigned token,revision,at;bool consumed=false;};
 std::string pending,current;unsigned token=0,revision=0,begun=0,lastAt=0,serial=0,generation=0;
 std::vector<Candidate> candidates;
 bool Observe(const std::string& clean,unsigned id,bool name,unsigned now=0){
  generation++;if(name||clean.empty())return false;
  for(auto i=candidates.rbegin();i!=candidates.rend();++i)if(i->token==id&&GlyphText(i->text)==GlyphText(clean)&&now-i->at<650)return false;
  pending=clean;token=id;lastAt=now;revision=++serial;candidates.push_back({clean,id,revision,now});
  if(candidates.size()>16)candidates.erase(candidates.begin());return true;
 }
 bool Pending(unsigned now) const {for(const auto& c:candidates)if(!c.consumed&&now-c.at<5000)return true;return false;}
 // Script callbacks include names/readings/intermediate strings. Only the candidate that matches an actual
 // complete record run becomes current; observing a different candidate never invalidates current ownership.
 template<class Match> bool Resolve(unsigned now,Match match){
  const Candidate* ordered[16];unsigned count=0;for(const auto& c:candidates)if(!c.consumed&&now-c.at<5000)ordered[count++]=&c;
  std::sort(ordered,ordered+count,[](const Candidate* a,const Candidate* b){return a->text.size()!=b->text.size()?a->text.size()>b->text.size():a->revision>b->revision;});
  for(unsigned i=0;i<count;i++){const auto* c=ordered[i];
   // A transient short candidate cannot replace a still fully matching current record run. A genuine short next line
   // remains eligible as soon as the old full run no longer matches, regardless of kana or elapsed time.
   if(current.size()>c->text.size()&&match(current))continue;
   if(!match(c->text))continue;
   pending=c->text;token=c->token;revision=c->revision;lastAt=c->at;return true;
  }return false;
 }
 // The script calls the text callback once ahead of a line (lookahead) and again when it is shown. Both copies are
 // candidates; consuming only the chosen one let the re-composition of the same run start the line a second time
 // (same token, same coordinates, reported as a new page), which cleared the page and could leave neither the
 // original nor ToMe visible (Opus 5.5, 2026-11-02). Older identical copies are consumed with it; a copy observed
 // after this line began stays available for a genuinely repeated line.
 bool Begin(){if(pending.empty()||revision==begun)return false;current=pending;begun=revision;const std::string same=GlyphText(pending);
  for(auto& c:candidates)if(c.revision==revision||(c.revision<revision&&GlyphText(c.text)==same))c.consumed=true;return true;}
};
// Cold direct dialogue can reach rasterisation before the script observer. Recover only a complete,
// balanced quoted run from validated records in the exact adapter's known dialogue bands.
struct QuoteGlyph {unsigned character=0;long x=0,y=0,size=0;};
static bool DirectBand(const QuoteGlyph& v,bool advVisible,bool fresh){
 return fresh&&((advVisible&&v.size==26&&v.x==0&&v.y==8)||
   (v.size==28&&v.x>=84&&v.x<1200&&(v.y==296||v.y==332)));
}
// In-game furigana (the reading over Boryuujima) is laid out as extra, smaller glyph records in the same run. Matching every
// record as sentence text rejected such lines, so they were hidden but never started (user video, 2026-11-03).
static bool RubyGlyph(long size,long base){return size>0&&base>0&&size*4<base*3;}
template<class Read> static std::string QuotedRun(Read read){
 QuoteGlyph first;if(!read(0,first)||(first.character!=0x8175&&first.character!=0x8177))return {};
 std::vector<unsigned> stack;std::string out;long lastY=first.y,lastX=first.x;
 for(unsigned i=0;i<512;i++){
  QuoteGlyph v;if(!read(i,v))return {};unsigned c=v.character;
  if(!c||c==0xffff||c==10||c==13)continue;
  if(RubyGlyph(v.size,first.size))continue;
  if(v.size!=first.size||v.x<0||v.x>1280||v.y<lastY||v.y>first.y+first.size*8||
    (v.y==lastY&&i&&v.x<lastX))return {};
  if(c<0x20||c==0x7f||(c>0xff&&!Lead((unsigned char)(c>>8))))return {};
  if(c==0x8175||c==0x8177)stack.push_back(c==0x8175?0x8176:0x8178);
  else if(c==0x8176||c==0x8178){if(stack.empty()||stack.back()!=c)return {};stack.pop_back();}
  if(c>0xff)out+=(char)(c>>8);out+=(char)c;lastY=v.y;lastX=v.x;
  if(stack.empty()){for(unsigned j=i+1;j<=i+49;j++){QuoteGlyph end;if(!read(j,end))return {};if(!end.character||end.character==0xffff||end.character==10||end.character==13)return out;if(RubyGlyph(end.size,first.size))continue;if(end.character!=0x20&&end.character!=0x8140)return {};}return {};}
 }return {};
}
// One authoritative sprite per displayed sentence. Remember accepted changes before the first line learns its
// sprite, replay that state at adoption, and ignore the previous window once a new window takes ownership.
struct DialogState {
 struct Entry {unsigned renderer=0,id=0;int visible=0;bool used=false;};
 Entry entries[128];unsigned next=0,renderer=0,id=0;bool bound=false;
 bool Observe(unsigned r,unsigned sprite,int visible,bool accepted=true){
  if(!accepted||(visible!=0&&visible!=1))return false;
  Entry* found=nullptr;for(auto& e:entries)if(e.used&&e.renderer==r&&e.id==sprite){found=&e;break;}
  if(!found)found=&entries[next++%128];*found={r,sprite,visible,true};
  return bound&&renderer==r&&id==sprite;
 }
 bool Bind(unsigned r,unsigned sprite,int& visible){
  renderer=r;id=sprite;bound=true;
  return Lookup(r,sprite,visible);
 }
 bool Lookup(unsigned r,unsigned sprite,int& visible) const {for(const auto& e:entries)if(e.used&&e.renderer==r&&e.id==sprite){visible=e.visible;return true;}return false;}
};
}
