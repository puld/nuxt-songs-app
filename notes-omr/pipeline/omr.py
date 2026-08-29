# -*- coding: utf-8 -*-
"""Извлечение нот из PDF по координатам глифов нотного шрифта."""
import pymupdf, collections, json, fontmap

HEAD_F, HEAD_H = '', ''
FLAG_UP, FLAG_DN = '', ''
FLAG16_UP, FLAG16_DN = '', ''   # шестнадцатая: один глиф на два крючка
DOT = ''
CLEF_G, CLEF_F = '', ''
FLAT, SHARP, NAT = '', '', ''

def staves_of(page):
    hor = []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 0.4 and (max(p1.x,p2.x) - min(p1.x,p2.x)) > 200:
                    hor.append((round(p1.y, 2), min(p1.x,p2.x), max(p1.x,p2.x)))
    hor = sorted(set(hor))
    groups, cur = [], []
    for h in hor:
        if cur and h[0] - cur[-1][0] > 8:
            groups.append(cur); cur = []
        cur.append(h)
    if cur: groups.append(cur)
    out = []
    for g in groups:
        ys = sorted(r[0] for r in g)
        out.append({"lines": ys, "top": ys[0], "bottom": ys[-1], "space": (ys[-1]-ys[0])/4,
                    "x0": min(r[1] for r in g), "x1": max(r[2] for r in g)})
    return out

def glyphs_of(page, music=("Maestro",)):
    """Глифы страницы; у нотных код приводится к общему виду U+F0xx.

    Одна и та же нотная кодировка приезжает в PDF тремя способами (приватная
    область, голый байт, MacRoman) — приведение к U+F0xx делает дальнейший разбор
    независимым от того, чем набирали сборник.
    """
    res = []
    for b in page.get_text("rawdict")["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for sp in l["spans"]:
                note = any(f in sp["font"] for f in music)
                for c in sp["chars"]:
                    ch, sem = c["c"], None
                    if note:
                        byte = fontmap.to_byte(ch)
                        if byte is not None:
                            ch, sem = chr(0xF000 + byte), fontmap.CODE.get(byte)
                    res.append({"fam": "maestro" if note else "text", "c": ch, "sem": sem,
                                "x": c["origin"][0], "y": c["origin"][1],
                                "bbox": tuple(c["bbox"]), "size": sp["size"]})
    return res

def verticals(page):
    out = []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.x - p2.x) < 0.5 and abs(p1.y - p2.y) > 2:
                    out.append({"x": (p1.x+p2.x)/2, "y0": min(p1.y,p2.y), "y1": max(p1.y,p2.y)})
    # дубли (Finale рисует штиль несколькими совпадающими линиями)
    uniq = {}
    for v in out:
        k = (round(v["x"],1), round(v["y0"],1), round(v["y1"],1))
        uniq[k] = v
    return list(uniq.values())

def beams(page):
    """Вязки: заполненный параллелограмм ровно из 4 отрезков.

    Ширина не ограничена парой нот: вязка через четыре восьмых (117) шире
    70 pt, и прежний потолок её терял — восьмые читались четвертями. Вместо
    габаритов проверяется толщина: у наклонной вязки прямоугольник высок, а
    расстояние между кромками на левом краю — те же 2.5–4 pt.
    """
    out = []
    for d in page.get_drawings():
        if d.get("type") != "f": continue
        items = d["items"]
        r = d["rect"]
        # горизонтальную вязку рисуют и одним прямоугольником, без наклона (115)
        if len(items) == 1 and items[0][0] == "re":
            if 5 < r.width < 240 and 1.5 < r.height < 6 and r.width > 2 * r.height:
                out.append((r.x0, r.y0, r.x1, r.y1))
            continue
        # замкнутый параллелограмм: четвёртая сторона может быть неявной (3 отрезка)
        if len(items) not in (3, 4) or any(i[0] != "l" for i in items): continue
        if not (5 < r.width < 240 and 1.5 < r.height < 25): continue
        pts = [p for it in items for p in (it[1], it[2])]
        left = min(p.x for p in pts)
        ys = [p.y for p in pts if p.x - left < r.width * 0.3]
        if ys and 1.5 < max(ys) - min(ys) < 6:
            out.append((r.x0, r.y0, r.x1, r.y1))
    return out

def strokes(page):
    """Короткие горизонтальные штрихи: половинки скобки триоли.

    Скобка рисуется обводкой и разорвана посередине — в разрыве стоит цифра.
    Вязки сюда не попадают (они заполненные), линии стана — длиннее.
    """
    out = []
    for d in page.get_drawings():
        if d.get("type") != "s": continue
        for it in d["items"]:
            if it[0] != "l": continue
            p1, p2 = it[1], it[2]
            if abs(p1.y - p2.y) < 3 and 8 < abs(p1.x - p2.x) < 45:
                out.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
    return out

def fills(page):
    """Заполненные пути — вязки, лиги, утолщения."""
    out = []
    for d in page.get_drawings():
        r = d["rect"]
        out.append({"rect": (r.x0, r.y0, r.x1, r.y1), "w": r.width, "h": r.height,
                    "n": len(d["items"]), "fill": d.get("fill"), "type": d.get("type")})
    return out

# ── станы в системы ──────────────────────────────────────────────────────────

def spans(v, a, b, k=0.5):
    """Идёт ли вертикаль от верха стана `a` до низа стана `b`.

    Допуск — в долях межлинейного, а не в пунктах: печать в сборниках разного
    кегля (межлинейное от 4.0 до 5.5 pt), и абсолютный порог мимо промахивается.
    """
    return abs(v["y0"] - a["top"]) < a["space"] * k and \
           abs(v["y1"] - b["bottom"]) < b["space"] * k

def systems_of(staves, ver):
    """Станы страницы, разбитые на системы.

    Связывает станы любая вертикаль от верха одного до низа другого: начальная
    черта системы, скобка группировки, сквозная тактовая черта. Достаточно
    одной — станы между связанными концами тоже попадают в систему, даже если
    сами по себе ни с чем не связаны.

    Делить станы по чётности («каждая пара подряд — система SATB») нельзя:
    так свёрстана только чисто хоровая партитура. В 1487 куплет набран как
    «вокал + фортепиано» (три стана), в 119 — хор с фортепиано (четыре), а в
    1473 первые две системы одиночные, и пары собирались поперёк систем.
    """
    n = len(staves)
    join = [False] * max(n - 1, 0)
    for i in range(n):
        for j in range(i + 1, n):
            if any(spans(v, staves[i], staves[j]) for v in ver):
                for k in range(i, j):
                    join[k] = True
    out = []
    for i, s in enumerate(staves):
        if i and join[i - 1]: out[-1].append(s)
        else: out.append([s])
    return out

def has_lyrics(page, a, b):
    """Есть ли подтекстовка в зазоре между станами `a` и `b`.

    Слова песни — единственное, что печатают между двумя станами одной группы.
    Между руками фортепиано стоят только динамика и вилки, а они набраны
    латиницей, поэтому признаком берётся кириллица.
    """
    lo, hi = a["bottom"], b["top"]
    for w in page.get_text("words"):
        y = (w[1] + w[3]) / 2
        if lo < y < hi and any("А" <= c <= "я" or c in "Ёё" for c in w[4]):
            return True
    return False

def split_staves(group, page, piano_score):
    """Вокальные и фортепианные станы системы.

    Три стана и больше — это голоса над аккомпанементом: партию фортепиано
    печатают снизу и всегда на двух станах, значит нижняя пара фортепианная, а
    всё, что выше, — вокал.

    Два стана значат разное в разных партитурах, и решает не форма, а
    содержание. В чисто хоровом сборнике (все системы по два стана) это хор — так
    конвейер работал и раньше. В партитуре с фортепиано двухстановая система
    бывает и хоровым припевом (1487), и фортепианной интерлюдией (119), где
    хоровые станы не выписаны вовсе; отличает их подтекстовка.
    """
    if len(group) >= 3: return group[:-2], group[-2:]
    if len(group) == 2 and piano_score and not has_lyrics(page, group[0], group[1]):
        return [], group
    return group, []

def system_staves(sy):
    """Станы системы. У глифовой партитуры (664) разбор геометрии не наш, и
    списка станов в системе нет — там их всегда два."""
    return sy.get("staves") or [sy["treble"], sy["bass"]]

def band_of(vocal, piano, below):
    """Полоса, где искать слова этой системы.

    У хоровой системы это зазор между станами — там подтекстовка и стоит. У
    одиночной вокальной строки нижней границы нет вовсе, и её роль играет
    ближайший стан снизу: слова печатают под станом, а ниже начинается уже
    следующая система. У системы без вокальных станов полоса пустая — искать
    там нечего.
    """
    if len(vocal) >= 2: return (vocal[0]["bottom"], vocal[-1]["top"])
    if len(vocal) == 1:
        top = vocal[0]["bottom"]
        bot = piano[0]["top"] if piano else (below["top"] if below else top + 12 * vocal[0]["space"])
        return (top, bot)
    return (0.0, 0.0)

def analyse(path):
    """Геометрия документа: станы, сведённые в системы, и глифы страницы.

    Вокал отделён от аккомпанемента (`vocal` / `piano`): фортепиано в партитуру
    не переносится, но такты его системы считаются — хор в ней молчит, и без её
    тактов сбилась бы нумерация всей песни. `treble` / `bass` остаются краями
    той группы, по которой режутся такты, — на них опирается остальной конвейер.
    """
    doc = pymupdf.open(path)
    music, _ = fontmap.music_fonts(doc)
    pages = []
    for pno, page in enumerate(doc):
        st = staves_of(page)
        ver = verticals(page)
        pages.append((pno, page, st, ver, systems_of(st, ver)))
    # признак «в партитуре есть фортепиано» — на весь документ, а не на систему:
    # по двум станам самим по себе его не видно, а по трём видно сразу
    piano_score = any(len(g) >= 3 for _, _, _, _, gs in pages for g in gs)
    systems = []
    for pno, page, st, ver, groups in pages:
        gl = glyphs_of(page, music)
        bm = beams(page)
        sk = strokes(page)
        for g in groups:
            vocal, piano = split_staves(g, page, piano_score)
            # станы, по которым режутся такты: у системы без вокала это
            # фортепиано — иначе её такты выпали бы из нумерации песни
            ref = vocal or piano
            below = next((s for s in st if s["top"] > g[-1]["bottom"] + 1), None)
            systems.append({"page": pno, "staves": g, "vocal": vocal, "piano": piano,
                            "treble": ref[0], "bass": ref[-1],
                            "band": band_of(vocal, piano, below),
                            "glyphs": gl, "ver": ver, "beams": bm, "strokes": sk,
                            "pstaves": st,
                            "ytop": ref[0]["top"], "ybot": ref[-1]["bottom"]})
    return doc, systems

def staff_notes(sys_, staff, clef, stem_sp=6):
    """Собирает ноты одного нотоносца: головки + штили + флаги + точки."""
    sp = staff["space"]; half = sp/2
    lo, hi = staff["top"] - 5*sp, staff["bottom"] + 5*sp
    # знаки отбираются по смыслу, а не по коду: точку длительности часть издателей
    # держит в отдельном шрифте под своим кодом, и сравнение с константой её теряло
    # целая нота (head_w) собирается наравне с прочими головками: штиля у неё нет,
    # и без неё такт недосчитывался всей её длительности — в 1473 таких нот семнадцать
    heads = [g for g in sys_["glyphs"] if g["sem"] in ("head_f", "head_h", "head_w")
             and lo < g["y"] < hi and g["x"] >= staff["x0"]-2]
    flags = [g for g in sys_["glyphs"]
             if g["sem"] in ("flag_up", "flag_dn", "flag16_up", "flag16_dn")
             and lo-3*sp < g["y"] < hi+3*sp]
    dots  = [g for g in sys_["glyphs"] if g["sem"] == "dot" and lo < g["y"] < hi]
    accs  = [g for g in sys_["glyphs"]
             if g["sem"] in ("flat", "sharp", "nat", "dblsharp") and lo < g["y"] < hi]
    # у фортепианного пассажа балка лежит в зазоре между станами, и штиль уходит
    # за обычное окно — отсюда настраиваемый размах stem_sp
    # размеры — в межлинейных: на мелкой печати (752 — 4 pt против обычных 5.5)
    # абсолютные пункты промахиваются мимо и штиля, и тактовой черты
    stems = [v for v in sys_["ver"] if staff["top"]-stem_sp*sp < v["y0"]
             and v["y1"] < staff["bottom"]+stem_sp*sp and 1.5*sp < (v["y1"]-v["y0"]) < 8.0*sp]
    # тактовые черты этого нотоносца
    bars = sorted({round(v["x"],1) for v in sys_["ver"]
                   if abs(v["y0"]-staff["top"]) < 0.3*sp and v["y1"] >= staff["bottom"]-0.3*sp})
    # головки в одной точке = унисон двух голосов: Finale рисует их дважды,
    # с отдельным штилем вверх и вниз. Один штиль на две головки — артефакт отрисовки.
    pos = {}
    for h in heads:
        pos.setdefault((round(h["x"], 1), round(h["y"], 1)), []).append(h)

    # каждая точка принадлежит ближайшей головке слева на своей высоте: у аккорда
    # точки нескольких голосов стоят столбиком, и точка верхнего голоса оказывается
    # дальше от головки, чем допускал прежний порог по X
    # точки репризы — не точки длительности: пара в средних просветах вплотную
    # к тактовой черте. Прежнее узкое окно до них не доставало, а окно в 9
    # полушагов дотягивается от последней ноты такта (655) — отсев обязателен
    mid = (staff["top"] + staff["bottom"]) / 2
    def repeat_dot(dd):
        if abs(dd["y"] - mid) > 1.2 * sp: return False
        if not any(abs(dd["x"] - b) < 1.6 * sp for b in bars): return False
        return any(x is not dd and abs(x["x"] - dd["x"]) < 1
                   and abs(abs(x["y"] - dd["y"]) - sp) < 1.5 for x in dots)
    dots = [dd for dd in dots if not repeat_dot(dd)]
    dotted_ids = set()
    for dd in dots:
        # окно 9 полушагов: у секунды двух голосов левая головка отодвинута от
        # столбика точек ещё и на ширину головки (011), прежние 6.5 не доставали
        cand = [h for h in heads if abs(dd["y"] - h["y"]) < half*1.35 and 0 < dd["x"] - h["x"] < 9*half]
        if not cand: continue
        # сперва высота, потом близость: точка печатается на высоте своей
        # головки, и при секунде ближняя по X головка соседнего голоса иначе
        # перехватывала чужую точку — голос оставался без трети длительности
        dy0 = min(abs(dd["y"] - h["y"]) for h in cand)
        cand = [h for h in cand if abs(dd["y"] - h["y"]) <= dy0 + 0.7]
        near = min(dd["x"] - h["x"] for h in cand)
        # унисон двух голосов = две головки почти в одной точке; точка относится к обеим,
        # иначе один из голосов недосчитается доли
        for h in cand:
            if dd["x"] - h["x"] <= near + 0.6:
                dotted_ids.add(id(h))

    # знак альтерации принадлежит головке справа от него на той же высоте: в аккорде
    # знаки стоят столбиком, и знак нижнего голоса отодвинут дальше первого.
    # Дальше 5.6*half — уже ключевые знаки: они стоят в 15pt от первой ноты системы
    acc_of = {}
    for a in accs:
        cand = [h for h in heads if abs(a["y"] - h["y"]) < 1.6 and 0.5 < h["x"] - a["x"] < 5.6*half]
        if not cand: continue
        near = min(h["x"] - a["x"] for h in cand)
        for h in cand:
            if h["x"] - a["x"] <= near + 0.6:
                acc_of[id(h)] = {"flat": "b", "sharp": "#", "nat": "n", "dblsharp": "x"}[a["sem"]]

    def find_stem(h, d):
        """Штиль головки: смещение и допуск — в межлинейных.

        Головка ищется внутри размаха штиля, а не на его конце: в гомофонной
        записи (752) на одном штиле сидят две головки, и вторая стоит в середине.
        """
        off = 1.22*sp if d == "up" else 0.07*sp
        t = 0.30*sp
        c = [v for v in stems if abs(v["x"] - (h["x"]+off)) < 0.30*sp
             and v["y0"]-t < h["y"] < v["y1"]+t]
        return c[0] if c else None

    def beams_at(stem, d):
        """Сколько балок на штиле: шестнадцатая — две, и вторая конца штиля уже не касается."""
        end = stem["y0"] if d == "up" else stem["y1"]
        n = 0
        for b in sys_.get("beams", []):
            if not (b[0]-1.5 <= stem["x"] <= b[2]+1.5): continue
            gap = (b[1] - end) if d == "up" else (end - b[3])   # балки идут стопкой внутрь штиля
            if b[1]-1.2 <= end <= b[3]+1.2 or 0 < gap < 9: n += 1
        return n

    def flags_for(h, d, stem):
        """Флаг принадлежит штилю, а не головке.

        У аккорда головок две, и смещённая на секунду стоит по другую сторону
        штиля — от неё направление читалось наоборот, и флаг вверх у общего штиля
        оставался незамеченным: восьмая становилась четвертью.
        """
        if not stem: return 0
        up = [f for f in flags if f["sem"] in ("flag_up", "flag16_up")
              and abs(f["x"] - stem["x"]) < 0.35*sp
              and stem["y0"]-2 < f["y"] < stem["y0"]+1.7*sp]
        dn = [f for f in flags if f["sem"] in ("flag_dn", "flag16_dn")
              and abs(f["x"] - stem["x"]) < 0.35*sp
              and stem["y1"]-1.7*sp < f["y"] < stem["y1"]+2]
        # двойной флаг — один глиф, но две балки: считать его надо за две
        n = sum(2 if "16" in f["sem"] else 1 for f in up + dn)
        # вязки считаются только на конце по направлению штиля: у короткого
        # штиля (147 — 2.9 межлинейного) вязка снизу укладывалась в допуск и от
        # верхнего конца, перебор «up, потом dn» находил её там одну — и до
        # второй вязки настоящего конца дело не доходило: шестнадцатые
        # становились восьмыми
        return n or (beams_at(stem, d) if d in ("up", "dn") else 0)

    notes = []
    for (_, _), group in pos.items():
        h = group[0]
        su, sd = find_stem(h, "up"), find_stem(h, "dn")
        if len(group) >= 2 and su and sd:
            assign = [("up", su), ("dn", sd)]          # унисон: по голосу на каждый штиль
        elif su and sd:
            assign = [("up", su), ("dn", sd)]          # одна головка, два штиля — тоже унисон
        elif su:
            assign = [("up", su)]
        elif sd:
            assign = [("dn", sd)]
        else:
            assign = [(None, None)]
        step = round((staff["bottom"] - h["y"]) / half)
        dotted = any(id(x) in dotted_ids for x in group)
        acc = next((acc_of[id(x)] for x in group if id(x) in acc_of), None)
        for d, stem in assign:
            # вязка вместо флага: в ABC такие ноты пишутся слитно, без пробела
            beamed = bool(stem) and d in ("up", "dn") and beams_at(stem, d) > 0
            notes.append({"x": h["x"], "y": h["y"], "step": step,
                          "open": h["sem"] in ("head_h", "head_w"),
                          "whole": h["sem"] == "head_w",
                          "dir": d, "flags": flags_for(h, d, stem), "dot": dotted, "beamed": beamed,
                          "acc": acc,
                          "stem": (stem["x"], stem["y0"], stem["y1"]) if stem else None,
                          "unison": len(group) >= 2})
    # Два голоса стана различаются либо направлением штиля (divisi), либо
    # положением головки в аккорде (гомофонная запись). Признак — доля штилей с
    # двумя головками: у divisi это единичный случай на всю пьесу, у гомофонной
    # записи так набрано почти всё. Решать поголовно нельзя: настоящий аккорд
    # внутри divisi уехал бы во второй голос и удвоил его такт.
    by_stem = {}
    for n in notes:
        if n["stem"]: by_stem.setdefault(n["stem"], []).append(n)
    chords = [g for g in by_stem.values() if len(g) >= 2]

    def alone(g):
        # если в этой же вертикали есть головка на другом штиле, голоса уже
        # разведены штилями — делить аккорд значит выдать одну ноту дважды
        xs = [n["x"] for n in g]
        return not any(n["stem"] != g[0]["stem"]
                       and any(abs(n["x"] - x) < 0.6*sp for x in xs)
                       for n in notes if n["stem"])

    if by_stem and len(chords) * 2 > len(by_stem):
        for g in chords:
            if not alone(g): continue
            g.sort(key=lambda n: n["y"])
            g[0]["dir"], g[-1]["dir"] = "up", "dn"
    notes.sort(key=lambda n: (n["x"], -n["y"]))
    return notes, bars

if __name__ == "__main__":
    doc, systems = analyse("093.pdf")
    print("систем:", len(systems))
    for si, sy in enumerate(systems):
        for name, staff, clef in (("treble", sy["treble"], "G"), ("bass", sy["bass"], "F")):
            notes, bars = staff_notes(sy, staff, clef)
            up = [n for n in notes if n["dir"]=="up"]; dn = [n for n in notes if n["dir"]=="dn"]
            nos = [n for n in notes if n["dir"] is None]
            print(f"  система {si+1} {name}: головок {len(notes)} (вверх {len(up)}, вниз {len(dn)}, без штиля {len(nos)}), тактовых черт {len(bars)}")
