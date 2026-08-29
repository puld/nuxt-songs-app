# -*- coding: utf-8 -*-
"""Лиги и тайи: дуги PDF привязываются к нотам голоса.

В PDF лига — залитый серп из двух кривых Безье, а не линия, поэтому в общем
потоке рисунков она отличается уже по типу элемента. Голос определяется
стороной стана: у верхнего голоса лига стоит над станом, у нижнего — под ним.
"""

def arcs_of(page):
    """Серпы страницы: края rect — концы лиги, серединой она выгибается.

    Серп приезжает двумя способами: кривыми Безье и многоугольником из десятков
    коротких отрезков (так пишет часть издателей — 661 весь такой). Различать их
    по типу нельзя, зато вязку от серпа отличает число сегментов: параллелограмм
    вязки — это три-четыре отрезка, ломаная серпа — несколько десятков.
    """
    cand = []
    for dr in page.get_drawings():
        items = dr["items"]
        curved = any(it[0] == "c" for it in items)
        if not curved and not (dr.get("type") in ("f", "fs") and len(items) >= 12
                               and all(it[0] == "l" for it in items)):
            continue
        r = dr["rect"]
        if r.width > 300 or r.height > 40: continue
        cand.append([r.x0, r.x1, r.y0, r.y1])
    # серп приезжает разрезанным пополам: в 664 половинки стоят встык (438.6-446.9
    # и 446.9-454.4), и порознь каждая накрывает всего две ноты вместо трёх, а
    # левая половина ещё и не проходит проверку «шире своей высоты» — так восемь
    # лиг из восемнадцати теряли голос и распев оставался без пометки
    joined = True
    while joined:
        joined = False
        for a in cand:
            if a is None: continue
            for j, b in enumerate(cand):
                if b is None or b is a: continue
                # стык — общая контрольная точка кривой, зазор между соседними
                # лигами так не выглядит: там всегда видимый просвет
                if abs(a[1] - b[0]) < 1.0 and a[3] > b[2] and b[3] > a[2]:
                    a[1] = max(a[1], b[1]); a[2] = min(a[2], b[2]); a[3] = max(a[3], b[3])
                    cand[j] = None; joined = True
    out = []
    for c in cand:
        if c is None: continue
        w, h = c[1] - c[0], c[3] - c[2]
        # вилки crescendo — тоже кривые у части издателей, но они длинные и плоские
        # лига всегда заметно шире своей высоты; круглые кривые — ферматы и знаки
        if not (6 < w < 220 and 1.5 < h < 30 and w > h * 1.6): continue
        out.append({"x0": c[0], "x1": c[1], "y": (c[2] + c[3]) / 2})
    return out

# верхний голос стана поёт со штилями вверх, и лига у него лежит над нотами;
# у нижнего — под ними. На этом голос и опознаётся
ABOVE = {"S": True, "T": True, "A": False, "B": False}

def voice_of(a, sy, it):
    """Голос дуги: тот, чьи ноты она обнимает с положенной стороны.

    Делить стан пополам по высоте нельзя: аккорд из низких нот целиком лежит
    ниже середины, и лига сопрано над ним всё равно оказывается в нижней
    половине — в 093 так обе дуги доставались альту.
    """
    best, bs = None, 1e9
    for v, cells in it["cells"].items():
        evs = [e for bar in cells for e in bar if not e["rest"]]
        ins = [e for e in evs if a["x0"] - 12 <= e["x"] <= a["x1"] + 6]
        if len(ins) < 2: continue
        # у аккорда дуга обнимает крайнюю головку своей стороны, а не середину
        pick = min if ABOVE[v] else max
        mid = sum(pick(p["y"] for p in e["pitches"]) for e in ins) / len(ins)
        d = abs(a["y"] - mid)
        # сторона важнее близости: у соседнего голоса ноты бывают ближе к дуге,
        # чем у своего, но лежат от неё не с той стороны
        if (a["y"] < mid) != ABOVE[v]: d += 100
        if d < bs: best, bs = v, d
    return best

def same_pitch(a, b):
    pa, pb = a["pitches"][0], b["pitches"][0]
    return (pa["p"], pa["o"]) == (pb["p"], pb["o"])

def nearest(a, syss, pno):
    """Система дуги — ближайшая по вертикали.

    Окно «полоса системы плюс поля» соседние системы делят между собой: лига над
    верхним голосом стоит выше своего стана, то есть в зазоре, и без выбора
    ближайшей она доставалась бы обеим — ноты помечались дважды.
    """
    best, bd = None, 1e9
    for i, sy in enumerate(syss):
        if sy["page"] != pno: continue
        d = 0.0 if sy["ytop"] <= a["y"] <= sy["ybot"] else \
            min(abs(a["y"] - sy["ytop"]), abs(a["y"] - sy["ybot"]))
        if d < bd: best, bd = i, d
    return best if bd < 60 else None

def vocal_limit(sy):
    """Нижняя граница, до которой дуга ещё может быть хоровой.

    У песни с фортепианным сопровождением дуг у аккомпанемента больше, чем у
    хора: в 119 их шестьдесят на страницу. Почти все отсекает `nearest` — они
    далеко, — но лига **над верхним фортепианным станом** попадает в зазор
    между вокалом и аккомпанементом, и басу доставались чужие дуги: в тактах
    18, 30 и 31 они превращались в тайи, и повторяющиеся ноты сливались в одну.

    Граница — середина зазора: своя лига баса рисуется под станом и так низко
    не опускается, а чужая лежит вплотную к фортепианному стану.
    """
    voc, pia = sy.get("vocal") or [], sy.get("piano") or []
    if not pia: return None
    if not voc: return -1e9                      # система без хора: все дуги чужие
    return (voc[-1]["bottom"] + pia[0]["top"]) / 2

def apply(doc, syss, sc):
    """Расставляет пометки «лига» и «тай» в событиях партитуры."""
    cache, n = {}, 0
    for pno in sorted({sy["page"] for sy in syss}):
        cache[pno] = arcs_of(doc[pno])
    for pno, arcs in cache.items():
        for a in arcs:
            si = nearest(a, syss, pno)
            if si is None: continue
            lim = vocal_limit(syss[si])
            if lim is not None and a["y"] > lim: continue
            it = sc["systems"][si]
            v = voice_of(a, syss[si], it)
            if v is None: continue
            evs = [e for bar in it["cells"][v] for e in bar if not e["rest"]]
            # лига рисуется от края головки, а не от её центра, и у нижнего голоса
            # обрывается, не доходя до последней головки — отсюда допуск с обеих сторон
            inside = [e for e in evs if a["x0"] - 12 <= e["x"] <= a["x1"] + 6]
            if len(inside) < 2: continue
            first, last = inside[0], inside[-1]
            if len(inside) == 2 and same_pitch(first, last):
                # та же высота — это продление ноты, а не распев
                first["tie"] = True
            else:
                # нота, на которой предыдущая лига кончилась, новую не открывает:
                # в ABC у одной ноты не бывает и закрывающей, и открывающей скобки
                if first.get("slurend") and len(inside) > 2: first = inside[1]
                first["slur"] = True; last["slurend"] = True
            n += 1
    return n
