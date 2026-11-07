// ToMe: the exact 2019 STEINS;GATE SC3 parser. Never edit the game's script buffer.
// Only body/ruby glyphs in a private copy become charset index 0 (full-width space).
#pragma once
#include <cstdint>
#include <vector>
namespace tome_sg {
inline bool blank(const uint8_t *input, size_t available, std::vector<uint8_t> &output, size_t &glyphs) {
    const size_t limit = available < 32768 ? available : 32768;
    std::vector<size_t> positions;
    bool name = false;
    size_t i = 0;
    glyphs = 0;
    while (i < limit) {
        const uint8_t code = input[i];
        if (code == 0xff) {
            if (name) return false;
            output.assign(input, input + i + 1);
            for (auto p : positions) { output[p] = 0x80; output[p + 1] = 0; }
            glyphs = positions.size();
            return glyphs != 0;
        }
        if (code >= 0x80 && code < 0xb0) {
            if (i + 2 > limit) return false;
            if (!name) positions.push_back(i);
            i += 2;
            continue;
        }
        if (code > 0x1f || code == 0x1c || code == 0x1d) return false;
        if (code == 1) { if (name) return false; name = true; }
        if (code == 2) name = false;
        size_t size = 1;
        switch (code) {
        case 4: case 0x15: {
            size_t p = i + 1;
            while (p < limit && input[p]) {
                const uint8_t token = input[p];
                p += (token & 0x80) ? 2 + ((token & 0x60) >> 5) : 2;
            }
            if (p >= limit) return false;
            size = p - i + 1;
            break;
        }
        case 7: case 0x1b: size = 2; break;
        case 0x0c: case 0x11: case 0x12: case 0x13: case 0x14:
        case 0x16: case 0x19: case 0x1a: size = 3; break;
        }
        if (i + size > limit) return false;
        i += size;
    }
    return false;
}
}
