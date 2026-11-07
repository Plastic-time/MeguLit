#include "engine32/Yuris.h"
#include "engine32/ToMeIslandDraw.h"
#include "engines/mages/mages.h"
class ToMeSteinsGate : public ENGINE {
public:
 ToMeSteinsGate(){
  check_by=CHECK_BY::CUSTOM;
  check_by_target=[](){
   auto dos=reinterpret_cast<IMAGE_DOS_HEADER*>(processStartAddress);
   auto pe=reinterpret_cast<IMAGE_NT_HEADERS*>(processStartAddress+dos->e_lfanew);
   return !_wcsicmp(processName,L"Game.exe")&&pe->FileHeader.TimeDateStamp==0x5ddf7af0;
  };
 }
 bool attach_function() override {return hookmages::MAGES();}
};
class ToMeIsland:public ENGINE{public:ToMeIsland(){check_by=CHECK_BY::CUSTOM;check_by_target=[](){return !_wcsicmp(processName,L"ISLAND.exe")&&ToMeIslandDraw::ExactFile();};}bool attach_function()override{return ToMeIslandDraw::Install();}};
std::vector<ENGINE*> check_engines(){return {new ToMeIsland,new ToMeSteinsGate,new Yuris};}
