/* Actual production MAGES gates on tiny cdecl engine functions. No game/window/COM.
   Return slots are tested by real detours, not by calling EnterReturn directly. */
#define main BaselineMain
#include "magesgate.cpp"
#undef main
#include <stdexcept>
using namespace MagesDraw;
static HANDLE Entered[2],Resume[2];
static int Results[2],Continuations[2],SlotsAtDeep=0,RecursiveCalls=0;
static int Used(){int n=0;for(auto &f:Returns)if(f.used)n++;return n;}
static int __cdecl Paused(int page,int unused,int flag){
 SetEvent(Entered[page]);if(WaitForSingleObject(Resume[page],5000)!=WAIT_OBJECT_0)return -900;
 FakeCommitBody(page,unused,flag);return 0x1200+page+unused*16+flag;
}
static DWORD WINAPI ThreadA(void*){Results[0]=FakeCommit(0,3,4);Continuations[0]=0x4141;return Used();}
static DWORD WINAPI ThreadB(void*){Results[1]=FakeCommit(1,5,6);Continuations[1]=0x4242;return Used();}
static int __cdecl Recurse(int page,int depth,int flag){
 RecursiveCalls++;int own=Used();if(own>SlotsAtDeep)SlotsAtDeep=own;
 if(depth){int n=FakeCommit(page,depth-1,flag);return n+7;}return 19;
}
static int __cdecl ThrowOriginal(int,int,int){throw std::runtime_error("original C++ exception");}
static int(__cdecl*volatile CppCommit)(int,int,int)=FakeCommit;
static bool ThrowOnce(){try{CppCommit(0,0,0);return false;}catch(const std::runtime_error&){return true;}}
static int __cdecl RaiseOriginal(int,int,int){RaiseException(0xe1234321,0,0,nullptr);return -1;}
static bool RaiseOnce(){
 __try{FakeCommit(0,0,0);return false;}__except(GetExceptionCode()==0xe1234321?EXCEPTION_EXECUTE_HANDLER:EXCEPTION_CONTINUE_SEARCH){return true;}
}
static int __cdecl OuterCatch(int page,int,int flag){
 CommitAction=RaiseOriginal;bool caught=RaiseOnce();CommitAction=OuterCatch;
 return caught?0x7531:-1;
}
static DWORD WINAPI ExceptionWorker(void*){
 SetPermission(true);CommitAction=OuterCatch;int r=FakeCommit(0,0,0);
 Check(r==0x7531&&Used()==1,"original SEH bypasses inner after-thunk; outer returns to its own caller");
 SetPermission(false);SetPermission(true);
 Check(Used()==1,"off/on preserves abandoned original return slot");
 CommitAction=ThrowOriginal;Check(ThrowOnce()&&Used()==2,"original C++ exception remains typed and retains only its abandoned slot");
 CommitAction=RaiseOriginal;
 for(int i=0;i<6;i++)Check(RaiseOnce(),"original exception is still delivered unchanged");
 Check(Used()==8,"eight abandoned frames retained without guessing ESP reuse");
 CommitAction=Recurse;RecursiveCalls=SlotsAtDeep=0;size_t before=Lines.size();
 int plain=FakeCommit(0,9,0);
 Check(plain==82&&RecursiveCalls==10&&Used()==8&&Lines.size()==before,"exhausted TLS slots degrade to transparent original with no observation");
 CommitAction=nullptr;return 0;
}
static DWORD WINAPI ProbeLock(void*){if(!TryEnterCriticalSection(&Lock))return 0;LeaveCriticalSection(&Lock);return 1;}
static bool OtherThreadCanLock(){HANDLE t=CreateThread(nullptr,0,ProbeLock,nullptr,0,nullptr);DWORD r=0;bool done=t&&WaitForSingleObject(t,2000)==WAIT_OBJECT_0;if(done)GetExitCodeThread(t,&r);if(t)CloseHandle(t);return done&&r==1;}
static void OffOnLogger(){LogAction=nullptr;SetPermission(false);SetPermission(true);}
static void CppFault(){LogAction=nullptr;throw std::runtime_error("fixture logger failure");}
static void SehFault(){LogAction=nullptr;RaiseException(0xe1231111,0,0,nullptr);}
static void NestedLogger(){LogAction=nullptr;FakeCommit(3,0,0);}
static int ObserverMode=0;
static void ObserveFault(){
 if(ObserverMode==1)CppFault();else if(ObserverMode==2)SehFault();else if(ObserverMode==3)NestedLogger();else OffOnLogger();
}
static std::wstring ControlPath(){
 wchar_t tmp[MAX_PATH];GetTempPathW(MAX_PATH,tmp);std::wstring dir=std::wstring(tmp)+L"MeguLit";CreateDirectoryW(dir.c_str(),nullptr);dir+=L"\\draw";CreateDirectoryW(dir.c_str(),nullptr);
 return dir+L"\\"+std::to_wstring(GetCurrentProcessId())+L".txt";
}
static bool WriteControl(const std::string&s){
 auto path=ControlPath();HANDLE h=CreateFileW(path.c_str(),GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,CREATE_ALWAYS,0,nullptr);
 if(h==INVALID_HANDLE_VALUE)return false;DWORD n=0;const BYTE bom[2]={255,254};WriteFile(h,bom,2,&n,nullptr);std::wstring wide(s.begin(),s.end());bool ok=WriteFile(h,wide.data(),(DWORD)wide.size()*2,&n,nullptr)&&n==wide.size()*2;CloseHandle(h);return ok;
}
static std::string GoodTable(){
 char b[512];snprintf(b,sizeof b,"#table mages drawDialogue=%x,%x drawGlyph=%x commit=%x clear=%x pages=%x stride=%x\n",
 (unsigned)(Dlg[0]-Base),(unsigned)(Dlg[1]-Base),(unsigned)(Glyph-Base),(unsigned)(Commit-Base),(unsigned)(Clear[0]-Base),(unsigned)(Pages-Base),Stride);return b;
}
static bool WaitPermission(bool on){for(int i=0;i<160;i++){if(((Ticket()&1)!=0)==on)return true;Sleep(25);}return false;}
// A separate original with a known all-register/flags/FX contract. No C++ runs with DF set.
// It does not change any machine state except the specified opaque EAX return.
__declspec(align(16)) static BYTE BeforeFx[512],AfterFx[512];
static DWORD BeforeRegs[8],AfterRegs[8],BeforeFlags,AfterFlags,BeforeEsp,AfterEsp;
static int AbiKind=0,AbiLogs=0;
static void* AbiPage=nullptr;
static void (*AbiOriginalPtr)();
static DWORD AbiArgs[11];

extern "C" __declspec(naked) void AbiOriginal(){
 __asm {
  pushfd
  pushad
  lea esi,[esp+40]
  lea edi,AbiArgs
  mov ecx,11
  cld
  rep movsd
  mov eax,AbiPage
  cmp AbiKind,2
  je clear_page
  cmp AbiKind,1
  jne state_ready
  inc dword ptr [eax+12]
  jmp state_ready
clear_page:
  mov dword ptr [eax+12],0
state_ready:
  mov eax,0x91abcdef
  mov dword ptr [esp+28],eax
  popad
  popfd
  ret
 }
}
static const DWORD DestroyMxcsr=0x5f80;
static void __cdecl DestroyObserverMachine(){
 __asm {
  fninit
  fldz
  fld1
  ldmxcsr DestroyMxcsr
  pxor xmm0,xmm0
  pxor xmm1,xmm1
  pxor xmm2,xmm2
  pxor xmm3,xmm3
  pxor xmm4,xmm4
  pxor xmm5,xmm5
  pxor xmm6,xmm6
  pxor xmm7,xmm7
  cld
 }
}
static void __cdecl AbiLog(){LogAction=nullptr;AbiLogs++;DestroyObserverMachine();}
static DWORD SeedMxcsr=0x3f80;
__declspec(align(16)) static DWORD SeedXmm[4]={0x3f800001,0x7f010203,0xababcdef,0x11223344};
#pragma warning(push)
#pragma warning(disable:4731)
static void ProbeAbi(){
 __asm {
  pushfd
  pushad
  sub esp,44
  mov dword ptr [esp],0
  mov dword ptr [esp+4],0
  mov dword ptr [esp+8],255
  mov dword ptr [esp+12],0
  mov dword ptr [esp+16],0
  mov dword ptr [esp+20],0x43fa0000
  mov dword ptr [esp+24],0x43480000
  mov dword ptr [esp+28],0x44048000
  mov dword ptr [esp+32],0x43660000
  mov dword ptr [esp+36],0xffffff
  mov dword ptr [esp+40],255
  fninit
  fld1
  fldpi
  ldmxcsr SeedMxcsr
  movdqa xmm0,SeedXmm
  movdqa xmm1,SeedXmm
  movdqa xmm2,SeedXmm
  movdqa xmm3,SeedXmm
  movdqa xmm4,SeedXmm
  movdqa xmm5,SeedXmm
  movdqa xmm6,SeedXmm
  movdqa xmm7,SeedXmm
  mov eax,0x10203040
  mov ecx,0x20304050
  mov edx,0x30405060
  mov ebx,0x40506070
  mov ebp,0x50607080
  mov esi,0x60708090
  mov edi,0x708090a0
  push 0xed7
  popfd
  mov BeforeEsp,esp
  mov BeforeRegs[0],eax
  mov BeforeRegs[4],ecx
  mov BeforeRegs[8],edx
  mov BeforeRegs[12],ebx
  mov BeforeRegs[16],ebp
  mov BeforeRegs[20],esi
  mov BeforeRegs[24],edi
  pushfd
  pop BeforeFlags
  fxsave BeforeFx
  call AbiOriginalPtr
  mov AfterEsp,esp
  mov AfterRegs[0],eax
  mov AfterRegs[4],ecx
  mov AfterRegs[8],edx
  mov AfterRegs[12],ebx
  mov AfterRegs[16],ebp
  mov AfterRegs[20],esi
  mov AfterRegs[24],edi
  pushfd
  pop AfterFlags
  fxsave AfterFx
  cld
  fninit
  ldmxcsr MagesDraw::ObserverMxcsr
  add esp,44
  popad
  popfd
 }
}
#pragma warning(pop)
static bool SameFx(){
 // FXSAVE instruction/data pointer bookkeeping need not survive C++ observation.
 // FXRSTOR must restore all architecturally live x87/MMX/XMM/MXCSR state.
 return !memcmp(BeforeFx,AfterFx,5)&&!memcmp(BeforeFx+6,AfterFx+6,2)&&!memcmp(BeforeFx+24,AfterFx+24,8)&&!memcmp(BeforeFx+32,AfterFx+32,128+128);
}
static void AbiCase(const char*name,void*gate,void**orig){
 Check(MH_CreateHook((void*)AbiOriginal,gate,orig)==MH_OK&&MH_EnableHook((void*)AbiOriginal)==MH_OK,std::string(name)+" ABI tiny actual MinHook installed");
 AbiOriginalPtr=AbiOriginal;AbiKind=!strncmp(name,"clear",5)?2:!strcmp(name,"commit post")?1:0;AbiPage=Pg(0);AbiLogs=0;SetPermission(false);SetPermission(true);SetLayout({0x254});*(int*)(Pg(0)+0xc)=1;Shown[0]=false;RunN=1;RunSite=0x1234;RHash=123;RX0=RY0=0;RX1=RY1=RH=30;
 LogAction=AbiLog;ProbeAbi();LogAction=nullptr;
 const DWORD args[11]={0,0,255,0,0,0x43fa0000,0x43480000,0x44048000,0x43660000,0xffffff,255};
 Check(!memcmp(AbiArgs,args,sizeof args),std::string(name)+" original receives every unchanged cdecl stack word");
 Check(AbiLogs==1,std::string(name)+" destructive logger actually ran");
 Check(AfterRegs[0]==0x91abcdef&&!memcmp(BeforeRegs+1,AfterRegs+1,6*sizeof(DWORD)),std::string(name)+" keeps opaque EAX and original GPR contract");
 Check(BeforeEsp==AfterEsp&&((BeforeFlags^AfterFlags)&0xcd5)==0,std::string(name)+" caller ESP and arithmetic/DF flags preserved");
 Check(SameFx(),std::string(name)+" x87 stack/control MXCSR and XMM0..7 survive destructive logger");
 Check(Used()==0,std::string(name)+" original return context released");
 MH_DisableHook((void*)AbiOriginal);MH_RemoveHook((void*)AbiOriginal);
}
int main(int argc,char**argv){
 SetErrorMode(SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX);_set_abort_behavior(0,_WRITE_ABORT_MSG|_CALL_REPORTFAULT);
 setvbuf(stdout,nullptr,_IONBF,0);int code=BaselineMain(0,nullptr);if(code)return code;
 if(argc>1){if(!strcmp(argv[1],"--original-cpp-unhooked"))MH_DisableHook((void*)FakeCommit);CommitAction=ThrowOriginal;bool caught=ThrowOnce();printf("%s original C++ catch probe\n",caught?"PASS":"FAIL");return caught?0:1;}
 FakeClear(0);FakeClear(1);SetLayout({0x8001,0x254});CommitAction=Paused;
 for(int i=0;i<2;i++){Entered[i]=CreateEventW(nullptr,TRUE,FALSE,nullptr);Resume[i]=CreateEventW(nullptr,TRUE,FALSE,nullptr);}
 HANDLE a=CreateThread(nullptr,0,ThreadA,nullptr,0,nullptr);Check(WaitForSingleObject(Entered[0],3000)==WAIT_OBJECT_0,"thread A is inside original");
 SetLayout({0x8002,0x255});HANDLE b=CreateThread(nullptr,0,ThreadB,nullptr,0,nullptr);Check(WaitForSingleObject(Entered[1],3000)==WAIT_OBJECT_0,"thread B enters original while A is paused (no lock across original)");
 SetEvent(Resume[0]);Check(WaitForSingleObject(a,3000)==WAIT_OBJECT_0,"earlier thread A returns before B");SetEvent(Resume[1]);Check(WaitForSingleObject(b,3000)==WAIT_OBJECT_0,"later thread B returns to its own caller");
 DWORD ar=99,br=99;GetExitCodeThread(a,&ar);GetExitCodeThread(b,&br);
 Check(Results[0]==0x1234&&Results[1]==0x1257&&Continuations[0]==0x4141&&Continuations[1]==0x4242&&ar==0&&br==0,"two threads preserve distinct result/continuation and clear only their own TLS slot");CloseHandle(a);CloseHandle(b);
 Check(Has("codes=80010255")&&Has("codes=80020255"),"overlapping threads retain their own pre-call SC3 marker snapshot");
 CommitAction=Recurse;RecursiveCalls=SlotsAtDeep=0;int recursive=FakeCommit(0,11,0);
 Check(recursive==96&&RecursiveCalls==12&&SlotsAtDeep==8&&Used()==0,"12 nested originals preserve eight owned returns; overflow is unpatched pass-through");
 HANDLE ex=CreateThread(nullptr,0,ExceptionWorker,nullptr,0,nullptr);Check(WaitForSingleObject(ex,5000)==WAIT_OBJECT_0,"original SEH/abandonment worker completes without stranded observer lock");CloseHandle(ex);CommitAction=nullptr;
 // Off during an original must complete while that original is still waiting.
 ResetEvent(Entered[0]);ResetEvent(Resume[0]);CommitAction=Paused;a=CreateThread(nullptr,0,ThreadA,nullptr,0,nullptr);WaitForSingleObject(Entered[0],3000);
 size_t logs=Lines.size();SetPermission(false);SetPermission(true);SetEvent(Resume[0]);WaitForSingleObject(a,3000);GetExitCodeThread(a,&ar);CloseHandle(a);CommitAction=nullptr;
 Check(Results[0]==0x1234&&ar==0&&Lines.size()==logs,"async off/on leaves real return alive but drops old-ticket post-call snapshot");
 SetPermission(false);logs=Lines.size();SetLayout({0x254});int r=FakeCommit(0,2,0);FakeClear(1);FakeDialogue(0,0,255);FakeMenu(2);FlushRun();
 Check(r>=2000&&Lines.size()==logs&&RunN==0,"installed gates are transparent and pending glyph data stays empty while revoked");
 SetPermission(true);SetLayout({0x254});FakeCommit(0,0,0);FakeMenu(2);FlushRun();Check(Lines.size()>logs,"same hooks resume only new authorized observations");
 for(int mode=1;mode<=4;mode++){SetPermission(false);SetPermission(true);FakeClear(0);SetLayout({0x254,0x255});ObserverMode=mode;LogAction=ObserveFault;r=FakeCommit(0,0,0);LogAction=nullptr;
  Check(r==2&&Used()==0&&OtherThreadCanLock(),"logger C++/SEH/reentry/off-on cannot damage return or strand lock");
 }
 // At least 81 codes force ev=more; an off/on inside first logger must stop old chunks/boxes.
 SetPermission(false);SetPermission(true);FakeClear(0);Layout.count=90;for(int i=0;i<90;i++){Layout.codes[i]=0x254;LayoutInfo[i]={20,30,80u+20u*i,600};}
 logs=Lines.size();LogAction=OffOnLogger;r=FakeCommit(0,0,0);
 Check(r==90&&Lines.size()==logs+1,"off/on inside first output drops stale remaining chunks and copied boxes");
 // Exercise persistent poll on actual private UTF16LE transport path, without image discovery.
 WriteControl("#cfg roles=1\n"+GoodTable());RefreshControl();Check((Ticket()&1)!=0,"matching strict address table grants already installed observer");
 WriteControl("#cfg roles=1\n"+GoodTable().replace(GoodTable().find("stride=")+7,1,"f"));RefreshControl();Check(!(Ticket()&1),"changed installed version table revokes observer");
 WriteControl("#cfg roles=1\n");HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);HANDLE watch=CreateThread(nullptr,0,Watch,stop,0,nullptr);Check(WaitPermission(true),"production watcher grants from real UTF16 BOM file");
 WriteControl("#cfg roles=10\n");Check(WaitPermission(false),"watcher continues after install and revokes malformed grant");
 WriteControl("#cfg roles=1\n");Check(WaitPermission(true),"watcher restores on later valid grant");
 HANDLE locked=CreateFileW(ControlPath().c_str(),GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,0,nullptr);Check(locked!=INVALID_HANDLE_VALUE&&WaitPermission(false),"exclusive control-file lock revokes rather than retaining old permission");CloseHandle(locked);
 Check(WaitPermission(true),"read-failure recovery grants a fresh epoch");
 DeleteFileW(ControlPath().c_str());Check(WaitPermission(false),"missing control revokes while watcher remains alive");
 SetEvent(stop);Check(WaitForSingleObject(watch,3000)==WAIT_OBJECT_0,"fixture watcher joins before hook teardown");CloseHandle(watch);CloseHandle(stop);
 for(int i=0;i<2;i++){CloseHandle(Entered[i]);CloseHandle(Resume[i]);}
 // Original engine now retired; reuse each production gate on a known machine-state contract.
 for(int i=0;i<NHooked;i++){MH_DisableHook((void*)Hooked[i]);MH_RemoveHook((void*)Hooked[i]);}
 AbiCase("commit post", (void*)CommitGate,&CommitOrig);
 AbiCase("clear post", (void*)ClearGate0,&ClearOrig[0]);
 AbiCase("clear 1 post", (void*)ClearGate1,&ClearOrig[1]);
 AbiCase("clear 2 post", (void*)ClearGate2,&ClearOrig[2]);
 AbiCase("clear 3 post", (void*)ClearGate3,&ClearOrig[3]);
 AbiCase("dialogue 1 pre", (void*)DlgGate1,&DlgOrig[1]);
 AbiCase("dialogue pre", (void*)DlgGate0,&DlgOrig[0]);
 AbiCase("glyph pre", (void*)GlyphGate,&GlyphOrig);
 MH_Uninitialize();printf("mages permission lifecycle: %d failure(s)\n",Failures);return Failures;
}
