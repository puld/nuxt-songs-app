# -*- coding: utf-8 -*-
"""Хоровая партитура 119: четыре голоса, такты 3/4, слова куплетов."""
import pymupdf, re, sys119 as S

WHOLE_REST = ""
BEATS = 3.0

def pitch(step, clef):
    DIA = "CDEFGAB"
    base = ("E", 4) if clef == "G" else ("G", 2)
    idx = DIA.index(base[0]) + step
    o = base[1] + (idx // 7 if idx >= 0 else -((-idx + 6) // 7))
    return DIA[idx % 7], o

def dur_of(n):
    d = 2.0 if n["open"] else (0.5 if n["flags"] == 1 else (0.25 if n["flags"] >= 2 else 1.0))
    return d * (1.5 if n["dot"] else 1.0)

def group_bars(ver, staff):
    """Границы тактов: вертикали от верха стана до его низа, близкие схлопнуты."""
    xs = sorted({round(v["x"], 1) for v in ver
                 if abs(v["y0"] - staff["top"]) < 2 and v["y1"] > staff["bottom"] - 2})
    out = []
    for x in xs:
        if out and x - out[-1] < 4: continue      # скобка рядом с чертой, двойная черта репризы
        out.append(x)
    return out

def sweep_bars(ver, staves):
    """Черты, прошивающие группу насквозь: у фортепиано штиль так далеко не тянется."""
    t, b = staves[0], staves[-1]
    xs = sorted({round(v["x"], 1) for v in ver
                 if abs(v["y0"] - t["top"]) < 2.5 and abs(v["y1"] - b["bottom"]) < 2.5})
    out = []
    for x in xs:
        if out and x - out[-1] < 4: continue
        out.append(x)
    return out

def bar_number(page, staff):
    """Номер такта, напечатанный слева над станом; у первой системы его нет."""
    for w in page.get_text("words"):
        if re.fullmatch(r"\d{1,3}", w[4]) and staff["top"] - 16 < (w[1] + w[3]) / 2 < staff["top"] + 2 \
           and w[0] < staff["x0"] + 60:
            return int(w[4])
    return None

def voice_events(notes, direction):
    ev = {}
    for n in notes:
        if n["dir"] != direction: continue
        ev.setdefault((round(n["stem"][0], 1), round(n["stem"][1], 1)), []).append(n)
    return sorted(ev.values(), key=lambda g: g[0]["x"])

def systems(path="119.pdf"):
    doc = pymupdf.open(path)
    out = []
    for pno, pg in enumerate(doc):
        ctx = {"glyphs": S.glyphs_of(pg), "ver": S.verticals(pg), "beams": S.beams(pg)}
        for sy in S.systems_of(pg):
            sy["page"], sy["ctx"] = pno, ctx
            out.append(sy)
    return doc, out

def build(path="119.pdf"):
    doc, syss = systems(path)
    res = []
    for sy in syss:
        ctx = sy["ctx"]
        ref = (sy["choir"] or sy["piano"])[0]
        # у хора тактовая черта рисуется на каждом стане, у фортепиано — насквозь через оба
        bars = group_bars(ctx["ver"], ref) if sy["choir"] else sweep_bars(ctx["ver"], sy["piano"])
        item = {"page": sy["page"], "bars": bars, "nbars": max(0, len(bars) - 1),
                "number": bar_number(doc[sy["page"]], ref),
                "silent": not sy["choir"], "voices": {v: [] for v in "SATB"}}
        if sy["choir"]:
            for vn, staff, clef, d in (("S", sy["choir"][0], "G", "up"), ("A", sy["choir"][0], "G", "dn"),
                                       ("T", sy["choir"][1], "F", "up"), ("B", sy["choir"][1], "F", "dn")):
                notes, _ = S.staff_notes(ctx, staff, clef)
                seq = []
                for g in voice_events(notes, d):
                    heads = sorted(g, key=lambda n: -n["y"])
                    base = heads[0]
                    seq.append({"x": base["x"], "dur": dur_of(base), "beamed": any(n.get("beamed") for n in g),
                                "pitches": [{"p": pitch(h["step"], clef)[0], "o": pitch(h["step"], clef)[1],
                                             "acc": h["acc"], "y": h["y"]} for h in heads]})
                # целотактовые паузы этого стана
                lo, hi = staff["top"] - 3, staff["bottom"] + 3
                rests = [g for g in ctx["glyphs"] if g["c"] == WHOLE_REST and lo < g["y"] < hi]
                item["voices"][vn] = {"events": seq, "rests": [r["x"] for r in rests]}
        res.append(item)
    return doc, syss, res

def in_bar(x, bars, i):
    return bars[i] - 2 <= x < bars[i + 1] - 2

if __name__ == "__main__":
    doc, syss, res = build()
    total = 0
    for si, it in enumerate(res):
        total += it["nbars"]
        if it["silent"]:
            print(f"система {si+1}: тактов {it['nbars']}, хор молчит")
            continue
        line = []
        for v in "SATB":
            evs = it["voices"][v]["events"]
            rests = it["voices"][v]["rests"]
            bad = []
            for i in range(it["nbars"]):
                s = sum(e["dur"] for e in evs if in_bar(e["x"], it["bars"], i))
                if any(in_bar(x, it["bars"], i) for x in rests): s = BEATS
                if abs(s - BEATS) > 1e-6: bad.append(f"т{i+1}={s:g}")
            line.append(f"{v}:{len(evs)}" + (" ✗ " + ",".join(bad) if bad else " ✓"))
        print(f"система {si+1}: тактов {it['nbars']} | " + " | ".join(line))
    print("всего тактов:", total)
