# -*- coding: utf-8 -*-
"""Фортепианная партия 119: аккорды на общем штиле, паузы, разбивка по тактам."""
import omr, choir119 as C, sys119 as S

REST = {"": None, "": 1.0, "": 0.5, "": 0.25}   # None = целый такт
HALF_REST = ""

def glue_chords(notes):
    """Головки аккорда без штиля приклеиваются к штилю: Finale рисует его только у крайней.

    Секунда смещается на ширину головки — по другую сторону штиля, поэтому окно по X
    двустороннее, а не «головка слева от штиля».
    """
    stems = {}
    for n in notes:
        if n["stem"]: stems.setdefault(n["stem"], []).append(n)
    out = {st: [n for n in ns] for st, ns in stems.items()}
    for n in notes:
        if n["stem"]: continue
        cand = [st for st in stems if st[1] - 2 <= n["y"] <= st[2] + 2 and abs(n["x"] - st[0]) < 8]
        if not cand: continue
        st = min(cand, key=lambda s: abs(n["x"] - s[0]))
        out[st].append(n)
    return out

def bands(staves):
    """Полоса каждого стана: до середины зазора с соседом.

    Окно omr.staff_notes (±5 межлинейных) шире, чем расстояние между станами фортепиано,
    поэтому верхний стан иначе забирает ноты хора над собой.
    """
    st = sorted(staves, key=lambda s: s["top"])
    out = {}
    for i, s_ in enumerate(st):
        top = (st[i-1]["bottom"] + s_["top"]) / 2 if i else s_["top"] - 5 * s_["space"]
        bot = (s_["bottom"] + st[i+1]["top"]) / 2 if i + 1 < len(st) else s_["bottom"] + 5 * s_["space"]
        out[id(s_)] = (top, bot)
    return out

def ledgers(pg):
    """Добавочные линейки: короткие горизонтали вне станов."""
    out = []
    for d in pg.get_drawings():
        for it in d["items"]:
            if it[0] != "l": continue
            p0, p1 = it[1], it[2]
            if abs(p0.y - p1.y) < 0.4 and 3 < abs(p1.x - p0.x) < 14:
                out.append(((p0.x + p1.x) / 2, p0.y))
    return out


def staff_pick(n, staves, leds):
    """Стан ноты: пассаж между станами принадлежит тому, от чьего края идут её линейки."""
    sp = staves[0]["space"]
    inside = [st for st in staves if st["top"] - sp*0.6 <= n["y"] <= st["bottom"] + sp*0.6]
    if len(inside) == 1: return inside[0]
    near = [l for l in leds if abs(l[0] - n["x"]) < 5 and abs(l[1] - n["y"]) < 6 * sp]
    if near:
        far = max(near, key=lambda l: abs(l[1] - n["y"]))[1]   # крайняя линейка цепочки — у своего стана
        return min(staves, key=lambda st: min(abs(far - st["top"]), abs(far - st["bottom"])))
    return min(staves, key=lambda st: min(abs(n["y"] - st["top"]), abs(n["y"] - st["bottom"])))

def rests_by_staff(ctx, staves):
    """Паузы системы раздаются станам по их полосам."""
    bd = bands(staves)
    out = {id(st): [] for st in staves}
    for g in ctx["glyphs"]:
        if g["fam"] != "maestro" or g["c"] not in REST: continue
        for st in staves:
            top, bot = bd[id(st)]
            if top < g["y"] < bot and g["x"] >= st["x0"] - 2:
                out[id(st)].append(g); break
    return out

def beam_bundles(ctx):
    """Балки, лежащие под одной группой нот, — в один пучок.

    У шестнадцатой балок две, и они разные отрезки: если ключ вязки брать
    поштучно, соседние ноты одной группы получат разные номера. Пучок — связная
    компонента балок, чьи x-интервалы пересекаются, а середины близки по высоте.
    """
    bs = list(ctx.get("beams", []))
    idx = list(range(len(bs)))
    def find(i):
        while idx[i] != i: idx[i] = idx[idx[i]]; i = idx[i]
        return i
    for i, a in enumerate(bs):
        for j, b in enumerate(bs[i+1:], i+1):
            if a[0] <= b[2] + 1 and b[0] <= a[2] + 1 and abs((a[1]+a[3])/2 - (b[1]+b[3])/2) < 14:
                idx[find(i)] = find(j)
    out = {}
    for i, b in enumerate(bs): out.setdefault(find(i), []).append(b)
    return out

def beam_key(bundles, stem, d):
    """Номер пучка над штилем или None: слитно в ABC пишутся только ноты одного пучка."""
    if not stem: return None
    x, y0, y1 = stem
    end = y0 if d == "up" else y1
    for k, bs in bundles.items():
        for b in bs:
            if not (b[0]-1.5 <= x <= b[2]+1.5): continue
            gap = (b[1] - end) if d == "up" else (end - b[3])
            if b[1]-1.2 <= end <= b[3]+1.2 or 0 < gap < 9: return k
    return None

def staff_events(ctx, staff, clef, rests=(), band=None, staves=None, leds=None):
    """События стана: аккорды (по штилю) и паузы, в порядке x."""
    notes, _ = omr.staff_notes(ctx, staff, clef, stem_sp=14 if leds is not None else 6)
    if leds is not None:
        notes = [n for n in notes if staff_pick(n, staves, leds) is staff]
    elif band:
        notes = [n for n in notes if band[0] < n["y"] < band[1]]
    bundles = beam_bundles(ctx)
    evs = []
    for st, group in glue_chords(notes).items():
        head = group[0]
        pitches = []
        for n in sorted(group, key=lambda n: -n["y"]):
            p, o = C.pitch(n["step"], clef)
            pitches.append({"p": p, "o": o, "acc": n["acc"]})
        evs.append({"x": min(n["x"] for n in group), "dur": C.dur_of(head),
                    "dir": head["dir"], "pitches": pitches, "beamed": head["beamed"], "rest": False,
                    "beam": beam_key(bundles, head["stem"], head["dir"])})
    for g in rests:
        evs.append({"x": g["x"], "dur": REST[g["c"]], "dir": None, "pitches": [], "rest": True,
                    "beamed": False, "beam": None})
    return sorted(evs, key=lambda e: e["x"])

def bar_sum(inside):
    """Доли такта: сначала как один голос.

    У фортепиано направление штиля задаёт высота ноты, а не голос, поэтому делить
    по dir можно только когда одноголосное прочтение не сходится.
    """
    tot = sum(e["dur"] or 3.0 for e in inside)
    if abs(tot - 3.0) < 1e-6: return "3"
    up = sum(e["dur"] or 3.0 for e in inside if e["dir"] != "dn")
    dn = sum(e["dur"] or 3.0 for e in inside if e["dir"] == "dn")
    return f"{up:g}/{dn:g}" if abs(up - 3.0) < 1e-6 and abs(dn - 3.0) < 1e-6 else f"!{tot:g} ({up:g}/{dn:g})"


def report(path="119.pdf"):
    doc, syss = C.systems(path)
    for si, sy in enumerate(syss, 1):
        # такты фортепиано берём общие для системы: у хора черта рисуется на каждом стане,
        # у фортепиано насквозь, но часть черт не дотягивается — партитура выровнена, x те же
        bars = C.group_bars(sy["ctx"]["ver"], sy["choir"][0]) if sy["choir"] \
               else C.sweep_bars(sy["ctx"]["ver"], sy["piano"])
        nb = max(0, len(bars) - 1)
        rests = rests_by_staff(sy["ctx"], sy["staves"])
        bd = bands(sy["staves"])
        for pi, staff in enumerate(sy["piano"]):
            evs = staff_events(sy["ctx"], staff, "G" if pi == 0 else "F",
                               rests[id(staff)], bd[id(staff)])
            sums = []
            for i in range(nb):
                inside = [e for e in evs if C.in_bar(e["x"], bars, i)]
                sums.append(bar_sum(inside))
            print(f"система {si} стан {pi}: тактов {nb} доли {' '.join(sums)}")

if __name__ == "__main__":
    report()
