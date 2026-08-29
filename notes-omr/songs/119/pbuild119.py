# -*- coding: utf-8 -*-
"""Фортепиано 119: события станов с временем, взятым из карты X→доля."""
import omr, choir119 as C, piano119 as P, timing as T

def choir_voices(sy):
    out = []
    if not sy["choir"]: return out
    for staff, clef, d in ((sy["choir"][0], "G", "up"), (sy["choir"][0], "G", "dn"),
                           (sy["choir"][1], "F", "up"), (sy["choir"][1], "F", "dn")):
        notes, _ = omr.staff_notes(sy["ctx"], staff, clef)
        out.append([{"x": min(n["x"] for n in g), "dur": C.dur_of(g[0])}
                    for g in C.voice_events(notes, d)])
    return out

def piano_staves(sy, pg):
    rests = P.rests_by_staff(sy["ctx"], sy["staves"])
    bd = P.bands(sy["staves"])
    leds = P.ledgers(pg)
    return [P.staff_events(sy["ctx"], st, "G" if i == 0 else "F", rests[id(st)], bd[id(st)],
                           sy["piano"], leds)
            for i, st in enumerate(sy["piano"])]

def bars_of(sy):
    return C.group_bars(sy["ctx"]["ver"], sy["choir"][0]) if sy["choir"] \
        else C.sweep_bars(sy["ctx"]["ver"], sy["piano"])

def bar_events(evs, mp, bars, bi):
    """События такта: onset с сетки, длительность — своя, если она распознана.

    Второй голос виден по **перекрытию**, а не только по совпадению onset: под
    половиной с точкой в басу идёт восьмая пауза с нотами, и её onset уже другой.
    Пока слои делились по совпадению, половина попадала в первый слой, а пауза —
    во второй и растягивалась до конца такта: на экране лишний прямоугольник.
    """
    ins = sorted((e for e in evs if C.in_bar(e["x"], bars, bi)), key=lambda e: e["x"])
    layers = [[]]
    for e in ins:
        t = T.quant(T.at(mp, e["x"]))
        for lay in layers:
            # слой свободен, если предыдущее событие в нём успело кончиться
            if not lay or t > lay[-1]["t"] + (lay[-1]["dur"] or 0.0) - 1e-9:
                lay.append({**e, "t": t}); break
        else:
            layers.append([{**e, "t": t}])
    for lay in layers:
        for a, b in zip(lay, lay[1:]): a["len"] = b["t"] - a["t"]
        # нота в конце слоя тянется до конца такта (сетка неточна, нота — нет),
        # а пауза звучит ровно свою длительность: растянутая до конца такта восьмая
        # пауза превращалась на экране в целотактовый прямоугольник
        if lay and lay[-1]["rest"]: lay[-1]["len"] = min(lay[-1]["dur"] or C.BEATS, C.BEATS - lay[-1]["t"])
        elif lay: lay[-1]["len"] = C.BEATS - lay[-1]["t"]
    return layers

def build(path="119.pdf"):
    doc, syss = C.systems(path)
    out = []
    for si, sy in enumerate(syss, 1):
        bars = bars_of(sy)
        nb = max(0, len(bars) - 1)
        ch, pn = choir_voices(sy), piano_staves(sy, doc[sy["page"]])
        item = {"nbars": nb, "staves": [[] for _ in pn]}
        for bi in range(nb):
            mp = T.bar_map(ch + pn, bars, bi)
            for pi, evs in enumerate(pn):
                item["staves"][pi].append(bar_events(evs, mp, bars, bi))
        out.append(item)
    return out

if __name__ == "__main__":
    n = 1
    for si, it in enumerate(build(), 1):
        for bi in range(it["nbars"]):
            для = []
            for pi in range(len(it["staves"])):
                lays = it["staves"][pi][bi]
                для.append("|".join(",".join(f"{e['len']:g}" for e in lay) for lay in lays) or "—")
            flag = ""
            for pi in range(len(it["staves"])):
                for lay in it["staves"][pi][bi]:
                    if lay and abs(sum(e["len"] for e in lay) - 3.0) > 1e-6: flag = "!"
                    if lay and lay[0]["t"] > 1e-9: flag += "^"
            print(f"{flag}такт {n} (сист.{si}): верх {для[0]}   низ {для[1]}")
            n += 1
