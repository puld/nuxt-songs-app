# -*- coding: utf-8 -*-
"""Знаки исполнения 119: динамика, вилки, лиги, текстовые ремарки.

Ноты — не единственное, что несёт PDF. Динамика в Maestro набрана готовыми
лигатурами (один глиф на «mf»), вилки — путь из двух отрезков с общей вершиной,
лиги — заполненный серп из двух кривых Безье, а «Andante» и «con Pedale» —
обычный Times. Метронома в PDF нет вовсе.
"""
import os, sys
# конвейер общий и лежит в pipeline/; путь берётся от этого файла, а не от cwd
_P = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "pipeline"))
if _P not in sys.path: sys.path.insert(0, _P)
import omr

# в Maestro динамика — лигатуры целиком, отдельной буквы «m» в шрифте нет
DYN = {0xF046: "mf", 0xF050: "mp", 0xF066: "f", 0xF070: "p"}

def dynamics(pg):
    """Знаки силы звука с точкой отсчёта на базовой линии глифа."""
    return [{"x": g["x"], "y": g["y"], "s": DYN[ord(g["c"])]}
            for g in omr.glyphs_of(pg) if g["fam"] == "maestro" and ord(g["c"]) in DYN]

def hairpins(pg):
    """Вилки: два отрезка из общей вершины. Вершина слева — crescendo, справа — diminuendo."""
    out = []
    for d in pg.get_drawings():
        it, r = d["items"], d["rect"]
        if d["type"] != "s" or len(it) != 2 or any(i[0] != "l" for i in it): continue
        if not (r.width > 15 and r.height < 12): continue
        # вершина — единственная точка, которая совпадает целиком: у открытого края
        # x тоже общий, но y там расходятся
        pts = [(round(p.x, 2), round(p.y, 2)) for i in it for p in (i[1], i[2])]
        apex = next((q for q in pts if pts.count(q) > 1), None)
        if apex is None: continue
        out.append({"x0": r.x0, "x1": r.x1, "y": (r.y0 + r.y1) / 2,
                    "kind": "<" if abs(apex[0] - r.x0) < abs(apex[0] - r.x1) else ">"})
    return out

def slurs(pg):
    """Лиги и легато: заполненный серп ровно из двух кривых."""
    out = []
    for d in pg.get_drawings():
        it, r = d["items"], d["rect"]
        if d["type"] != "f" or len(it) != 2 or any(i[0] != "c" for i in it): continue
        if not (r.width > 4 and r.height < 30): continue
        # дуга вниз (концы выше середины) идёт под нотами, вверх — над ними
        out.append({"x0": r.x0, "x1": r.x1, "y": (r.y0 + r.y1) / 2})
    return out

def texts(pg):
    """Ремарки словами: темп, характер, педаль — всё, что набрано не Maestro."""
    out = []
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if "Maestro" in s["font"]: continue
                t = s["text"].strip()
                if t in ("Andante", "con Pedale"):
                    out.append({"x": s["bbox"][0], "y": s["bbox"][3], "t": t,
                                "italic": "Italic" in s["font"]})
    return out

if __name__ == "__main__":
    import sys119 as S
    doc = __import__("pymupdf").open("119.pdf")
    for pi in range(doc.page_count):
        pg = doc[pi]
        h = hairpins(pg)
        print(f'стр.{pi+1}: динамика {[(round(g["x"]), g["s"]) for g in dynamics(pg)]}')
        print(f'        вилок {len(h)} ({sum(1 for x in h if x["kind"]=="<")} cresc, '
              f'{sum(1 for x in h if x["kind"]==">")} dim), лиг {len(slurs(pg))}, '
              f'ремарки {[t["t"] for t in texts(pg)]}')

# --- привязка знаков к нотам -------------------------------------------------

def mark_zone(y, sy):
    """Голос, которому адресован знак.

    Динамика пишется над станом сопрано, под станом баса и **между** станами
    фортепиано — в последнем случае она относится к обоим, и ближайший по
    расстоянию стан оказался бы нижним, поэтому зазор разбирается отдельно.
    """
    p0, p1 = sy["piano"]
    if p0["bottom"] < y < p1["top"]: return "P1"
    cand = ([("S", sy["choir"][0]), ("T", sy["choir"][1])] if sy["choir"] else []) \
         + [("P1", sy["piano"][0]), ("P2", sy["piano"][1])]
    def dist(st):
        if y < st["top"]: return st["top"] - y
        if y > st["bottom"]: return y - st["bottom"]
        return 0.0
    return min(cand, key=lambda p: dist(p[1]))[0]

def nearest(evs, x):
    """Событие голоса, к которому крепится знак: ближайшее по горизонтали."""
    return min(evs, key=lambda e: abs(e["x"] - x)) if evs else None

def collect(pg, sy):
    """Знаки системы, разложенные по голосам: (голос, вид, x или пара x)."""
    lo = min(st["top"] for st in ([*sy["choir"]] if sy["choir"] else []) + list(sy["piano"])) - 40
    hi = max(st["bottom"] for st in ([*sy["choir"]] if sy["choir"] else []) + list(sy["piano"])) + 40
    out = []
    for g in dynamics(pg):
        if lo < g["y"] < hi: out.append((mark_zone(g["y"], sy), "dyn", g["x"], g["s"]))
    for h in hairpins(pg):
        if lo < h["y"] < hi: out.append((mark_zone(h["y"], sy), "hair", (h["x0"], h["x1"]), h["kind"]))
    for s in slurs(pg):
        if lo < s["y"] < hi: out.append((mark_zone(s["y"], sy), "slur", (s["x0"], s["x1"]), None))
    for t in texts(pg):
        # «Andante» уходит в заголовок Q:, иначе оно продублируется на экране
        if t["t"] != "Andante" and lo < t["y"] < hi:
            out.append((mark_zone(t["y"], sy), "text", t["x"], t["t"]))
    return out

def decorate(marks, voice, evs):
    """Приставки и хвосты к событиям голоса: ключ — x события.

    Лига и вилка крепятся к ближайшим событиям своих краёв: Finale рисует их от
    края головки, а не от её середины, поэтому «внутрь диапазона» не годится.
    """
    deco = {}
    def slot(e):
        return deco.setdefault(round(e["x"], 1), {"pre": "", "post": ""})
    for vz, kind, x, val in marks:
        if vz != voice: continue
        if kind in ("dyn", "text"):
            e = nearest(evs, x)
            if not e: continue
            # аннотация словами ставится под станом: «_» — позиция, а не начертание
            slot(e)["pre"] = ("!%s!" % val if kind == "dyn" else '"_%s"' % val) + slot(e)["pre"]
            continue
        a, b = nearest(evs, x[0]), nearest(evs, x[1])
        if not a or not b or a is b: continue
        if kind == "slur":
            slot(a)["pre"] += "("
            slot(b)["post"] = ")" + slot(b)["post"]
        else:
            slot(a)["pre"] += "!%s(!" % val
            slot(b)["post"] += "!%s)!" % val
    return deco
