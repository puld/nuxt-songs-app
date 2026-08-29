# -*- coding: utf-8 -*-
"""ABC 119 целиком: хор плюс фортепианный аккомпанемент."""
import abc119 as A, lyr119 as L, choir119 as C, pbuild119 as B, marks119 as MK

PIANO = ("P1", "P2", "P3")

WRITABLE = (12, 8, 6, 4, 3, 2, 1)      # что записывается одной нотой при L:1/16

def split_len(n):
    """Длительность в шестнадцатых → куски, каждый из которых нота с точкой или без.

    Время события берётся из карты X→доля, поэтому длина бывает любой (9, 10),
    а такую ноту ABC одним знаком не запишет — куски связываются лигой.
    """
    out = []
    while n > 0:
        for w in WRITABLE:
            if w <= n: out.append(w); n -= w; break
        else:
            break
    return out

def ev_token(e):
    """Событие фортепиано: длительность взята из карты времени, а не из флагов."""
    parts = split_len(round(e["len"] * A.UNIT / 4))
    if e["rest"] or not e["pitches"]:
        return " ".join("z%d" % p for p in parts)
    heads, seen = [], set()
    for p in e["pitches"]:
        k = (p["p"], p["o"], p["acc"])
        if k in seen: continue
        seen.add(k); heads.append(p)
    body = A.abc_pitch(heads[0]) if len(heads) == 1 else "[" + "".join(A.abc_pitch(h) for h in heads) + "]"
    return "-".join(body + ("" if p == 1 else str(p)) for p in parts)

def layer_bar(lay, deco=None):
    """Такт одного слоя; слой, вступающий позже начала такта, открывается паузой.

    Вязка в ABC — это отсутствие пробела: соседние ноты, которые в PDF стоят под
    общей балкой, пишутся слитно, иначе abcjs нарисует каждой свой флажок.
    """
    # пустой слой и «добор» до вступления — наша заплатка, а не знак из PDF:
    # реальные паузы фортепиано приходят событиями, поэтому здесь пауза невидимая
    if not lay: return "x%d" % A.BAR
    s = ""
    if lay[0]["t"] > 1e-9: s = "x%d" % round(lay[0]["t"] * A.UNIT / 4)
    prev = None
    for e in lay:
        tok = ev_token(e)
        d = (deco or {}).get(round(e["x"], 1))
        if d: tok = d["pre"] + tok + d["post"]
        # слитно пишутся только соседи из одного пучка балок: в PDF такт разбит
        # на группы по долям, а сплошная балка на весь такт — другой рисунок
        beam = e.get("beam") if not e["rest"] and e["len"] < 1.0 else None
        if s and not (beam is not None and beam == prev): s += " "
        s += tok
        prev = beam
    tail = C.BEATS - (lay[-1]["t"] + lay[-1]["len"])
    if tail > 1e-9: s += " x%d" % round(tail * A.UNIT / 4)
    return s

def piano_bars(item, vi, deco=None):
    """Такты голоса: P1 — верхний стан, P2/P3 — первый и второй слои нижнего."""
    out = []
    for bi in range(item["nbars"]):
        if vi == 0:
            lays = item["staves"][0][bi]
            out.append(layer_bar(lays[0] if lays else [], deco))
        else:
            lays = item["staves"][1][bi] if len(item["staves"]) > 1 else []
            k = vi - 1
            out.append(layer_bar(lays[k] if len(lays) > k else [], deco))
    return " | ".join(out)

def voice_events(pit, vi):
    """Все события голоса в системе: край вилки или лиги легко приходится на
    соседний такт, поэтому ближайшую ноту ищем по всей системе, а не в такте."""
    if not pit["staves"]: return []
    if vi == 0: bars, k = pit["staves"][0], 0
    elif len(pit["staves"]) > 1: bars, k = pit["staves"][1], vi - 1
    else: return []
    return [e for bar in bars for lay in bar[k:k+1] for e in lay]

def build(path="119.pdf"):
    doc, syss, res, lines = L.build(path)
    piano = B.build(path)
    head = ["X:1", "T:Верность Твоя велика", "C:K. Runvan",
            "R:Фортепианный аккомпанемент — В. Иванов", "M:3/4", "L:1/%d" % A.UNIT,
            # «Andante» в PDF есть, метронома нет: 84 — наша подстановка внутри
            # обычного диапазона andante, иначе плееру нечем задать скорость
            'Q:"Andante" 1/4=84', "K:D",
            # своя акколада хору и своя фортепиано: одна общая скобка вокруг всех
            # четырёх станов сбивает abcjs раскладку подписей — «Сопрано» уезжает
            # под «Бас», к стану фортепиано
            "%%score {(S A) | (T B)} {(P1) | (P2 P3)}",
            # abcjs умеет только «каждый N-й такт»: номера строк он не знает заранее,
            # при адаптивной вёрстке переносы всё равно не совпадут с PDF
            "%%barnumbers 5",
            'V:S clef=treble name="Сопрано" stem=up',
            'V:A clef=treble name="Альт" stem=down',
            'V:T clef=bass name="Тенор" stem=up',
            'V:B clef=bass name="Бас" stem=down',
            'V:P1 clef=treble name="Ф-но"',
            'V:P2 clef=bass',
            'V:P3 clef=bass']
    body = []
    li = {v: 0 for v in range(1, L.VERSES + 1)}
    for si, (it, pit) in enumerate(zip(res, piano)):
        sy = syss[si]
        marks = MK.collect(doc[sy["page"]], sy)
        # паузу на хоровом стане рисует только верхний голос: в PDF она одна на стан,
        # а голосов на нём два — вторая превратилась бы в лишний прямоугольник
        vbars = {v: A.bars_of_system(it, v) for v in A.VOICES}
        for up, lo in (("S", "A"), ("T", "B")):
            vbars[lo] = A.hide_second(vbars[up], vbars[lo])
        for v in A.VOICES:
            evs = it["voices"].get(v, {}).get("events", []) if not it["silent"] else []
            body.append("V:%s" % v)
            body.append(A.render_bars(vbars[v], MK.decorate(marks, v, evs)) + " |")
            if v == "S" and not it["silent"] and it["voices"]["S"]["events"]:
                for verse in range(1, L.VERSES + 1):
                    body.append("w: " + " ".join(lines[verse][li[verse]]["syls"]))
        for vi, vn in enumerate(PIANO):
            # события голоса собираются со всех тактов системы: знак крепится к
            # ближайшей ноте, а его край легко приходится на соседний такт
            evs = voice_events(pit, vi)
            body.append("V:%s" % vn)
            body.append(piano_bars(pit, vi, MK.decorate(marks, vn, evs)) + " |")
        if not it["silent"] and it["voices"].get("S", {}).get("events"):
            for verse in range(1, L.VERSES + 1): li[verse] += 1
    return "\n".join(head + body) + "\n"

if __name__ == "__main__":
    abc = build()
    open("119full.abc", "w", encoding="utf-8").write(abc)
    print(abc[:900]); print("...\nбайт:", len(abc.encode()))
