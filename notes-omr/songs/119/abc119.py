# -*- coding: utf-8 -*-
"""ABC-партитура хора 119 из распознанного PDF."""
import lyr119 as L, choir119 as C

UNIT = 16          # L:1/16 — восьмая с точкой (3) целым числом при L:1/8 не записывается
BAR = 12           # 3/4 в шестнадцатых
ACC = {"#": "^", "b": "_", "n": "="}
VOICES = ("S", "A", "T", "B")

def abc_pitch(p):
    letter, o, s = p["p"], p["o"], ACC.get(p["acc"], "")
    if o >= 5: return s + letter.lower() + "'" * (o - 5)
    return s + letter + "," * (4 - o)

def abc_len(dur):
    n = dur * UNIT / 4                      # dur в четвертях
    assert abs(n - round(n)) < 1e-6, dur
    n = round(n)
    return "" if n == 1 else str(n)

def abc_event(e):
    # унисон внутри одного голоса Finale рисует двумя головками в одной точке —
    # в ABC это была бы «созвучие» из двух одинаковых нот
    heads, seen = [], set()
    for p in e["pitches"]:
        k = (p["p"], p["o"], p["acc"])
        if k in seen: continue
        seen.add(k); heads.append(p)
    body = abc_pitch(heads[0]) if len(heads) == 1 else "[" + "".join(abc_pitch(h) for h in heads) + "]"
    return body + abc_len(e["dur"])

def hide_second(upper, lower):
    """Второй голос стана не рисует паузу там, где её уже рисует первый."""
    return [("empty" if (a == "rest" and b == "rest") else b) for a, b in zip(upper, lower)]

def bars_of_system(it, voice):
    """События голоса, разложенные по тактам системы."""
    if it["silent"] or not it["voices"].get(voice):
        return ["empty"] * it["nbars"]               # в PDF на этом стане ничего нет
    evs = it["voices"][voice]["events"]
    rests = it["voices"][voice]["rests"]
    out = []
    for i in range(it["nbars"]):
        inside = [e for e in evs if C.in_bar(e["x"], it["bars"], i)]
        if not inside:
            # «rest» — пауза действительно нарисована, «empty» — такт пуст
            out.append("rest" if any(C.in_bar(x, it["bars"], i) for x in rests) else "empty")
        else:
            out.append(inside)
    return out

def render_bars(bars, deco=None):
    chunks = []
    for b in bars:
        if isinstance(b, str):
            # невидимая пауза: в PDF пауза стоит одна на стан, а голосов на нём два —
            # вторая нарисованная превратилась бы в лишний прямоугольник
            chunks.append(("z%d" if b == "rest" else "x%d") % BAR); continue
        s, prev_beamed = "", False
        for e in b:
            token = abc_event(e)
            d = (deco or {}).get(round(e["x"], 1))
            if d: token = d["pre"] + token + d["post"]
            # вязка = слитная запись, без пробела перед нотой
            if s and not (prev_beamed and e.get("beamed")): s += " "
            s += token
            prev_beamed = e.get("beamed", False)
        chunks.append(s or "z%d" % BAR)
    return " | ".join(chunks)

def build(path="119.pdf"):
    doc, syss, res, lines = L.build(path)
    head = ["X:1", "T:Верность Твоя велика", "C:K. Runvan",
            "R:Фортепианный аккомпанемент — В. Иванов", "M:3/4", "L:1/%d" % UNIT,
            "Q:1/4=84", "K:D", "%%score {(S A) | (T B)}",
            'V:S clef=treble name="Сопрано" stem=up',
            'V:A clef=treble name="Альт" stem=down',
            'V:T clef=bass name="Тенор" stem=up',
            'V:B clef=bass name="Бас" stem=down']
    body = []
    li = {v: 0 for v in range(1, L.VERSES + 1)}
    for it in res:
        for v in VOICES:
            body.append("V:%s" % v)
            body.append(render_bars(bars_of_system(it, v)) + " |")
            if v == "S" and not it["silent"] and it["voices"]["S"]["events"]:
                for verse in range(1, L.VERSES + 1):
                    blk = lines[verse][li[verse]]
                    body.append("w: " + " ".join(blk["syls"]))
        if not it["silent"] and it["voices"].get("S", {}).get("events"):
            for verse in range(1, L.VERSES + 1): li[verse] += 1
    return "\n".join(head + body) + "\n", res

if __name__ == "__main__":
    abc, res = build()
    open("119.abc", "w", encoding="utf-8").write(abc)
    print(abc[:1500])
    print("...\nвсего строк:", abc.count("\n"), "| байт:", len(abc.encode()))
