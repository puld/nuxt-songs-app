# -*- coding: utf-8 -*-
"""Сборка ABC-файла из распознанной партитуры (score.py)."""
import score as S

BEATS = 4.0          # такт 4/4
UP = 1.5             # затакт: три восьмых
LEN = "1/8"          # L:1/8 -> длительность в восьмых = dur * 2
ACC = {"#": "^", "b": "_", "n": "="}

def abc_pitch(p):
    """C4 -> 'C', C5 -> 'c', C3 -> 'C,', C6 -> \"c'\"."""
    letter, o = p["p"], p["o"]
    s = ACC.get(p["acc"], "")
    if o >= 5:
        return s + letter.lower() + "'" * (o - 5)
    return s + letter + "," * (4 - o)

def abc_dur(dur):
    n = dur * 2                       # в восьмых
    return "" if n == 1 else str(int(n))

def abc_note(e):
    head = abc_pitch(e["pitches"][0]) + abc_dur(e["dur"])
    return head + ("-" if e["tie"] else "")

def bars_of(events):
    """Разрезаем поток событий на такты: первый неполный (затакт)."""
    bars, cur, acc, cap = [], [], 0.0, UP
    for e in events:
        cur.append(e); acc += e["dur"]
        if acc >= cap - 1e-6:
            bars.append(cur); cur, acc, cap = [], 0.0, BEATS
    if cur: bars.append(cur)
    return bars

def voice_stream(sc, v):
    return [dict(e, sys=si) for si, info in enumerate(sc["systems"]) for e in info["voices"][v]]

def verse_syllables(ly, si, k):
    """Слоги куплета k в системе si: свой текст + общий припев для 1-7."""
    verses = ly[si]
    out = list(verses.get(str(k), []))
    if k <= 7:
        out += verses.get("1-7", [])
    return sorted(out, key=lambda s: s[0])

def lyric_line(bars, ly, k):
    """Строка w:: слог под нотой сопрано.

    Слог привязывается не окном вокруг ноты, а границей по середине между
    соседними нотами: набор в PDF смещает слог влево тем сильнее, чем он длиннее,
    и фиксированное окно теряло как раз длинные слоги.
    """
    by_sys = {}
    for si in {e["sys"] for bar in bars for e in bar}:
        by_sys[si] = list(verse_syllables(ly, si, k))

    notes = [e for bar in bars for e in bar]
    cells, qi = [], {si: 0 for si in by_sys}
    for i, e in enumerate(notes):
        syls = by_sys[e["sys"]]
        nxt = next((n for n in notes[i + 1:] if n["sys"] == e["sys"]), None)
        edge = (e["x"] + nxt["x"]) / 2 if nxt else float("inf")
        word = ""
        while qi[e["sys"]] < len(syls) and syls[qi[e["sys"]]][0] < edge:
            s = syls[qi[e["sys"]]]; qi[e["sys"]] += 1
            word += ("~" if word and not word.endswith("-") else "") + s[1] + ("-" if s[2] else "")
        cells.append(word or "*")

    out, pos = [], 0
    for bar in bars:
        out.append(" ".join(cells[pos:pos + len(bar)])); pos += len(bar)
    return "w: " + " | ".join(out)

def build_abc(path="093.pdf"):
    doc, systems, sc = S.build(path)
    ly = S.lyrics(doc, systems)
    L = []
    L.append("X:1")
    L.append("T:Великий Бог")
    L.append("C:швед. народная мелодия, №93")
    L.append("M:4/4")
    L.append("L:" + LEN)
    L.append("Q:1/4=88")
    L.append("K:Bb")
    L.append('%%score {(S A) | (T B)}')
    L.append('V:S clef=treble name="S" stem=up')
    L.append('V:A clef=treble name="A" stem=down')
    L.append('V:T clef=bass name="T" stem=up')
    L.append('V:B clef=bass name="B" stem=down')

    s_bars = None
    for v in "SATB":
        bars = bars_of(voice_stream(sc, v))
        if v == "S": s_bars = bars
        L.append("V:" + v)
        body = []
        for i, bar in enumerate(bars):
            cell = ""
            for j, e in enumerate(bar):
                cell += abc_note(e)
                if j + 1 < len(bar):
                    # ноты под общей вязкой пишутся слитно — иначе abcjs рисует отдельные флаги
                    cell += "" if (e.get("beamed") and bar[j + 1].get("beamed")) else " "
            body.append(cell)
        text = " | ".join(body) + " |]"
        L.append(text)
        if v == "S":
            for k in range(1, 9):
                L.append(lyric_line(bars, ly, k))
    return "\n".join(L) + "\n", sc, s_bars

if __name__ == "__main__":
    abc, sc, bars = build_abc()
    open("093.abc", "w", encoding="utf-8").write(abc)
    print(abc)
    print("тактов:", len(bars))
