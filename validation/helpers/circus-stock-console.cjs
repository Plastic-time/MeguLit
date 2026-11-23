'use strict';
/* Compile the repository's unchanged stock c3 routine in a local image-search stand-in.
   NewHook is a recorder, not MinHook; this does not inject a game or certify Reader output. */
const fs = require('node:fs');
const path = require('node:path');
const stockFile = path.resolve(__dirname, '../../preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32/Circus.cpp');
const constants = path.resolve(__dirname, '../../preserved/source/lunahoook-adapted/NativeImpl/LunaHook/include/const.h');

function stockC3(source = fs.readFileSync(stockFile, 'utf8')) {
  const match = source.replace(/\r\n/g, '\n').match(/  bool c3\(\)\s*(\{[\s\S]*?\n  \})\n\}/);
  if (!match) throw Error('CIRCUS_STOCK_C3_REGION_CHANGED');
  return `bool c3()\n${match[1]}\n`;
}

function consoleSource() {
  const prefix = String.raw`
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>
#include "${constants.replace(/\\/g, '/')}"
#define XX4 XX, XX, XX, XX
static_assert(sizeof(uintptr_t) == 4, "stock fixture requires x86");
struct TextBuffer {};
struct HookParam {
  uintptr_t address = 0;
  int offset = 0;
  int type = 0;
  void (*filter_fun)(TextBuffer*, HookParam*) = nullptr;
};
void filter(TextBuffer*, HookParam*) {}
constexpr int stackoffset(int argument) { return argument * sizeof(uint32_t); }
uintptr_t processStartAddress = 0, processStopAddress = 0;
uint32_t guestBase = 0;
bool acceptHook = true;
int newHookCalls = 0;
HookParam captured;
std::string hookName;
bool NewHook(HookParam hp, const char* name) {
  ++newHookCalls; captured = hp; hookName = name; return acceptHook;
}
bool inside(uintptr_t at, size_t count) {
  return at >= processStartAddress && at <= processStopAddress && count <= processStopAddress - at;
}
namespace MemDbg {
uintptr_t findBytes(const void* pattern, size_t count, uintptr_t start, uintptr_t end) {
  if (!inside(start, 0) || end > processStopAddress || start > end || count > end - start) return 0;
  const auto* wanted = static_cast<const BYTE*>(pattern);
  for (uintptr_t at = start; at <= end - count; ++at) {
    bool match = true;
    for (size_t i = 0; i < count; ++i) if (wanted[i] != XX && wanted[i] != *reinterpret_cast<const BYTE*>(at + i)) { match = false; break; }
    if (match) return at;
  }
  return 0;
}
uintptr_t findPushAddress(uintptr_t pointer, uintptr_t start, uintptr_t end) {
  if (!inside(pointer, 1)) return 0;
  const uint32_t guest = guestBase + pointer - processStartAddress;
  for (uintptr_t at = start; at + 5 <= end; ++at) {
    if (*reinterpret_cast<const BYTE*>(at) == 0x68) {
      uint32_t operand; std::memcpy(&operand, reinterpret_cast<void*>(at + 1), 4);
      if (operand == guest) return at;
    }
  }
  return 0;
}
uintptr_t findEnclosingAlignedFunction(uintptr_t at, uintptr_t maximum = 0x800) {
  const uintptr_t low = at > processStartAddress + maximum ? at - maximum : processStartAddress + 4;
  for (uintptr_t entry = at & ~uintptr_t(15); entry >= low; entry -= 16) {
    if (!inside(entry - 4, 4)) break;
    const auto* padding = reinterpret_cast<const BYTE*>(entry - 4);
    if (std::all_of(padding, padding + 4, [](BYTE b) { return b == 0xcc; }) ||
        std::all_of(padding, padding + 4, [](BYTE b) { return b == 0x90; })) return entry;
    if (entry < processStartAddress + 20) break;
  }
  return 0;
}
}
uintptr_t reverseFindBytes(const BYTE* pattern, int count, uintptr_t start, uintptr_t end, int offset = 0, bool aligned = false) {
  if (count <= 0 || !inside(start, 0) || end > processStopAddress || start > end || uintptr_t(count) > end - start) return 0;
  for (uintptr_t at = end - count;; --at) {
    bool match = !aligned || ((at + offset) & 15) == 0;
    for (int i = 0; i < count && match; ++i) if (pattern[i] != XX && pattern[i] != *reinterpret_cast<BYTE*>(at + i)) match = false;
    if (match) return at + offset;
    if (at == start) break;
  }
  return 0;
}
`;
  const suffix = String.raw`
int wmain(int argc, wchar_t** argv) {
  if (argc != 3) return 2;
  std::ifstream input(std::filesystem::path(argv[1]), std::ios::binary);
  std::vector<BYTE> file((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  if (file.size() != 908800 || file.size() < sizeof(IMAGE_DOS_HEADER)) return 3;
  const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(file.data());
  if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew < 0 || size_t(dos->e_lfanew) + sizeof(IMAGE_NT_HEADERS32) > file.size()) return 4;
  const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS32*>(file.data() + dos->e_lfanew);
  if (nt->Signature != IMAGE_NT_SIGNATURE || nt->FileHeader.Machine != IMAGE_FILE_MACHINE_I386 || nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR32_MAGIC ||
      nt->OptionalHeader.SizeOfImage > 16 * 1024 * 1024 || nt->OptionalHeader.SizeOfHeaders > nt->OptionalHeader.SizeOfImage ||
      nt->FileHeader.NumberOfSections > 32) return 5;
  const size_t sectionOffset = size_t(dos->e_lfanew) + 24 + nt->FileHeader.SizeOfOptionalHeader;
  if (sectionOffset + size_t(nt->FileHeader.NumberOfSections) * sizeof(IMAGE_SECTION_HEADER) > file.size()) return 5;
  auto* image = static_cast<BYTE*>(VirtualAlloc(nullptr, nt->OptionalHeader.SizeOfImage, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE));
  if (!image) return 6;
  const auto release = [&] { VirtualFree(image, 0, MEM_RELEASE); };
  if (nt->OptionalHeader.SizeOfHeaders > file.size()) { release(); return 7; }
  std::memcpy(image, file.data(), nt->OptionalHeader.SizeOfHeaders);
  const auto* sections = IMAGE_FIRST_SECTION(nt);
  for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i) {
    const auto& section = sections[i];
    if (uint64_t(section.PointerToRawData) + section.SizeOfRawData > file.size() || uint64_t(section.VirtualAddress) + section.SizeOfRawData > nt->OptionalHeader.SizeOfImage) { release(); return 8; }
    std::memcpy(image + section.VirtualAddress, file.data() + section.PointerToRawData, section.SizeOfRawData);
  }
  processStartAddress = reinterpret_cast<uintptr_t>(image);
  processStopAddress = processStartAddress + nt->OptionalHeader.SizeOfImage;
  guestBase = nt->OptionalHeader.ImageBase;
  const std::wstring mode(argv[2]);
  if (mode == L"blank") std::memset(image, 0, nt->OptionalHeader.SizeOfImage);
  else if (mode == L"fallback") {
    const char* text = "SetStr overflow";
    for (size_t i = 0; i + std::strlen(text) <= nt->OptionalHeader.SizeOfImage; ++i) {
      if (std::memcmp(image + i, text, std::strlen(text)) == 0) std::memset(image + i, 'X', std::strlen(text));
    }
  } else if (mode == L"newhook-fail") acceptHook = false;
  else if (mode != L"normal") { release(); return 9; }
  const bool result = c3();
  const bool blank = mode == L"blank";
  const bool expected = !blank && acceptHook;
  const uint32_t rva = newHookCalls ? captured.address - processStartAddress : 0;
  const bool pass = result == expected && newHookCalls == (blank ? 0 : 1) &&
    (blank || (rva == 0x42890 && captured.offset == 4 && captured.type == USING_STRING && captured.filter_fun == filter && hookName == "Circus2_1"));
  std::wcout << L"{\"mode\":\"" << mode << L"\",\"pass\":" << (pass ? L"true" : L"false")
    << L",\"c3Result\":" << (result ? L"true" : L"false") << L",\"newHookCalls\":" << newHookCalls
    << L",\"rva\":" << rva << L",\"offset\":" << captured.offset << L",\"type\":" << captured.type
    << L",\"minhookInstalled\":false,\"gameStarted\":false,\"filterExecuted\":false}" << std::endl;
  release();
  return pass ? 0 : 1;
}
`;
  return prefix + stockC3() + suffix;
}

module.exports = { stockFile, stockC3, consoleSource };
if (require.main === module) {
  const output = process.argv[2];
  const local = path.resolve(__dirname, '../../.local-circus-runtime');
  if (!output || !path.resolve(output).startsWith(local + path.sep)) throw Error('CIRCUS_FIXTURE_OUTPUT_MUST_BE_LOCAL');
  fs.writeFileSync(output, consoleSource());
}
