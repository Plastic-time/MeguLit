// Stand-in "game" for MeguLitDump32/64.dll: it reads files under a toy cipher and decrypts them the ways real games do
// (in place, into a fresh buffer, through RtlDecompressBuffer), then checks the DLL saved exactly the plain bytes and
// nothing for noise or media. Usage: host.exe <MeguLitDump.dll> <output root>. No game is involved.
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <vector>

typedef LONG(NTAPI *CompressFn)(USHORT, PUCHAR, ULONG, PUCHAR, ULONG, ULONG, PULONG, PVOID);
typedef LONG(NTAPI *DecompressFn)(USHORT, PUCHAR, ULONG, PUCHAR, ULONG, PULONG);
typedef LONG(NTAPI *WorkSizeFn)(USHORT, PULONG, PULONG);

std::string Encode(const wchar_t *text, UINT cp) {
 int n = WideCharToMultiByte(cp, 0, text, -1, NULL, 0, NULL, NULL);
 std::string r(n, '\0'); WideCharToMultiByte(cp, 0, text, -1, &r[0], n, NULL, NULL); r.resize(n - 1); return r;
}
std::string Repeat(const std::string &s, int k) { std::string r; for (int i = 0; i < k; i++) r += s; return r; }
void Xor(std::string &s) { for (size_t i = 0; i < s.size(); i++) s[i] = (char)(s[i] ^ (0x5A + (i % 7))); }
void Put(const std::string &path, const std::string &data) {
 HANDLE h = CreateFileA(path.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 DWORD w; WriteFile(h, data.data(), (DWORD)data.size(), &w, NULL); CloseHandle(h);
}
char *ReadAll(const std::string &path, DWORD *n) {
 HANDLE h = CreateFileA(path.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return NULL;
 *n = GetFileSize(h, NULL);
 char *buf = (char *)malloc(*n);
 ReadFile(h, buf, *n, n, NULL); CloseHandle(h);
 return buf;
}
// Is there a saved .bin whose bytes are exactly `want`?
bool Saved(const std::string &dir, const std::string &want, const char *how) {
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((dir + "*.bin").c_str(), &f);
 if (h == INVALID_HANDLE_VALUE) return false;
 bool found = false;
 do {
  if (how && !strstr(f.cFileName, how)) continue;
  DWORD n = 0; char *b = ReadAll(dir + f.cFileName, &n);
  if (b && n == want.size() && !memcmp(b, want.data(), n)) found = true;
  free(b);
 } while (!found && FindNextFileA(h, &f));
 FindClose(h);
 return found;
}
int Count(const std::string &dir) {
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((dir + "*.bin").c_str(), &f); int n = 0;
 if (h == INVALID_HANDLE_VALUE) return 0;
 do n++; while (FindNextFileA(h, &f)); FindClose(h); return n;
}

int main(int argc, char **argv) {
 if (argc < 3) return 2;
 char cwd[MAX_PATH]; GetCurrentDirectoryA(MAX_PATH, cwd);
 std::string game = cwd;
 unsigned hash = 2166136261u;
 for (char *p = cwd; *p; p++) { unsigned char c = (unsigned char)*p; if (c >= 'A' && c <= 'Z') c += 32; hash = (hash ^ c) * 16777619u; }
 char key[16]; sprintf_s(key, "%08x", hash);
 std::string dir = std::string(argv[2]) + "\\" + key + "\\";
 SetEnvironmentVariableA("MEGULIT_RUNTIME_DUMP", argv[2]);
 SetEnvironmentVariableA("MEGULIT_RUNTIME_DUMP_ON", "1");
 if (!LoadLibraryA(argv[1])) { printf("load failed %lu\n", GetLastError()); return 3; }
 for (int i = 0; i < 100 && GetFileAttributesA((dir + "ready.txt").c_str()) == INVALID_FILE_ATTRIBUTES; i++) Sleep(50);
 if (GetFileAttributesA((dir + "ready.txt").c_str()) == INVALID_FILE_ATTRIBUTES) { printf("dll never ready\n"); return 4; }

 std::string ja = Repeat(Encode(L"【めぐみん】「我が名はめぐみん！紅魔族随一の魔法の使い手にして、爆裂魔法を操りし者！」\r\n", 932), 6);
 std::string ja2 = Repeat(Encode(L"今日はいい天気ですね。散歩にでも行きましょうか。\r\n", 932), 8);
 std::string zh = Repeat(Encode(L"「吾名惠惠！红魔族第一的魔法师，操纵爆裂魔法之人！」\r\n", 65001), 6);
 std::string noise(4096, '\0'); for (auto &c : noise) c = (char)(rand() & 0xFF);
 std::string a = ja, b = ja2; Xor(a); Xor(b);
 Put("scene.dat", a); Put("trans.chs", b); Put("noise.bin", noise);
 std::string media = ja; Put("face.png", media);

 // 1. in place
 DWORD n = 0; char *buf = ReadAll("scene.dat", &n);
 { std::string s(buf, n); Xor(s); memcpy(buf, s.data(), n); }
 // 2. into a fresh buffer
 DWORD m = 0; char *enc = ReadAll("trans.chs", &m);
 char *plain = (char *)malloc(m);
 for (DWORD i = 0; i < m; i++) plain[i] = (char)(enc[i] ^ (0x5A + (i % 7)));
 // 3. decompression
 HMODULE nt = GetModuleHandleA("ntdll.dll");
 CompressFn compress = (CompressFn)GetProcAddress(nt, "RtlCompressBuffer");
 DecompressFn decompress = (DecompressFn)GetProcAddress(nt, "RtlDecompressBuffer");
 WorkSizeFn work = (WorkSizeFn)GetProcAddress(nt, "RtlGetCompressionWorkSpaceSize");
 ULONG ws = 0, fs = 0; work(2, &ws, &fs);
 std::vector<unsigned char> space(ws), packed(zh.size() * 2), unpacked(zh.size() + 64);
 ULONG packedSize = 0, outSize = 0;
 compress(2, (PUCHAR)zh.data(), (ULONG)zh.size(), packed.data(), (ULONG)packed.size(), 4096, &packedSize, space.data());
 decompress(2, unpacked.data(), (ULONG)unpacked.size(), packed.data(), packedSize, &outSize);
 // 4. noise and media
 DWORD k = 0; char *nb = ReadAll("noise.bin", &k); free(nb);
 DWORD q = 0; char *mb = ReadAll("face.png", &q); free(mb);
 Sleep(1500);

 int fail = 0;
 if (!Saved(dir, ja, "inplace")) { printf("FAIL in-place decrypt not saved\n"); fail++; }
 if (!Saved(dir, ja2, "alloc")) { printf("FAIL fresh-buffer decrypt not saved\n"); fail++; }
 if (!Saved(dir, zh, "rtl")) { printf("FAIL RtlDecompressBuffer output not saved\n"); fail++; }
 if (Saved(dir, noise, NULL)) { printf("FAIL noise saved\n"); fail++; }
 if (Saved(dir, ja, "plain")) { printf("FAIL media file read as plain text\n"); fail++; }
 if (Saved(dir, a, NULL) || Saved(dir, b, NULL)) { printf("FAIL cipher text saved\n"); fail++; }
 printf("%s: %d saved, %d failures\n", sizeof(void *) == 8 ? "x64" : "x86", Count(dir), fail);
 free(buf); free(enc); free(plain);
 return fail ? 1 : 0;
}
