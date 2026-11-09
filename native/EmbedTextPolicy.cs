// SPDX-License-Identifier: GPL-3.0-or-later
// Which hooked strings may be written back, for every engine (E215, 2026-11-06).
// LunaHook engine adapters report a stream's role in the thread's split value (ctx2): 1 scenario, 2 name, 3 other
// (choices, history and a script VM's general strings). CLANNAD HD crashed because the selected EmbedSiglus2 stream had
// role 3: it is the VM's general string constructor, so blanking it rewrote name flags and commands ("名前フラグ名が
// 短すぎます", "コマンドが不正です", "string too long"). Name/other streams are therefore never written to, and strings
// that still carry script syntax, resource names or control codes are left to the engine unchanged.
using System;
using System.Text.RegularExpressions;

internal static class EmbedTextPolicy {
    // Script VM syntax: variable references (【＄名前】, ＄朋也), command letters (％Ａ, ＊Ｂ; not "50％OFF"), markup, escapes
    // and control/private-use characters.
    static readonly Regex Script = new Regex(@"[【《\[][\$＄@＠]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄][\p{L}\p{N}_＿]|</?[A-Za-z][^>\r\n]*>|\\[nrt](?![A-Za-z])|[\x00-\x08\x0b\x0c\x0e-\x1f-]");
    static readonly Regex Resource = new Regex(@"[\\/]|\.[A-Za-z0-9]{2,5}(\b|$)|^[\x20-\x7e]*,|^[\p{L}\p{N}_.:-]*[_:]\w*$");
    static readonly Regex Dialogue = new Regex(@"[ぁ-ゖァ-ヺ「-』、。…！？]|(?:\p{L}{2,}[ \t]+){1,}\p{L}{2,}|\p{L}{2,}[.!?]$");
    static readonly Regex Glyph = new Regex(@"[\p{L}\p{N}\p{P}\p{S}]");

    // Role an embed-capable stream declares; 0 when unknown or when the split value is not a role (read-only hooks).
    public static int Role(bool embed, ulong ctx2) { return embed && ctx2 >= 1 && ctx2 <= 3 ? (int)ctx2 : 0; }
    // Only scenario (or undeclared) streams carry the displayed dialogue and may be written back.
    public static bool Writable(int role) { return role == 0 || role == 1; }

    // Whole script constructs, kept byte for byte when a dialogue line is blanked (E215.2): a variable reference with its
    // closing bracket, a command letter, a tag, an escape or a run of control/private-use characters.
    static readonly Regex Construct = new Regex(@"[【《\[][\$＄@＠][^】》\]\r\n]{0,64}[】》\]]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄][\p{L}\p{N}_＿]+|</?[A-Za-z][^>\r\n]*>|\\[nrt](?![A-Za-z])|[\x00-\x08\x0b\x0c\x0e-\x1f-]+");

    // Multilingual containers (E243, Maitetsu Pure Station): every language of a line in one string, split by the engine
    // through separators the hook decodes as ？？？ / U+FFFD / private-use runs, or written inline as %l<ja>;<zh>%l.
    // Rewriting one breaks the engine's own split, so all tracks were drawn; such strings are never written back.
    static readonly Regex TrackSeparator = new Regex(@"\S{2,}[?？�-￰-￿]{3,}\s*\S{2,}");
    static readonly Regex InlineTrack = new Regex(@"%l[^%\r\n]*;[^%\r\n]*%l|%l\S");
    public static bool Container(string value) { return value != null && (TrackSeparator.IsMatch(value) || InlineTrack.IsMatch(value)); }

    // Bumped when the rules change, so a stream remembered as unsafe under older rules gets one more try (E320).
    public const int Version = 2;

    // E320 HuneX ruby (魔法使いの夜: <rふ>触</r>): the closing tag's "/" read as a path and each ruby counted as two
    // constructs, so every line with furigana went back unchanged and its original stayed under MeguLit's text. A ruby
    // group is now blanked whole (reading and base) with its tag letters kept; any other construct in such a line still
    // leaves the line to the engine.
    static readonly Regex Ruby = new Regex(@"<r([^<>\r\n]{1,32})>([^<>\r\n]{1,32})</r>");
    static string HideRuby(string value) {
        string plain = Ruby.Replace(value, m => m.Groups[2].Value);
        if (Resource.IsMatch(plain) || Container(plain) || Construct.IsMatch(plain) || !Dialogue.IsMatch(plain)) return "";
        var output = new System.Text.StringBuilder(value.Length);
        int at = 0;
        foreach (Match m in Ruby.Matches(value)) {
            output.Append(Blank(value.Substring(at, m.Index - at))).Append("<r").Append(Blank(m.Groups[1].Value)).Append('>').Append(Blank(m.Groups[2].Value)).Append("</r>");
            at = m.Index + m.Length;
        }
        return output.Append(Blank(value.Substring(at))).ToString();
    }

    public static string Hide(string value) {
        // An empty reply tells LunaHook to skip writeback entirely, including its own re-encoding.
        if (String.IsNullOrWhiteSpace(value) || value.Length > 600) return "";
        if (Ruby.IsMatch(value)) return HideRuby(value);
        if (Resource.IsMatch(value) || Container(value)) return "";
        // A dialogue line that carries a few script constructs used to be skipped whole, so its original stayed under
        // MeguLit's text (CLANNAD HD overlap, user 2026-11-06). Now only the visible text is blanked and every construct
        // stays intact for the engine. Strings dense with constructs (name/variable tables) are still left alone.
        MatchCollection constructs = Construct.Matches(value);
        if (constructs.Count > 2 || !Dialogue.IsMatch(Construct.Replace(value, ""))) return "";
        var output = new System.Text.StringBuilder(value.Length);
        int at = 0;
        foreach (Match m in constructs) { output.Append(Blank(value.Substring(at, m.Index - at))).Append(m.Value); at = m.Index + m.Length; }
        return output.Append(Blank(value.Substring(at))).ToString();
    }
    static string Blank(string text) { return Glyph.Replace(text, m => m.Value[0] <= 0x7f ? " " : "　"); }

    public static bool SelfTest() {
        const string mixed = "そう、雪だ。♪【$名前＿渚】【$名前＿渚】%A";
        return Role(true, 3) == 3 && Role(true, 1) == 1 && Role(false, 3) == 0 && Role(true, 0xe9a0f05) == 0 &&
            !Writable(2) && !Writable(3) && Writable(1) && Writable(0) &&
            Hide(mixed) == "" && Hide("そう、雪だ。♪【＄名前＿渚】％Ａ") == "　　　　　　　【＄名前＿渚】％Ａ" &&
            Hide("％Ａ《渚の名前》％Ｂ《秋生の名前》％Ｃ《＊Ｂから渚への呼称》プロローグ") == "" &&
            Hide("＊Ａ崎岡岡崎") == "" && Hide("全品50％OFFだって！").Length == "全品50％OFFだって！".Length &&
            Hide("grp.pak") == "" && Hide("grp,bg001") == "" && Hide(@"data\grp\背景.tga") == "" &&
            Hide("トーンカーブ.dat") == "" && Hide("「またね」<wait>") == "　　　　　<wait>" &&
            Hide("名前%Q") == "" && Hide("「またね」\u0001") == "　　　　　\u0001" &&
            Hide("「やっと来たね」\r\nそうですね……") == "　　　　　　　　\r\n　　　　　　　" &&
            Hide("Good evening!") == "             " &&
            Hide("「ついてないわね」「ついてないわね」？？？？？？「真够不走运的」") == "" &&
            Hide("「確認開始%l砂撒き;放沙%l;。」") == "" &&
            Hide("「えっ？？？」").Length == "「えっ？？？」".Length &&
            Hide("　彼女がはじめて命に<rふ>触</r>れた、<rしず>厳</r>かな朝の出来事だ。") == "　　　　　　　　　　<r　>　</r>　　　<r　　>　</r>　　　　　　　　　" &&
            Hide("　車の窓は<rしも>霜</r>だらけで、\n　走りだせない。") == "　　　　　<r　　>　</r>　　　　　\n　　　　　　　　" &&
            Hide("<rふ>触</r>【＄名前】") == "" && Hide(@"<rx>data\a</r>") == "";
    }
}
