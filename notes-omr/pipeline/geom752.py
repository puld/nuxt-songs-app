# -*- coding: utf-8 -*-
"""Разведка геометрии 752: горизонтали, группировка в станы, вертикали.

Отдельный файл, а не правка omr.py: сначала надо увидеть числа, и только потом
решать, какой порог менять — иначе правка делается вслепую.
"""
import sys, pymupdf, omr, fontmap

def hor_raw(page, minlen=0.0):
    """Все горизонтальные отрезки страницы без фильтра по длине.

    Фильтр длины (>200) в omr.staves_of отсекает не только текстовые
    подчёркивания, но и короткие станы — надо посмотреть, что реально есть.
    """
    out = []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 0.4:
                    ln = abs(p2.x - p1.x)
                    if ln > minlen:
                        out.append((round(p1.y, 2), round(min(p1.x, p2.x), 2),
                                    round(max(p1.x, p2.x), 2), round(ln, 2)))
    return sorted(set(out))

def group(ys, thr):
    """Группировка y по зазору thr — та же логика, что в omr.staves_of."""
    gs, cur = [], []
    for y in ys:
        if cur and y - cur[-1] > thr:
            gs.append(cur); cur = []
        cur.append(y)
    if cur: gs.append(cur)
    return gs

def dump(path, minlen=200):
    doc = pymupdf.open(path)
    print("=== %s, страниц %d ===" % (path, len(doc)))
    for pno, page in enumerate(doc):
        print("-- страница %d, размер %.1f x %.1f" % (pno, page.rect.width, page.rect.height))
        allh = hor_raw(page)
        long_ = [h for h in allh if h[3] > minlen]
        print("   горизонталей всего %d, длиннее %d pt: %d" % (len(allh), minlen, len(long_)))
        ys = sorted({h[0] for h in long_})
        # зазоры между соседними y: по ним и видно, где кончается стан
        gaps = [round(ys[i+1]-ys[i], 2) for i in range(len(ys)-1)]
        print("   уникальных y: %d" % len(ys))
        print("   зазоры:", gaps)
        for thr in (8, 9, 10, 12, 14):
            gs = group(ys, thr)
            sizes = [len(g) for g in gs]
            print("   порог %-3d -> групп %d, размеры %s" % (thr, len(gs), sizes))
        # длины длинных линий: одинаковы ли станы по ширине
        print("   длины (уник.):", sorted({h[3] for h in long_}))
        print("   x0 (уник.):", sorted({h[1] for h in long_}))
        print("   x1 (уник.):", sorted({h[2] for h in long_}))

if __name__ == "__main__":
    for p in sys.argv[1:]:
        dump(p)

def dump_staves(path):
    """Станы как их видит omr.staves_of + вертикали, накрывающие каждый стан."""
    doc = pymupdf.open(path)
    for pno, page in enumerate(doc):
        st = omr.staves_of(page)
        ver = omr.verticals(page)
        print("-- страница %d: станов %d" % (pno, len(st)))
        for i, s in enumerate(st):
            print("   стан %2d: top=%7.2f bottom=%7.2f space=%.2f x0=%.2f x1=%.2f"
                  % (i, s["top"], s["bottom"], s["space"], s["x0"], s["x1"]))
        print("   вертикалей: %d" % len(ver))
        # длинные вертикали — кандидаты в тактовые черты и скобки
        lng = sorted([v for v in ver if v["y1"] - v["y0"] > 12],
                     key=lambda v: (v["y0"], v["x"]))
        print("   длиннее 12 pt: %d" % len(lng))
        for v in lng:
            h = v["y1"] - v["y0"]
            # какие станы накрывает эта вертикаль
            cov = [i for i, s in enumerate(st)
                   if v["y0"] < s["bottom"] + 1 and v["y1"] > s["top"] - 1]
            print("      x=%7.2f y0=%7.2f y1=%7.2f h=%6.2f станы=%s"
                  % (v["x"], v["y0"], v["y1"], h, cov))

FILES = ["../songs/093/093.pdf", "../pdf/655.pdf", "../pdf/656.pdf", "../pdf/658.pdf",
         "../pdf/660.pdf", "../pdf/661.pdf", "../pdf/662.pdf", "../pdf/744.pdf",
         "../pdf/752.pdf"]

def scale_survey(files=FILES):
    """Межлинейное расстояние по файлам: допуски в omr/satb заданы в пунктах,
    и если 752 напечатан заметно мельче эталонов — пункты сами по себе виноваты."""
    for p in files:
        doc = pymupdf.open(p)
        sps, tops = [], []
        for page in doc:
            for s in omr.staves_of(page):
                sps.append(s["space"])
                tops.append(s["bottom"] - s["top"])
        print("%-24s станов %2d  space %.2f..%.2f  высота стана %.2f"
              % (p, len(sps), min(sps), max(sps), max(tops)))

def barcand(path):
    """Что проходит фильтр satb.bars_of и насколько точно вертикаль ложится на стан.

    Отклонения нормируются на межлинейное: порог в пунктах на мелкой печати
    означает совсем не то же, что на крупной.
    """
    doc = pymupdf.open(path)
    print("=== %s ===" % path)
    for pno, page in enumerate(doc):
        st = omr.staves_of(page)
        ver = omr.verticals(page)
        for si in range(0, len(st), 2):
            staff = st[si]
            sp = staff["space"]
            cand = [v for v in ver
                    if abs(v["y0"] - staff["top"]) < 2 and v["y1"] > staff["bottom"] - 2]
            cand.sort(key=lambda v: v["x"])
            print(" система %d (стан top=%.2f sp=%.2f): кандидатов %d"
                  % (si // 2 + 1, staff["top"], sp, len(cand)))
            for v in cand:
                print("    x=%7.2f  dy0=%+6.2f (%+5.2f sp)  dy1=%+6.2f (%+5.2f sp)  h=%6.2f"
                      % (v["x"], v["y0"] - staff["top"], (v["y0"] - staff["top"]) / sp,
                         v["y1"] - staff["bottom"], (v["y1"] - staff["bottom"]) / sp,
                         v["y1"] - v["y0"]))

def cand_stats(files=FILES):
    """Разброс отклонений кандидатов в тактовые черты по всем файлам.

    Эталоны сейчас разбираются верно, значит всё, что проходит там, порогом
    трогать нельзя; смотрим, есть ли зазор между эталонами и мусором 752.
    """
    for p in files:
        doc = pymupdf.open(p)
        rows = []
        for page in doc:
            st = omr.staves_of(page)
            ver = omr.verticals(page)
            for si in range(0, len(st), 2):
                s = st[si]; sp = s["space"]
                for v in ver:
                    if abs(v["y0"] - s["top"]) < 2 and v["y1"] > s["bottom"] - 2:
                        rows.append(((v["y0"] - s["top"]) / sp, (v["y1"] - s["bottom"]) / sp,
                                     (v["y1"] - v["y0"]) / (s["bottom"] - s["top"])))
        d0 = sorted(r[0] for r in rows); d1 = sorted(r[1] for r in rows)
        # доля кандидатов, чья высота заметно меньше стана — заведомо не черта
        print("%-24s кандидатов %3d  dy0/sp [%+5.2f..%+5.2f]  dy1/sp [%+5.2f..%+5.2f]"
              % (p, len(rows), d0[0], d0[-1], d1[0], d1[-1]))
        # гистограмма dy1 по 0.1 sp — чтобы увидеть, где кучкуются настоящие черты
        hist = {}
        for _, y1, _ in rows: hist[round(y1, 1)] = hist.get(round(y1, 1), 0) + 1
        print("      dy1/sp:", dict(sorted(hist.items())))

def stem_offsets(files=FILES):
    """Реальное смещение штиля от головки в пунктах и в межлинейных.

    find_stem ищет штиль вверх на h.x+6.6 pt: если смещение на деле привязано к
    размеру головки, а головка — к размеру стана, то на мелкой печати константа
    промахивается, и весь голос «вверх» пропадает.
    """
    for p in files:
        doc = pymupdf.open(p)
        up, dn, sps = [], [], []
        for page in doc:
            st = omr.staves_of(page)
            ver = omr.verticals(page)
            gl = omr.glyphs_of(page, fontmap.music_fonts(doc)[0])
            for s in st:
                sp = s["space"]; sps.append(sp)
                lo, hi = s["top"] - 5 * sp, s["bottom"] + 5 * sp
                heads = [g for g in gl if g["sem"] in ("head_f", "head_h")
                         and lo < g["y"] < hi and g["x"] >= s["x0"] - 2]
                stems = [v for v in ver if s["top"] - 6 * sp < v["y0"]
                         and v["y1"] < s["bottom"] + 6 * sp and 8 < (v["y1"] - v["y0"]) < 40]
                for h in heads:
                    # штиль вверх касается головки снизу (y1 ≈ y головки), вниз — сверху
                    for v in stems:
                        if abs(v["y1"] - h["y"]) < 2.0 and 0 < v["x"] - h["x"] < 3 * sp:
                            up.append(v["x"] - h["x"])
                        if abs(v["y0"] - h["y"]) < 2.0 and -1.5 < v["x"] - h["x"] < 1.5 * sp:
                            dn.append(v["x"] - h["x"])
        sp = sum(sps) / len(sps)
        f = lambda a: ("нет" if not a else "%.2f..%.2f pt  (%.2f..%.2f sp)"
                       % (min(a), max(a), min(a) / sp, max(a) / sp))
        print("%-24s sp=%.2f\n    вверх: %s\n    вниз : %s" % (p, sp, f(up), f(dn)))


# ───────────────────────── пробный патч ─────────────────────────
# Все три константы ниже были заданы в пунктах под печать со space≈5.5.
# 752 напечатан со space≈4.0 — те же пункты означают там другую долю стана,
# и допуски перестают отделять черту от штиля, а штиль от соседа.

def bars_of_rel(ver, staff, tol_k=0.25):
    """satb.bars_of с допуском в межлинейных вместо пунктов.

    Черта лежит ровно на стане: верх на верхней линейке, низ на нижней либо
    уходит вниз к следующему стану. Штиль такой привязки не имеет — он просто
    случайно бывает почти в рост стана, и на мелкой печати абсолютный допуск в
    2 pt перестаёт их различать.
    """
    sp = staff["space"]
    tol = sp * tol_k
    xs = sorted({round(v["x"], 1) for v in ver
                 if abs(v["y0"] - staff["top"]) < tol
                 and (abs(v["y1"] - staff["bottom"]) < tol
                      or v["y1"] > staff["bottom"] + sp * 3)})
    out = []
    for x in xs:
        if out and x - out[-1] < staff["space"] * 3: continue
        out.append(x)
    return out


def patch(tol_k=0.25, stem_c=1.22, stem_t=0.30, flag_c=1.12, flag_t=0.35):
    """Подменяет satb.bars_of и omr.staff_notes на версии с относительными допусками."""
    import satb, omr as _omr
    satb.bars_of = lambda ver, staff: bars_of_rel(ver, staff, tol_k)
    _omr.staff_notes = lambda sy, staff, clef, stem_sp=6: staff_notes_rel(
        sy, staff, clef, stem_sp, stem_c, stem_t, flag_c, flag_t)


def staff_notes_rel(sys_, staff, clef, stem_sp=6, stem_c=1.22, stem_t=0.30,
                    flag_c=1.12, flag_t=0.35):
    """Копия omr.staff_notes; отличия только в поиске штиля и флага."""
    sp = staff["space"]; half = sp / 2
    lo, hi = staff["top"] - 5 * sp, staff["bottom"] + 5 * sp
    heads = [g for g in sys_["glyphs"] if g["sem"] in ("head_f", "head_h")
             and lo < g["y"] < hi and g["x"] >= staff["x0"] - 2]
    flags = [g for g in sys_["glyphs"]
             if g["sem"] in ("flag_up", "flag_dn", "flag16_up", "flag16_dn")
             and lo - 3 * sp < g["y"] < hi + 3 * sp]
    dots = [g for g in sys_["glyphs"] if g["sem"] == "dot" and lo < g["y"] < hi]
    accs = [g for g in sys_["glyphs"] if g["sem"] in ("flat", "sharp", "nat") and lo < g["y"] < hi]
    stems = [v for v in sys_["ver"] if staff["top"] - stem_sp * sp < v["y0"]
             and v["y1"] < staff["bottom"] + stem_sp * sp and 8 < (v["y1"] - v["y0"]) < 40]
    bars = sorted({round(v["x"], 1) for v in sys_["ver"]
                   if abs(v["y0"] - staff["top"]) < 1.2 and v["y1"] >= staff["bottom"] - 1.2})
    pos = {}
    for h in heads:
        pos.setdefault((round(h["x"], 1), round(h["y"], 1)), []).append(h)
    dotted_ids = set()
    for dd in dots:
        cand = [h for h in heads if abs(dd["y"] - h["y"]) < half * 1.35 and 0 < dd["x"] - h["x"] < 6.5 * half]
        if not cand: continue
        near = min(dd["x"] - h["x"] for h in cand)
        for h in cand:
            if dd["x"] - h["x"] <= near + 0.6: dotted_ids.add(id(h))
    acc_of = {}
    for a in accs:
        cand = [h for h in heads if abs(a["y"] - h["y"]) < 1.6 and 0.5 < h["x"] - a["x"] < 5.6 * half]
        if not cand: continue
        near = min(h["x"] - a["x"] for h in cand)
        for h in cand:
            if h["x"] - a["x"] <= near + 0.6:
                acc_of[id(h)] = {"flat": "b", "sharp": "#", "nat": "n"}[a["sem"]]

    def find_stem(h, d):
        # смещение штиля задаётся шириной головки, а она пропорциональна стану
        off = stem_c * sp if d == "up" else 0.07 * sp
        key = "y1" if d == "up" else "y0"
        c = [v for v in stems if abs(v["x"] - (h["x"] + off)) < stem_t * sp
             and abs(v[key] - h["y"]) < 2.0]
        return c[0] if c else None

    def beams_at(stem, d):
        end = stem["y0"] if d == "up" else stem["y1"]
        n = 0
        for b in sys_.get("beams", []):
            if not (b[0] - 1.5 <= stem["x"] <= b[2] + 1.5): continue
            gap = (b[1] - end) if d == "up" else (end - b[3])
            if b[1] - 1.2 <= end <= b[3] + 1.2 or 0 < gap < 9: n += 1
        return n

    def flags_for(h, d, stem):
        if not stem: return 0
        if d == "up":
            fx = h["x"] + flag_c * sp
            near = [f for f in flags if f["sem"] in ("flag_up", "flag16_up")
                    and abs(f["x"] - fx) < flag_t * sp
                    and stem["y0"] - 2 < f["y"] < stem["y0"] + 1.7 * sp]
            n = sum(2 if f["sem"] == "flag16_up" else 1 for f in near)
            return n or beams_at(stem, "up")
        fx = h["x"]
        near = [f for f in flags if f["sem"] in ("flag_dn", "flag16_dn")
                and abs(f["x"] - fx) < flag_t * sp
                and stem["y1"] - 1.7 * sp < f["y"] < stem["y1"] + 2]
        n = sum(2 if f["sem"] == "flag16_dn" else 1 for f in near)
        return n or beams_at(stem, "dn")

    notes = []
    for (_, _), group in pos.items():
        h = group[0]
        su, sd = find_stem(h, "up"), find_stem(h, "dn")
        if su and sd: assign = [("up", su), ("dn", sd)]
        elif su: assign = [("up", su)]
        elif sd: assign = [("dn", sd)]
        else: assign = [(None, None)]
        step = round((staff["bottom"] - h["y"]) / half)
        dotted = any(id(x) in dotted_ids for x in group)
        acc = next((acc_of[id(x)] for x in group if id(x) in acc_of), None)
        for d, stem in assign:
            beamed = bool(stem) and d in ("up", "dn") and beams_at(stem, d) > 0
            notes.append({"x": h["x"], "y": h["y"], "step": step, "open": h["sem"] == "head_h",
                          "dir": d, "flags": flags_for(h, d, stem), "dot": dotted, "beamed": beamed,
                          "acc": acc,
                          "stem": (stem["x"], stem["y0"], stem["y1"]) if stem else None,
                          "unison": len(group) >= 2})
    notes.sort(key=lambda n: (n["x"], -n["y"]))
    return notes, bars


def run_all(files=FILES, **kw):
    """Прогон отчёта по всем файлам с наложенным патчем."""
    import satb
    patch(**kw)
    for p in files:
        print(p)
        try: satb.report(p)
        except Exception as e: print("   ОШИБКА:", type(e).__name__, e)


def voicing_survey(files=FILES):
    """Как записаны два голоса на стане: двумя штилями или аккордом на общем.

    Конвейер делит голоса по направлению штиля. Это верно для divisi-записи
    (сопрано штилем вверх, альт вниз), но не для гомофонной, где оба голоса
    сидят на одном штиле — там второй голос надо брать нижней головкой аккорда.
    """
    import satb
    patch()
    for p in files:
        doc, syss, _ = None, None, None
        doc = pymupdf.open(p)
        rows = []
        for name in ("treble", "bass"):
            up = dn = ch2 = ev = 0
            _, syss = omr.analyse(p)
            for sy in syss:
                notes, _ = omr.staff_notes(sy, sy[name], "G")
                for d in ("up", "dn"):
                    g = satb.voice_events(notes, d, sy[name]["space"])
                    if d == "up": up += len(g)
                    else: dn += len(g)
                    ev += len(g)
                    ch2 += sum(1 for x in g if len(x) >= 2)
            rows.append("%-6s вверх %3d вниз %3d, из них аккордов(2+) %3d" % (name, up, dn, ch2))
        print("%-24s %s | %s" % (p, rows[0], rows[1]))


def staff_notes_v2(sys_, staff, clef, stem_sp=6, stem_c=1.22, stem_t=0.30,
                   flag_c=1.12, flag_t=0.35, span_t=0.30,
                   flag_from_stem=False, chord_guard=False,
                   stem_lo=1.5, stem_hi=8.0):
    """staff_notes с двумя правками: головка сидит на штиле по всему его размаху
    (а не только на конце), и аккорд на общем штиле делится между голосами стана.

    Гомофонная запись держит оба голоса на одном штиле. Прежняя привязка
    «головка на конце штиля» видела из такого аккорда только одну головку —
    вторая теряла штиль, а с ним и голос.
    """
    sp = staff["space"]; half = sp / 2
    lo, hi = staff["top"] - 5 * sp, staff["bottom"] + 5 * sp
    heads = [g for g in sys_["glyphs"] if g["sem"] in ("head_f", "head_h")
             and lo < g["y"] < hi and g["x"] >= staff["x0"] - 2]
    flags = [g for g in sys_["glyphs"]
             if g["sem"] in ("flag_up", "flag_dn", "flag16_up", "flag16_dn")
             and lo - 3 * sp < g["y"] < hi + 3 * sp]
    dots = [g for g in sys_["glyphs"] if g["sem"] == "dot" and lo < g["y"] < hi]
    accs = [g for g in sys_["glyphs"] if g["sem"] in ("flat", "sharp", "nat") and lo < g["y"] < hi]
    stems = [v for v in sys_["ver"] if staff["top"] - stem_sp * sp < v["y0"]
             and v["y1"] < staff["bottom"] + stem_sp * sp
             and stem_lo * sp < (v["y1"] - v["y0"]) < stem_hi * sp]
    bars = sorted({round(v["x"], 1) for v in sys_["ver"]
                   if abs(v["y0"] - staff["top"]) < 0.3 * sp
                   and v["y1"] >= staff["bottom"] - 0.3 * sp})
    pos = {}
    for h in heads:
        pos.setdefault((round(h["x"], 1), round(h["y"], 1)), []).append(h)
    dotted_ids = set()
    for dd in dots:
        cand = [h for h in heads if abs(dd["y"] - h["y"]) < half * 1.35 and 0 < dd["x"] - h["x"] < 6.5 * half]
        if not cand: continue
        near = min(dd["x"] - h["x"] for h in cand)
        for h in cand:
            if dd["x"] - h["x"] <= near + 0.6: dotted_ids.add(id(h))
    acc_of = {}
    for a in accs:
        cand = [h for h in heads if abs(a["y"] - h["y"]) < 1.6 and 0.5 < h["x"] - a["x"] < 5.6 * half]
        if not cand: continue
        near = min(h["x"] - a["x"] for h in cand)
        for h in cand:
            if h["x"] - a["x"] <= near + 0.6:
                acc_of[id(h)] = {"flat": "b", "sharp": "#", "nat": "n"}[a["sem"]]

    def find_stem(h, d):
        # головка аккорда стоит на штиле, но не на его конце: проверяем попадание
        # в размах, иначе видна только крайняя нота аккорда
        off = stem_c * sp if d == "up" else 0.07 * sp
        t = span_t * sp
        c = [v for v in stems if abs(v["x"] - (h["x"] + off)) < stem_t * sp
             and v["y0"] - t < h["y"] < v["y1"] + t]
        return c[0] if c else None

    def beams_at(stem, d):
        end = stem["y0"] if d == "up" else stem["y1"]
        n = 0
        for b in sys_.get("beams", []):
            if not (b[0] - 1.5 <= stem["x"] <= b[2] + 1.5): continue
            gap = (b[1] - end) if d == "up" else (end - b[3])
            if b[1] - 1.2 <= end <= b[3] + 1.2 or 0 < gap < 9: n += 1
        return n

    def flags_of_stem(stem):
        # флаг принадлежит штилю, а не головке: у аккорда головок две (а
        # смещённая на секунду ещё и стоит по другую сторону штиля), флаг же
        # один на всех. Направление берём у самого штиля — какой конец
        # оказался с флагом, тот и верный
        up = [f for f in flags if f["sem"] in ("flag_up", "flag16_up")
              and abs(f["x"] - stem["x"]) < flag_t * sp
              and stem["y0"] - 2 < f["y"] < stem["y0"] + 1.7 * sp]
        dn = [f for f in flags if f["sem"] in ("flag_dn", "flag16_dn")
              and abs(f["x"] - stem["x"]) < flag_t * sp
              and stem["y1"] - 1.7 * sp < f["y"] < stem["y1"] + 2]
        n = sum(2 if "16" in f["sem"] else 1 for f in up + dn)
        return n or beams_at(stem, "up") or beams_at(stem, "dn")

    def flags_for(h, d, stem):
        if not stem: return 0
        if flag_from_stem: return flags_of_stem(stem)
        if d == "up":
            near = [f for f in flags if f["sem"] in ("flag_up", "flag16_up")
                    and abs(f["x"] - (h["x"] + flag_c * sp)) < flag_t * sp
                    and stem["y0"] - 2 < f["y"] < stem["y0"] + 1.7 * sp]
            n = sum(2 if f["sem"] == "flag16_up" else 1 for f in near)
            return n or beams_at(stem, "up")
        near = [f for f in flags if f["sem"] in ("flag_dn", "flag16_dn")
                and abs(f["x"] - h["x"]) < flag_t * sp
                and stem["y1"] - 1.7 * sp < f["y"] < stem["y1"] + 2]
        n = sum(2 if f["sem"] == "flag16_dn" else 1 for f in near)
        return n or beams_at(stem, "dn")

    notes = []
    for (_, _), group in pos.items():
        h = group[0]
        su, sd = find_stem(h, "up"), find_stem(h, "dn")
        if su and sd: assign = [("up", su), ("dn", sd)]
        elif su: assign = [("up", su)]
        elif sd: assign = [("dn", sd)]
        else: assign = [(None, None)]
        step = round((staff["bottom"] - h["y"]) / half)
        dotted = any(id(x) in dotted_ids for x in group)
        acc = next((acc_of[id(x)] for x in group if id(x) in acc_of), None)
        for d, stem in assign:
            beamed = bool(stem) and d in ("up", "dn") and beams_at(stem, d) > 0
            notes.append({"x": h["x"], "y": h["y"], "step": step, "open": h["sem"] == "head_h",
                          "dir": d, "flags": flags_for(h, d, stem), "dot": dotted, "beamed": beamed,
                          "acc": acc,
                          "stem": (stem["x"], stem["y0"], stem["y1"]) if stem else None,
                          "unison": len(group) >= 2})

    # Два голоса стана различаются либо направлением штиля (divisi), либо
    # положением головки в аккорде (гомофонная запись). Признак — доля штилей
    # с двумя головками: у divisi это единичный случай на всю пьесу, у
    # гомофонной запись такова почти вся. Решать поголовно нельзя: настоящий
    # аккорд внутри divisi уехал бы во второй голос и удвоил его такт.
    by_stem = {}
    for n in notes:
        if n["stem"]: by_stem.setdefault(n["stem"], []).append(n)
    chords = [g for g in by_stem.values() if len(g) >= 2]

    def alone(g):
        # если в этой же вертикали есть головка на другом штиле, голоса уже
        # разведены штилями — делить аккорд значит выдать одну ноту дважды
        xs = [n["x"] for n in g]
        return not any(n["stem"] != g[0]["stem"]
                       and any(abs(n["x"] - x) < 0.6 * sp for x in xs)
                       for n in notes if n["stem"])

    if by_stem and len(chords) * 2 > len(by_stem):
        for g in chords:
            if chord_guard and not alone(g): continue
            g.sort(key=lambda n: n["y"])
            g[0]["dir"], g[-1]["dir"] = "up", "dn"

    notes.sort(key=lambda n: (n["x"], -n["y"]))
    return notes, bars


def patch2(tol_k=0.25, **kw):
    import satb, omr as _omr
    satb.bars_of = lambda ver, staff: bars_of_rel(ver, staff, tol_k)
    _omr.staff_notes = lambda sy, staff, clef, stem_sp=6: staff_notes_v2(sy, staff, clef, stem_sp, **kw)


def run_all2(files=FILES, **kw):
    import satb
    patch2(**kw)
    for p in files:
        print(p)
        try: satb.report(p)
        except Exception as e: print("   ОШИБКА:", type(e).__name__, e)


def chord_survey(files=FILES):
    """Сколько на стане штилей каждого направления и сколько из них с аккордом.

    Гравёр выбирает запись на всю пьесу: либо divisi (два направления штиля,
    по голосу на каждое), либо гомофонную (одно направление, оба голоса на
    общем штиле). Признак должен быть на уровне стана, а не отдельной ноты —
    иначе настоящий аккорд внутри divisi поедет во второй голос.
    """
    for p in files:
        _, syss = omr.analyse(p)
        for name in ("treble", "bass"):
            st = {"up": [0, 0], "dn": [0, 0]}
            for sy in syss:
                notes, _ = staff_notes_v2(sy, sy[name], "G")
                by = {}
                for n in notes:
                    if n["stem"]: by.setdefault(n["stem"], []).append(n)
                for k, g in by.items():
                    d = "up" if k[2] > max(x["y"] for x in g) - 0.1 else "dn"
                    # направление по тому, с какой стороны от головок свободный конец
                    d = "up" if k[1] < min(x["y"] for x in g) else "dn"
                    st[d][0] += 1
                    if len(g) >= 2: st[d][1] += 1
            print("%-24s %-6s вверх %3d (аккордов %3d)  вниз %3d (аккордов %3d)"
                  % (p, name, st["up"][0], st["up"][1], st["dn"][0], st["dn"][1]))


def bars_of_sys(ver, treble, bass, tol_k=0.3):
    """Тактовые черты системы: вертикаль, лежащая ровно на стане.

    Черта делит такт у всей системы сразу, поэтому она либо пронизывает систему
    насквозь, либо нарисована на обоих станах в одном x. Штиль такой пары не
    имеет — это и отличает его от черты, когда он случайно оказался в рост
    стана (на мелкой печати это сплошь и рядом).
    """
    def on(staff):
        sp = staff["space"]; tol = sp * tol_k
        return {round(v["x"], 1) for v in ver
                if abs(v["y0"] - staff["top"]) < tol and abs(v["y1"] - staff["bottom"]) < tol}
    sp = treble["space"]; tol = sp * tol_k
    through = {round(v["x"], 1) for v in ver
               if abs(v["y0"] - treble["top"]) < tol and v["y1"] > bass["bottom"] - tol}
    xs = sorted(through | (on(treble) & on(bass)))
    if not xs:                       # черты только на верхнем стане — берём как есть
        xs = sorted(on(treble))
    out = []
    for x in xs:
        if out and x - out[-1] < sp * 3: continue
        out.append(x)
    return out


def run_all3(files=FILES, tol_k=0.3, **kw):
    """Прогон с системной версией bars_of (подмена через обёртку build)."""
    import satb, omr as _omr
    _omr.staff_notes = lambda sy, staff, clef, stem_sp=6: staff_notes_v2(sy, staff, clef, stem_sp, **kw)
    orig = satb.bars_of
    holder = {}
    def bars_of(ver, staff):
        sy = holder["sy"]
        return bars_of_sys(ver, sy["treble"], sy["bass"], tol_k)
    satb.bars_of = bars_of
    # build перебирает системы — подменяем omr.analyse, чтобы знать текущую
    real_analyse = _omr.analyse
    def analyse(path):
        doc, syss = real_analyse(path)
        return doc, _Track(syss, holder)
    _omr.analyse = analyse
    for p in files:
        print(p)
        try: satb.report(p)
        except Exception as e: print("   ОШИБКА:", type(e).__name__, e)
    _omr.analyse = real_analyse
    satb.bars_of = orig


class _Track(list):
    """Список систем, запоминающий текущую при переборе: bars_of в satb получает
    только стан, а системной версии нужен и второй стан."""
    def __init__(self, items, holder):
        super().__init__(items); self._h = holder
    def __iter__(self):
        for x in super().__iter__():
            self._h["sy"] = x
            yield x


def run_all4(files=FILES, tol_k=0.3, **kw):
    """Финальный набор: системная bars_of + staff_notes_v2 с обеими правками."""
    kw.setdefault("flag_from_stem", True)
    kw.setdefault("chord_guard", True)
    run_all3(files, tol_k, **kw)


def bars_of_final(ver, staff, other=None, tol_k=0.3):
    """Итоговая замена satb.bars_of — ровно то, что предлагается в отчёте.

    Второй стан необязателен: у вызывающих (sysimg) его нет, и без него
    работает прежнее одностановое правило, только с допуском от межлинейного.
    """
    sp = staff["space"]; tol = sp * tol_k

    def on(st):
        t = st["space"] * tol_k
        return {round(v["x"], 1) for v in ver
                if abs(v["y0"] - st["top"]) < t and abs(v["y1"] - st["bottom"]) < t}

    xs = []
    if other is not None:
        # черта делит такт у всей системы, поэтому либо пронизывает её насквозь,
        # либо нарисована на обоих станах в одном x. У штиля, случайно выросшего
        # в рост стана (мелкая печать), пары на соседнем стане нет
        through = {round(v["x"], 1) for v in ver
                   if abs(v["y0"] - staff["top"]) < tol and v["y1"] > other["bottom"] - tol}
        xs = sorted(through | (on(staff) & on(other)))
    if not xs:
        xs = sorted({round(v["x"], 1) for v in ver
                     if abs(v["y0"] - staff["top"]) < tol and v["y1"] > staff["bottom"] - tol})
    out = []
    for x in xs:
        if out and x - out[-1] < sp * 3: continue
        out.append(x)
    return out


def run_final(files=FILES, **kw):
    """Прогон с финальными версиями обеих функций."""
    import satb, omr as _omr
    kw.setdefault("flag_from_stem", True)
    kw.setdefault("chord_guard", True)
    _omr.staff_notes = lambda sy, staff, clef, stem_sp=6: staff_notes_v2(sy, staff, clef, stem_sp, **kw)
    holder = {}
    satb.bars_of = lambda ver, staff: bars_of_final(ver, staff, holder["sy"]["bass"])
    real_analyse = _omr.analyse
    _omr.analyse = lambda path: (lambda r: (r[0], _Track(r[1], holder)))(real_analyse(path))
    for p in files:
        print(p)
        try: satb.report(p)
        except Exception as e: print("   ОШИБКА:", type(e).__name__, e)
    _omr.analyse = real_analyse
